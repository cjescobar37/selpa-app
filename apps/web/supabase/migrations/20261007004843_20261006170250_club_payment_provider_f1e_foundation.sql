-- F1E provider boundary. No backfill; no F1A function, lifecycle or grant is changed.
begin;

-- Vault is an explicit prerequisite, never a plaintext fallback.
do $$ begin
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null
    or to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') is null
    or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'PAYMENT_VAULT_REQUIRED';
  end if;
end $$;
-- service_role is the trusted backend role and retains Supabase-managed Vault privileges;
-- application code uses account-scoped provider RPCs only. Do not alter managed grants.
revoke all on schema vault from public, anon, authenticated;
revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;

create table public.club_payment_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  provider text not null default 'MERCADO_PAGO' check (provider = 'MERCADO_PAGO'),
  provider_account_id text not null check (provider_account_id ~ '^[0-9]+$'),
  access_token_secret_id uuid unique,
  refresh_token_secret_id uuid unique,
  token_expires_at timestamptz,
  refresh_claim uuid,
  refresh_claimed_at timestamptz,
  credential_error_code text,
  status text not null check (status in ('CONNECTED', 'RECONNECT_REQUIRED', 'DISCONNECTED')),
  live_mode boolean not null,
  connected_by uuid not null references auth.users(id) on delete restrict,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  check ((access_token_secret_id is null) = (refresh_token_secret_id is null)),
  check (status <> 'CONNECTED' or (access_token_secret_id is not null and token_expires_at is not null))
);
create unique index club_provider_connected_f1e_idx on public.club_payment_provider_accounts(club_id, provider)
  where status in ('CONNECTED', 'RECONNECT_REQUIRED');
create index club_provider_history_f1e_idx on public.club_payment_provider_accounts(club_id, connected_at desc);

create table public.club_payment_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  binding_hash text not null check (binding_hash ~ '^[0-9a-f]{64}$'),
  club_id uuid not null references public.clubs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  pkce_verifier_secret_id uuid unique,
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index club_payment_oauth_club_f1e_idx on public.club_payment_oauth_states(club_id, expires_at desc);
create index club_payment_oauth_cleanup_f1e_idx on public.club_payment_oauth_states(expires_at)
  where pkce_verifier_secret_id is not null;

create table public.club_payment_intents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  obligation_id uuid not null,
  provider text not null default 'MERCADO_PAGO' check (provider = 'MERCADO_PAGO'),
  provider_account_id uuid not null,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  currency_code text not null default 'ARS' check (currency_code = 'ARS'),
  amount numeric(14,2) not null check (amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')),
  marketplace_fee numeric(14,2) not null default 0 check (marketplace_fee >= 0 and marketplace_fee < amount),
  status text not null default 'CREATED' check (status in ('CREATED', 'CHECKOUT_READY', 'PENDING',
    'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'RECONCILIATION_REQUIRED')),
  provider_preference_id text unique,
  provider_payment_id text unique,
  finance_payment_id uuid,
  external_reference uuid not null default gen_random_uuid() unique,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  checkout_url text,
  checkout_claim uuid,
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, payer_user_id, idempotency_key),
  foreign key (club_id, obligation_id, currency_code)
    references public.club_finance_obligations(club_id, id, currency_code) on delete restrict,
  foreign key (club_id, provider_account_id)
    references public.club_payment_provider_accounts(club_id, id) on delete restrict,
  foreign key (club_id, finance_payment_id)
    references public.club_finance_payments(club_id, id) on delete restrict
);
create unique index club_payment_intent_active_f1e_idx on public.club_payment_intents(obligation_id, provider)
  where status in ('CREATED', 'CHECKOUT_READY', 'PENDING');
create index club_payment_intent_obligation_f1e_idx on public.club_payment_intents(club_id, obligation_id, created_at desc);
create index club_payment_intent_account_f1e_idx on public.club_payment_intents(club_id, provider_account_id);
create index club_payment_intent_reconcile_f1e_idx on public.club_payment_intents(club_id, updated_at desc)
  where status = 'RECONCILIATION_REQUIRED';

-- Immutable inbox plus append-only processing attempts: retry never rewrites evidence.
create table public.club_payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'MERCADO_PAGO' check (provider = 'MERCADO_PAGO'),
  account_id uuid not null references public.club_payment_provider_accounts(id) on delete restrict,
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type = 'payment'),
  provider_payment_id text not null check (provider_payment_id ~ '^[0-9]+$'),
  received_at timestamptz not null default now()
);
create index club_provider_event_account_f1e_idx on public.club_payment_provider_events(account_id, received_at desc);
create table public.club_payment_provider_event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_payment_provider_events(id) on delete restrict,
  intent_id uuid references public.club_payment_intents(id) on delete restrict,
  processing_status text not null check (processing_status in ('PROCESSED', 'IGNORED', 'RETRY', 'RECONCILIATION_REQUIRED')),
  error_code text,
  verified_snapshot jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default clock_timestamp()
);
create index club_provider_result_event_f1e_idx on public.club_payment_provider_event_results(event_id, processed_at desc);
create trigger club_provider_events_immutable before update or delete on public.club_payment_provider_events
  for each row execute function public.guard_club_finance_immutable();
