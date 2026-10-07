begin;

-- SELPA Billing: club -> SELPA. No Club Finance/legacy money is read or written.
create table public.platform_billing_plans (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  name text not null check (length(btrim(name)) between 1 and 120), description text not null default '',
  currency_code text not null default 'ARS' check (currency_code = 'ARS'),
  billing_interval text not null check (billing_interval in ('MONTHLY','ANNUAL','FREE')),
  price numeric(14,2) not null check (price >= 0 and price < 1000000000000), active boolean not null default true,
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (billing_interval <> 'FREE' or price = 0), check (code ~ '^[A-Z0-9_-]{1,48}$')
);
create table public.platform_billing_subscriptions (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  plan_id uuid not null references public.platform_billing_plans(id),
  next_plan_id uuid references public.platform_billing_plans(id),
  status text not null check (status in ('TRIAL','ACTIVE','SUSPENDED','CANCELLED')),
  started_at date not null check (isfinite(started_at)), current_period_start date not null, current_period_end date not null,
  cancel_at_period_end boolean not null default false, cancelled_at timestamptz,
  created_by uuid not null references auth.users(id), revision bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (club_id,id), check (current_period_end > current_period_start and isfinite(current_period_start) and isfinite(current_period_end)),
  check ((status = 'CANCELLED') = (cancelled_at is not null))
);
create unique index platform_billing_one_current_subscription_idx on public.platform_billing_subscriptions(club_id) where status <> 'CANCELLED';
create index platform_billing_subscription_created_idx on public.platform_billing_subscriptions(created_at desc,id desc);
create index platform_billing_subscription_plan_idx on public.platform_billing_subscriptions(plan_id,club_id);
create table public.platform_billing_periods (
  id uuid primary key default gen_random_uuid(), club_id uuid not null,
  subscription_id uuid not null, plan_id uuid not null references public.platform_billing_plans(id),
  period_start date not null, period_end date not null, plan_snapshot jsonb not null,
  status text not null check (status in ('OPEN','INVOICED','PAID','VOID')),
  created_at timestamptz not null default now(), unique (subscription_id,period_start), unique (club_id,id), unique (club_id,subscription_id,id),
  foreign key (club_id,subscription_id) references public.platform_billing_subscriptions(club_id,id),
  check (period_end > period_start and isfinite(period_start) and isfinite(period_end))
);
create sequence public.platform_billing_invoice_number_seq;
create index platform_billing_period_club_created_idx on public.platform_billing_periods(club_id,created_at desc,id desc);
create index platform_billing_period_created_idx on public.platform_billing_periods(created_at desc,id desc);
create index platform_billing_period_plan_idx on public.platform_billing_periods(plan_id,id);
create table public.platform_billing_invoices (
  id uuid primary key default gen_random_uuid(), club_id uuid not null, subscription_id uuid not null, period_id uuid not null unique,
  invoice_number text not null unique default ('SELPA-' || lpad(nextval('public.platform_billing_invoice_number_seq')::text,10,'0')),
  currency_code text not null default 'ARS' check (currency_code = 'ARS'), subtotal numeric(14,2) not null check (subtotal >= 0 and subtotal < 1000000000000),
  total numeric(14,2) not null check (total >= 0 and total < 1000000000000), status text not null check (status in ('DRAFT','ISSUED','VOID')),
  issued_at timestamptz, due_at date not null check (isfinite(due_at)), voided_at timestamptz, void_reason text,
  created_by uuid not null references auth.users(id), revision bigint not null default 1, created_at timestamptz not null default now(),
  unique (club_id,id), foreign key (club_id,subscription_id) references public.platform_billing_subscriptions(club_id,id),
  foreign key (club_id,subscription_id,period_id) references public.platform_billing_periods(club_id,subscription_id,id),
  check ((status = 'DRAFT') = (issued_at is null)), check ((status = 'VOID') = (voided_at is not null))
);
create index platform_billing_invoice_club_created_idx on public.platform_billing_invoices(club_id,created_at desc,id desc);
create index platform_billing_invoice_created_idx on public.platform_billing_invoices(created_at desc,id desc);
create index platform_billing_invoice_due_idx on public.platform_billing_invoices(due_at,club_id) where status = 'ISSUED';
create table public.platform_billing_invoice_lines (
  id uuid primary key default gen_random_uuid(), club_id uuid not null, invoice_id uuid not null,
  kind text not null check (kind in ('PLAN','PLATFORM_FEE','ADJUSTMENT')), description text not null,
  amount numeric(14,2) not null check (amount > -1000000000000 and amount < 1000000000000), foreign key (club_id,invoice_id) references public.platform_billing_invoices(club_id,id)
);
create index platform_billing_line_invoice_idx on public.platform_billing_invoice_lines(invoice_id);
create table public.platform_billing_payments (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  currency_code text not null default 'ARS' check (currency_code = 'ARS'), amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  method text not null check (method in ('CASH','BANK_TRANSFER','MERCADO_PAGO','OTHER')),
  reference text not null default '', paid_at timestamptz not null check (isfinite(paid_at)), status text not null check (status in ('POSTED','REVERSED')),
  created_by uuid not null references auth.users(id), reversed_by uuid references auth.users(id), reversed_at timestamptz, reversal_reason text,
  created_at timestamptz not null default now(), unique (club_id,id),
  check ((status = 'REVERSED') = (reversed_at is not null and reversed_by is not null and length(btrim(reversal_reason)) > 0))
);
create index platform_billing_payment_club_created_idx on public.platform_billing_payments(club_id,created_at desc,id desc);
create index platform_billing_payment_created_idx on public.platform_billing_payments(created_at desc,id desc);
create index platform_billing_payment_paid_idx on public.platform_billing_payments(paid_at,club_id) where status = 'POSTED';
create table public.platform_billing_allocations (
  id uuid primary key default gen_random_uuid(), club_id uuid not null, payment_id uuid not null, invoice_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000), unique (payment_id,invoice_id),
  foreign key (club_id,payment_id) references public.platform_billing_payments(club_id,id),
  foreign key (club_id,invoice_id) references public.platform_billing_invoices(club_id,id)
);
create index platform_billing_allocation_invoice_idx on public.platform_billing_allocations(invoice_id,payment_id);
create table public.platform_billing_commands (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
  operation text not null, idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  payload jsonb not null, response jsonb, created_at timestamptz not null default now(),
  unique (actor_id,idempotency_key)
);
create table public.platform_billing_journals (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  kind text not null check (kind in ('INVOICE_ISSUED','INVOICE_VOIDED','PAYMENT_POSTED','PAYMENT_REVERSED')),
  invoice_id uuid, payment_id uuid, command_id uuid not null references public.platform_billing_commands(id),
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (kind,invoice_id), unique (kind,payment_id), unique (club_id,id),
  foreign key (club_id,invoice_id) references public.platform_billing_invoices(club_id,id),
  foreign key (club_id,payment_id) references public.platform_billing_payments(club_id,id),
  check ((kind like 'INVOICE_%' and invoice_id is not null and payment_id is null) or
         (kind like 'PAYMENT_%' and payment_id is not null and invoice_id is null))
);
create index platform_billing_command_created_idx on public.platform_billing_commands(created_at desc,id desc);
create index platform_billing_command_club_created_idx on public.platform_billing_commands((payload->>'club_id'),created_at desc,id desc);
create index platform_billing_journal_club_created_idx on public.platform_billing_journals(club_id,created_at desc,id desc);
create index platform_billing_journal_command_idx on public.platform_billing_journals(command_id);
create table public.platform_billing_postings (
  id uuid primary key default gen_random_uuid(), club_id uuid not null, journal_id uuid not null,
  account text not null check (account in ('ACCOUNTS_RECEIVABLE','CASH','REVENUE','ADJUSTMENT')),
  amount numeric(14,2) not null check (amount <> 0 and amount > -1000000000000 and amount < 1000000000000), unique (journal_id,account),
  foreign key (club_id,journal_id) references public.platform_billing_journals(club_id,id)
);
create index platform_billing_posting_club_account_idx on public.platform_billing_postings(club_id,account,journal_id);

