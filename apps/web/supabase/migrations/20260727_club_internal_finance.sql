-- Finanzas internas del club. No mezcla caja del club con payments/commissions/settlements de SELPA.
begin;

create table if not exists public.club_financial_transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('INCOME', 'EXPENSE', 'ADJUSTMENT')),
  concept text not null check (char_length(btrim(concept)) between 2 and 180),
  category text not null check (char_length(btrim(category)) between 2 and 80),
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'ARS' check (currency_code ~ '^[A-Z]{3}$'),
  payment_method text not null check (payment_method in ('CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CARD', 'OTHER')),
  status text not null default 'POSTED' check (status in ('POSTED', 'VOIDED')),
  occurred_at timestamptz not null default now(),
  responsible_user_id uuid null references auth.users(id) on delete set null,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  reference_type text null,
  reference_id uuid null,
  notes text null check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  voided_by uuid null references auth.users(id) on delete set null,
  voided_at timestamptz null,
  void_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_receivables (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  debtor_user_id uuid null references auth.users(id) on delete set null,
  debtor_name text not null check (char_length(btrim(debtor_name)) between 2 and 160),
  contact text null check (contact is null or char_length(contact) <= 180),
  concept text not null check (char_length(btrim(concept)) between 2 and 180),
  tournament_id uuid null references public.tournaments(id) on delete set null,
  team_id uuid null references public.tournament_teams(id) on delete set null,
  registration_id uuid null references public.tournament_registrations(id) on delete set null,
  category text null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  waived_amount numeric(14,2) not null default 0 check (waived_amount >= 0),
  currency_code text not null default 'ARS' check (currency_code ~ '^[A-Z]{3}$'),
  due_date date null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PARTIAL', 'PAID', 'WAIVED', 'OVERDUE', 'VOIDED')),
  notes text null check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_receivables_totals_check check (paid_amount + waived_amount <= total_amount)
);