create trigger club_provider_results_immutable before update or delete on public.club_payment_provider_event_results
  for each row execute function public.guard_club_finance_immutable();

create function public.require_payment_provider_service_f1e()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
end;
$$;

-- Bounded opportunistic cleanup; an expired/consumed verifier cannot be loaded even before cleanup.
-- Retain disconnected credentials only for unresolved/in-flight evidence or a 30-day late-notification window.
create function public.cleanup_payment_provider_secrets_internal_f1e()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v record;
begin
  for v in select state_hash, pkce_verifier_secret_id from public.club_payment_oauth_states
    where pkce_verifier_secret_id is not null and (expires_at <= now() or consumed_at is not null)
    order by expires_at limit 100 for update skip locked loop
    update public.club_payment_oauth_states set pkce_verifier_secret_id = null where state_hash = v.state_hash;
    delete from vault.secrets where id = v.pkce_verifier_secret_id;
  end loop;
  for v in select a.id, a.access_token_secret_id, a.refresh_token_secret_id
    from public.club_payment_provider_accounts a where a.status = 'DISCONNECTED' and a.access_token_secret_id is not null
    and not exists(select 1 from public.club_payment_intents i where i.provider_account_id = a.id and
      (i.status in ('CREATED','CHECKOUT_READY','PENDING','RECONCILIATION_REQUIRED') or i.updated_at > now() - interval '30 days'))
    and not exists(select 1 from public.club_payment_provider_events e where e.account_id = a.id and
      (select r.processing_status from public.club_payment_provider_event_results r where r.event_id = e.id
       order by r.processed_at desc, r.id desc limit 1) is distinct from 'PROCESSED')
    order by a.id limit 100 for update of a skip locked loop
    update public.club_payment_provider_accounts set access_token_secret_id = null, refresh_token_secret_id = null,
      token_expires_at = null, refresh_claim = null, refresh_claimed_at = null where id = v.id;
    delete from vault.secrets where id in (v.access_token_secret_id, v.refresh_token_secret_id);
  end loop;
end;
$$;
create function public.cleanup_payment_provider_secrets_f1e()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  perform public.cleanup_payment_provider_secrets_internal_f1e();
end;
$$;

-- Backend authenticates the actor, DB independently validates capability; authenticated cannot send an arbitrary actor/verifier.
create function public.start_payment_provider_oauth_f1e(p_club_id uuid, p_actor_id uuid, p_state_hash text, p_binding_hash text, p_verifier text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_secret uuid; v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  perform public.require_payment_provider_service_f1e();
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor_id, 'role', 'service_role')::text, true);
  if p_actor_id is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
  if p_verifier is null or p_verifier !~ '^[A-Za-z0-9_-]{43,128}$' then
    raise exception 'PAYMENT_OAUTH_INVALID' using errcode = '22023'; end if;
  perform public.cleanup_payment_provider_secrets_internal_f1e();
  v_secret := vault.create_secret(p_verifier, null, 'SELPA F1E PKCE');
  insert into public.club_payment_oauth_states(state_hash, binding_hash, club_id, actor_id, pkce_verifier_secret_id)
    values (p_state_hash, p_binding_hash, p_club_id, p_actor_id, v_secret);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$$;

