-- Club Finance F1A. Coexists with legacy club finance and tournament payment requests.
-- No existing financial row is copied or reinterpreted as collected money.
begin;

create table public.club_finance_obligations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  debtor_type text not null check (debtor_type in ('USER', 'TEAM', 'THIRD_PARTY')),
  debtor_user_id uuid references auth.users(id) on delete restrict,
  debtor_team_id uuid references public.tournament_teams(id) on delete restrict,
  debtor_name text,
  source_type text not null check (source_type in ('MANUAL', 'TOURNAMENT_REGISTRATION')),
  source_id uuid,
  tournament_id uuid references public.tournaments(id) on delete restrict,
  registration_id uuid references public.tournament_registrations(id) on delete restrict,
  team_id uuid references public.tournament_teams(id) on delete restrict,
  concept text not null check (length(btrim(concept)) between 2 and 180),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  original_amount numeric(14,2) not null check (
    original_amount >= 0 and original_amount::text not in ('NaN', 'Infinity', '-Infinity')),
  revision integer not null default 1 check (revision > 0),
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN', 'CANCELLED')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  unique (club_id, id),
  unique (club_id, id, currency_code),
  constraint club_finance_obligation_debtor_check check (
    (debtor_type = 'USER' and debtor_user_id is not null and debtor_team_id is null and debtor_name is null) or
    (debtor_type = 'TEAM' and debtor_user_id is null and debtor_team_id is not null and debtor_name is null) or
    (debtor_type = 'THIRD_PARTY' and debtor_user_id is null and debtor_team_id is null
      and length(btrim(coalesce(debtor_name, ''))) between 2 and 160)
  ),
  constraint club_finance_obligation_cancel_check check (
    (status = 'OPEN' and cancelled_by is null and cancelled_at is null and cancel_reason is null) or
    (status = 'CANCELLED' and cancelled_by is not null and cancelled_at is not null
      and length(btrim(coalesce(cancel_reason, ''))) >= 3)
  ),
  constraint club_finance_obligation_source_check check (
    source_type = 'MANUAL' or (source_type = 'TOURNAMENT_REGISTRATION' and source_id is not null
      and source_id = registration_id
      and registration_id is not null and tournament_id is not null and team_id is not null
      and (debtor_type <> 'TEAM' or debtor_team_id = team_id))
  )
);
create unique index club_finance_obligation_source_uidx
  on public.club_finance_obligations(club_id, source_type, source_id) where source_id is not null;
create index club_finance_obligation_club_due_idx
  on public.club_finance_obligations(club_id, currency_code, due_date) where status = 'OPEN';
create index club_finance_obligation_registration_idx
  on public.club_finance_obligations(club_id, registration_id) where registration_id is not null;

create table public.club_finance_payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  payer_user_id uuid references auth.users(id) on delete restrict,
  amount numeric(14,2) not null check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  payment_method text not null check (payment_method in ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER')),
  paid_at timestamptz not null,
  reference text check (reference is null or length(reference) <= 180),
  notes text check (notes is null or length(notes) <= 2000),
  source_type text not null default 'MANUAL' check (source_type = 'MANUAL'),
  source_id uuid,
  status text not null default 'POSTED' check (status in ('POSTED', 'REVERSED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  unique (club_id, id),
  unique (club_id, id, currency_code),
  constraint club_finance_payment_reversal_check check (
    (status = 'POSTED' and reversed_by is null and reversed_at is null and reversal_reason is null) or
    (status = 'REVERSED' and reversed_by is not null and reversed_at is not null
      and length(btrim(coalesce(reversal_reason, ''))) >= 3)
  )
);
create unique index club_finance_payment_source_uidx
  on public.club_finance_payments(club_id, source_type, source_id) where source_id is not null;
create index club_finance_payment_club_paid_idx
  on public.club_finance_payments(club_id, currency_code, paid_at desc);

create table public.club_finance_allocations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  payment_id uuid not null,
  obligation_id uuid not null,
  amount numeric(14,2) not null check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (club_id, payment_id, obligation_id),
  foreign key (club_id, payment_id, currency_code)
    references public.club_finance_payments(club_id, id, currency_code) on delete restrict,
  foreign key (club_id, obligation_id, currency_code)
    references public.club_finance_obligations(club_id, id, currency_code) on delete restrict
);
create index club_finance_allocation_obligation_idx on public.club_finance_allocations(club_id, obligation_id);

create table public.club_finance_journals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  event_type text not null check (event_type in
    ('OBLIGATION_CREATED', 'PAYMENT_RECEIVED', 'PAYMENT_REVERSED', 'OBLIGATION_CANCELLED')),
  obligation_id uuid not null,
  payment_id uuid,
  reason text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (club_id, id, currency_code),
  foreign key (club_id, obligation_id, currency_code)
    references public.club_finance_obligations(club_id, id, currency_code) on delete restrict,
  foreign key (club_id, payment_id, currency_code)
    references public.club_finance_payments(club_id, id, currency_code) on delete restrict,
  constraint club_finance_journal_payment_check check (
    (event_type in ('OBLIGATION_CREATED', 'OBLIGATION_CANCELLED') and payment_id is null) or
    (event_type in ('PAYMENT_RECEIVED', 'PAYMENT_REVERSED') and payment_id is not null)
  )
);
create index club_finance_journal_club_created_idx on public.club_finance_journals(club_id, created_at desc);
create index club_finance_journal_obligation_idx on public.club_finance_journals(club_id, obligation_id);
create index club_finance_journal_payment_idx
  on public.club_finance_journals(club_id, payment_id) where payment_id is not null;