create table if not exists public.club_receivable_payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  receivable_id uuid not null references public.club_receivables(id) on delete restrict,
  transaction_id uuid not null unique references public.club_financial_transactions(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'ARS' check (currency_code ~ '^[A-Z]{3}$'),
  payment_method text not null check (payment_method in ('CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'CARD', 'OTHER')),
  paid_at timestamptz not null default now(),
  notes text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.club_expenses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  transaction_id uuid not null unique references public.club_financial_transactions(id) on delete restrict,
  supplier text null,
  receipt_path text null,
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'VOIDED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.club_financial_closures (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'CLOSED' check (status in ('CLOSED', 'REOPENED')),
  currency_code text not null default 'ARS' check (currency_code ~ '^[A-Z]{3}$'),
  income_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  adjustment_total numeric(14,2) not null default 0,
  receivable_pending_total numeric(14,2) not null default 0,
  result_total numeric(14,2) not null default 0,
  transaction_count integer not null default 0 check (transaction_count >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  notes text null check (notes is null or char_length(notes) <= 2000),
  closed_by uuid not null references auth.users(id) on delete restrict,
  closed_at timestamptz not null default now(),
  reopened_by uuid null references auth.users(id) on delete set null,
  reopened_at timestamptz null,
  reopen_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_financial_closures_period_check check (period_end >= period_start),
  unique (club_id, period_start, period_end)
);

create table if not exists public.club_financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('CREATED', 'UPDATED', 'VOIDED', 'PAYMENT_RECORDED', 'WAIVED', 'CLOSED', 'REOPENED', 'ADJUSTED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  change_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists club_financial_transactions_club_date_idx on public.club_financial_transactions(club_id, occurred_at desc);
create index if not exists club_financial_transactions_club_type_idx on public.club_financial_transactions(club_id, transaction_type, status);
create index if not exists club_financial_transactions_reference_idx on public.club_financial_transactions(club_id, reference_type, reference_id);
create index if not exists club_receivables_club_status_idx on public.club_receivables(club_id, status, due_date);
create index if not exists club_receivables_debtor_idx on public.club_receivables(club_id, debtor_user_id);
create index if not exists club_receivable_payments_receivable_idx on public.club_receivable_payments(receivable_id, paid_at desc);
create index if not exists club_expenses_club_idx on public.club_expenses(club_id, created_at desc);
create index if not exists club_financial_closures_club_period_idx on public.club_financial_closures(club_id, period_start desc);
create index if not exists club_financial_audit_club_date_idx on public.club_financial_audit_log(club_id, created_at desc);

create or replace function public.club_finance_period_is_closed(p_club_id uuid, p_occurred_at timestamptz)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.club_financial_closures closure
    where closure.club_id = p_club_id
      and closure.status = 'CLOSED'
      and p_occurred_at::date between closure.period_start and closure.period_end
  );
$$;

create or replace function public.create_club_financial_transaction(
  p_club_id uuid, p_transaction_type text, p_concept text, p_category text,
  p_amount numeric, p_payment_method text, p_occurred_at timestamptz default now(),
  p_notes text default null, p_tournament_id uuid default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid; v_type text := upper(btrim(p_transaction_type)); v_method text := upper(btrim(p_payment_method));
begin
  if not public.has_club_capability(p_club_id, 'finance:manage') then raise exception 'FINANCE_FORBIDDEN' using errcode = '42501'; end if;
  if public.club_finance_period_is_closed(p_club_id, p_occurred_at) then raise exception 'FINANCE_PERIOD_CLOSED' using errcode = 'P0001'; end if;
  if p_tournament_id is not null and not exists (
    select 1 from public.tournaments tournament where tournament.id = p_tournament_id and tournament.club_id = p_club_id
  ) then raise exception 'FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  insert into public.club_financial_transactions (
    club_id, transaction_type, concept, category, amount, payment_method, occurred_at,
    notes, tournament_id, created_by, updated_by
  ) values (
    p_club_id, v_type, btrim(p_concept), btrim(p_category), p_amount, v_method, coalesce(p_occurred_at, now()),
    nullif(btrim(p_notes), ''), p_tournament_id, auth.uid(), auth.uid()
  ) returning id into v_id;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'TRANSACTION', v_id, case when v_type = 'ADJUSTMENT' then 'ADJUSTED' else 'CREATED' end, auth.uid(), jsonb_build_object('type', v_type, 'amount', p_amount));
  return v_id;
end;
$$;

create or replace function public.create_club_receivable(
  p_club_id uuid, p_debtor_name text, p_concept text, p_total_amount numeric,
  p_due_date date default null, p_contact text default null, p_category text default null,
  p_debtor_user_id uuid default null, p_tournament_id uuid default null,
  p_team_id uuid default null, p_registration_id uuid default null, p_notes text default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  if not public.has_club_capability(p_club_id, 'payments:manage') then raise exception 'FINANCE_FORBIDDEN' using errcode = '42501'; end if;
  if p_tournament_id is not null and not exists (
    select 1 from public.tournaments tournament where tournament.id = p_tournament_id and tournament.club_id = p_club_id
  ) then raise exception 'FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  if p_team_id is not null and not exists (
    select 1 from public.tournament_teams team
    join public.tournaments tournament on tournament.id = team.tournament_id
    where team.id = p_team_id and tournament.club_id = p_club_id
  ) then raise exception 'FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  if p_registration_id is not null and not exists (
    select 1 from public.tournament_registrations registration
    where registration.id = p_registration_id and registration.club_id = p_club_id
  ) then raise exception 'FINANCE_CROSS_CLUB_REFERENCE' using errcode = '23503'; end if;
  insert into public.club_receivables (
    club_id, debtor_user_id, debtor_name, contact, concept, tournament_id, team_id,
    registration_id, category, total_amount, due_date, notes, created_by, updated_by
  ) values (
    p_club_id, p_debtor_user_id, btrim(p_debtor_name), nullif(btrim(p_contact), ''),
    btrim(p_concept), p_tournament_id, p_team_id, p_registration_id, nullif(btrim(p_category), ''),
    p_total_amount, p_due_date, nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  ) returning id into v_id;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'RECEIVABLE', v_id, 'CREATED', auth.uid(), jsonb_build_object('amount', p_total_amount));
  return v_id;
end;
$$;

