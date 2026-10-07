-- DISPOSABLE DB ONLY, after F1A-F1F. Requires approved OWNER and a user without finance access.
-- No provider calls, Vault writes or cron. Fixtures/evidence/history all roll back.
begin;
do $$
declare
  v_club uuid; v_actor uuid; v_outsider uuid; v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_base jsonb; v_report jsonb; v_result jsonb; v_case jsonb; v_detail jsonb;
  v_obligation uuid; v_cancelled uuid; v_payment uuid; v_account uuid; v_intent uuid;
  v_event uuid; v_event_result uuid; v_review uuid; v_replay uuid; v_key uuid := gen_random_uuid();
  v_version text; v_before_payment jsonb; v_before_intent jsonb; v_before_result jsonb;
  v_journals bigint; v_count bigint; v_prefix text := 'qa-f1f-' || gen_random_uuid()::text;
begin
  select m.club_id, m.user_id into v_club, v_actor from public.club_memberships m
  where m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null limit 1;
  if v_actor is null then raise exception 'QA_F1F_REQUIRES_OWNER'; end if;
  select u.id into v_outsider from auth.users u where not exists (
    select 1 from public.club_memberships m where m.club_id = v_club and m.user_id = u.id
      and m.status = 'APPROVED' and m.approved_at is not null and m.role in ('OWNER', 'ADMIN')) limit 1;
  if v_outsider is null then raise exception 'QA_F1F_REQUIRES_NON_FINANCE_USER'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_base := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  v_result := public.create_club_finance_obligation(v_club,
    jsonb_build_object('debtor_type', 'THIRD_PARTY', 'debtor_name', 'QA F1F Pareja', 'concept', v_prefix,
      'currency_code', 'ARS', 'original_amount', 100), v_prefix || '-obligation');
  v_obligation := (v_result->>'obligation_id')::uuid;
  v_result := public.register_club_finance_payment(v_club, v_obligation, 20, 'ARS', 'CASH', v_prefix || '-partial');
  v_payment := (v_result->>'payment_id')::uuid;
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'total_pending')::numeric <> (v_base->>'total_pending')::numeric + 80
    or (v_report->>'total_received')::numeric <> (v_base->>'total_received')::numeric + 20
    or (v_report->>'partial_obligations')::bigint <> (v_base->>'partial_obligations')::bigint + 1 then
    raise exception 'QA_F1F_PARTIAL';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_report->'aging') a
    where a->>'bucket' = 'NO_DUE_DATE' and (a->>'amount')::numeric >= 80) then raise exception 'QA_F1F_AGING'; end if;
  if not exists (select 1 from public.list_club_finance_f1f(v_club, 'OBLIGATIONS', 'PARTIAL', 'QA F1F Pareja') x
    where x.item->>'id' = v_obligation::text and (x.item->>'balance')::numeric = 80) then raise exception 'QA_F1F_PARTIAL_SEARCH'; end if;
  perform public.register_club_finance_payment(v_club, v_obligation, 80, 'ARS', 'BANK_TRANSFER', v_prefix || '-paid');
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'total_pending')::numeric <> (v_base->>'total_pending')::numeric
    or (v_report->>'open_obligations')::bigint <> (v_base->>'open_obligations')::bigint
    or (v_report->>'paid_obligations')::bigint <> (v_base->>'paid_obligations')::bigint + 1 then raise exception 'QA_F1F_PAID'; end if;
  perform public.reverse_club_finance_payment(v_club, v_payment, 'QA F1F reversal', v_prefix || '-reverse');
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'total_received')::numeric <> (v_base->>'total_received')::numeric + 80
    or (v_report->>'total_pending')::numeric <> (v_base->>'total_pending')::numeric + 20 then raise exception 'QA_F1F_REVERSAL_NET'; end if;
  if not exists (select 1 from public.list_club_finance_f1f(v_club, 'MOVEMENTS', 'REVERSED', '', v_today, v_today) x
    where x.item->>'payment_id' = v_payment::text and (x.item->>'amount')::numeric = -20) then raise exception 'QA_F1F_REVERSAL_MOVEMENT'; end if;

  v_result := public.create_club_finance_obligation(v_club,
    jsonb_build_object('debtor_type', 'THIRD_PARTY', 'debtor_name', 'QA F1F Cancelado', 'concept', v_prefix,
      'currency_code', 'ARS', 'original_amount', 50), v_prefix || '-cancel-obligation');
  v_cancelled := (v_result->>'obligation_id')::uuid;
  perform public.cancel_club_finance_obligation(v_club, v_cancelled, 'QA F1F cancel', v_prefix || '-cancel');
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'total_pending')::numeric <> (v_base->>'total_pending')::numeric + 20
    or not exists (select 1 from public.list_club_finance_f1f(v_club, 'OBLIGATIONS', 'CANCELLED') x
      where x.item->>'id' = v_cancelled::text and (x.item->>'balance')::numeric = 0) then raise exception 'QA_F1F_CANCELLED'; end if;

  -- Synthetic F1E link, without OAuth/secret references/real checkout.
  insert into public.club_payment_provider_accounts(club_id, provider_account_id, status, live_mode, connected_by)
    values(v_club, '999999', 'DISCONNECTED', false, v_actor) returning id into v_account;
  insert into public.club_payment_intents(club_id, obligation_id, provider_account_id, payer_user_id,
    amount, status, error_code, idempotency_key, finance_payment_id)
    values(v_club, v_obligation, v_account, v_actor, 20, 'RECONCILIATION_REQUIRED', 'BALANCE_CHANGED', v_prefix || '-intent', v_payment)
    returning id into v_intent;
  v_version := public.get_club_finance_case_f1f(v_club, 'INTENT', v_intent)->'case'->>'source_version';
  if not exists (select 1 from public.list_club_finance_f1f(v_club, 'PAYMENTS', 'MERCADO_PAGO') x
    where x.item->>'id' = v_payment::text and x.item->>'provider' = 'MERCADO_PAGO') then raise exception 'QA_F1F_MP_METHOD'; end if;
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'reconciliation_open')::bigint <> (v_base->>'reconciliation_open')::bigint + 1 then raise exception 'QA_F1F_HISTORY_OPEN'; end if;
  select to_jsonb(p) into v_before_payment from public.club_finance_payments p where p.id = v_payment;
  select to_jsonb(i) into v_before_intent from public.club_payment_intents i where i.id = v_intent;
  select count(*) into v_journals from public.club_finance_journals j where j.club_id = v_club;
  v_review := public.record_club_finance_review_f1f(v_club, 'INTENT', v_intent, v_version, 'RESOLVED', 'Verificado fuera del ledger; sin dinero nuevo', v_key);
  v_replay := public.record_club_finance_review_f1f(v_club, 'INTENT', v_intent, v_version, 'RESOLVED', 'Verificado fuera del ledger; sin dinero nuevo', v_key);
  if v_review <> v_replay then raise exception 'QA_F1F_IDEMPOTENCY'; end if;
  v_detail := public.get_club_finance_case_f1f(v_club, 'INTENT', v_intent);
  if jsonb_array_length(v_detail->'history') <> 1 or v_detail->'case'->>'review_status' <> 'RESOLVED' then raise exception 'QA_F1F_HISTORY_RESOLVED'; end if;
  v_report := public.get_club_finance_report_f1f(v_club, v_today, v_today);
  if (v_report->>'reconciliation_open')::bigint <> (v_base->>'reconciliation_open')::bigint
    or (select to_jsonb(p) from public.club_finance_payments p where p.id = v_payment) <> v_before_payment
    or (select to_jsonb(i) from public.club_payment_intents i where i.id = v_intent) <> v_before_intent
    or (select count(*) from public.club_finance_journals j where j.club_id = v_club) <> v_journals then raise exception 'QA_F1F_HISTORY_FINANCE_UNCHANGED'; end if;
  perform public.record_club_finance_review_f1f(v_club, 'INTENT', v_intent, v_version, 'NOTE', 'Seguimiento posterior permitido', gen_random_uuid());
  if public.get_club_finance_case_f1f(v_club, 'INTENT', v_intent)->'case'->>'review_status' <> 'RESOLVED' then raise exception 'QA_F1F_HISTORY_NOTE_REOPENS'; end if;
  begin
    update public.club_finance_review_history_f1f set note = 'Reescritura inválida' where id = v_review;
    raise exception 'QA_F1F_IMMUTABLE';
  exception when check_violation then null; end;
  begin
    perform public.record_club_finance_review_f1f(v_club, 'INTENT', v_intent, v_version, 'NOTE', 'Otra solicitud', v_key);
    raise exception 'QA_F1F_IDEMPOTENCY_CONFLICT';
  exception when invalid_parameter_value then null; end;

  insert into public.club_payment_provider_events(account_id, fingerprint, event_type, provider_payment_id)
    values(v_account, repeat('a', 32) || replace(gen_random_uuid()::text, '-', ''), 'payment', '999999') returning id into v_event;
  insert into public.club_payment_provider_event_results(event_id, processing_status, error_code, verified_snapshot)
    values(v_event, 'RECONCILIATION_REQUIRED', 'EXTERNAL_REFERENCE_MISMATCH', '{"amount":"42.50","currency":"ARS"}'::jsonb)
    returning id into v_event_result;
  v_case := public.get_club_finance_case_f1f(v_club, 'EVENT', v_event_result)->'case';
  if (v_case->>'amount')::numeric <> 42.50 then raise exception 'QA_F1F_EVENT_AMOUNT'; end if;
  select to_jsonb(r) into v_before_result from public.club_payment_provider_event_results r where r.id = v_event_result;
  perform public.record_club_finance_review_f1f(v_club, 'EVENT', v_event_result, v_event_result::text, 'RESOLVED', 'Evento desconocido verificado', gen_random_uuid());
  if (select to_jsonb(r) from public.club_payment_provider_event_results r where r.id = v_event_result) <> v_before_result then raise exception 'QA_F1F_EVENT_UNCHANGED'; end if;

  begin
    perform public.get_club_finance_report_f1f(gen_random_uuid(), v_today, v_today);
    raise exception 'QA_F1F_CROSS_CLUB';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  begin
    perform public.get_club_finance_report_f1f(v_club, v_today, v_today);
    raise exception 'QA_F1F_NO_CAPABILITY';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_club_finance_f1f(v_club, 'PAYMENTS');
    raise exception 'QA_F1F_NO_CAPABILITY_EXPORT';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_club_finance_review_f1f(v_club, 'INTENT', v_intent, v_version, 'NOTE', 'Sin permiso', gen_random_uuid());
    raise exception 'QA_F1F_NO_CAPABILITY_MANAGE';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  begin
    perform public.get_club_finance_report_f1f(v_club, v_today, v_today - 1);
    raise exception 'QA_F1F_RANGE_INVALID';
  exception when invalid_parameter_value then null; end;
  select count(*) into v_count from public.list_club_finance_f1f(v_club, 'PAYMENTS', 'ALL', '', v_today - 1, v_today - 1) x where x.item->>'id' = v_payment::text;
  if v_count <> 0 then raise exception 'QA_F1F_RANGE_BOUNDARY'; end if;
  if has_table_privilege('authenticated', 'public.club_finance_review_history_f1f', 'INSERT')
    or has_table_privilege('authenticated', 'public.club_finance_cases_read_f1f', 'SELECT')
    or has_function_privilege('anon', 'public.get_club_finance_report_f1f(uuid,date,date)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.record_club_finance_review_f1f(uuid,text,uuid,text,text,text,uuid)', 'EXECUTE') then raise exception 'QA_F1F_NO_CAPABILITY_ACL'; end if;
end; $$;
set constraints all immediate;
rollback;