create unique index club_finance_journal_obligation_event_uidx
  on public.club_finance_journals(club_id, obligation_id, event_type)
  where event_type in ('OBLIGATION_CREATED', 'OBLIGATION_CANCELLED');
create unique index club_finance_journal_payment_event_uidx
  on public.club_finance_journals(club_id, payment_id, event_type)
  where event_type in ('PAYMENT_RECEIVED', 'PAYMENT_REVERSED');

create table public.club_finance_postings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  journal_id uuid not null,
  currency_code text not null,
  line_number smallint not null check (line_number in (1, 2)),
  account text not null check (account in ('ACCOUNTS_RECEIVABLE', 'CASH', 'OBLIGATION_CLEARING')),
  side text not null check (side in ('DEBIT', 'CREDIT')),
  amount numeric(14,2) not null check (
    amount > 0 and amount::text not in ('NaN', 'Infinity', '-Infinity')),
  created_at timestamptz not null default now(),
  unique (journal_id, line_number),
  foreign key (club_id, journal_id, currency_code)
    references public.club_finance_journals(club_id, id, currency_code) on delete restrict
);
create index club_finance_posting_club_account_idx on public.club_finance_postings(club_id, currency_code, account);

create table public.club_finance_commands (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in
    ('CREATE_OBLIGATION', 'REGISTER_PAYMENT', 'REVERSE_PAYMENT', 'CANCEL_OBLIGATION')),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 200),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (club_id, operation, idempotency_key),
  constraint club_finance_command_response_check check (
    (response_payload is null and completed_at is null) or
    (jsonb_typeof(response_payload) = 'object' and completed_at is not null)
  )
);

-- Posted journals and allocations are never economically rewritten or deleted.
create function public.guard_club_finance_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  raise exception 'CLUB_FINANCE_IMMUTABLE' using errcode = '23514';
end;
$$;
create trigger club_finance_allocation_immutable before update or delete on public.club_finance_allocations
  for each row execute function public.guard_club_finance_immutable();
create trigger club_finance_journal_immutable before update or delete on public.club_finance_journals
  for each row execute function public.guard_club_finance_immutable();
create trigger club_finance_posting_immutable before update or delete on public.club_finance_postings
  for each row execute function public.guard_club_finance_immutable();

create function public.validate_club_finance_allocation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_payment public.club_finance_payments%rowtype;
  v_obligation public.club_finance_obligations%rowtype;
  v_payment_allocated numeric; v_obligation_allocated numeric;
begin
  -- Canonical lock order: obligation, then payment. Every allocation changes
  -- the obligation row, including allocations inserted by future privileged RPCs.
  perform set_config('selpa.club_finance_write', 'allowed', true);
  update public.club_finance_obligations
  set revision = revision + 1
  where club_id = new.club_id and id = new.obligation_id and status = 'OPEN'
  returning * into v_obligation;
  select * into v_payment from public.club_finance_payments
  where club_id = new.club_id and id = new.payment_id for update;
  if v_payment.id is null or v_obligation.id is null
     or v_payment.status <> 'POSTED' or v_obligation.status <> 'OPEN'
     or new.currency_code <> v_payment.currency_code
     or new.currency_code <> v_obligation.currency_code then
    raise exception 'CLUB_FINANCE_ALLOCATION_SCOPE_INVALID' using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into v_payment_allocated
  from public.club_finance_allocations where club_id = new.club_id and payment_id = new.payment_id;
  select coalesce(sum(a.amount), 0) into v_obligation_allocated
  from public.club_finance_allocations a
  join public.club_finance_payments p on p.id = a.payment_id and p.club_id = a.club_id
  where a.club_id = new.club_id and a.obligation_id = new.obligation_id and p.status = 'POSTED';
  if v_payment_allocated + new.amount > v_payment.amount
     or v_obligation_allocated + new.amount > v_obligation.original_amount then
    raise exception 'CLUB_FINANCE_OVER_ALLOCATION' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger club_finance_allocation_validate before insert on public.club_finance_allocations
  for each row execute function public.validate_club_finance_allocation();

create function public.validate_club_finance_journal_balance()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_count integer; v_debit numeric; v_credit numeric; v_pattern boolean;
  v_debit_account text; v_credit_account text; v_expected_amount numeric;
  v_obligation public.club_finance_obligations%rowtype;
  v_payment public.club_finance_payments%rowtype;
  v_allocation public.club_finance_allocations%rowtype;
