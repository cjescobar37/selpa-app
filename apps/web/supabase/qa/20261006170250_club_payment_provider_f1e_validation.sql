-- F1E QA, DISPOSABLE DB ONLY. Install F1A/F1B/F1C/F1D/F1E first.
-- Needs one approved OWNER, a tournament/category, and three other auth users.
-- Vault must exist. Only synthetic tokens/PKCE and API snapshots; no real credentials or MP calls.
-- This file never enables the application flag. Everything rolls back.
begin;
create function pg_temp.f1e_actor(p_id uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', p_role)::text, true);
end;
$$;
grant execute on function pg_temp.f1e_actor(uuid, text) to anon, authenticated, service_role;
do $$
declare
  c uuid; owner_id uuid; players uuid[]; a uuid; b uuid; outsider uuid; category smallint;
  tournament_id uuid; team_id uuid; v_provider_account_id uuid; obligation_ids uuid[] := '{}'; o uuid;
  intent jsonb; other_intent jsonb; result jsonb; event_id uuid; payment_id uuid; claim_id uuid;
  snapshot jsonb; before_count integer; after_count integer; n integer; current_intent uuid; outcome text;
  access_ref uuid; refresh_ref uuid; pkce_ref uuid; secret_count integer; account_count integer;
  rpc_signature text;
begin
  select m.club_id, m.user_id, t.category_id into c, owner_id, category
    from public.club_memberships m join public.tournaments t on t.club_id = m.club_id
    where m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null limit 1;
  select array_agg(x.id) into players from (select u.id from auth.users u where u.id <> owner_id
    and not exists(select 1 from public.club_memberships m where m.club_id = c and m.user_id = u.id
      and m.role in ('OWNER', 'ADMIN') and m.status = 'APPROVED' and m.approved_at is not null)
    order by u.id limit 3) x;
  if c is null or cardinality(players) <> 3 then raise exception 'QA_F1E_FIXTURES_REQUIRED'; end if;
  a := players[1]; b := players[2]; outsider := players[3];
  perform pg_temp.f1e_actor(owner_id, 'authenticated');
  insert into public.tournaments(club_id, name, type, start_date, category_id)
    values(c, 'QA F1E rollback', 'OPEN', current_date, category) returning id into tournament_id;
  insert into public.tournament_teams(club_id, tournament_id, player1_user_id, player2_user_id, created_by)
    values(c, tournament_id, a, b, owner_id) returning id into team_id;
  for n in 1..7 loop
    result := public.create_club_finance_obligation(c, jsonb_build_object('debtor_type', 'TEAM', 'debtor_team_id', team_id,
      'concept', 'QA F1E TEAM ' || n, 'currency_code', 'ARS', 'original_amount', 100), 'qa-f1e-team-' || n);
    obligation_ids := array_append(obligation_ids, (result->>'obligation_id')::uuid);
  end loop;
  result := public.create_club_finance_obligation(c, jsonb_build_object('debtor_type', 'USER', 'debtor_user_id', a,
    'concept', 'QA F1E USER', 'currency_code', 'ARS', 'original_amount', 100), 'qa-f1e-user');
  obligation_ids := array_append(obligation_ids, (result->>'obligation_id')::uuid);
  perform public.register_club_finance_payment(c, obligation_ids[1], 20, 'ARS', 'CASH', 'qa-f1e-partial');
  perform public.register_club_finance_payment(c, obligation_ids[7], 100, 'ARS', 'CASH', 'qa-f1e-paid');

  execute 'set local role authenticated';
  begin
    perform public.start_payment_provider_oauth_f1e(c, owner_id, repeat('a',64), repeat('b',64), repeat('v',64));
    raise exception 'QA_F1E_OAUTH_SERVER_ONLY';
  exception when insufficient_privilege then null; end;
  perform pg_temp.f1e_actor(a, 'authenticated');
  begin
    perform public.prepare_club_payment_intent_f1e(obligation_ids[1], 'qa-f1e-disconnected');
    raise exception 'QA_F1E_DISCONNECTED';
  exception when check_violation then null; end;
  begin
    perform public.consume_payment_provider_oauth_f1e(repeat('a',64), repeat('b',64));
    raise exception 'QA_F1E_SERVICE_RPC_EXPOSED';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role service_role';
  perform pg_temp.f1e_actor(null, 'service_role');
  begin
    perform public.start_payment_provider_oauth_f1e(c, outsider, repeat('c',64), repeat('d',64), repeat('v',64));
    raise exception 'QA_F1E_OAUTH_CAPABILITY';
  exception when insufficient_privilege then null; end;
  perform public.start_payment_provider_oauth_f1e(c, owner_id, repeat('a',64), repeat('b',64), repeat('v',64));
  execute 'reset role';
  select pkce_verifier_secret_id into pkce_ref from public.club_payment_oauth_states where state_hash = repeat('a',64);
  if pkce_ref is null or not exists(select 1 from vault.secrets where id = pkce_ref) then raise exception 'QA_F1E_PKCE_VAULT'; end if;
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  result := public.consume_payment_provider_oauth_f1e(repeat('a',64), repeat('b',64));
  if result->>'verifier' <> repeat('v',64) then raise exception 'QA_F1E_PKCE_CONSUME'; end if;
  begin
    perform public.consume_payment_provider_oauth_f1e(repeat('a',64), repeat('b',64));
    raise exception 'QA_F1E_OAUTH_REPLAY';
  exception when insufficient_privilege then null; end;
  perform public.complete_payment_provider_oauth_f1e(repeat('a',64), '123456', 'qa-access-old', 'qa-refresh-old', now()+interval '30 seconds', false);
  execute 'reset role';
  select id into v_provider_account_id from public.club_payment_provider_accounts where club_id = c and status = 'CONNECTED';
  if exists(select 1 from vault.secrets where id = pkce_ref)
    or exists(select 1 from public.club_payment_oauth_states where state_hash = repeat('a',64) and pkce_verifier_secret_id is not null) then
    raise exception 'QA_F1E_PKCE_DELETED'; end if;
  select access_token_secret_id, refresh_token_secret_id into access_ref, refresh_ref
    from public.club_payment_provider_accounts where id = v_provider_account_id;
  if access_ref is null or refresh_ref is null or access_ref = refresh_ref
    or (select decrypted_secret from vault.decrypted_secrets where id = access_ref) is distinct from 'qa-access-old'
    or (select decrypted_secret from vault.decrypted_secrets where id = refresh_ref) is distinct from 'qa-refresh-old'
    or exists(select 1 from public.club_payment_provider_accounts a where a.id = v_provider_account_id and to_jsonb(a)::text like '%qa-access-old%')
    or exists(select 1 from public.club_payment_provider_accounts a where a.id = v_provider_account_id and to_jsonb(a)::text like '%qa-refresh-old%') then
    raise exception 'QA_F1E_VAULT_REFS'; end if;
  claim_id := gen_random_uuid();
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  result := public.claim_payment_provider_credentials_f1e(v_provider_account_id, claim_id, 'CHECKOUT');
  if result->>'kind' <> 'REFRESH' or result->'tokens'->>'refreshToken' <> 'qa-refresh-old' then raise exception 'QA_F1E_REFRESH_CLAIM'; end if;
  if public.claim_payment_provider_credentials_f1e(v_provider_account_id, gen_random_uuid(), 'CHECKOUT')->>'kind' <> 'BUSY' then raise exception 'QA_F1E_REFRESH_RACE'; end if;
  begin
    perform public.rotate_payment_provider_credentials_f1e(v_provider_account_id, claim_id, '123456', 'qa-access-new', '', now()+interval '1 hour', false);
    raise exception 'QA_F1E_INVALID_REFRESH_ACCEPTED';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  if (select decrypted_secret from vault.decrypted_secrets where id = access_ref) is distinct from 'qa-access-old'
    or (select decrypted_secret from vault.decrypted_secrets where id = refresh_ref) is distinct from 'qa-refresh-old' then raise exception 'QA_F1E_REFRESH_OLD_DESTROYED'; end if;
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  perform public.rotate_payment_provider_credentials_f1e(v_provider_account_id, claim_id, '123456', 'qa-access-new', 'qa-refresh-new', now()+interval '1 hour', false);
  begin
    perform public.rotate_payment_provider_credentials_f1e(v_provider_account_id, claim_id, '123456', 'stale-access', 'stale-refresh', now()+interval '1 hour', false);
    raise exception 'QA_F1E_STALE_REFRESH_ACCEPTED';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if (select decrypted_secret from vault.decrypted_secrets where id = access_ref) is distinct from 'qa-access-new'
    or (select decrypted_secret from vault.decrypted_secrets where id = refresh_ref) is distinct from 'qa-refresh-new'
    or exists(select 1 from public.club_payment_provider_accounts where id = v_provider_account_id and refresh_claim is not null) then raise exception 'QA_F1E_ROTATION'; end if;

  pkce_ref := vault.create_secret(repeat('z',64), null, 'SELPA F1E QA expired');
  insert into public.club_payment_oauth_states(state_hash, binding_hash, club_id, actor_id, pkce_verifier_secret_id, expires_at)
    values(repeat('d',64), repeat('c',64), c, owner_id, pkce_ref, now() - interval '1 minute');
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  begin
    perform public.consume_payment_provider_oauth_f1e(repeat('d',64), repeat('c',64));
    raise exception 'QA_F1E_EXPIRED_STATE';
  exception when insufficient_privilege then null; end;
  perform public.cleanup_payment_provider_secrets_f1e();
  execute 'reset role';
  if exists(select 1 from vault.secrets where id = pkce_ref) then raise exception 'QA_F1E_EXPIRED_PKCE_RETAINED'; end if;

  -- Force rollback AFTER both Vault writes + account insertion; no orphan refs or CONNECTED account survive.
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  perform public.start_payment_provider_oauth_f1e(c, owner_id, repeat('7',64), repeat('8',64), repeat('k',64));
  perform public.consume_payment_provider_oauth_f1e(repeat('7',64), repeat('8',64));
  execute 'reset role';
  select count(*) into secret_count from vault.secrets;
  select count(*) into account_count from public.club_payment_provider_accounts;
  begin
    execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
    perform public.complete_payment_provider_oauth_f1e(repeat('7',64), '123456', 'qa-rollback-access', 'qa-rollback-refresh', now()+interval '1 hour', false);
    raise exception 'SIMULATED_POST_VAULT_FAILURE' using errcode = 'P0002';
  exception when no_data_found then null; end;
  execute 'reset role';
  if (select count(*) from vault.secrets) <> secret_count or (select count(*) from public.club_payment_provider_accounts) <> account_count
    or not exists(select 1 from public.club_payment_provider_accounts where id = v_provider_account_id and status = 'CONNECTED') then raise exception 'QA_F1E_VAULT_ATOMIC_FAILURE'; end if;

  execute 'set local role authenticated';
  perform pg_temp.f1e_actor(a, 'authenticated');
  intent := public.prepare_club_payment_intent_f1e(obligation_ids[1], 'qa-f1e-player1');
  if (intent->>'amount')::numeric <> 80 or intent->>'currency_code' <> 'ARS'
    or (intent->>'payer_user_id')::uuid <> a then raise exception 'QA_F1E_PLAYER1_AMOUNT'; end if;
  other_intent := public.prepare_club_payment_intent_f1e(obligation_ids[1], 'qa-f1e-player1');
  if other_intent->>'id' <> intent->>'id' then raise exception 'QA_F1E_IDEMPOTENT'; end if;
  perform pg_temp.f1e_actor(b, 'authenticated');
  other_intent := public.prepare_club_payment_intent_f1e(obligation_ids[1], 'qa-f1e-player2');
  if other_intent->>'id' <> intent->>'id' then raise exception 'QA_F1E_PLAYER2_DUPLICATE'; end if;
  begin
    perform public.prepare_club_payment_intent_f1e(obligation_ids[8], 'qa-f1e-user-b');
    raise exception 'QA_F1E_USER_VISIBILITY';
  exception when insufficient_privilege then null; end;
  perform pg_temp.f1e_actor(outsider, 'authenticated');
  begin
    perform public.prepare_club_payment_intent_f1e(obligation_ids[1], 'qa-f1e-outsider');
    raise exception 'QA_F1E_OUTSIDER';
  exception when insufficient_privilege then null; end;
  perform pg_temp.f1e_actor(a, 'authenticated');
  result := public.prepare_club_payment_intent_f1e(obligation_ids[8], 'qa-f1e-user-a');
  if (result->>'payer_user_id')::uuid <> a then raise exception 'QA_F1E_USER_OWNER'; end if;
  begin
    perform public.prepare_club_payment_intent_f1e(obligation_ids[7], 'qa-f1e-zero');
    raise exception 'QA_F1E_ZERO';
  exception when check_violation then null; end;
  begin
    perform 1 from public.club_payment_provider_accounts;
    raise exception 'QA_F1E_RAW_SECRETS_VISIBLE';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  current_intent := (intent->>'id')::uuid; claim_id := gen_random_uuid();
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  result := public.claim_club_payment_checkout_f1e(current_intent, claim_id);
  if result is null then raise exception 'QA_F1E_CLAIM'; end if;
  if public.claim_club_payment_checkout_f1e(current_intent, gen_random_uuid()) is not null then raise exception 'QA_F1E_DUPLICATE_CHECKOUT'; end if;
  perform public.finish_club_payment_checkout_f1e(current_intent, claim_id, 'qa-preference', 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=qa');
  event_id := public.record_payment_provider_event_f1e(v_provider_account_id, repeat('e',64), '99990001');
  if public.record_payment_provider_event_f1e(v_provider_account_id, repeat('e',64), '99990001') <> event_id then raise exception 'QA_F1E_EVENT_DUPLICATE'; end if;
  snapshot := jsonb_build_object('id', '99990001', 'status', 'approved', 'amount', '80', 'currency', 'ARS', 'collector_id', '123456',
    'external_reference', intent->>'external_reference', 'paid_at', now(), 'captured', true, 'live_mode', false);
  outcome := public.reconcile_payment_provider_event_f1e(event_id, snapshot);
  if outcome <> 'PROCESSED' then raise exception 'QA_F1E_APPROVED_NOT_POSTED'; end if;
  perform public.reconcile_payment_provider_event_f1e(event_id, snapshot);
  execute 'reset role';
  select finance_payment_id into payment_id from public.club_payment_intents where id = current_intent;
  if payment_id is null or (select count(*) from public.club_finance_payments where club_id = c and reference = 'MP:99990001') <> 1
    or (select count(*) from public.club_finance_journals j where j.payment_id = (select i.finance_payment_id from public.club_payment_intents i where i.id = current_intent) and j.event_type = 'PAYMENT_RECEIVED') <> 1 then
    raise exception 'QA_F1E_APPROVED_ONCE'; end if;
  if not exists(select 1 from public.club_finance_journals j where j.payment_id = (select i.finance_payment_id from public.club_payment_intents i where i.id = current_intent) and j.actor_id = owner_id) then
    raise exception 'QA_F1E_AUDIT_DELEGATE'; end if;
  -- Keep SQL variable names unambiguous in this check.
  if (public.club_finance_obligation_projection_internal(c, obligation_ids[1])->>'balance')::numeric <> 0 then raise exception 'QA_F1E_APPROVED_BALANCE'; end if;

  -- Rejected / mismatched amount / mismatched currency / manual race / wrong collector.
  for n in 2..6 loop
    execute 'set local role authenticated'; perform pg_temp.f1e_actor(a, 'authenticated');
    intent := public.prepare_club_payment_intent_f1e(obligation_ids[n], 'qa-f1e-scenario-' || n);
    execute 'reset role';
    select count(*) into before_count from public.club_finance_payments where club_id = c;
    if n = 5 then
      perform pg_temp.f1e_actor(owner_id, 'authenticated');
      perform public.register_club_finance_payment(c, obligation_ids[n], 100, 'ARS', 'CASH', 'qa-f1e-manual-race');
      before_count := before_count + 1;
    end if;
    execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
    event_id := public.record_payment_provider_event_f1e(v_provider_account_id, repeat(n::text,64), '9999000' || n);
    snapshot := jsonb_build_object('id', '9999000' || n, 'status', case when n = 2 then 'rejected' else 'approved' end,
      'amount', case when n = 3 then '90' else '100' end, 'currency', case when n = 4 then 'USD' else 'ARS' end,
      'collector_id', case when n = 6 then '000' else '123456' end, 'external_reference', intent->>'external_reference',
      'paid_at', now(), 'captured', true, 'live_mode', false);
    outcome := public.reconcile_payment_provider_event_f1e(event_id, snapshot);
    if n = 2 and outcome <> 'IGNORED' then raise exception 'QA_F1E_REJECTED'; end if;
    if n > 2 and outcome <> 'RECONCILIATION_REQUIRED' then raise exception 'QA_F1E_INVALID_PROVIDER_ACCEPTED'; end if;
    execute 'reset role';
    select count(*) into after_count from public.club_finance_payments where club_id = c;
    if after_count <> before_count then
      case n when 2 then raise exception 'QA_F1E_REJECTED_PAYMENT'; when 3 then raise exception 'QA_F1E_AMOUNT_PAYMENT';
        when 4 then raise exception 'QA_F1E_CURRENCY_PAYMENT'; when 5 then raise exception 'QA_F1E_MANUAL_RACE_PAYMENT';
        else raise exception 'QA_F1E_COLLECTOR_PAYMENT'; end case;
    end if;
  end loop;
  -- State tied to an actor who no longer has capability cannot connect, even via service_role.
  select count(*) into before_count from public.club_finance_payments where club_id = c;
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  event_id := public.record_payment_provider_event_f1e(v_provider_account_id, repeat('9',64), '99990009');
  outcome := public.reconcile_payment_provider_event_f1e(event_id, snapshot || jsonb_build_object('id','99990009','external_reference',gen_random_uuid()));
  if outcome <> 'RECONCILIATION_REQUIRED' then raise exception 'QA_F1E_REFERENCE_MISMATCH'; end if;
  execute 'reset role';
  if (select count(*) from public.club_finance_payments where club_id = c) <> before_count then raise exception 'QA_F1E_REFERENCE_PAYMENT'; end if;
  insert into public.club_payment_oauth_states(state_hash, binding_hash, club_id, actor_id, consumed_at)
    values(repeat('f',64), repeat('a',64), c, outsider, now());
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  begin
    perform public.complete_payment_provider_oauth_f1e(repeat('f',64), '999', 'forbidden-access', 'forbidden-refresh', now()+interval '1 hour', false);
    raise exception 'QA_F1E_ACTOR_CAPABILITY_BYPASSED';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if has_function_privilege('authenticated', 'public.reconcile_payment_provider_event_f1e(uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.prepare_club_payment_intent_f1e(uuid,text)', 'EXECUTE') then raise exception 'QA_F1E_ACL'; end if;
  begin update public.club_payment_provider_events set event_type = 'payment' where id = event_id;
    raise exception 'QA_F1E_EVENT_MUTABLE'; exception when check_violation then null; end;
  -- Client roles cannot read/write Vault. service_role is trusted backend and may
  -- retain Supabase-managed direct Vault privileges; do NOT assert denial for it.
  for outcome in select unnest(array['anon','authenticated']) loop
    execute format('set local role %I', outcome); perform pg_temp.f1e_actor(null, outcome);
    begin perform 1 from vault.decrypted_secrets; raise exception 'QA_F1E_VAULT_ACL';
    exception when insufficient_privilege then null; end;
    begin perform vault.create_secret('qa-forbidden', null, null); raise exception 'QA_F1E_VAULT_WRITE_ACL';
    exception when insufficient_privilege then null; end;
    begin perform public.claim_payment_provider_credentials_f1e(v_provider_account_id, gen_random_uuid(), 'CHECKOUT'); raise exception 'QA_F1E_CREDENTIAL_RPC_ACL';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  -- Secret-bearing server RPCs are granted ONLY to the trusted backend, never clients.
  for rpc_signature in select unnest(array[
    'public.start_payment_provider_oauth_f1e(uuid,uuid,text,text,text)',
    'public.consume_payment_provider_oauth_f1e(text,text)',
    'public.complete_payment_provider_oauth_f1e(text,text,text,text,timestamp with time zone,boolean)',
    'public.claim_payment_provider_credentials_f1e(uuid,uuid,text)',
    'public.rotate_payment_provider_credentials_f1e(uuid,uuid,text,text,text,timestamp with time zone,boolean)',
    'public.fail_payment_provider_refresh_f1e(uuid,uuid,boolean,boolean)',
    'public.payment_provider_account_internal_f1e(uuid)',
    'public.cleanup_payment_provider_secrets_f1e()'
  ]) loop
    if has_function_privilege('anon', rpc_signature, 'EXECUTE')
      or has_function_privilege('authenticated', rpc_signature, 'EXECUTE')
      or not has_function_privilege('service_role', rpc_signature, 'EXECUTE') then
      raise exception 'QA_F1E_SECRET_RPC_ACL'; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%f1e' and
    (p.proname ~ '(get(_any)?_secret|list_secrets)' or
     p.proargnames && array['p_secret_id','secret_id','p_secret_uuid','p_access_token_secret_id','p_refresh_token_secret_id'])) then
    raise exception 'QA_F1E_GENERIC_SECRET_RPC'; end if;
  for result in select to_jsonb(p) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%provider%f1e' and p.prosecdef loop
    if not ((result->'proconfig') @> '["search_path=pg_catalog, public"]'::jsonb) then raise exception 'QA_F1E_SEARCH_PATH'; end if;
  end loop;
  if exists(select 1 from pg_class where oid in ('public.club_payment_provider_accounts'::regclass,
    'public.club_payment_oauth_states'::regclass,'public.club_payment_intents'::regclass,
    'public.club_payment_provider_events'::regclass,'public.club_payment_provider_event_results'::regclass) and not relrowsecurity) then raise exception 'QA_F1E_RLS'; end if;
  select count(*) into before_count from public.club_finance_payments where club_id = c;
  execute 'set local role authenticated'; perform pg_temp.f1e_actor(owner_id, 'authenticated');
  perform public.disconnect_payment_provider_f1e(c);
  execute 'reset role';
  if not exists(select 1 from public.club_payment_provider_accounts where id = v_provider_account_id and status = 'DISCONNECTED')
    or not exists(select 1 from public.club_payment_provider_events e where e.account_id = v_provider_account_id)
    or (select count(*) from public.club_finance_payments where club_id = c) <> before_count then raise exception 'QA_F1E_DISCONNECT_HISTORY'; end if;
  -- In-flight/reconciliation history retains protected refs, but they cannot fund NEW checkouts.
  execute 'set local role service_role'; perform pg_temp.f1e_actor(null, 'service_role');
  begin perform public.claim_payment_provider_credentials_f1e(v_provider_account_id, gen_random_uuid(), 'CHECKOUT'); raise exception 'QA_F1E_DISCONNECTED_CREDENTIALS';
  exception when insufficient_privilege then null; end;
  -- A fresh account without intents has no retention reason: disconnect deletes both Vault secrets.
  perform public.start_payment_provider_oauth_f1e(c, owner_id, repeat('1',64), repeat('0',64), repeat('p',64));
  perform public.consume_payment_provider_oauth_f1e(repeat('1',64), repeat('0',64));
  perform public.complete_payment_provider_oauth_f1e(repeat('1',64), '123456', 'qa-unused-access', 'qa-unused-refresh', now()+interval '1 hour', false);
  execute 'reset role';
  select access_token_secret_id, refresh_token_secret_id into access_ref, refresh_ref from public.club_payment_provider_accounts where club_id = c and status = 'CONNECTED';
  execute 'set local role authenticated'; perform pg_temp.f1e_actor(owner_id, 'authenticated'); perform public.disconnect_payment_provider_f1e(c);
  execute 'reset role';
  if exists(select 1 from vault.secrets where id in (access_ref, refresh_ref))
    or exists(select 1 from public.club_payment_provider_accounts where club_id = c and access_token_secret_id = access_ref) then raise exception 'QA_F1E_DISCONNECT_SECRET_CLEANUP'; end if;
end;
$$;
set constraints all immediate;
rollback;
