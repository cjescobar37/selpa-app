-- F1C read model QA for a disposable database only. All fixtures roll back.
begin;

do $$
declare
  v_club uuid;
  v_actor uuid;
  v_other_user uuid;
  v_before jsonb;
  v_now jsonb;
  v_pending uuid;
  v_partial uuid;
  v_paid uuid;
  v_cancelled uuid;
  v_payment uuid;
  v_reversed uuid;
  v_result jsonb;
begin
  select m.club_id, m.user_id into v_club, v_actor
  from public.club_memberships m
  where m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null
  limit 1;
  if v_actor is null then raise exception 'QA_F1C_REQUIRES_APPROVED_OWNER'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.has_club_capability(v_club, 'finance:manage') then
    raise exception 'QA_F1C_OWNER_LACKS_FINANCE_MANAGE';
  end if;
  v_before := public.get_club_finance_overview_f1c(v_club);

  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA Pendiente","concept":"QA F1C pendiente","currency_code":"ARS","original_amount":100}'::jsonb,
    'qa-f1c-obligation-pending');
  v_pending := (v_result->>'obligation_id')::uuid;
  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA Parcial","concept":"QA F1C parcial","currency_code":"ARS","original_amount":100}'::jsonb,
    'qa-f1c-obligation-partial');
  v_partial := (v_result->>'obligation_id')::uuid;
  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA Pagado","concept":"QA F1C pagado","currency_code":"ARS","original_amount":100}'::jsonb,
    'qa-f1c-obligation-paid');
  v_paid := (v_result->>'obligation_id')::uuid;
  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA Cancelado","concept":"QA F1C cancelado","currency_code":"ARS","original_amount":100}'::jsonb,
    'qa-f1c-obligation-cancelled');
  v_cancelled := (v_result->>'obligation_id')::uuid;
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 400
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 4 then
    raise exception 'QA_F1C_PENDING_SUMMARY_INVALID';
  end if;

  v_result := public.register_club_finance_payment(
    v_club, v_partial, 20, 'ARS', 'CASH', 'qa-f1c-payment-partial');
  v_payment := (v_result->>'payment_id')::uuid;
  v_result := public.register_club_finance_payment(
    v_club, v_paid, 100, 'ARS', 'BANK_TRANSFER', 'qa-f1c-payment-full');
  v_reversed := (v_result->>'payment_id')::uuid;
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 280
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric + 120
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 3 then
    raise exception 'QA_F1C_PARTIAL_BALANCE_INVALID';
  end if;
  if not exists (select 1 from public.list_club_finance_obligations_f1c(v_club, 'PAID', 51) x
    where x.item->>'id' = v_paid::text and x.item->>'financial_status' = 'PAID') then
    raise exception 'QA_F1C_PAID_BALANCE_INVALID';
  end if;
  if not exists (select 1 from public.list_club_finance_obligations_f1c(v_club, 'PENDING', 51) x
    where x.item->>'id' = v_partial::text and x.item->>'financial_status' = 'PARTIAL'
      and (x.item->>'balance')::numeric = 80) then
    raise exception 'QA_F1C_PENDING_FILTER_EXCLUDES_PARTIAL';
  end if;

  perform public.reverse_club_finance_payment(
    v_club, v_reversed, 'QA reversión', 'qa-f1c-reverse-full');
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 380
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric + 20
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 4
     or not exists (select 1 from public.list_club_finance_movements_f1c(v_club, 51) x
       where x.item->>'id' = v_reversed::text and x.item->>'status' = 'REVERSED') then
    raise exception 'QA_F1C_REVERSAL_NET_INVALID';
  end if;

  perform public.cancel_club_finance_obligation(
    v_club, v_cancelled, 'QA cancelación', 'qa-f1c-cancel-obligation');
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 280
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 3
     or exists (select 1 from public.list_club_finance_obligations_f1c(v_club, 'PENDING', 51) x
       where x.item->>'id' = v_cancelled::text) then
    raise exception 'QA_F1C_CANCELLED_PENDING_INVALID';
  end if;

  select u.id into v_other_user from auth.users u
  where u.id <> v_actor and not exists (
    select 1 from public.club_memberships m where m.club_id = v_club and m.user_id = u.id
      and m.status = 'APPROVED' and m.approved_at is not null
      and m.role in ('OWNER', 'ADMIN'))
  limit 1;
  if v_other_user is not null then
    perform set_config('request.jwt.claim.sub', v_other_user::text, true);
    begin
      perform public.get_club_finance_overview_f1c(v_club);
      raise exception 'QA_F1C_CROSS_CLUB_VISIBLE';
    exception when insufficient_privilege then null;
    end;
  end if;
  if v_payment is null or v_pending is null then
    raise exception 'QA_F1C_FIXTURE_INCOMPLETE';
  end if;
end;
$$;

-- Isolated overview baseline: fully paid OPEN rows do not count; reversal reopens the balance.
do $$
declare
  v_club uuid;
  v_actor uuid;
  v_before jsonb;
  v_now jsonb;
  v_obligation uuid;
  v_payment uuid;
  v_result jsonb;
begin
  select m.club_id, m.user_id into v_club, v_actor
  from public.club_memberships m
  where m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null
  limit 1;
  if v_actor is null then raise exception 'QA_F1C_REQUIRES_APPROVED_OWNER'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_before := public.get_club_finance_overview_f1c(v_club);

  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA Abierta neta","concept":"QA F1C open balance","currency_code":"ARS","original_amount":100}'::jsonb,
    'qa-f1c-open-balance-obligation');
  v_obligation := (v_result->>'obligation_id')::uuid;
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 100
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 1 then
    raise exception 'QA_F1C_OPEN_BALANCE_CREATED_INVALID';
  end if;

  v_result := public.register_club_finance_payment(
    v_club, v_obligation, 100, 'ARS', 'CASH', 'qa-f1c-open-balance-full');
  v_payment := (v_result->>'payment_id')::uuid;
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric + 100
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint
     or not exists (select 1 from public.club_finance_obligations o
       where o.id = v_obligation and o.club_id = v_club and o.status = 'OPEN') then
    raise exception 'QA_F1C_PAID_NOT_OPEN_INVALID';
  end if;

  perform public.reverse_club_finance_payment(
    v_club, v_payment, 'QA open balance reversión', 'qa-f1c-open-balance-reverse');
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 100
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 1 then
    raise exception 'QA_F1C_REVERSED_OPEN_BALANCE_INVALID';
  end if;

  perform public.register_club_finance_payment(
    v_club, v_obligation, 20, 'ARS', 'CASH', 'qa-f1c-open-balance-partial');
  v_now := public.get_club_finance_overview_f1c(v_club);
  if (v_now->>'total_pending')::numeric <> (v_before->>'total_pending')::numeric + 80
     or (v_now->>'total_received')::numeric <> (v_before->>'total_received')::numeric + 20
     or (v_now->>'open_obligations')::bigint <> (v_before->>'open_obligations')::bigint + 1 then
    raise exception 'QA_F1C_PARTIAL_STILL_OPEN_INVALID';
  end if;
end;
$$;

set constraints all immediate;
rollback;