begin
  v_debit_account := case new.event_type
    when 'OBLIGATION_CREATED' then 'ACCOUNTS_RECEIVABLE'
    when 'PAYMENT_RECEIVED' then 'CASH'
    when 'PAYMENT_REVERSED' then 'ACCOUNTS_RECEIVABLE'
    when 'OBLIGATION_CANCELLED' then 'OBLIGATION_CLEARING'
  end;
  v_credit_account := case new.event_type
    when 'OBLIGATION_CREATED' then 'OBLIGATION_CLEARING'
    when 'PAYMENT_RECEIVED' then 'ACCOUNTS_RECEIVABLE'
    when 'PAYMENT_REVERSED' then 'CASH'
    when 'OBLIGATION_CANCELLED' then 'ACCOUNTS_RECEIVABLE'
  end;
  if new.event_type in ('OBLIGATION_CREATED', 'OBLIGATION_CANCELLED') then
    select * into v_obligation from public.club_finance_obligations
    where club_id = new.club_id and id = new.obligation_id
      and currency_code = new.currency_code;
    if v_obligation.id is null
       or (new.event_type = 'OBLIGATION_CANCELLED' and v_obligation.status <> 'CANCELLED') then
      raise exception 'CLUB_FINANCE_JOURNAL_SOURCE_INVALID' using errcode = '23514';
    end if;
    v_expected_amount := v_obligation.original_amount;
  else
    select * into v_payment from public.club_finance_payments
    where club_id = new.club_id and id = new.payment_id
      and currency_code = new.currency_code;
    if v_payment.id is null
       or (new.event_type = 'PAYMENT_REVERSED' and v_payment.status <> 'REVERSED') then
      raise exception 'CLUB_FINANCE_JOURNAL_SOURCE_INVALID' using errcode = '23514';
    end if;
    select * into strict v_allocation from public.club_finance_allocations
    where club_id = new.club_id and payment_id = new.payment_id;
    if v_allocation.obligation_id <> new.obligation_id
       or v_allocation.amount <> v_payment.amount then
      raise exception 'CLUB_FINANCE_JOURNAL_SOURCE_INVALID' using errcode = '23514';
    end if;
    v_expected_amount := v_payment.amount;
  end if;
  select count(*), coalesce(sum(amount) filter (where side = 'DEBIT'), 0),
    coalesce(sum(amount) filter (where side = 'CREDIT'), 0),
    bool_and((line_number = 1 and side = 'DEBIT' and account = v_debit_account
        and amount = v_expected_amount)
      or (line_number = 2 and side = 'CREDIT' and account = v_credit_account
        and amount = v_expected_amount))
  into v_count, v_debit, v_credit, v_pattern
  from public.club_finance_postings where journal_id = new.id;
  if v_count <> 2 or v_debit <> v_credit or v_pattern is distinct from true then
    raise exception 'CLUB_FINANCE_JOURNAL_UNBALANCED' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger club_finance_journal_balance
  after insert on public.club_finance_journals deferrable initially deferred
  for each row execute function public.validate_club_finance_journal_balance();

-- Entity coverage is checked against final transaction state. A journal must
-- exist for every economic lifecycle state, not merely for current RPC paths.
create function public.validate_club_finance_obligation_journals()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_status text; v_created bigint; v_cancelled bigint;
begin
  select status into v_status from public.club_finance_obligations
  where club_id = new.club_id and id = new.id;
  select count(*) filter (where event_type = 'OBLIGATION_CREATED'),
    count(*) filter (where event_type = 'OBLIGATION_CANCELLED')
  into v_created, v_cancelled from public.club_finance_journals
  where club_id = new.club_id and obligation_id = new.id and payment_id is null;
  if v_created <> 1 or (v_status = 'OPEN' and v_cancelled <> 0)
     or (v_status = 'CANCELLED' and v_cancelled <> 1) then
    raise exception 'CLUB_FINANCE_OBLIGATION_JOURNAL_MISSING' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger club_finance_obligation_journal_coverage
  after insert or update on public.club_finance_obligations deferrable initially deferred
  for each row execute function public.validate_club_finance_obligation_journals();

create function public.validate_club_finance_payment_journals()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_status text; v_received bigint; v_reversed bigint;
begin
  select status into v_status from public.club_finance_payments
  where club_id = new.club_id and id = new.id;
  select count(*) filter (where event_type = 'PAYMENT_RECEIVED'),
    count(*) filter (where event_type = 'PAYMENT_REVERSED')
  into v_received, v_reversed from public.club_finance_journals
  where club_id = new.club_id and payment_id = new.id;
  if v_received <> 1 or (v_status = 'POSTED' and v_reversed <> 0)
     or (v_status = 'REVERSED' and v_reversed <> 1) then
    raise exception 'CLUB_FINANCE_PAYMENT_JOURNAL_MISSING' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger club_finance_payment_journal_coverage
  after insert or update on public.club_finance_payments deferrable initially deferred
  for each row execute function public.validate_club_finance_payment_journals();