create or replace function public.record_club_receivable_payment(
  p_club_id uuid, p_receivable_id uuid, p_amount numeric, p_payment_method text,
  p_paid_at timestamptz default now(), p_notes text default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_receivable public.club_receivables%rowtype; v_transaction_id uuid; v_payment_id uuid; v_new_paid numeric;
begin
  if not public.has_club_capability(p_club_id, 'payments:manage') then raise exception 'FINANCE_FORBIDDEN' using errcode = '42501'; end if;
  select * into strict v_receivable from public.club_receivables receivable
  where receivable.id = p_receivable_id and receivable.club_id = p_club_id for update;
  if v_receivable.status in ('PAID', 'WAIVED', 'VOIDED') then raise exception 'RECEIVABLE_NOT_PAYABLE' using errcode = 'P0001'; end if;
  if p_amount <= 0 or p_amount > v_receivable.total_amount - v_receivable.paid_amount - v_receivable.waived_amount then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = '22023';
  end if;
  if public.club_finance_period_is_closed(p_club_id, p_paid_at) then raise exception 'FINANCE_PERIOD_CLOSED' using errcode = 'P0001'; end if;
  insert into public.club_financial_transactions (
    club_id, transaction_type, concept, category, amount, payment_method, occurred_at,
    reference_type, reference_id, notes, tournament_id, created_by, updated_by
  ) values (
    p_club_id, 'INCOME', 'Cobro: ' || v_receivable.concept, coalesce(v_receivable.category, 'Cobros'),
    p_amount, upper(btrim(p_payment_method)), coalesce(p_paid_at, now()), 'RECEIVABLE', p_receivable_id,
    nullif(btrim(p_notes), ''), v_receivable.tournament_id, auth.uid(), auth.uid()
  ) returning id into v_transaction_id;
  insert into public.club_receivable_payments(
    club_id, receivable_id, transaction_id, amount, payment_method, paid_at, notes, created_by
  ) values (
    p_club_id, p_receivable_id, v_transaction_id, p_amount, upper(btrim(p_payment_method)),
    coalesce(p_paid_at, now()), nullif(btrim(p_notes), ''), auth.uid()
  ) returning id into v_payment_id;
  v_new_paid := v_receivable.paid_amount + p_amount;
  update public.club_receivables
  set paid_amount = v_new_paid,
      status = case when v_new_paid + waived_amount = total_amount then 'PAID' else 'PARTIAL' end,
      updated_by = auth.uid(), updated_at = now()
  where id = p_receivable_id;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'RECEIVABLE', p_receivable_id, 'PAYMENT_RECORDED', auth.uid(), jsonb_build_object('payment_id', v_payment_id, 'transaction_id', v_transaction_id, 'amount', p_amount));
  return v_payment_id;
exception when no_data_found then
  raise exception 'RECEIVABLE_NOT_FOUND' using errcode = 'P0002';
end;
$$;

create or replace function public.create_club_expense(
  p_club_id uuid, p_concept text, p_category text, p_amount numeric,
  p_payment_method text, p_occurred_at timestamptz default now(),
  p_supplier text default null, p_notes text default null, p_tournament_id uuid default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_transaction_id uuid; v_expense_id uuid;
begin
  v_transaction_id := public.create_club_financial_transaction(
    p_club_id, 'EXPENSE', p_concept, p_category, p_amount, p_payment_method,
    p_occurred_at, p_notes, p_tournament_id
  );
  insert into public.club_expenses(club_id, transaction_id, supplier, created_by, updated_by)
  values (p_club_id, v_transaction_id, nullif(btrim(p_supplier), ''), auth.uid(), auth.uid())
  returning id into v_expense_id;
  return v_expense_id;
end;
$$;

create or replace function public.void_club_financial_transaction(
  p_club_id uuid, p_transaction_id uuid, p_reason text
) returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_transaction public.club_financial_transactions%rowtype;
begin
  if not public.has_club_capability(p_club_id, 'finance:manage') then raise exception 'FINANCE_FORBIDDEN' using errcode = '42501'; end if;
  select * into strict v_transaction from public.club_financial_transactions tx
  where tx.id = p_transaction_id and tx.club_id = p_club_id for update;
  if v_transaction.status = 'VOIDED' then raise exception 'TRANSACTION_ALREADY_VOIDED' using errcode = 'P0001'; end if;
  if public.club_finance_period_is_closed(p_club_id, v_transaction.occurred_at) then raise exception 'FINANCE_PERIOD_CLOSED' using errcode = 'P0001'; end if;
  update public.club_financial_transactions set status = 'VOIDED', voided_by = auth.uid(), voided_at = now(),
    void_reason = btrim(p_reason), updated_by = auth.uid(), updated_at = now() where id = p_transaction_id;
  update public.club_expenses set status = 'VOIDED', updated_by = auth.uid(), updated_at = now() where transaction_id = p_transaction_id;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'TRANSACTION', p_transaction_id, 'VOIDED', auth.uid(), jsonb_build_object('reason', p_reason));
exception when no_data_found then raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
end;
$$;