create function public.consume_payment_provider_oauth_f1e(p_state_hash text, p_binding_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.club_payment_oauth_states%rowtype; v_verifier text;
begin
  perform public.require_payment_provider_service_f1e();
  perform public.cleanup_payment_provider_secrets_internal_f1e();
  update public.club_payment_oauth_states set consumed_at = now()
    where state_hash = p_state_hash and binding_hash = p_binding_hash
      and expires_at > now() and consumed_at is null returning * into v;
  if not found then raise exception 'PAYMENT_OAUTH_STATE_INVALID' using errcode = '42501'; end if;
  select decrypted_secret into v_verifier from vault.decrypted_secrets where id = v.pkce_verifier_secret_id;
  if v_verifier is null then raise exception 'PAYMENT_VAULT_UNAVAILABLE'; end if;
  update public.club_payment_oauth_states set pkce_verifier_secret_id = null where state_hash = v.state_hash;
  delete from vault.secrets where id = v.pkce_verifier_secret_id;
  -- This result is server-only. Verifier is deleted in the SAME transaction as one-time consume.
  return jsonb_build_object('club_id', v.club_id, 'actor_id', v.actor_id, 'verifier', v_verifier);
end;
$$;

create function public.complete_payment_provider_oauth_f1e(p_state_hash text, p_provider_account_id text,
  p_access_token text, p_refresh_token text, p_token_expires_at timestamptz, p_live_mode boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.club_payment_oauth_states%rowtype; v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true); v_access uuid; v_refresh uuid;
begin
  perform public.require_payment_provider_service_f1e();
  select * into v from public.club_payment_oauth_states where state_hash = p_state_hash for update;
  if v.state_hash is null or v.consumed_at is null or v.completed_at is not null or v.expires_at <= now() then
    raise exception 'PAYMENT_OAUTH_STATE_INVALID' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', v.actor_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v.actor_id, 'role', 'service_role')::text, true);
  if not public.has_club_capability(v.club_id, 'finance:manage') then
    raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(length(p_access_token),0) not between 1 and 8192 or coalesce(length(p_refresh_token),0) not between 1 and 8192
    or p_token_expires_at is null or p_token_expires_at <= now() then raise exception 'PAYMENT_CREDENTIALS_INVALID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider:' || v.club_id::text, 0));
  -- Both Vault writes and CONNECTED commit together. Any Vault failure rolls the whole RPC back.
  v_access := vault.create_secret(p_access_token, null, 'SELPA F1E access');
  v_refresh := vault.create_secret(p_refresh_token, null, 'SELPA F1E refresh');
  update public.club_payment_provider_accounts set status = 'DISCONNECTED', updated_at = now()
    where club_id = v.club_id and status in ('CONNECTED', 'RECONNECT_REQUIRED');
  insert into public.club_payment_provider_accounts(club_id, provider_account_id, access_token_secret_id, refresh_token_secret_id,
    token_expires_at, status, connected_by, live_mode)
    values(v.club_id, p_provider_account_id, v_access, v_refresh, p_token_expires_at, 'CONNECTED', v.actor_id, p_live_mode);
  update public.club_payment_oauth_states set completed_at = now() where state_hash = p_state_hash;
  perform public.cleanup_payment_provider_secrets_internal_f1e();
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$$;