create function public.guard_club_finance_obligation_lifecycle()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'CLUB_FINANCE_OBLIGATION_IMMUTABLE' using errcode = '23514';
  end if;
  if current_setting('selpa.club_finance_write', true) is distinct from 'allowed'
     or old.status <> 'OPEN'
     or new.status not in ('OPEN', 'CANCELLED')
     or new.revision <> old.revision + 1
     or row(new.id, new.club_id, new.debtor_type, new.debtor_user_id, new.debtor_team_id,
       new.debtor_name, new.source_type, new.source_id, new.tournament_id, new.registration_id,
       new.team_id, new.concept, new.currency_code, new.original_amount, new.due_date,
       new.metadata, new.created_by, new.created_at)
       is distinct from row(old.id, old.club_id, old.debtor_type, old.debtor_user_id, old.debtor_team_id,
       old.debtor_name, old.source_type, old.source_id, old.tournament_id, old.registration_id,
       old.team_id, old.concept, old.currency_code, old.original_amount, old.due_date,
       old.metadata, old.created_by, old.created_at)
  then raise exception 'CLUB_FINANCE_OBLIGATION_IMMUTABLE' using errcode = '23514'; end if;
  if new.status = 'CANCELLED' and exists (
    select 1 from public.club_finance_allocations allocation
    join public.club_finance_payments payment
      on payment.club_id = allocation.club_id and payment.id = allocation.payment_id
    where allocation.club_id = old.club_id and allocation.obligation_id = old.id
      and payment.status = 'POSTED'
  ) then
    raise exception 'CLUB_FINANCE_CANCEL_REQUIRES_PAYMENT_RESOLUTION' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger club_finance_obligation_lifecycle before update or delete on public.club_finance_obligations
  for each row execute function public.guard_club_finance_obligation_lifecycle();

create function public.guard_club_finance_payment_lifecycle()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_allocation public.club_finance_allocations%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'CLUB_FINANCE_PAYMENT_IMMUTABLE' using errcode = '23514';
  end if;
  if current_setting('selpa.club_finance_write', true) is distinct from 'allowed'
     or old.status <> 'POSTED' or new.status <> 'REVERSED'
     or row(new.id, new.club_id, new.payer_user_id, new.amount, new.currency_code,
       new.payment_method, new.paid_at, new.reference, new.notes, new.source_type,
       new.source_id, new.created_by, new.created_at)
       is distinct from row(old.id, old.club_id, old.payer_user_id, old.amount, old.currency_code,
       old.payment_method, old.paid_at, old.reference, old.notes, old.source_type,
       old.source_id, old.created_by, old.created_at)
  then raise exception 'CLUB_FINANCE_PAYMENT_IMMUTABLE' using errcode = '23514'; end if;
  -- The obligation was acquired before the payment in the canonical RPC.
  -- This trigger also forces a write conflict for any future privileged reversal.
  select * into strict v_allocation from public.club_finance_allocations
  where club_id = old.club_id and payment_id = old.id;
  update public.club_finance_obligations
  set revision = revision + 1
  where club_id = old.club_id and id = v_allocation.obligation_id and status = 'OPEN';
  if not found then
    raise exception 'CLUB_FINANCE_REVERSAL_OBLIGATION_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger club_finance_payment_lifecycle before update or delete on public.club_finance_payments
  for each row execute function public.guard_club_finance_payment_lifecycle();

