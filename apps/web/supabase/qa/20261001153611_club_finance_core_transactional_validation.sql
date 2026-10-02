-- F1A SEQUENTIAL QA only. Run in a disposable database with an approved OWNER;
-- all test rows roll back. Never run against production without explicit approval.
begin;

do $$
declare
  v_actor uuid; v_club uuid; v_other_club uuid;
  v_obligation uuid; v_cancel_obligation uuid; v_payment_10 uuid; v_payment_20 uuid;
  v_unbalanced_obligation uuid;
  v_created jsonb; v_partial jsonb; v_paid jsonb; v_reversed jsonb; v_replay jsonb;
  v_status text; v_balance numeric; v_revision integer;
begin
  select membership.user_id, membership.club_id into v_actor, v_club
  from public.club_memberships membership
  where membership.role = 'OWNER' and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_actor is null then raise exception 'QA_REQUIRES_APPROVED_OWNER'; end if;
  select club.id into v_other_club from public.clubs club
  where club.id <> v_club and not exists (
    select 1 from public.club_memberships membership
    where membership.club_id = club.id and membership.user_id = v_actor
      and membership.status = 'APPROVED' and membership.approved_at is not null
  ) limit 1;
  if v_other_club is null then raise exception 'QA_REQUIRES_SECOND_CLUB'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.has_club_capability(v_club, 'finance:manage') then
    raise exception 'QA_OWNER_LACKS_FINANCE_MANAGE';
  end if;

  -- A: creation and derived PENDING.
  v_created := public.create_club_finance_obligation(v_club, jsonb_build_object(
    'debtor_type', 'USER', 'debtor_user_id', v_actor,
    'source_type', 'MANUAL', 'concept', 'QA F1A inscripción',
    'currency_code', 'ARS', 'original_amount', 30000
  ), 'qa-f1a-create-0001');
  v_obligation := (v_created->>'obligation_id')::uuid;
  select revision into v_revision from public.club_finance_obligations where id = v_obligation;
  if v_revision <> 1 then raise exception 'QA_A_REVISION_INITIAL_FAILED'; end if;
  if v_created->>'financial_status' <> 'PENDING' or (v_created->>'balance')::numeric <> 30000 then
    raise exception 'QA_A_PENDING_FAILED';
  end if;
  if public.create_club_finance_obligation(v_club, jsonb_build_object(
    'debtor_type', 'USER', 'debtor_user_id', v_actor,
    'source_type', 'MANUAL', 'concept', 'QA F1A inscripción',
    'currency_code', 'ARS', 'original_amount', 30000
  ), 'qa-f1a-create-0001') is distinct from v_created then
    raise exception 'QA_CREATE_REPLAY_FAILED';
  end if;
  begin
    perform public.create_club_finance_obligation(v_club, jsonb_build_object(
      'debtor_type', 'USER', 'debtor_user_id', v_actor,
      'concept', 'QA changed amount', 'original_amount', 40000
    ), 'qa-f1a-create-0001');
    raise exception 'QA_IDEMPOTENCY_CONFLICT_NOT_BLOCKED';
  exception when unique_violation then
    if sqlerrm not like '%CLUB_FINANCE_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;

  -- B/C: partial and complete allocations.
  v_partial := public.register_club_finance_payment(v_club, v_obligation,
    10000, 'ARS', 'CASH', 'qa-f1a-pay-10000');
  v_payment_10 := (v_partial->>'payment_id')::uuid;
  if v_partial->'obligation'->>'financial_status' <> 'PARTIAL'
     or (v_partial->'obligation'->>'balance')::numeric <> 20000 then
    raise exception 'QA_B_PARTIAL_FAILED';
  end if;
  if (select revision from public.club_finance_obligations where id = v_obligation) <= v_revision then
    raise exception 'QA_B_REVISION_NOT_BUMPED';
  end if;
  select revision into v_revision from public.club_finance_obligations where id = v_obligation;
  v_paid := public.register_club_finance_payment(v_club, v_obligation,
    20000, 'ARS', 'BANK_TRANSFER', 'qa-f1a-pay-20000');
  v_payment_20 := (v_paid->>'payment_id')::uuid;
  if v_paid->'obligation'->>'financial_status' <> 'PAID'
     or (v_paid->'obligation'->>'balance')::numeric <> 0 then
    raise exception 'QA_C_PAID_FAILED';
  end if;
  if (select revision from public.club_finance_obligations where id = v_obligation) <= v_revision then
    raise exception 'QA_C_REVISION_NOT_BUMPED';
  end if;
  select revision into v_revision from public.club_finance_obligations where id = v_obligation;

  -- D/F: another key cannot over-allocate the same obligation.
  begin
    perform public.register_club_finance_payment(v_club, v_obligation,
      1, 'ARS', 'CASH', 'qa-f1a-pay-third');
    raise exception 'QA_D_OVER_ALLOCATION_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_OVER_ALLOCATION%' then raise; end if;
  end;
  -- E: replay returns the original payment and journal, not a second receipt.
  v_replay := public.register_club_finance_payment(v_club, v_obligation,
    20000, 'ARS', 'BANK_TRANSFER', 'qa-f1a-pay-20000');
  if v_replay is distinct from v_paid
     or (select count(*) from public.club_finance_payments where club_id = v_club
       and id = v_payment_20) <> 1 then raise exception 'QA_E_PAYMENT_REPLAY_FAILED'; end if;
  begin
    perform public.register_club_finance_payment(v_club, v_obligation,
      20000, 'ARS', 'CASH', 'qa-f1a-pay-20000');
    raise exception 'QA_E_INCOMPATIBLE_PAYLOAD_NOT_BLOCKED';
  exception when unique_violation then
    if sqlerrm not like '%CLUB_FINANCE_IDEMPOTENCY_CONFLICT%' then raise; end if;
  end;

  -- G/H: reversal compensates economics; identical retry replays, new key fails.
  v_reversed := public.reverse_club_finance_payment(v_club, v_payment_20,
    'QA reversión confirmada', 'qa-f1a-reverse-20');
  if v_reversed->'obligation'->>'financial_status' <> 'PARTIAL'
     or (v_reversed->'obligation'->>'balance')::numeric <> 20000 then
    raise exception 'QA_G_REVERSE_FAILED';
  end if;
  if (select revision from public.club_finance_obligations where id = v_obligation) <= v_revision then
    raise exception 'QA_G_REVISION_NOT_BUMPED';
  end if;
  if public.reverse_club_finance_payment(v_club, v_payment_20,
    'QA reversión confirmada', 'qa-f1a-reverse-20') is distinct from v_reversed then
    raise exception 'QA_H_REVERSE_REPLAY_FAILED';
  end if;
  begin
    perform public.reverse_club_finance_payment(v_club, v_payment_20,
      'QA segunda reversión', 'qa-f1a-reverse-21');
    raise exception 'QA_H_DOUBLE_REVERSE_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_PAYMENT_ALREADY_REVERSED%' then raise; end if;
  end;

  -- I: wrong currency is rejected before any payment row is created.
  begin
    perform public.register_club_finance_payment(v_club, v_obligation,
      1, 'USD', 'CASH', 'qa-f1a-usd-denied');
    raise exception 'QA_I_CURRENCY_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_OBLIGATION_NOT_PAYABLE%' then raise; end if;
  end;

  -- J/K: cancellation only when no money remains applied.
  v_cancel_obligation := (public.create_club_finance_obligation(v_club, jsonb_build_object(
    'debtor_type', 'USER', 'debtor_user_id', v_actor,
    'concept', 'QA cancelación sin pagos', 'original_amount', 2500
  ), 'qa-f1a-create-cancel')->>'obligation_id')::uuid;
  if public.cancel_club_finance_obligation(v_club, v_cancel_obligation,
    'QA cancelación limpia', 'qa-f1a-cancel-0001')->'obligation'->>'financial_status' <> 'CANCELLED' then
    raise exception 'QA_J_CANCEL_FAILED';
  end if;
  begin
    perform public.cancel_club_finance_obligation(v_club, v_obligation,
      'QA cancelación indebida', 'qa-f1a-cancel-0002');
    raise exception 'QA_K_PAID_CANCEL_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_CANCEL_REQUIRES_PAYMENT_RESOLUTION%' then raise; end if;
  end;
  begin
    perform set_config('selpa.club_finance_write', 'allowed', true);
    update public.club_finance_obligations
    set status = 'CANCELLED', revision = revision + 1,
      cancelled_by = v_actor, cancelled_at = now(), cancel_reason = 'QA bypass attempt'
    where id = v_obligation;
    raise exception 'QA_K_PRIVILEGED_CANCEL_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_CANCEL_REQUIRES_PAYMENT_RESOLUTION%' then raise; end if;
  end;

  -- L: each journal has exactly two same-club/same-currency balanced postings.
  if exists (
    select 1 from public.club_finance_journals j
    left join public.club_finance_postings line on line.journal_id = j.id
    where j.club_id = v_club and j.obligation_id in (v_obligation, v_cancel_obligation)
    group by j.id
    having count(line.id) <> 2
      or coalesce(sum(line.amount) filter (where line.side = 'DEBIT'), 0)
        <> coalesce(sum(line.amount) filter (where line.side = 'CREDIT'), 0)
  ) then raise exception 'QA_L_JOURNAL_UNBALANCED'; end if;

  -- Negative deferred-integrity tests. Each exception subtransaction rolls back
  -- its intentionally invalid row; SET CONSTRAINTS makes the deferred check run.
  begin
    insert into public.club_finance_obligations(
      club_id, debtor_type, debtor_user_id, source_type, concept,
      currency_code, original_amount, created_by
    ) values (v_club, 'USER', v_actor, 'MANUAL', 'QA unbalanced journal',
      'ARS', 1000, v_actor) returning id into v_unbalanced_obligation;
    insert into public.club_finance_journals(
      club_id, currency_code, event_type, obligation_id, payment_id, actor_id
    ) values (v_club, 'ARS', 'OBLIGATION_CREATED', v_unbalanced_obligation, null, v_actor);
    set constraints club_finance_journal_balance immediate;
    raise exception 'QA_L_UNBALANCED_COMMIT_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_JOURNAL_UNBALANCED%' then raise; end if;
  end;
  begin
    insert into public.club_finance_payments(
      club_id, amount, currency_code, payment_method, paid_at, created_by
    ) values (v_club, 1000, 'ARS', 'CASH', now(), v_actor);
    set constraints club_finance_payment_journal_coverage immediate;
    raise exception 'QA_L_PAYMENT_WITHOUT_JOURNAL_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_PAYMENT_JOURNAL_MISSING%' then raise; end if;
  end;
  begin
    perform set_config('selpa.club_finance_write', 'allowed', true);
    update public.club_finance_payments
    set status = 'REVERSED', reversed_by = v_actor, reversed_at = now(),
      reversal_reason = 'QA reversal without journal'
    where id = v_payment_10;
    set constraints club_finance_payment_journal_coverage immediate;
    raise exception 'QA_L_REVERSAL_WITHOUT_JOURNAL_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_PAYMENT_JOURNAL_MISSING%' then raise; end if;
  end;
  begin
    insert into public.club_finance_obligations(
      club_id, debtor_type, debtor_user_id, source_type, concept,
      currency_code, original_amount, created_by
    ) values (v_club, 'USER', v_actor, 'MANUAL', 'QA orphan obligation',
      'ARS', 1000, v_actor);
    set constraints club_finance_obligation_journal_coverage immediate;
    raise exception 'QA_L_OBLIGATION_WITHOUT_JOURNAL_NOT_BLOCKED';
  exception when check_violation then
    if sqlerrm not like '%CLUB_FINANCE_OBLIGATION_JOURNAL_MISSING%' then raise; end if;
  end;

  -- M: authenticated has no direct write or TRUNCATE grants on economic tables.
  if exists (
    select 1 from unnest(array[
      'club_finance_obligations', 'club_finance_payments', 'club_finance_allocations',
      'club_finance_journals', 'club_finance_postings', 'club_finance_commands'
    ]) as table_name
    where has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
      or has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE')
  ) then raise exception 'QA_M_DIRECT_WRITE_GRANTED'; end if;
  if has_table_privilege('authenticated', 'public.club_finance_commands', 'SELECT')
     or has_table_privilege('anon', 'public.club_finance_payments', 'SELECT')
     or has_table_privilege('service_role', 'public.club_finance_payments', 'SELECT')
     or has_function_privilege('authenticated',
       'public.validate_club_finance_payment_journals()', 'EXECUTE')
     or has_function_privilege('anon',
       'public.register_club_finance_payment(uuid,uuid,numeric,text,text,text,timestamptz,text,text,uuid)',
       'EXECUTE') then
    raise exception 'QA_M_FINANCE_ACL_EXPOSURE';
  end if;

  -- N: even a known UUID cannot be read through a different club scope.
  if public.has_club_capability(v_other_club, 'finance:view') then
    raise exception 'QA_N_CROSS_CLUB_CAPABILITY';
  end if;
  begin
    perform public.get_club_finance_obligation(v_other_club, v_obligation);
    raise exception 'QA_N_CROSS_CLUB_READ_NOT_BLOCKED';
  exception when insufficient_privilege then
    if sqlerrm not like '%CLUB_FINANCE_FORBIDDEN%' then raise; end if;
  end;

  select financial_status, balance into v_status, v_balance
  from jsonb_to_record(public.get_club_finance_obligation(v_club, v_obligation))
    as projected(financial_status text, balance numeric);
  if v_status <> 'PARTIAL' or v_balance <> 20000 then
    raise exception 'QA_FINAL_PROJECTION_FAILED';
  end if;
  raise notice 'F1A QA PASS: obligations, partial/full payment, idempotency, reversal, cancellation, journal, ACL, club isolation';
end;
$$;

rollback;

-- TWO-SESSION QA is separate: 20261001153611_club_finance_core_two_session.md.
-- These concurrency scenarios are prepared but have NOT been executed.