create or replace function public.close_club_financial_period(
  p_club_id uuid, p_period_start date, p_period_end date, p_notes text default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid; v_income numeric; v_expense numeric; v_adjustment numeric; v_pending numeric; v_count integer;
begin
  if not public.has_club_capability(p_club_id, 'finance:manage') then raise exception 'FINANCE_FORBIDDEN' using errcode = '42501'; end if;
  if p_period_end < p_period_start then raise exception 'INVALID_PERIOD' using errcode = '22023'; end if;
  select
    coalesce(sum(amount) filter (where transaction_type = 'INCOME'), 0),
    coalesce(sum(amount) filter (where transaction_type = 'EXPENSE'), 0),
    coalesce(sum(case when transaction_type = 'ADJUSTMENT' then amount else 0 end), 0),
    count(*)
  into v_income, v_expense, v_adjustment, v_count
  from public.club_financial_transactions tx
  where tx.club_id = p_club_id and tx.status = 'POSTED'
    and tx.occurred_at::date between p_period_start and p_period_end;
  select coalesce(sum(total_amount - paid_amount - waived_amount), 0) into v_pending
  from public.club_receivables receivable
  where receivable.club_id = p_club_id and receivable.status in ('PENDING', 'PARTIAL', 'OVERDUE')
    and receivable.created_at::date <= p_period_end;
  insert into public.club_financial_closures(
    club_id, period_start, period_end, status, income_total, expense_total, adjustment_total,
    receivable_pending_total, result_total, transaction_count, snapshot, notes, closed_by
  ) values (
    p_club_id, p_period_start, p_period_end, 'CLOSED', v_income, v_expense, v_adjustment,
    v_pending, v_income - v_expense + v_adjustment, v_count,
    jsonb_build_object('generated_at', now(), 'income', v_income, 'expense', v_expense, 'adjustment', v_adjustment, 'pending', v_pending),
    nullif(btrim(p_notes), ''), auth.uid()
  )
  on conflict (club_id, period_start, period_end) do update
  set status = 'CLOSED', income_total = excluded.income_total, expense_total = excluded.expense_total,
      adjustment_total = excluded.adjustment_total, receivable_pending_total = excluded.receivable_pending_total,
      result_total = excluded.result_total, transaction_count = excluded.transaction_count,
      snapshot = excluded.snapshot, notes = excluded.notes, closed_by = auth.uid(), closed_at = now(),
      reopened_by = null, reopened_at = null, reopen_reason = null, updated_at = now()
  returning id into v_id;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'CLOSURE', v_id, 'CLOSED', auth.uid(), jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end));
  return v_id;
end;
$$;

create or replace function public.reopen_club_financial_period(
  p_club_id uuid, p_closure_id uuid, p_reason text
) returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_club_owner(p_club_id) then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  update public.club_financial_closures set status = 'REOPENED', reopened_by = auth.uid(),
    reopened_at = now(), reopen_reason = btrim(p_reason), updated_at = now()
  where id = p_closure_id and club_id = p_club_id and status = 'CLOSED';
  if not found then raise exception 'CLOSURE_NOT_FOUND_OR_OPEN' using errcode = 'P0002'; end if;
  insert into public.club_financial_audit_log(club_id, entity_type, entity_id, action, actor_user_id, change_summary)
  values (p_club_id, 'CLOSURE', p_closure_id, 'REOPENED', auth.uid(), jsonb_build_object('reason', p_reason));
end;
$$;

alter table public.club_financial_transactions enable row level security;
alter table public.club_receivables enable row level security;
alter table public.club_receivable_payments enable row level security;
alter table public.club_expenses enable row level security;
alter table public.club_financial_closures enable row level security;
alter table public.club_financial_audit_log enable row level security;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'club_financial_transactions', 'club_receivables', 'club_receivable_payments',
    'club_expenses', 'club_financial_closures', 'club_financial_audit_log'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_select', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_club_capability(club_id, ''finance:view''))',
      v_table || '_select', v_table
    );
  end loop;
end $$;

revoke all on table public.club_financial_transactions, public.club_receivables, public.club_receivable_payments,
  public.club_expenses, public.club_financial_closures, public.club_financial_audit_log from anon, authenticated;
grant select on table public.club_financial_transactions, public.club_receivables, public.club_receivable_payments,
  public.club_expenses, public.club_financial_closures, public.club_financial_audit_log to authenticated;

revoke all on function public.club_finance_period_is_closed(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.create_club_financial_transaction(uuid, text, text, text, numeric, text, timestamptz, text, uuid) from public, anon;
revoke all on function public.create_club_receivable(uuid, text, text, numeric, date, text, text, uuid, uuid, uuid, uuid, text) from public, anon;
revoke all on function public.record_club_receivable_payment(uuid, uuid, numeric, text, timestamptz, text) from public, anon;
revoke all on function public.create_club_expense(uuid, text, text, numeric, text, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.void_club_financial_transaction(uuid, uuid, text) from public, anon;
revoke all on function public.close_club_financial_period(uuid, date, date, text) from public, anon;
revoke all on function public.reopen_club_financial_period(uuid, uuid, text) from public, anon;
grant execute on function public.club_finance_period_is_closed(uuid, timestamptz) to service_role;
grant execute on function public.create_club_financial_transaction(uuid, text, text, text, numeric, text, timestamptz, text, uuid) to authenticated, service_role;
grant execute on function public.create_club_receivable(uuid, text, text, numeric, date, text, text, uuid, uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.record_club_receivable_payment(uuid, uuid, numeric, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.create_club_expense(uuid, text, text, numeric, text, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.void_club_financial_transaction(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.close_club_financial_period(uuid, date, date, text) to authenticated, service_role;
grant execute on function public.reopen_club_financial_period(uuid, uuid, text) to authenticated, service_role;

commit;