create function public.club_finance_obligation_projection_internal(p_club_id uuid, p_obligation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_row public.club_finance_obligations%rowtype; v_allocated numeric(14,2);
  v_balance numeric(14,2); v_status text;
begin
  if p_obligation_id is null then
    return jsonb_build_object('obligation_id', null, 'original_amount', 0,
      'allocated_net', 0, 'balance', 0, 'financial_status', 'NO_CHARGE', 'due_date', null);
  end if;
  select * into v_row from public.club_finance_obligations
  where id = p_obligation_id and club_id = p_club_id;
  if not found then raise exception 'CLUB_FINANCE_OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
  select coalesce(sum(a.amount), 0) into v_allocated
  from public.club_finance_allocations a
  join public.club_finance_payments p on p.id = a.payment_id and p.club_id = a.club_id
  where a.club_id = p_club_id and a.obligation_id = p_obligation_id and p.status = 'POSTED';
  v_balance := case when v_row.status = 'CANCELLED' then 0 else v_row.original_amount - v_allocated end;
  v_status := case
    when v_row.status = 'CANCELLED' then 'CANCELLED'
    when v_balance = 0 then 'PAID'
    when v_row.due_date is not null and v_row.due_date < current_date then 'OVERDUE'
    when v_allocated > 0 then 'PARTIAL'
    else 'PENDING'
  end;
  -- REFUNDED is reserved for the later real-refund lifecycle, not a manual reversal.
  return jsonb_build_object('obligation_id', v_row.id, 'club_id', v_row.club_id,
    'original_amount', v_row.original_amount, 'allocated_net', v_allocated,
    'balance', v_balance, 'financial_status', v_status, 'due_date', v_row.due_date,
    'currency_code', v_row.currency_code, 'status', v_row.status);
end;
$$;

create function public.get_club_finance_obligation(p_club_id uuid, p_obligation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  return public.club_finance_obligation_projection_internal(p_club_id, p_obligation_id);
end;
$$;

create function public.get_club_finance_summary(p_club_id uuid, p_currency_code text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_pending numeric(14,2); v_received numeric(14,2); v_currency text := upper(btrim(p_currency_code));
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'CLUB_FINANCE_CURRENCY_INVALID' using errcode = '22023';
  end if;
  select coalesce(sum((projected.value->>'balance')::numeric), 0) into v_pending
  from public.club_finance_obligations o
  cross join lateral public.club_finance_obligation_projection_internal(o.club_id, o.id) as projected(value)
  where o.club_id = p_club_id and o.currency_code = v_currency and o.status = 'OPEN';
  select coalesce(sum(amount), 0) into v_received
  from public.club_finance_payments
  where club_id = p_club_id and currency_code = v_currency and status = 'POSTED';
  return jsonb_build_object('club_id', p_club_id, 'currency_code', v_currency,
    'total_pending', v_pending, 'total_received', v_received);
end;
$$;

-- Unique club/operation/key serializes HTTP retries. A committed command always has a response.
create function public.begin_club_finance_command(
  p_club_id uuid, p_operation text, p_key text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid := auth.uid(); v_hash text;
  v_existing public.club_finance_commands%rowtype;
begin
  if v_actor is null or length(btrim(coalesce(p_key, ''))) not between 8 and 200 then
    raise exception 'CLUB_FINANCE_COMMAND_INVALID' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(coalesce(p_payload, '{}'::jsonb)::text, 'sha256'), 'hex');
  insert into public.club_finance_commands(club_id, actor_id, operation, idempotency_key, request_hash)
  values(p_club_id, v_actor, p_operation, p_key, v_hash)
  on conflict (club_id, operation, idempotency_key) do nothing;
  if found then return null; end if;
  select * into v_existing from public.club_finance_commands
  where club_id = p_club_id and operation = p_operation and idempotency_key = p_key
  for update;
  if v_existing.actor_id is distinct from v_actor or v_existing.request_hash is distinct from v_hash then
    raise exception 'CLUB_FINANCE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;
  if v_existing.completed_at is null then
    raise exception 'CLUB_FINANCE_COMMAND_INCOMPLETE' using errcode = '23514';
  end if;
  return v_existing.response_payload;
end;
$$;

create function public.finish_club_finance_command(
  p_club_id uuid, p_operation text, p_key text, p_response jsonb
) returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  update public.club_finance_commands
  set response_payload = p_response, completed_at = now()
  where club_id = p_club_id and operation = p_operation and idempotency_key = p_key
    and actor_id = auth.uid() and completed_at is null;
  if not found then raise exception 'CLUB_FINANCE_COMMAND_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

create function public.post_club_finance_journal(
  p_club_id uuid, p_event_type text, p_obligation_id uuid, p_payment_id uuid,
  p_amount numeric, p_currency_code text, p_reason text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; v_debit text; v_credit text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'CLUB_FINANCE_AMOUNT_INVALID' using errcode = '22023';
  end if;
  v_debit := case p_event_type
    when 'OBLIGATION_CREATED' then 'ACCOUNTS_RECEIVABLE'
    when 'PAYMENT_RECEIVED' then 'CASH'
    when 'PAYMENT_REVERSED' then 'ACCOUNTS_RECEIVABLE'
    when 'OBLIGATION_CANCELLED' then 'OBLIGATION_CLEARING'
  end;
  v_credit := case p_event_type
    when 'OBLIGATION_CREATED' then 'OBLIGATION_CLEARING'
    when 'PAYMENT_RECEIVED' then 'ACCOUNTS_RECEIVABLE'
    when 'PAYMENT_REVERSED' then 'CASH'
    when 'OBLIGATION_CANCELLED' then 'ACCOUNTS_RECEIVABLE'
  end;
  if v_debit is null then raise exception 'CLUB_FINANCE_EVENT_INVALID' using errcode = '22023'; end if;
  insert into public.club_finance_journals(
    club_id, currency_code, event_type, obligation_id, payment_id, reason, actor_id
  ) values (p_club_id, p_currency_code, p_event_type, p_obligation_id, p_payment_id,
    p_reason, auth.uid()) returning id into v_id;
  insert into public.club_finance_postings(
    club_id, journal_id, currency_code, line_number, account, side, amount
  ) values
    (p_club_id, v_id, p_currency_code, 1, v_debit, 'DEBIT', p_amount),
    (p_club_id, v_id, p_currency_code, 2, v_credit, 'CREDIT', p_amount);
  return v_id;
end;
$$;

create function public.create_club_finance_obligation(
  p_club_id uuid, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_replay jsonb; v_result jsonb; v_row public.club_finance_obligations%rowtype;
  v_source_type text := upper(coalesce(p_payload->>'source_type', 'MANUAL'));
  v_currency text := upper(coalesce(p_payload->>'currency_code', 'ARS'));
  v_amount numeric;
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CLUB_FINANCE_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) as key(name)
    where name not in ('debtor_type', 'debtor_user_id', 'debtor_team_id', 'debtor_name',
      'source_type', 'source_id', 'tournament_id', 'registration_id', 'team_id',
      'concept', 'currency_code', 'original_amount', 'due_date', 'metadata')) then
    raise exception 'CLUB_FINANCE_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  v_amount := nullif(p_payload->>'original_amount', '')::numeric;
  if v_amount is null or v_amount <= 0
     or v_amount::text in ('NaN', 'Infinity', '-Infinity')
     or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'CLUB_FINANCE_AMOUNT_OR_CURRENCY_INVALID' using errcode = '22023';
  end if;
  if p_payload->>'tournament_id' is not null and not exists (
    select 1 from public.tournaments t
    where t.id = (p_payload->>'tournament_id')::uuid and t.club_id = p_club_id
  ) then raise exception 'CLUB_FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  if p_payload->>'team_id' is not null and not exists (
    select 1 from public.tournament_teams team
    where team.id = (p_payload->>'team_id')::uuid and team.club_id = p_club_id
      and (p_payload->>'tournament_id' is null
        or team.tournament_id = (p_payload->>'tournament_id')::uuid)
  ) then raise exception 'CLUB_FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  if p_payload->>'debtor_team_id' is not null and not exists (
    select 1 from public.tournament_teams team
    where team.id = (p_payload->>'debtor_team_id')::uuid and team.club_id = p_club_id
  ) then raise exception 'CLUB_FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  if p_payload->>'registration_id' is not null and not exists (
    select 1 from public.tournament_registrations registration
    where registration.id = (p_payload->>'registration_id')::uuid and registration.club_id = p_club_id
      and (p_payload->>'tournament_id' is null
        or registration.tournament_id = (p_payload->>'tournament_id')::uuid)
      and (p_payload->>'team_id' is null or registration.team_id = (p_payload->>'team_id')::uuid)
  ) then raise exception 'CLUB_FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;

  v_replay := public.begin_club_finance_command(p_club_id, 'CREATE_OBLIGATION', p_idempotency_key,
    jsonb_build_object('actor', auth.uid(), 'payload', p_payload));
  if v_replay is not null then return v_replay; end if;
  insert into public.club_finance_obligations(
    club_id, debtor_type, debtor_user_id, debtor_team_id, debtor_name, source_type, source_id,
    tournament_id, registration_id, team_id, concept, currency_code, original_amount,
    due_date, metadata, created_by
  ) values (
    p_club_id, upper(p_payload->>'debtor_type'), nullif(p_payload->>'debtor_user_id', '')::uuid,
    nullif(p_payload->>'debtor_team_id', '')::uuid, nullif(btrim(p_payload->>'debtor_name'), ''),
    v_source_type, nullif(p_payload->>'source_id', '')::uuid,
    nullif(p_payload->>'tournament_id', '')::uuid, nullif(p_payload->>'registration_id', '')::uuid,
    nullif(p_payload->>'team_id', '')::uuid, btrim(p_payload->>'concept'), v_currency,
    v_amount, nullif(p_payload->>'due_date', '')::date,
    coalesce(p_payload->'metadata', '{}'::jsonb), auth.uid()
  ) returning * into v_row;
  perform public.post_club_finance_journal(p_club_id, 'OBLIGATION_CREATED', v_row.id,
    null, v_row.original_amount, v_row.currency_code);
  v_result := public.club_finance_obligation_projection_internal(p_club_id, v_row.id);
  perform public.finish_club_finance_command(p_club_id, 'CREATE_OBLIGATION', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function public.register_club_finance_payment(
  p_club_id uuid, p_obligation_id uuid, p_amount numeric, p_currency_code text,
  p_payment_method text, p_idempotency_key text, p_paid_at timestamptz default null,
  p_reference text default null, p_notes text default null, p_payer_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_replay jsonb; v_result jsonb; v_obligation public.club_finance_obligations%rowtype;
  v_payment_id uuid; v_journal_id uuid; v_balance numeric; v_currency text := upper(btrim(p_currency_code));
  v_method text := upper(btrim(p_payment_method));
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0
     or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or v_currency is null or v_currency !~ '^[A-Z]{3}$'
     or v_method is null or v_method not in ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER') then
    raise exception 'CLUB_FINANCE_PAYMENT_INVALID' using errcode = '22023';
  end if;
  v_replay := public.begin_club_finance_command(p_club_id, 'REGISTER_PAYMENT', p_idempotency_key,
    jsonb_build_object('actor', auth.uid(), 'obligation', p_obligation_id, 'amount', p_amount,
      'currency', v_currency, 'method', v_method, 'paid_at', p_paid_at,
      'reference', p_reference, 'notes', p_notes, 'payer', p_payer_user_id));
  if v_replay is not null then return v_replay; end if;

  -- All payments to one obligation serialize here, including distinct keys.
  select * into v_obligation from public.club_finance_obligations
  where id = p_obligation_id and club_id = p_club_id for update;
  if not found then raise exception 'CLUB_FINANCE_OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_obligation.status <> 'OPEN' or v_obligation.currency_code <> v_currency then
    raise exception 'CLUB_FINANCE_OBLIGATION_NOT_PAYABLE' using errcode = '23514';
  end if;
  -- Real write-write conflict before the balance read. The allocation trigger
  -- performs a second bump so even future privileged insert paths fail closed.
  perform set_config('selpa.club_finance_write', 'allowed', true);
  update public.club_finance_obligations set revision = revision + 1
  where club_id = p_club_id and id = p_obligation_id and status = 'OPEN';
  v_balance := (public.club_finance_obligation_projection_internal(p_club_id, p_obligation_id)->>'balance')::numeric;
  if p_amount > v_balance then raise exception 'CLUB_FINANCE_OVER_ALLOCATION' using errcode = '23514'; end if;

  insert into public.club_finance_payments(
    club_id, payer_user_id, amount, currency_code, payment_method, paid_at,
    reference, notes, created_by
  ) values (p_club_id, coalesce(p_payer_user_id, v_obligation.debtor_user_id), p_amount,
    v_currency, v_method, coalesce(p_paid_at, now()), nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''), auth.uid()) returning id into v_payment_id;
  insert into public.club_finance_allocations(club_id, payment_id, obligation_id, amount, currency_code)
  values (p_club_id, v_payment_id, p_obligation_id, p_amount, v_currency);
  v_journal_id := public.post_club_finance_journal(p_club_id, 'PAYMENT_RECEIVED',
    p_obligation_id, v_payment_id, p_amount, v_currency);
  v_result := jsonb_build_object('payment_id', v_payment_id, 'journal_id', v_journal_id,
    'obligation', public.club_finance_obligation_projection_internal(p_club_id, p_obligation_id));
  perform public.finish_club_finance_command(p_club_id, 'REGISTER_PAYMENT', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function public.reverse_club_finance_payment(
  p_club_id uuid, p_payment_id uuid, p_reason text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_replay jsonb; v_result jsonb; v_payment public.club_finance_payments%rowtype;
  v_allocation public.club_finance_allocations%rowtype; v_journal_id uuid;
  v_obligation public.club_finance_obligations%rowtype;
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'CLUB_FINANCE_REASON_REQUIRED' using errcode = '22023';
  end if;
  v_replay := public.begin_club_finance_command(p_club_id, 'REVERSE_PAYMENT', p_idempotency_key,
    jsonb_build_object('actor', auth.uid(), 'payment', p_payment_id, 'reason', btrim(p_reason)));
  if v_replay is not null then return v_replay; end if;
  -- Immutable allocation resolves the obligation without taking a payment lock.
  -- Canonical lock order is command -> obligation -> payment.
  select * into strict v_allocation from public.club_finance_allocations
  where payment_id = p_payment_id and club_id = p_club_id;
  select * into v_obligation from public.club_finance_obligations
  where id = v_allocation.obligation_id and club_id = p_club_id for update;
  if v_obligation.id is null or v_obligation.status <> 'OPEN' then
    raise exception 'CLUB_FINANCE_REVERSAL_OBLIGATION_INVALID' using errcode = '23514';
  end if;
  select * into v_payment from public.club_finance_payments
  where id = p_payment_id and club_id = p_club_id for update;
  if not found then raise exception 'CLUB_FINANCE_PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_payment.status <> 'POSTED' then
    raise exception 'CLUB_FINANCE_PAYMENT_ALREADY_REVERSED' using errcode = '23514';
  end if;
  perform set_config('selpa.club_finance_write', 'allowed', true);
  update public.club_finance_payments
  set status = 'REVERSED', reversed_by = auth.uid(), reversed_at = now(),
    reversal_reason = btrim(p_reason)
  where id = p_payment_id;
  v_journal_id := public.post_club_finance_journal(p_club_id, 'PAYMENT_REVERSED',
    v_allocation.obligation_id, p_payment_id, v_payment.amount, v_payment.currency_code,
    btrim(p_reason));
  v_result := jsonb_build_object('payment_id', p_payment_id, 'journal_id', v_journal_id,
    'obligation', public.club_finance_obligation_projection_internal(p_club_id, v_allocation.obligation_id));
  perform public.finish_club_finance_command(p_club_id, 'REVERSE_PAYMENT', p_idempotency_key, v_result);
  return v_result;
end;
$$;

create function public.cancel_club_finance_obligation(
  p_club_id uuid, p_obligation_id uuid, p_reason text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_replay jsonb; v_result jsonb; v_row public.club_finance_obligations%rowtype;
  v_allocated numeric; v_journal_id uuid;
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:manage') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'CLUB_FINANCE_REASON_REQUIRED' using errcode = '22023';
  end if;
  v_replay := public.begin_club_finance_command(p_club_id, 'CANCEL_OBLIGATION', p_idempotency_key,
    jsonb_build_object('actor', auth.uid(), 'obligation', p_obligation_id, 'reason', btrim(p_reason)));
  if v_replay is not null then return v_replay; end if;
  select * into v_row from public.club_finance_obligations
  where id = p_obligation_id and club_id = p_club_id for update;
  if not found then raise exception 'CLUB_FINANCE_OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'OPEN' then raise exception 'CLUB_FINANCE_OBLIGATION_CANCELLED' using errcode = '23514'; end if;
  v_allocated := (public.club_finance_obligation_projection_internal(p_club_id, p_obligation_id)->>'allocated_net')::numeric;
  if v_allocated <> 0 then
    raise exception 'CLUB_FINANCE_CANCEL_REQUIRES_PAYMENT_RESOLUTION' using errcode = '23514';
  end if;
  perform set_config('selpa.club_finance_write', 'allowed', true);
  update public.club_finance_obligations
  set status = 'CANCELLED', revision = revision + 1,
    cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_reason)
  where id = p_obligation_id;
  v_journal_id := public.post_club_finance_journal(p_club_id, 'OBLIGATION_CANCELLED',
    p_obligation_id, null, v_row.original_amount, v_row.currency_code, btrim(p_reason));
  v_result := jsonb_build_object('journal_id', v_journal_id,
    'obligation', public.club_finance_obligation_projection_internal(p_club_id, p_obligation_id));
  perform public.finish_club_finance_command(p_club_id, 'CANCEL_OBLIGATION', p_idempotency_key, v_result);
  return v_result;
end;
$$;

alter table public.club_finance_obligations enable row level security;
alter table public.club_finance_payments enable row level security;
alter table public.club_finance_allocations enable row level security;
alter table public.club_finance_journals enable row level security;
alter table public.club_finance_postings enable row level security;
alter table public.club_finance_commands enable row level security;

create policy club_finance_obligations_read on public.club_finance_obligations
  for select to authenticated using (public.has_club_capability(club_id, 'finance:view'));
create policy club_finance_payments_read on public.club_finance_payments
  for select to authenticated using (public.has_club_capability(club_id, 'finance:view'));
create policy club_finance_allocations_read on public.club_finance_allocations
  for select to authenticated using (public.has_club_capability(club_id, 'finance:view'));
create policy club_finance_journals_read on public.club_finance_journals
  for select to authenticated using (public.has_club_capability(club_id, 'finance:view'));
create policy club_finance_postings_read on public.club_finance_postings
  for select to authenticated using (public.has_club_capability(club_id, 'finance:view'));
-- Commands contain technical request hashes and are intentionally not exposed by Data API.

revoke all on table public.club_finance_obligations, public.club_finance_payments,
  public.club_finance_allocations, public.club_finance_journals,
  public.club_finance_postings, public.club_finance_commands
  from public, anon, authenticated, service_role;
grant select on table public.club_finance_obligations, public.club_finance_payments,
  public.club_finance_allocations, public.club_finance_journals,
  public.club_finance_postings to authenticated;

revoke all on function public.guard_club_finance_immutable(),
  public.validate_club_finance_allocation(),
  public.validate_club_finance_journal_balance(),
  public.guard_club_finance_obligation_lifecycle(),
  public.guard_club_finance_payment_lifecycle(),
  public.club_finance_obligation_projection_internal(uuid, uuid),
  public.validate_club_finance_obligation_journals(),
  public.validate_club_finance_payment_journals(),
  public.begin_club_finance_command(uuid, text, text, jsonb),
  public.finish_club_finance_command(uuid, text, text, jsonb),
  public.post_club_finance_journal(uuid, text, uuid, uuid, numeric, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.get_club_finance_obligation(uuid, uuid),
  public.get_club_finance_summary(uuid, text),
  public.create_club_finance_obligation(uuid, jsonb, text),
  public.register_club_finance_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text, uuid),
  public.reverse_club_finance_payment(uuid, uuid, text, text),
  public.cancel_club_finance_obligation(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_finance_obligation(uuid, uuid),
  public.get_club_finance_summary(uuid, text),
  public.create_club_finance_obligation(uuid, jsonb, text),
  public.register_club_finance_payment(uuid, uuid, numeric, text, text, text, timestamptz, text, text, uuid),
  public.reverse_club_finance_payment(uuid, uuid, text, text),
  public.cancel_club_finance_obligation(uuid, uuid, text, text)
  to authenticated;

comment on table public.club_finance_obligations is
  'F1A Club Finance canonical obligations; legacy club_receivables and tournament_payments are not migrated or synced.';
comment on table public.club_finance_payments is
  'Confirmed money received by a club, never a payment request or provider checkout attempt.';
comment on table public.club_finance_journals is
  'Append-only club financial journal. SELPA Billing and Competition point settlements are separate domains.';

commit;