-- No Data API direct writes, including service_role. RPCs run with a real user JWT.
create function public.platform_billing_can_read_f2(p_club_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select auth.uid() is not null and (exists(select 1 from public.platform_admins where user_id = auth.uid()) or
    exists(select 1 from public.club_memberships where club_id = p_club_id and user_id = auth.uid()
      and role in ('OWNER','ADMIN') and status = 'APPROVED' and approved_at is not null));
$$;
create function public.platform_billing_require_admin_f2() returns uuid
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'BILLING_PLATFORM_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Internal read projections. All statuses/balances are net of reversed payments.
create view public.platform_billing_invoice_projection_f2 as
select i.*, coalesce(a.net,0) allocated_net,
  case when i.status = 'VOID' then 0 else i.total - coalesce(a.net,0) end balance,
  case when i.status in ('VOID','DRAFT') then i.status when i.total = coalesce(a.net,0) then 'PAID'
    when i.due_at < (now() at time zone 'America/Argentina/Buenos_Aires')::date then 'OVERDUE'
    when coalesce(a.net,0) > 0 then 'PARTIAL' else 'ISSUED' end financial_status,
  case when i.status = 'ISSUED' and i.total = coalesce(a.net,0) then coalesce(a.last_paid,i.issued_at) end paid_at
from public.platform_billing_invoices i left join lateral (
  select sum(a.amount) net, max(p.paid_at) last_paid from public.platform_billing_allocations a
  join public.platform_billing_payments p on p.id = a.payment_id and p.status = 'POSTED' where a.invoice_id = i.id
) a on true;
create view public.platform_billing_subscription_projection_f2 as
select s.*, p.name plan_name, coalesce((pe.plan_snapshot->>'price')::numeric,p.price) price,
  coalesce(pe.plan_snapshot->>'billing_interval',p.billing_interval) billing_interval, p.description, p.config,
  p.price catalog_price,p.billing_interval catalog_interval,
  c.name club_name, np.name next_plan_name,np.price next_plan_price,np.billing_interval next_plan_interval,
  case when s.status in ('ACTIVE','TRIAL') and exists(select 1 from public.platform_billing_invoice_projection_f2 i
    where i.subscription_id = s.id and i.financial_status = 'OVERDUE') then 'PAST_DUE' else s.status end financial_status,
  coalesce((select sum(i.balance) from public.platform_billing_invoice_projection_f2 i where i.club_id = s.club_id and i.status = 'ISSUED'),0) balance
from public.platform_billing_subscriptions s join public.platform_billing_plans p on p.id = s.plan_id
join public.clubs c on c.id = s.club_id left join public.platform_billing_plans np on np.id = s.next_plan_id
left join public.platform_billing_periods pe on pe.subscription_id=s.id and pe.period_start=s.current_period_start and pe.plan_id=s.plan_id;

create function public.platform_billing_immutable_f2() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin raise exception 'BILLING_IMMUTABLE'; end $$;
create function public.platform_billing_invoice_guard_f2() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then raise exception 'BILLING_IMMUTABLE'; end if;
  if (to_jsonb(new) - array['status','voided_at','void_reason','revision']) is distinct from
     (to_jsonb(old) - array['status','voided_at','void_reason','revision']) or
     not (new.status = old.status or (old.status = 'ISSUED' and new.status = 'VOID')) then
    raise exception 'BILLING_INVOICE_ECONOMICS_IMMUTABLE';
  end if;
  if new.status=old.status and (new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason) then
    raise exception 'BILLING_INVOICE_ECONOMICS_IMMUTABLE'; end if;
  return new;
end $$;
create function public.platform_billing_payment_guard_f2() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then raise exception 'BILLING_IMMUTABLE'; end if;
  if (to_jsonb(new) - array['status','reversed_at','reversed_by','reversal_reason']) is distinct from
     (to_jsonb(old) - array['status','reversed_at','reversed_by','reversal_reason']) or
     old.status <> 'POSTED' or new.status <> 'REVERSED' then raise exception 'BILLING_PAYMENT_IMMUTABLE'; end if;
  return new;
end $$;
create trigger platform_billing_invoice_guard before update or delete on public.platform_billing_invoices for each row execute function public.platform_billing_invoice_guard_f2();
create trigger platform_billing_payment_guard before update or delete on public.platform_billing_payments for each row execute function public.platform_billing_payment_guard_f2();
create function public.platform_billing_command_guard_f2() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op='DELETE' then raise exception 'BILLING_IMMUTABLE'; end if;
  if old.response is not null or (to_jsonb(new)-'response') is distinct from (to_jsonb(old)-'response') or new.response is null then
    raise exception 'BILLING_COMMAND_IMMUTABLE'; end if;
  return new;
end $$;
create trigger platform_billing_command_guard before update or delete on public.platform_billing_commands for each row execute function public.platform_billing_command_guard_f2();
create trigger platform_billing_subscription_no_delete before delete on public.platform_billing_subscriptions for each row execute function public.platform_billing_immutable_f2();
create trigger platform_billing_plan_no_delete before delete on public.platform_billing_plans for each row execute function public.platform_billing_immutable_f2();

-- Deferred checks also catch privileged malformed journals or source records.
create function public.platform_billing_integrity_f2() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare j public.platform_billing_journals; v_amount numeric; v_debit text; v_credit text; v_source uuid;
begin
  if tg_table_name in ('platform_billing_journals','platform_billing_postings') then
    select * into j from public.platform_billing_journals where id = case when tg_table_name = 'platform_billing_journals' then new.id else (to_jsonb(new)->>'journal_id')::uuid end;
    if j.invoice_id is not null then select total into v_amount from public.platform_billing_invoices where id = j.invoice_id;
    else select amount into v_amount from public.platform_billing_payments where id = j.payment_id; end if;
    v_debit := case j.kind when 'INVOICE_ISSUED' then 'ACCOUNTS_RECEIVABLE' when 'INVOICE_VOIDED' then 'REVENUE' when 'PAYMENT_POSTED' then 'CASH' else 'ACCOUNTS_RECEIVABLE' end;
    v_credit := case j.kind when 'INVOICE_ISSUED' then 'REVENUE' when 'INVOICE_VOIDED' then 'ACCOUNTS_RECEIVABLE' when 'PAYMENT_POSTED' then 'ACCOUNTS_RECEIVABLE' else 'CASH' end;
    if (select count(*) from public.platform_billing_postings where journal_id = j.id) <> 2 or
       not exists(select 1 from public.platform_billing_postings where journal_id = j.id and account = v_debit and amount = v_amount) or
       not exists(select 1 from public.platform_billing_postings where journal_id = j.id and account = v_credit and amount = -v_amount) or
       not exists(select 1 from public.platform_billing_commands where id = j.command_id and actor_id = j.actor_id and
         operation=case j.kind when 'INVOICE_ISSUED' then 'GENERATE_PERIOD' when 'INVOICE_VOIDED' then 'VOID_INVOICE' when 'PAYMENT_POSTED' then 'REGISTER_PAYMENT' else 'REVERSE_PAYMENT' end) or
       (j.kind='INVOICE_VOIDED' and not exists(select 1 from public.platform_billing_invoices where id=j.invoice_id and status='VOID')) or
       (j.kind='PAYMENT_REVERSED' and not exists(select 1 from public.platform_billing_payments where id=j.payment_id and status='REVERSED' and reversed_by=j.actor_id)) or
       (j.kind='PAYMENT_POSTED' and not exists(select 1 from public.platform_billing_payments where id=j.payment_id and created_by=j.actor_id)) or
       (j.kind='INVOICE_ISSUED' and not exists(select 1 from public.platform_billing_invoices where id=j.invoice_id and created_by=j.actor_id)) then
      raise exception 'BILLING_JOURNAL_INTEGRITY';
    end if;
  elsif tg_table_name = 'platform_billing_invoices' then
    select total into v_amount from public.platform_billing_invoices where id = new.id;
    if (select coalesce(sum(amount),0) from public.platform_billing_invoice_lines where invoice_id = new.id) <> v_amount then raise exception 'BILLING_LINE_TOTAL'; end if;
    if new.status <> 'DRAFT' and v_amount > 0 and not exists(select 1 from public.platform_billing_journals where invoice_id = new.id and kind = 'INVOICE_ISSUED') then raise exception 'BILLING_INVOICE_JOURNAL_MISSING'; end if;
    if new.status = 'VOID' and ((select allocated_net from public.platform_billing_invoice_projection_f2 where id = new.id) <> 0 or
      (v_amount > 0 and not exists(select 1 from public.platform_billing_journals where invoice_id = new.id and kind = 'INVOICE_VOIDED'))) then raise exception 'BILLING_VOID_INTEGRITY'; end if;
  elsif tg_table_name = 'platform_billing_payments' then
    if (select coalesce(sum(amount),0) from public.platform_billing_allocations where payment_id = new.id) <> new.amount or
       not exists(select 1 from public.platform_billing_journals where payment_id = new.id and kind = 'PAYMENT_POSTED') or
       (new.status = 'REVERSED' and not exists(select 1 from public.platform_billing_journals where payment_id = new.id and kind = 'PAYMENT_REVERSED')) then raise exception 'BILLING_PAYMENT_INTEGRITY'; end if;
  elsif tg_table_name = 'platform_billing_allocations' then
    v_source := new.invoice_id;
    if exists(select 1 from public.platform_billing_invoice_projection_f2 where id = v_source and (allocated_net > total or (status <> 'ISSUED' and allocated_net > 0))) then raise exception 'BILLING_OVER_ALLOCATION'; end if;
    if (select coalesce(sum(amount),0) from public.platform_billing_allocations where payment_id=new.payment_id)<>
       (select amount from public.platform_billing_payments where id=new.payment_id) then raise exception 'BILLING_ALLOCATION_TOTAL'; end if;
  elsif tg_table_name = 'platform_billing_invoice_lines' then
    if (select coalesce(sum(amount),0) from public.platform_billing_invoice_lines where invoice_id=new.invoice_id)<>
       (select total from public.platform_billing_invoices where id=new.invoice_id) then raise exception 'BILLING_LINE_TOTAL'; end if;
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['platform_billing_journals','platform_billing_postings','platform_billing_allocations','platform_billing_invoice_lines','platform_billing_periods'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.platform_billing_immutable_f2()',t || '_immutable',t);
  end loop;
  foreach t in array array['platform_billing_journals','platform_billing_postings','platform_billing_invoices','platform_billing_payments','platform_billing_allocations','platform_billing_invoice_lines'] loop
    execute format('create constraint trigger %I after insert or update on public.%I deferrable initially deferred for each row execute function public.platform_billing_integrity_f2()',t || '_integrity',t);
  end loop;
end $$;

create function public.platform_billing_post_journal_f2(p_club uuid,p_kind text,p_invoice uuid,p_payment uuid,p_command uuid,p_actor uuid,p_amount numeric) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_debit text; v_credit text;
begin
  if p_amount = 0 then return; end if;
  v_debit := case p_kind when 'INVOICE_ISSUED' then 'ACCOUNTS_RECEIVABLE' when 'INVOICE_VOIDED' then 'REVENUE' when 'PAYMENT_POSTED' then 'CASH' else 'ACCOUNTS_RECEIVABLE' end;
  v_credit := case p_kind when 'INVOICE_ISSUED' then 'REVENUE' when 'INVOICE_VOIDED' then 'ACCOUNTS_RECEIVABLE' when 'PAYMENT_POSTED' then 'ACCOUNTS_RECEIVABLE' else 'CASH' end;
  insert into public.platform_billing_journals(club_id,kind,invoice_id,payment_id,command_id,actor_id)
    values(p_club,p_kind,p_invoice,p_payment,p_command,p_actor) returning id into v_id;
  insert into public.platform_billing_postings(club_id,journal_id,account,amount) values(p_club,v_id,v_debit,p_amount),(p_club,v_id,v_credit,-p_amount);
end $$;

-- One transactional gateway, explicit allowlist. No actor_id argument or service-key path.
create function public.execute_platform_billing_f2(p_operation text,p_key text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor uuid := public.platform_billing_require_admin_f2(); cmd public.platform_billing_commands;
  s public.platform_billing_subscriptions; pl public.platform_billing_plans; i public.platform_billing_invoices;
  pay public.platform_billing_payments; per public.platform_billing_periods;
  v_club uuid := (p_payload->>'club_id')::uuid; v_id uuid; v_start date; v_end date; v_amount numeric;
  v_item jsonb; v_response jsonb; v_immediate boolean; v_revision bigint; v_has_period boolean;
begin
  if p_operation not in ('SAVE_PLAN','ASSIGN_PLAN','CHANGE_PLAN','GENERATE_PERIOD','REGISTER_PAYMENT','REVERSE_PAYMENT','VOID_INVOICE','SUSPEND','REACTIVATE','CANCEL_AT_END') or
     p_key is null or length(p_key) not between 8 and 160 or jsonb_typeof(p_payload) <> 'object' or p_payload ? 'actor_id' then raise exception 'BILLING_INVALID_COMMAND'; end if;
  if p_payload ? 'currency_code' and p_payload->>'currency_code' is distinct from 'ARS' then raise exception 'BILLING_ARS_ONLY'; end if;
  insert into public.platform_billing_commands(actor_id,operation,idempotency_key,payload) values(v_actor,p_operation,p_key,p_payload)
    on conflict(actor_id,idempotency_key) do nothing;
  select * into cmd from public.platform_billing_commands where actor_id = v_actor and idempotency_key = p_key for update;
  if cmd.operation <> p_operation or cmd.payload <> p_payload then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
  if cmd.response is not null then return cmd.response; end if;
  if p_operation = 'SAVE_PLAN' then
    if (p_payload->>'price')::numeric <> round((p_payload->>'price')::numeric,2) then raise exception 'BILLING_INVALID_MONEY'; end if;
    if p_payload->>'id' is null then
      insert into public.platform_billing_plans(code,name,description,billing_interval,price,active,config)
      values(upper(btrim(p_payload->>'code')),btrim(p_payload->>'name'),coalesce(p_payload->>'description',''),p_payload->>'billing_interval',
        (p_payload->>'price')::numeric,coalesce((p_payload->>'active')::boolean,true),coalesce(p_payload->'config','{}')) returning id into v_id;
    else
      select * into pl from public.platform_billing_plans where id = (p_payload->>'id')::uuid for update;
      if not found then raise exception 'BILLING_PLAN_NOT_FOUND'; end if;
      if pl.revision <> (p_payload->>'revision')::bigint or p_payload->>'revision' is null then raise exception 'BILLING_REVISION_CONFLICT'; end if;
      update public.platform_billing_plans set name=btrim(p_payload->>'name'),description=coalesce(p_payload->>'description',''),
        billing_interval=p_payload->>'billing_interval',price=(p_payload->>'price')::numeric,active=(p_payload->>'active')::boolean,
        config=coalesce(p_payload->'config','{}'),revision=revision+1,updated_at=now() where id=pl.id returning id into v_id;
    end if;
  elsif p_operation = 'ASSIGN_PLAN' then
    -- Serialize competing assignments even when the club has no subscription yet.
    perform 1 from public.clubs where id = v_club for update;
    if not found then raise exception 'BILLING_CLUB_NOT_FOUND'; end if;
    if exists(select 1 from public.platform_billing_subscriptions where club_id=v_club and status <> 'CANCELLED') then raise exception 'BILLING_CURRENT_SUBSCRIPTION_EXISTS'; end if;
    select * into pl from public.platform_billing_plans where id=(p_payload->>'plan_id')::uuid and active for share;
    if not found then raise exception 'BILLING_ACTIVE_PLAN_REQUIRED'; end if;
    v_start := (p_payload->>'starts_on')::date;
    v_end := (v_start + case when pl.billing_interval='ANNUAL' then interval '1 year' else interval '1 month' end)::date;
    insert into public.platform_billing_subscriptions(club_id,plan_id,status,started_at,current_period_start,current_period_end,created_by)
    values(v_club,pl.id,case when coalesce((p_payload->>'trial')::boolean,false) then 'TRIAL' else 'ACTIVE' end,v_start,v_start,v_end,v_actor) returning id into v_id;
  elsif p_operation = 'REGISTER_PAYMENT' then
    if jsonb_typeof(p_payload->'allocations') <> 'array' or jsonb_array_length(p_payload->'allocations') not between 1 and 100 then raise exception 'BILLING_ALLOCATIONS_REQUIRED'; end if;
    v_amount := (p_payload->>'amount')::numeric;
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount,2) or
       (select sum((x->>'amount')::numeric) from jsonb_array_elements(p_payload->'allocations') x) <> v_amount then raise exception 'BILLING_ALLOCATION_TOTAL'; end if;
    if (select count(distinct x->>'invoice_id') from jsonb_array_elements(p_payload->'allocations') x) <> jsonb_array_length(p_payload->'allocations') then raise exception 'BILLING_DUPLICATE_ALLOCATION'; end if;
    -- Same order for payment, reversal and VOID. Updating revision forces 40001 under RR.
    for v_item in select x from jsonb_array_elements(p_payload->'allocations') x order by (x->>'invoice_id')::uuid loop
      select * into i from public.platform_billing_invoices where id=(v_item->>'invoice_id')::uuid and club_id=v_club for update;
      if not found or i.status <> 'ISSUED' then raise exception 'BILLING_PAYABLE_INVOICE_REQUIRED'; end if;
      if (v_item->>'amount')::numeric is null or (v_item->>'amount')::numeric <= 0 or (v_item->>'amount')::numeric <> round((v_item->>'amount')::numeric,2) or
         (v_item->>'amount')::numeric > (select balance from public.platform_billing_invoice_projection_f2 where id=i.id) then raise exception 'BILLING_OVER_ALLOCATION'; end if;
      update public.platform_billing_invoices set revision=revision+1 where id=i.id;
    end loop;
    if (p_payload->>'paid_at')::timestamptz > now() then raise exception 'BILLING_FUTURE_PAYMENT'; end if;
    insert into public.platform_billing_payments(club_id,amount,method,reference,paid_at,status,created_by)
    values(v_club,v_amount,p_payload->>'method',coalesce(p_payload->>'reference',''),(p_payload->>'paid_at')::timestamptz,'POSTED',v_actor) returning * into pay;
    insert into public.platform_billing_allocations(club_id,payment_id,invoice_id,amount)
      select v_club,pay.id,(x->>'invoice_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_payload->'allocations') x;
    perform public.platform_billing_post_journal_f2(v_club,'PAYMENT_POSTED',null,pay.id,cmd.id,v_actor,v_amount); v_id:=pay.id;
  elsif p_operation = 'REVERSE_PAYMENT' then
    select * into pay from public.platform_billing_payments where id=(p_payload->>'id')::uuid and club_id=v_club;
    if not found then raise exception 'BILLING_PAYMENT_NOT_FOUND'; end if;
    perform 1 from public.platform_billing_invoices where id in (select invoice_id from public.platform_billing_allocations where payment_id=pay.id) order by id for update;
    select * into pay from public.platform_billing_payments where id=pay.id for update;
    if pay.status <> 'POSTED' then raise exception 'BILLING_PAYMENT_ALREADY_REVERSED'; end if;
    if length(btrim(coalesce(p_payload->>'reason',''))) < 3 then raise exception 'BILLING_REASON_REQUIRED'; end if;
    update public.platform_billing_invoices set revision=revision+1 where id in (select invoice_id from public.platform_billing_allocations where payment_id=pay.id);
    update public.platform_billing_payments set status='REVERSED',reversed_by=v_actor,reversed_at=now(),reversal_reason=btrim(p_payload->>'reason') where id=pay.id;
    perform public.platform_billing_post_journal_f2(v_club,'PAYMENT_REVERSED',null,pay.id,cmd.id,v_actor,pay.amount); v_id:=pay.id;
  elsif p_operation = 'VOID_INVOICE' then
    select * into i from public.platform_billing_invoices where id=(p_payload->>'id')::uuid and club_id=v_club for update;
    if not found or i.status <> 'ISSUED' then raise exception 'BILLING_ISSUED_INVOICE_REQUIRED'; end if;
    if (select allocated_net from public.platform_billing_invoice_projection_f2 where id=i.id) > 0 then raise exception 'BILLING_REVERSE_PAYMENTS_BEFORE_VOID'; end if;
    if length(btrim(coalesce(p_payload->>'reason',''))) < 3 then raise exception 'BILLING_REASON_REQUIRED'; end if;
    update public.platform_billing_invoices set status='VOID',voided_at=now(),void_reason=btrim(p_payload->>'reason'),revision=revision+1 where id=i.id;
    perform public.platform_billing_post_journal_f2(v_club,'INVOICE_VOIDED',i.id,null,cmd.id,v_actor,i.total); v_id:=i.id;
  else
    select * into s from public.platform_billing_subscriptions where id=(p_payload->>'id')::uuid and club_id=v_club for update;
    if not found or s.status='CANCELLED' then raise exception 'BILLING_CURRENT_SUBSCRIPTION_REQUIRED'; end if;
    if p_operation <> 'GENERATE_PERIOD' then
      v_revision := (p_payload->>'revision')::bigint;
      if v_revision is null or s.revision <> v_revision then raise exception 'BILLING_REVISION_CONFLICT'; end if;
    end if;
    if p_operation = 'CHANGE_PLAN' then
      select * into pl from public.platform_billing_plans where id=(p_payload->>'plan_id')::uuid and active for share;
      if not found then raise exception 'BILLING_ACTIVE_PLAN_REQUIRED'; end if;
      v_immediate := coalesce((p_payload->>'immediate')::boolean,false);
      update public.platform_billing_subscriptions set plan_id=case when v_immediate then pl.id else plan_id end,
        next_plan_id=case when v_immediate then null else pl.id end,revision=revision+1,updated_at=now() where id=s.id;
    elsif p_operation in ('SUSPEND','REACTIVATE','CANCEL_AT_END') then
      update public.platform_billing_subscriptions set status=case p_operation when 'SUSPEND' then 'SUSPENDED' when 'REACTIVATE' then 'ACTIVE' else status end,
        cancel_at_period_end=case when p_operation='CANCEL_AT_END' then (p_payload->>'cancel')::boolean else cancel_at_period_end end,
        revision=revision+1,updated_at=now() where id=s.id;
    elsif p_operation = 'GENERATE_PERIOD' then
      v_start := (p_payload->>'period_start')::date;
      select * into per from public.platform_billing_periods where subscription_id=s.id and period_start=v_start;
      if found then
        v_response:=jsonb_build_object('id',per.id,'invoice_id',(select id from public.platform_billing_invoices where period_id=per.id),'duplicate',true);
      else
        if s.status='SUSPENDED' then raise exception 'BILLING_SUBSCRIPTION_SUSPENDED'; end if;
        v_has_period:=exists(select 1 from public.platform_billing_periods where subscription_id=s.id);
        -- Consecutive canonical periods only; explicit start makes retries unambiguous.
        if exists(select 1 from public.platform_billing_periods where subscription_id=s.id) then
          if v_start is distinct from s.current_period_end then raise exception 'BILLING_NEXT_PERIOD_REQUIRED'; end if;
          if s.cancel_at_period_end then
            update public.platform_billing_subscriptions set status='CANCELLED',cancelled_at=now(),revision=revision+1,updated_at=now() where id=s.id;
            v_response:=jsonb_build_object('id',s.id,'cancelled',true);
          end if;
        elsif v_start is distinct from s.current_period_start then raise exception 'BILLING_FIRST_PERIOD_REQUIRED'; end if;
        if v_response is null then
          select * into pl from public.platform_billing_plans where id=case when exists(select 1 from public.platform_billing_periods where subscription_id=s.id) then coalesce(s.next_plan_id,s.plan_id) else s.plan_id end for share;
          if not pl.active then raise exception 'BILLING_ACTIVE_PLAN_REQUIRED'; end if;
          if (p_payload ? 'expected_plan_id' and (p_payload->>'expected_plan_id')::uuid is distinct from pl.id) or
             (p_payload ? 'expected_price' and (p_payload->>'expected_price')::numeric is distinct from pl.price) or
             (p_payload ? 'expected_interval' and p_payload->>'expected_interval' is distinct from pl.billing_interval) then raise exception 'BILLING_REVISION_CONFLICT'; end if;
          v_end := (v_start + case when pl.billing_interval='ANNUAL' then interval '1 year' else interval '1 month' end)::date;
          insert into public.platform_billing_periods(club_id,subscription_id,plan_id,period_start,period_end,plan_snapshot,status)
            values(v_club,s.id,pl.id,v_start,v_end,to_jsonb(pl),case when pl.billing_interval='FREE' then 'PAID' else 'INVOICED' end) returning * into per;
          update public.platform_billing_subscriptions set plan_id=pl.id,next_plan_id=case when v_has_period then null else next_plan_id end,current_period_start=v_start,current_period_end=v_end,
            status=case when status='TRIAL' then 'ACTIVE' else status end,revision=revision+1,updated_at=now() where id=s.id;
          if pl.billing_interval <> 'FREE' then
            if p_payload->>'due_on' is null then raise exception 'BILLING_DUE_DATE_REQUIRED'; end if;
            insert into public.platform_billing_invoices(club_id,subscription_id,period_id,subtotal,total,status,issued_at,due_at,created_by)
              values(v_club,s.id,per.id,pl.price,pl.price,'ISSUED',now(),(p_payload->>'due_on')::date,v_actor) returning * into i;
            insert into public.platform_billing_invoice_lines(club_id,invoice_id,kind,description,amount)
              values(v_club,i.id,'PLAN',pl.name || ' · ' || v_start || ' / ' || v_end,pl.price);
            perform public.platform_billing_post_journal_f2(v_club,'INVOICE_ISSUED',i.id,null,cmd.id,v_actor,pl.price);
          end if;
          v_response:=jsonb_build_object('id',per.id,'invoice_id',i.id,'duplicate',false);
        end if;
      end if;
    end if;
    v_id:=s.id;
  end if;
  v_response:=coalesce(v_response,jsonb_build_object('id',v_id));
  update public.platform_billing_commands set response=v_response where id=cmd.id;
  return v_response;
end $$;

create function public.get_platform_billing_overview_f2(p_club_id uuid default null,p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_from date := coalesce(p_from,date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_to date := coalesce(p_to,(now() at time zone 'America/Argentina/Buenos_Aires')::date); result jsonb;
begin
  if p_club_id is null then perform public.platform_billing_require_admin_f2();
  elsif not public.platform_billing_can_read_f2(p_club_id) then raise exception 'BILLING_READ_DENIED' using errcode='42501'; end if;
  if v_to < v_from or v_to - v_from > 366 then raise exception 'BILLING_INVALID_DATE_RANGE'; end if;
  select jsonb_build_object('from',v_from,'to',v_to,'currency_code','ARS',
    'received',coalesce((select sum(amount) from public.platform_billing_payments where status='POSTED' and
      paid_at >= (v_from::timestamp at time zone 'America/Argentina/Buenos_Aires') and paid_at < ((v_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and (p_club_id is null or club_id=p_club_id)),0),
    'pending',coalesce(sum(balance) filter(where status='ISSUED'),0),
    'overdue',coalesce(sum(balance) filter(where financial_status='OVERDUE'),0),
    'clubs_with_debt',count(distinct club_id) filter(where status='ISSUED' and balance>0),
    'active_clubs',(select count(*) from public.platform_billing_subscriptions where status in ('TRIAL','ACTIVE') and (p_club_id is null or club_id=p_club_id)),
    'subscription',(select to_jsonb(s) || jsonb_build_object('generated_current',exists(select 1 from public.platform_billing_periods where subscription_id=s.id and period_start=s.current_period_start))
      from public.platform_billing_subscription_projection_f2 s where s.club_id=p_club_id order by s.created_at desc,s.id desc limit 1),
    'generated_at',now()) into result
  from public.platform_billing_invoice_projection_f2 where p_club_id is null or club_id=p_club_id;
  return result;
end $$;

create function public.list_platform_billing_f2(p_kind text,p_club_id uuid default null,p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,p_limit integer default 20,p_search text default '',p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb; v_last jsonb; v_count integer; v_from date; v_to date;
begin
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_at is null) <> (p_cursor_id is null) then raise exception 'BILLING_INVALID_PAGE'; end if;
  if p_club_id is null or p_kind in ('plans','clubs','balances','plan_reports','history') then perform public.platform_billing_require_admin_f2();
  elsif not public.platform_billing_can_read_f2(p_club_id) then raise exception 'BILLING_READ_DENIED' using errcode='42501'; end if;
  v_from:=coalesce(p_from,date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_to:=coalesce(p_to,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
  if v_to < v_from or v_to-v_from > 366 then raise exception 'BILLING_INVALID_DATE_RANGE'; end if;
  if p_kind='invoices' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select i.*,c.name club_name,pe.period_start,pe.period_end from public.platform_billing_invoice_projection_f2 i
      join public.clubs c on c.id=i.club_id join public.platform_billing_periods pe on pe.id=i.period_id
      where (p_club_id is null or i.club_id=p_club_id) and (p_cursor_at is null or (i.created_at,i.id)<(p_cursor_at,p_cursor_id))
      order by i.created_at desc,i.id desc limit p_limit+1) r;
  elsif p_kind='payments' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select p.*,c.name club_name,(select jsonb_agg(jsonb_build_object('invoice_id',a.invoice_id,'invoice_number',i.invoice_number,'amount',a.amount))
        from public.platform_billing_allocations a join public.platform_billing_invoices i on i.id=a.invoice_id where a.payment_id=p.id) allocations
      from public.platform_billing_payments p join public.clubs c on c.id=p.club_id
      where (p_club_id is null or p.club_id=p_club_id) and (p_cursor_at is null or (p.created_at,p.id)<(p_cursor_at,p_cursor_id))
      order by p.created_at desc,p.id desc limit p_limit+1) r;
  elsif p_kind='subscriptions' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select s.*,exists(select 1 from public.platform_billing_periods where subscription_id=s.id and period_start=s.current_period_start) generated_current
      from public.platform_billing_subscription_projection_f2 s where (p_club_id is null or s.club_id=p_club_id)
      and (p_cursor_at is null or (s.created_at,s.id)<(p_cursor_at,p_cursor_id)) order by s.created_at desc,s.id desc limit p_limit+1) r;
  elsif p_kind='periods' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select p.*,i.invoice_number,coalesce(case when i.financial_status='VOID' then 'VOID' when i.financial_status='PAID' then 'PAID' else p.status end,p.status) financial_status
      from public.platform_billing_periods p left join public.platform_billing_invoice_projection_f2 i on i.period_id=p.id
      where (p_club_id is null or p.club_id=p_club_id) and (p_cursor_at is null or (p.created_at,p.id)<(p_cursor_at,p_cursor_id))
      order by p.created_at desc,p.id desc limit p_limit+1) r;
  elsif p_kind in ('plans','plan_reports') then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select p.*,
        (select count(*) from public.platform_billing_subscriptions where plan_id=p.id and status <> 'CANCELLED') clubs,
        (select coalesce(sum(i.total),0) from public.platform_billing_periods pe join public.platform_billing_invoices i on i.period_id=pe.id
          where pe.plan_id=p.id and i.status='ISSUED' and i.issued_at >= (v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
          and i.issued_at < ((v_to+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')) billed
      from public.platform_billing_plans p where (p_cursor_at is null or (p.created_at,p.id)<(p_cursor_at,p_cursor_id))
      and (p.name ilike '%' || left(coalesce(p_search,''),100) || '%' or p.code ilike '%' || left(coalesce(p_search,''),100) || '%')
      order by p.created_at desc,p.id desc limit p_limit+1) r;
  elsif p_kind in ('balances','clubs') then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select c.id,c.name club_name,c.created_at,coalesce(sum(i.balance) filter(where i.status='ISSUED'),0) balance,
        coalesce(sum(i.balance) filter(where i.financial_status='OVERDUE'),0) overdue
      from public.clubs c left join public.platform_billing_invoice_projection_f2 i on i.club_id=c.id
      where (p_club_id is null or c.id=p_club_id) and c.name ilike '%' || left(coalesce(p_search,''),100) || '%'
        and (p_cursor_at is null or (c.created_at,c.id)<(p_cursor_at,p_cursor_id))
      group by c.id order by c.created_at desc,c.id desc limit p_limit+1) r;
  elsif p_kind='history' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select * from public.platform_billing_commands where (p_club_id is null or payload->>'club_id'=p_club_id::text)
      and (p_cursor_at is null or (created_at,id)<(p_cursor_at,p_cursor_id)) order by created_at desc,id desc limit p_limit+1) r;
  else raise exception 'BILLING_INVALID_LIST'; end if;
  v_count:=jsonb_array_length(v_rows);
  v_last:=v_rows->(least(v_count,p_limit)-1);
  return jsonb_build_object('items',case when v_count>p_limit then v_rows-(v_count-1) else v_rows end,
    'nextCursor',case when v_count>p_limit then jsonb_build_object('at',v_last->>'created_at','id',v_last->>'id') else null end);
end $$;

-- Tables have RLS and minimal SELECT policies; grants remain RPC-only deliberately.
do $$ declare t text; begin
  foreach t in array array['platform_billing_plans','platform_billing_subscriptions','platform_billing_periods','platform_billing_invoices',
    'platform_billing_invoice_lines','platform_billing_payments','platform_billing_allocations','platform_billing_commands','platform_billing_journals','platform_billing_postings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    if t in ('platform_billing_plans','platform_billing_commands') then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.is_platform_admin()))',t || '_read',t);
    else
      execute format('create policy %I on public.%I for select to authenticated using (public.platform_billing_can_read_f2(club_id))',t || '_read',t);
    end if;
  end loop;
end $$;
revoke all on sequence public.platform_billing_invoice_number_seq from public,anon,authenticated,service_role;
revoke all on public.platform_billing_invoice_projection_f2,public.platform_billing_subscription_projection_f2 from public,anon,authenticated,service_role;
revoke all on function public.platform_billing_can_read_f2(uuid),public.platform_billing_require_admin_f2(),public.platform_billing_immutable_f2(),
  public.platform_billing_invoice_guard_f2(),public.platform_billing_payment_guard_f2(),public.platform_billing_command_guard_f2(),public.platform_billing_integrity_f2(),
  public.platform_billing_post_journal_f2(uuid,text,uuid,uuid,uuid,uuid,numeric),public.execute_platform_billing_f2(text,text,jsonb),
  public.get_platform_billing_overview_f2(uuid,date,date),public.list_platform_billing_f2(text,uuid,timestamptz,uuid,integer,text,date,date)
  from public,anon,authenticated,service_role;
grant execute on function public.execute_platform_billing_f2(text,text,jsonb),public.get_platform_billing_overview_f2(uuid,date,date),
  public.list_platform_billing_f2(text,uuid,timestamptz,uuid,integer,text,date,date) to authenticated;

commit;