create function public.disconnect_payment_provider_f1e(p_club_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider:' || p_club_id::text, 0));
  update public.club_payment_provider_accounts set status = 'DISCONNECTED', updated_at = now()
    where club_id = p_club_id and status in ('CONNECTED', 'RECONNECT_REQUIRED');
  perform public.cleanup_payment_provider_secrets_internal_f1e();
end;
$$;

-- One account-scoped credential boundary. No RPC accepts an arbitrary Vault secret UUID.
-- Claim outlives the short row-lock transaction; network I/O is outside PostgreSQL.
create function public.claim_payment_provider_credentials_f1e(p_account_id uuid, p_claim uuid, p_purpose text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.club_payment_provider_accounts%rowtype; v_access text; v_refresh text;
begin
  perform public.require_payment_provider_service_f1e();
  select * into a from public.club_payment_provider_accounts where id = p_account_id for update;
  if a.id is null or a.access_token_secret_id is null or a.status = 'RECONNECT_REQUIRED'
    or p_claim is null or p_purpose not in ('CHECKOUT','WEBHOOK') or p_purpose is null
    or (a.status = 'DISCONNECTED' and (p_purpose <> 'WEBHOOK' or not exists(
      select 1 from public.club_payment_intents where provider_account_id = a.id))) then
    raise exception 'PAYMENT_CREDENTIALS_UNAVAILABLE' using errcode = '42501'; end if;
  if a.refresh_claim is not null then
    if a.credential_error_code = 'REFRESH_UNCERTAIN' or a.refresh_claimed_at <= now() - interval '30 seconds' then
      -- A crashed/ambiguous rotation must not reuse a potentially consumed refresh token.
      update public.club_payment_provider_accounts set credential_error_code = 'REFRESH_UNCERTAIN' where id = a.id;
      return jsonb_build_object('kind','UNCERTAIN');
    end if;
    return jsonb_build_object('kind','BUSY');
  end if;
  select decrypted_secret into v_access from vault.decrypted_secrets where id = a.access_token_secret_id;
  if v_access is null then raise exception 'PAYMENT_VAULT_UNAVAILABLE'; end if;
  if a.token_expires_at > now() + interval '60 seconds' then
    return jsonb_build_object('kind','READY','accessToken',v_access);
  end if;
  select decrypted_secret into v_refresh from vault.decrypted_secrets where id = a.refresh_token_secret_id;
  if v_refresh is null then raise exception 'PAYMENT_VAULT_UNAVAILABLE'; end if;
  update public.club_payment_provider_accounts set refresh_claim = p_claim, refresh_claimed_at = now(), credential_error_code = null where id = a.id;
  return jsonb_build_object('kind','REFRESH','tokens',jsonb_build_object('accessToken',v_access,'refreshToken',v_refresh,
    'accountId',a.provider_account_id,'expiresAt',extract(epoch from a.token_expires_at)*1000,'liveMode',a.live_mode));
end;
$$;

create function public.rotate_payment_provider_credentials_f1e(p_account_id uuid, p_claim uuid,
  p_provider_account_id text, p_access_token text, p_refresh_token text, p_token_expires_at timestamptz, p_live_mode boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.club_payment_provider_accounts%rowtype;
begin
  perform public.require_payment_provider_service_f1e();
  select * into a from public.club_payment_provider_accounts where id = p_account_id for update;
  if a.id is null or a.refresh_claim is distinct from p_claim or p_claim is null
    or a.access_token_secret_id is null or a.status = 'RECONNECT_REQUIRED'
    or a.provider_account_id is distinct from p_provider_account_id or a.live_mode is distinct from p_live_mode then
    raise exception 'PAYMENT_ROTATION_STALE' using errcode = '42501'; end if;
  if coalesce(length(p_access_token),0) not between 1 and 8192 or coalesce(length(p_refresh_token),0) not between 1 and 8192
    or p_token_expires_at is null or p_token_expires_at <= now() then raise exception 'PAYMENT_CREDENTIALS_INVALID' using errcode = '22023'; end if;
  perform vault.update_secret(a.access_token_secret_id, p_access_token);
  perform vault.update_secret(a.refresh_token_secret_id, p_refresh_token);
  update public.club_payment_provider_accounts set token_expires_at = p_token_expires_at,
    refresh_claim = null, refresh_claimed_at = null, credential_error_code = null, updated_at = now() where id = a.id;
end;
$$;

create function public.fail_payment_provider_refresh_f1e(p_account_id uuid, p_claim uuid, p_definitive boolean, p_uncertain boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  -- Preserve both old secrets. Definitive authorization failures alone request reconnection.
  update public.club_payment_provider_accounts set status = case when p_definitive and status = 'CONNECTED' then 'RECONNECT_REQUIRED' else status end,
    credential_error_code = case when p_definitive then 'AUTHORIZATION_REVOKED' when p_uncertain then 'REFRESH_UNCERTAIN' else 'REFRESH_RETRY' end,
    refresh_claim = case when p_uncertain and not p_definitive then refresh_claim else null end,
    refresh_claimed_at = case when p_uncertain and not p_definitive then refresh_claimed_at else null end, updated_at = now()
    where id = p_account_id and refresh_claim = p_claim;
end;
$$;

create function public.payment_provider_account_internal_f1e(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  return (select to_jsonb(a) from public.club_payment_provider_accounts a where id = p_account_id);
end;
$$;

-- Claim under the same obligation lock as manual F1A payments; no network call inside DB.
create function public.prepare_club_payment_intent_f1e(p_obligation_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare o public.club_finance_obligations%rowtype; a public.club_payment_provider_accounts%rowtype;
  v_intent public.club_payment_intents%rowtype; v_balance numeric;
begin
  if not exists (select 1 from public.player_finance_visible_obligations_f1d(null) where id = p_obligation_id) then
    raise exception 'PAYMENT_OBLIGATION_FORBIDDEN' using errcode = '42501'; end if;
  select co.* into o from public.club_finance_obligations co where co.id = p_obligation_id for update;
  v_balance := (public.club_finance_obligation_projection_internal(o.club_id, o.id)->>'balance')::numeric;
  if o.status <> 'OPEN' or o.currency_code <> 'ARS' or v_balance <= 0 then
    raise exception 'PAYMENT_BALANCE_NOT_PAYABLE' using errcode = '23514'; end if;
  select ca.* into a from public.club_payment_provider_accounts ca where ca.club_id = o.club_id and ca.status = 'CONNECTED';
  if not found then raise exception 'PAYMENT_PROVIDER_NOT_CONNECTED' using errcode = '23514'; end if;
  select ci.* into v_intent from public.club_payment_intents ci where ci.club_id = o.club_id
    and ci.payer_user_id = auth.uid() and ci.idempotency_key = p_idempotency_key;
  if found and v_intent.obligation_id <> o.id then raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
  if found and v_intent.status not in ('CREATED', 'CHECKOUT_READY', 'PENDING') then
    raise exception 'PAYMENT_ATTEMPT_TERMINAL' using errcode = '23514'; end if;
  if exists (select 1 from public.club_payment_intents ci where ci.obligation_id = o.id and ci.status = 'RECONCILIATION_REQUIRED') then
    raise exception 'PAYMENT_RECONCILIATION_REQUIRED' using errcode = '23514'; end if;
  if exists(select 1 from public.club_payment_intents ci join public.club_finance_payments cp
    on cp.id = ci.finance_payment_id and cp.club_id = ci.club_id
    where ci.obligation_id = o.id and cp.status = 'REVERSED') then
    raise exception 'PAYMENT_RECONCILIATION_REQUIRED' using errcode = '23514'; end if;
  select ci.* into v_intent from public.club_payment_intents ci where ci.obligation_id = o.id
    and ci.status in ('CREATED', 'CHECKOUT_READY', 'PENDING') for update;
  if found and v_intent.amount = v_balance and v_intent.provider_account_id = a.id and v_intent.expires_at > now()
    and (v_intent.provider_preference_id is not null or v_intent.checkout_claim is null or v_intent.claimed_at > now() - interval '2 minutes') then return to_jsonb(v_intent); end if;
  -- A claimed preference or pending payment may already exist externally: never blindly retry it.
  if found and (v_intent.checkout_claim is not null and v_intent.provider_preference_id is null or v_intent.status = 'PENDING') then
    update public.club_payment_intents ci set status = 'RECONCILIATION_REQUIRED', error_code = 'CHECKOUT_UNCERTAIN', updated_at = now() where ci.id = v_intent.id;
    return jsonb_build_object('status', 'RECONCILIATION_REQUIRED');
  end if;
  if v_intent.id is not null then
    update public.club_payment_intents ci set status = 'EXPIRED', updated_at = now() where ci.id = v_intent.id;
  end if;
  insert into public.club_payment_intents as ci(club_id, obligation_id, provider_account_id, payer_user_id, amount, idempotency_key)
    values(o.club_id, o.id, a.id, auth.uid(), v_balance, p_idempotency_key) returning ci.* into v_intent;
  return to_jsonb(v_intent);
end;
$$;

create function public.claim_club_payment_checkout_f1e(p_intent_id uuid, p_claim uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare i public.club_payment_intents%rowtype; v_stale jsonb;
begin
  perform public.require_payment_provider_service_f1e();
  update public.club_payment_intents set checkout_claim = p_claim, claimed_at = now(), updated_at = now()
    where id = p_intent_id and status = 'CREATED' and checkout_claim is null and expires_at > now() returning * into i;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_id', provider_account_id, 'preference_id', provider_preference_id)), '[]') into v_stale
    from public.club_payment_intents where obligation_id = i.obligation_id and status = 'EXPIRED' and provider_preference_id is not null;
  return to_jsonb(i) || jsonb_build_object('stale_preferences', v_stale);
end;
$$;

create function public.finish_club_payment_checkout_f1e(p_intent_id uuid, p_claim uuid, p_preference_id text, p_checkout_url text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  if p_preference_id is null or p_checkout_url is null or p_checkout_url !~ '^https://((www|sandbox)\.)?mercadopago\.com\.ar/' then
    raise exception 'PAYMENT_CHECKOUT_INVALID' using errcode = '22023'; end if;
  update public.club_payment_intents set provider_preference_id = p_preference_id, checkout_url = p_checkout_url,
    status = 'CHECKOUT_READY', updated_at = now()
    where id = p_intent_id and checkout_claim = p_claim and status = 'CREATED' and expires_at > now();
  if not found then raise exception 'PAYMENT_CHECKOUT_STALE' using errcode = '23514'; end if;
end;
$$;

create function public.fail_club_payment_checkout_f1e(p_intent_id uuid, p_claim uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  update public.club_payment_intents set status = 'RECONCILIATION_REQUIRED', error_code = 'CHECKOUT_UNCERTAIN', updated_at = now()
    where id = p_intent_id and checkout_claim = p_claim and status = 'CREATED';
end;
$$;

create function public.record_payment_provider_event_f1e(p_account_id uuid, p_fingerprint text, p_payment_id text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  perform public.require_payment_provider_service_f1e();
  insert into public.club_payment_provider_events(account_id, fingerprint, event_type, provider_payment_id)
    values(p_account_id, p_fingerprint, 'payment', p_payment_id) on conflict (fingerprint) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.club_payment_provider_events where fingerprint = p_fingerprint
    and account_id = p_account_id and provider_payment_id = p_payment_id; end if;
  if v_id is null then raise exception 'PAYMENT_EVENT_CONFLICT' using errcode = '23505'; end if;
  return v_id;
end;
$$;

create function public.record_payment_provider_retry_f1e(p_event_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  insert into public.club_payment_provider_event_results(event_id, processing_status, error_code)
    values(p_event_id, 'RETRY', 'PROVIDER_API_UNAVAILABLE');
end;
$$;

create function public.mark_payment_provider_reconnect_f1e(p_account_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.require_payment_provider_service_f1e();
  update public.club_payment_provider_accounts set status = 'RECONNECT_REQUIRED', updated_at = now()
    where id = p_account_id and status = 'CONNECTED';
end;
$$;

create function public.reconcile_payment_provider_event_f1e(p_event_id uuid, p_payment jsonb)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare e public.club_payment_provider_events%rowtype; a public.club_payment_provider_accounts%rowtype;
  i public.club_payment_intents%rowtype; o public.club_finance_obligations%rowtype; v_result jsonb;
  v_reason text; v_state text; v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true); v_snapshot jsonb;
begin
  perform public.require_payment_provider_service_f1e();
  select * into strict e from public.club_payment_provider_events where id = p_event_id;
  select * into strict a from public.club_payment_provider_accounts where id = e.account_id;
  select * into i from public.club_payment_intents where external_reference::text = p_payment->>'external_reference'
    and provider_account_id = a.id;
  if i.id is not null then
    select * into o from public.club_finance_obligations where club_id = i.club_id and id = i.obligation_id;
  end if;
  v_snapshot := jsonb_build_object('id', p_payment->>'id', 'status', p_payment->>'status',
    'amount', p_payment->>'amount', 'currency', p_payment->>'currency', 'collector_id', p_payment->>'collector_id',
    'external_reference', p_payment->>'external_reference', 'live_mode', p_payment->'live_mode',
    'paid_at', p_payment->>'paid_at', 'captured', p_payment->'captured');
  if i.id is null then v_reason := 'EXTERNAL_REFERENCE_MISMATCH';
  elsif p_payment->>'id' is distinct from e.provider_payment_id or p_payment->>'collector_id' is distinct from a.provider_account_id then v_reason := 'PROVIDER_OWNERSHIP_MISMATCH';
  elsif p_payment->>'currency' is distinct from i.currency_code then v_reason := 'CURRENCY_MISMATCH';
  elsif (p_payment->>'amount')::numeric is distinct from i.amount then v_reason := 'AMOUNT_MISMATCH';
  elsif (p_payment->>'live_mode')::boolean is distinct from a.live_mode then v_reason := 'PROVIDER_MODE_MISMATCH';
  elsif i.finance_payment_id is not null then
    if p_payment->>'status' = 'approved' and i.provider_payment_id = e.provider_payment_id then v_state := 'PROCESSED';
    else v_reason := 'EXTERNAL_PAYMENT_REQUIRES_REVIEW'; end if;
  elsif p_payment->>'status' = 'approved' then
    if i.status in ('EXPIRED', 'CANCELLED', 'RECONCILIATION_REQUIRED') then v_reason := 'INTENT_NOT_APPLICABLE';
    elsif o.status <> 'OPEN' or (public.club_finance_obligation_projection_internal(o.club_id, o.id)->>'balance')::numeric <> i.amount then v_reason := 'BALANCE_CHANGED';
    elsif (p_payment->>'captured')::boolean is distinct from true or p_payment->>'paid_at' is null then v_reason := 'PAYMENT_NOT_CAPTURED';
    else
      -- Delegation is confined to this service-only bridge. F1A itself is unchanged.
      -- The original connecting admin is revalidated on every accounting attempt.
      begin
        perform set_config('request.jwt.claim.sub', a.connected_by::text, true);
        perform set_config('request.jwt.claims', jsonb_build_object('sub', a.connected_by, 'role', 'service_role')::text, true);
        if not public.has_club_capability(i.club_id, 'finance:manage') then
          raise exception 'PAYMENT_DELEGATION_REVOKED' using errcode = '42501'; end if;
        v_result := public.register_club_finance_payment(i.club_id, i.obligation_id, i.amount, i.currency_code,
          'OTHER', 'mp:' || e.provider_payment_id, (p_payment->>'paid_at')::timestamptz,
          'MP:' || e.provider_payment_id, 'Mercado Pago · conciliación automática autorizada por conexión OAuth', i.payer_user_id);
        -- F1A owns command -> obligation locks. Acquire intent only afterwards, in that order.
        select * into i from public.club_payment_intents where id = i.id for update;
        if i.status in ('EXPIRED', 'CANCELLED', 'RECONCILIATION_REQUIRED') or
          (public.club_finance_obligation_projection_internal(i.club_id, i.obligation_id)->>'balance')::numeric <> 0 then
          raise exception 'PAYMENT_BALANCE_CHANGED' using errcode = '23514'; end if;
        update public.club_payment_intents set status = 'APPROVED', provider_payment_id = e.provider_payment_id,
          finance_payment_id = (v_result->>'payment_id')::uuid, error_code = null, updated_at = now() where id = i.id;
        v_state := 'PROCESSED';
      exception when serialization_failure or deadlock_detected then raise;
      when others then
        -- Subtransaction rolls back payment, allocation and journal together.
        v_reason := 'LEDGER_REJECTED_' || sqlstate;
      end;
    end if;
  elsif p_payment->>'status' in ('rejected', 'cancelled') then
    if i.status not in ('EXPIRED', 'RECONCILIATION_REQUIRED') then
      -- A rejected/cancelled payment attempt does not retire its Checkout Pro preference.
      update public.club_payment_intents set status = case when expires_at <= now() then 'EXPIRED'
        when provider_preference_id is not null then 'CHECKOUT_READY' else 'CREATED' end,
        error_code = case when p_payment->>'status' = 'rejected' then 'LAST_ATTEMPT_REJECTED' else 'LAST_ATTEMPT_CANCELLED' end,
        updated_at = now() where id = i.id;
    end if;
    v_state := 'IGNORED';
  elsif p_payment->>'status' in ('pending', 'in_process', 'authorized', 'in_mediation') then
    update public.club_payment_intents set status = 'PENDING', updated_at = now() where id = i.id and status in ('CREATED', 'CHECKOUT_READY', 'PENDING');
    v_state := 'IGNORED';
  else v_reason := 'PROVIDER_STATUS_REQUIRES_REVIEW'; end if;
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_reason is not null then
    v_state := 'RECONCILIATION_REQUIRED';
    update public.club_payment_intents set status = v_state, error_code = v_reason, updated_at = now() where id = i.id;
  end if;
  insert into public.club_payment_provider_event_results(event_id, intent_id, processing_status, error_code, verified_snapshot)
    values(e.id, i.id, v_state, v_reason, v_snapshot);
  return v_state;
end;
$$;

create function public.get_club_payment_provider_f1e(p_club_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object('status', case when exists(select 1 from public.club_payment_oauth_states
    where club_id = p_club_id and expires_at > now() and consumed_at is null)
    then 'CONNECTING' else coalesce((select status from public.club_payment_provider_accounts
    where club_id = p_club_id order by connected_at desc limit 1),
    case when exists(select 1 from public.club_payment_oauth_states where club_id = p_club_id and expires_at > now() and completed_at is null)
      then 'CONNECTING' else 'NOT_CONNECTED' end) end,
    'issues', (select coalesce(jsonb_agg(x.item), '[]'::jsonb) from (
      select jsonb_build_object('concept', o.concept, 'amount', i.amount, 'created_at', i.created_at) item
      from public.club_payment_intents i join public.club_finance_obligations o on o.club_id = i.club_id and o.id = i.obligation_id
      left join public.club_finance_payments p on p.club_id = i.club_id and p.id = i.finance_payment_id
      where i.club_id = p_club_id and (i.status = 'RECONCILIATION_REQUIRED' or p.status = 'REVERSED')
      order by i.updated_at desc limit 5) x),
    'reconciliation_required', (select count(*) from public.club_payment_intents i
      left join public.club_finance_payments p on p.club_id = i.club_id and p.id = i.finance_payment_id
      where i.club_id = p_club_id and (i.status = 'RECONCILIATION_REQUIRED' or p.status = 'REVERSED')) +
      (select count(*) from public.club_payment_provider_events e
       join public.club_payment_provider_accounts a on a.id = e.account_id
       join lateral (select r.intent_id, r.processing_status from public.club_payment_provider_event_results r
         where r.event_id = e.id order by r.processed_at desc, r.id desc limit 1) r on true
       where a.club_id = p_club_id and r.intent_id is null and r.processing_status = 'RECONCILIATION_REQUIRED'));
end;
$$;

create function public.get_player_payment_options_f1e(p_ids uuid[])
returns table(item jsonb) language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if cardinality(p_ids) > 51 then raise exception 'PAYMENT_PAGE_INVALID' using errcode = '22023'; end if;
  return query select jsonb_build_object('id', o.id, 'payable', o.status = 'OPEN' and
    (public.club_finance_obligation_projection_internal(o.club_id, o.id)->>'balance')::numeric > 0 and
    exists(select 1 from public.club_payment_provider_accounts a where a.club_id = o.club_id and a.status = 'CONNECTED') and
    not exists(select 1 from public.club_payment_intents i where i.obligation_id = o.id and i.status in ('PENDING', 'RECONCILIATION_REQUIRED')) and
    not exists(select 1 from public.club_payment_intents i join public.club_finance_payments p
      on p.id = i.finance_payment_id and p.club_id = i.club_id where i.obligation_id = o.id and p.status = 'REVERSED'),
    'status', (select case when p.status = 'REVERSED' then 'RECONCILIATION_REQUIRED' else i.status end
      from public.club_payment_intents i left join public.club_finance_payments p on p.club_id = i.club_id and p.id = i.finance_payment_id
      where i.obligation_id = o.id order by i.created_at desc limit 1))
    from public.player_finance_visible_obligations_f1d(null) o where o.id = any(p_ids);
end;
$$;

create function public.get_payment_movement_labels_f1e(p_club_id uuid, p_ids uuid[])
returns table(item jsonb) language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or cardinality(p_ids) > 51 then raise exception 'PAYMENT_PAGE_INVALID' using errcode = '42501'; end if;
  if p_club_id is not null and not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'PAYMENT_PROVIDER_FORBIDDEN' using errcode = '42501'; end if;
  return query select jsonb_build_object('id', case when p_club_id is null then a.id else p.id end, 'provider', i.provider)
    from public.club_payment_intents i
    join public.club_finance_payments p on p.club_id = i.club_id and p.id = i.finance_payment_id
    join public.club_finance_allocations a on a.club_id = p.club_id and a.payment_id = p.id
    where ((p_club_id is not null and i.club_id = p_club_id and p.id = any(p_ids)) or
      (p_club_id is null and a.id = any(p_ids) and exists (select 1 from public.player_finance_visible_obligations_f1d(null) o where o.id = a.obligation_id)));
end;
$$;

create function public.get_player_payment_return_f1e(p_reference uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_status text;
begin
  select case when p.status = 'REVERSED' then 'REVERSED'
    when i.status in ('CREATED', 'CHECKOUT_READY') and i.error_code = 'LAST_ATTEMPT_REJECTED' then 'REJECTED'
    when i.status in ('CREATED', 'CHECKOUT_READY') and i.error_code = 'LAST_ATTEMPT_CANCELLED' then 'CANCELLED' else i.status end into v_status from public.club_payment_intents i
    left join public.club_finance_payments p on p.club_id = i.club_id and p.id = i.finance_payment_id
    where i.external_reference = p_reference and exists(select 1 from public.player_finance_visible_obligations_f1d(null) o where o.id = i.obligation_id);
  if v_status is null then raise exception 'PAYMENT_OBLIGATION_FORBIDDEN' using errcode = '42501'; end if;
  return v_status;
end;
$$;

alter table public.club_payment_provider_accounts enable row level security;
alter table public.club_payment_oauth_states enable row level security;
alter table public.club_payment_intents enable row level security;
alter table public.club_payment_provider_events enable row level security;
alter table public.club_payment_provider_event_results enable row level security;
revoke all on table public.club_payment_provider_accounts, public.club_payment_oauth_states,
  public.club_payment_intents, public.club_payment_provider_events, public.club_payment_provider_event_results
  from public, anon, authenticated, service_role;
-- No raw table grants. All access passes through scoped RPCs.
revoke all on function public.require_payment_provider_service_f1e(),
  public.cleanup_payment_provider_secrets_internal_f1e(), public.cleanup_payment_provider_secrets_f1e(),
  public.claim_payment_provider_credentials_f1e(uuid, uuid, text),
  public.rotate_payment_provider_credentials_f1e(uuid, uuid, text, text, text, timestamptz, boolean),
  public.fail_payment_provider_refresh_f1e(uuid, uuid, boolean, boolean),
  public.start_payment_provider_oauth_f1e(uuid, uuid, text, text, text),
  public.consume_payment_provider_oauth_f1e(text, text),
  public.complete_payment_provider_oauth_f1e(text, text, text, text, timestamptz, boolean),
  public.disconnect_payment_provider_f1e(uuid), public.payment_provider_account_internal_f1e(uuid),
  public.prepare_club_payment_intent_f1e(uuid, text), public.claim_club_payment_checkout_f1e(uuid, uuid),
  public.finish_club_payment_checkout_f1e(uuid, uuid, text, text), public.fail_club_payment_checkout_f1e(uuid, uuid),
  public.record_payment_provider_event_f1e(uuid, text, text), public.reconcile_payment_provider_event_f1e(uuid, jsonb),
  public.get_club_payment_provider_f1e(uuid), public.get_player_payment_options_f1e(uuid[]),
  public.get_payment_movement_labels_f1e(uuid, uuid[]), public.get_player_payment_return_f1e(uuid),
  public.record_payment_provider_retry_f1e(uuid), public.mark_payment_provider_reconnect_f1e(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.disconnect_payment_provider_f1e(uuid), public.prepare_club_payment_intent_f1e(uuid, text),
  public.get_club_payment_provider_f1e(uuid), public.get_player_payment_options_f1e(uuid[]),
  public.get_payment_movement_labels_f1e(uuid, uuid[]), public.get_player_payment_return_f1e(uuid) to authenticated;
grant execute on function public.start_payment_provider_oauth_f1e(uuid, uuid, text, text, text),
  public.consume_payment_provider_oauth_f1e(text, text),
  public.complete_payment_provider_oauth_f1e(text, text, text, text, timestamptz, boolean), public.payment_provider_account_internal_f1e(uuid),
  public.cleanup_payment_provider_secrets_f1e(), public.claim_payment_provider_credentials_f1e(uuid, uuid, text),
  public.rotate_payment_provider_credentials_f1e(uuid, uuid, text, text, text, timestamptz, boolean),
  public.fail_payment_provider_refresh_f1e(uuid, uuid, boolean, boolean),
  public.claim_club_payment_checkout_f1e(uuid, uuid), public.finish_club_payment_checkout_f1e(uuid, uuid, text, text),
  public.fail_club_payment_checkout_f1e(uuid, uuid), public.record_payment_provider_event_f1e(uuid, text, text),
  public.record_payment_provider_retry_f1e(uuid), public.mark_payment_provider_reconnect_f1e(uuid),
  public.reconcile_payment_provider_event_f1e(uuid, jsonb) to service_role;
commit;
