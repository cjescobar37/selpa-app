-- F1F is additive. No economic writes, provider processing or F1A-F1E ACL changes.
begin;

create table public.club_finance_review_history_f1f (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  intent_id uuid references public.club_payment_intents(id) on delete restrict,
  result_id uuid references public.club_payment_provider_event_results(id) on delete restrict,
  source_version text not null,
  action text not null check (action in ('NOTE', 'REVIEWED', 'RESOLVED')),
  note text not null check (length(btrim(note)) between 3 and 2000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  check ((intent_id is null) <> (result_id is null)),
  unique (club_id, idempotency_key)
);
alter table public.club_finance_review_history_f1f enable row level security;
revoke all on public.club_finance_review_history_f1f from public, anon, authenticated, service_role;
create trigger club_finance_review_history_f1f_immutable
  before update or delete on public.club_finance_review_history_f1f
  for each row execute function public.guard_club_finance_immutable();
-- Supports latest administrative disposition and chronological case history.
create index club_finance_review_intent_f1f_idx
  on public.club_finance_review_history_f1f(club_id, intent_id, created_at desc, id desc)
  where intent_id is not null;
create index club_finance_review_result_f1f_idx
  on public.club_finance_review_history_f1f(club_id, result_id, created_at desc, id desc)
  where result_id is not null;
-- Batch provider classification joins on finance_payment_id, including when F1E is OFF.
create index club_payment_intent_finance_payment_f1f_idx
  on public.club_payment_intents(club_id, finance_payment_id) where finance_payment_id is not null;

-- Internal views are not Data API resources. Definer RPCs below enforce club capability.
create view public.club_finance_obligations_read_f1f with (security_invoker = true) as
with paid as (
  select a.club_id, a.obligation_id, sum(a.amount) allocated_net
  from public.club_finance_allocations a
  join public.club_finance_payments p on p.club_id = a.club_id and p.id = a.payment_id
  where p.status = 'POSTED' and p.currency_code = 'ARS'
  group by a.club_id, a.obligation_id
), balances as (
  select o.*, coalesce(paid.allocated_net, 0) allocated_net,
    case when o.status = 'CANCELLED' then 0
      else greatest(o.original_amount - coalesce(paid.allocated_net, 0), 0) end balance
  from public.club_finance_obligations o
  left join paid on paid.club_id = o.club_id and paid.obligation_id = o.id
  where o.currency_code = 'ARS'
)
select b.id, b.club_id, b.created_at, b.due_date, b.concept, b.tournament_id,
  t.name tournament_name, b.original_amount, b.allocated_net, b.balance, b.currency_code,
  case when b.status = 'CANCELLED' then 'CANCELLED'
    when b.balance = 0 then 'PAID' when b.allocated_net > 0 then 'PARTIAL'
    else 'PENDING' end financial_status,
  case when b.debtor_type = 'TEAM' then concat_ws(' + ',
    coalesce(nullif(btrim(concat_ws(' ', p1.first_name, p1.last_name)), ''), nullif(p1.display_name, ''), 'Jugador 1'),
    coalesce(nullif(btrim(concat_ws(' ', p2.first_name, p2.last_name)), ''), nullif(p2.display_name, ''), 'Jugador 2'))
    when b.debtor_type = 'USER' then
      coalesce(nullif(btrim(concat_ws(' ', pu.first_name, pu.last_name)), ''), nullif(pu.display_name, ''), 'Jugador')
    else b.debtor_name end debtor_name
from balances b
left join public.tournament_teams team on team.club_id = b.club_id and team.id = coalesce(b.team_id, b.debtor_team_id)
left join public.profiles p1 on p1.user_id = team.player1_user_id
left join public.profiles p2 on p2.user_id = team.player2_user_id
left join public.profiles pu on pu.user_id = b.debtor_user_id
left join public.tournaments t on t.club_id = b.club_id and t.id = b.tournament_id;

-- One row per payment, even if future canonical allocations split a payment.
create view public.club_finance_payments_read_f1f with (security_invoker = true) as
select p.id, p.club_id, p.paid_at, p.created_at, p.reversed_at, p.amount, p.currency_code,
  p.payment_method method, p.status, p.reference,
  case when exists (select 1 from public.club_payment_intents i
    where i.club_id = p.club_id and i.finance_payment_id = p.id)
    then 'MERCADO_PAGO'::text else null::text end provider,
  labels.debtor_name, labels.concept, labels.tournament_name
from public.club_finance_payments p
left join (
  select a.club_id, a.payment_id,
    string_agg(distinct o.debtor_name, ' / ') debtor_name,
    string_agg(distinct o.concept, ' / ') concept,
    string_agg(distinct o.tournament_name, ' / ') tournament_name
  from public.club_finance_allocations a
  join public.club_finance_obligations_read_f1f o on o.club_id = a.club_id and o.id = a.obligation_id
  group by a.club_id, a.payment_id
) labels on labels.club_id = p.club_id and labels.payment_id = p.id
where p.currency_code = 'ARS';

create view public.club_finance_cases_read_f1f with (security_invoker = true) as
with sources as (
  select i.id, i.club_id, 'INTENT'::text kind, extract(epoch from i.updated_at)::text source_version,
    i.updated_at occurred_at, i.obligation_id, i.amount, i.currency_code,
    i.error_code reason, i.provider, i.payer_user_id,
    (i.status = 'RECONCILIATION_REQUIRED') needs_review
  from public.club_payment_intents i where i.status = 'RECONCILIATION_REQUIRED'
    or exists (select 1 from public.club_finance_review_history_f1f h where h.club_id = i.club_id and h.intent_id = i.id)
  union all
  select r.id, a.club_id, 'EVENT'::text, r.id::text, r.processed_at,
    i.obligation_id,
    coalesce(i.amount, case when r.verified_snapshot->>'amount' ~ '^\d{1,12}(\.\d{1,2})?$'
      then (r.verified_snapshot->>'amount')::numeric end),
    coalesce(i.currency_code, case when r.verified_snapshot->>'currency' ~ '^[A-Z]{3}$'
      then r.verified_snapshot->>'currency' end), r.error_code, e.provider, i.payer_user_id,
    (not exists (select 1 from public.club_payment_provider_event_results newer
      where newer.event_id = r.event_id and (newer.processed_at, newer.id) > (r.processed_at, r.id))) needs_review
  from public.club_payment_provider_event_results r
  join public.club_payment_provider_events e on e.id = r.event_id
  join public.club_payment_provider_accounts a on a.id = e.account_id
  left join public.club_payment_intents i on i.id = r.intent_id and i.club_id = a.club_id
  where r.processing_status = 'RECONCILIATION_REQUIRED'
    and (not exists (select 1 from public.club_payment_provider_event_results newer
      where newer.event_id = r.event_id and (newer.processed_at, newer.id) > (r.processed_at, r.id))
      or exists (select 1 from public.club_finance_review_history_f1f h where h.club_id = a.club_id and h.result_id = r.id))
    and (i.id is null or i.status <> 'RECONCILIATION_REQUIRED'
      or exists (select 1 from public.club_finance_review_history_f1f h where h.club_id = a.club_id and h.result_id = r.id))
)
select s.*, o.debtor_name, o.tournament_name, o.balance, o.financial_status,
  coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), nullif(p.display_name, ''), 'Jugador no identificado') player_name,
  case when not s.needs_review then 'RESOLVED' else coalesce(disposition.action, 'OPEN') end review_status
from sources s
left join public.club_finance_obligations_read_f1f o on o.club_id = s.club_id and o.id = s.obligation_id
left join public.profiles p on p.user_id = s.payer_user_id
left join lateral (
  select h.action from public.club_finance_review_history_f1f h
  where h.club_id = s.club_id and h.source_version = s.source_version
    and ((s.kind = 'INTENT' and h.intent_id = s.id) or (s.kind = 'EVENT' and h.result_id = s.id))
    and h.action in ('REVIEWED', 'RESOLVED') order by h.created_at desc, h.id desc limit 1
) disposition on true;

revoke all on public.club_finance_obligations_read_f1f, public.club_finance_payments_read_f1f,
  public.club_finance_cases_read_f1f from public, anon, authenticated, service_role;

create function public.get_club_finance_report_f1f(p_club_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_result jsonb; v_start timestamptz; v_end timestamptz;
begin
  if p_club_id is null or auth.uid() is null or not coalesce(public.has_club_capability(p_club_id, 'finance:view'), false) then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'FINANCE_RANGE_INVALID' using errcode = '22023';
  end if;
  v_start := p_from::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_end := (p_to + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  with obligations as materialized (
    select * from public.club_finance_obligations_read_f1f o where o.club_id = p_club_id
  ), payments as materialized (
    select * from public.club_finance_payments_read_f1f p
    where p.club_id = p_club_id and p.paid_at >= v_start and p.paid_at < v_end and p.status = 'POSTED'
  ), tournament_received as (
    select o.tournament_id, sum(a.amount) received
    from payments p join public.club_finance_allocations a on a.club_id = p_club_id and a.payment_id = p.id
    join obligations o on o.id = a.obligation_id group by o.tournament_id
  ), tournaments as (
    select o.tournament_id, coalesce(max(o.tournament_name), 'Sin torneo') tournament_name,
      sum(o.balance) pending, coalesce(max(tr.received), 0) received
    from obligations o left join tournament_received tr on tr.tournament_id is not distinct from o.tournament_id
    group by o.tournament_id
  ), aging as (
    select case when o.due_date is null then 'NO_DUE_DATE'
      when o.due_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date then 'CURRENT'
      when (now() at time zone 'America/Argentina/Buenos_Aires')::date - o.due_date <= 7 then 'DAYS_1_7'
      when (now() at time zone 'America/Argentina/Buenos_Aires')::date - o.due_date <= 30 then 'DAYS_8_30'
      else 'DAYS_31_PLUS' end bucket, sum(o.balance) amount, count(*) count
    from obligations o where o.balance > 0 group by 1
  )
  select jsonb_build_object('currency_code', 'ARS', 'from', p_from, 'to', p_to,
    'generated_at', now(), 'total_received', (select coalesce(sum(p.amount), 0) from payments p),
    'total_pending', (select coalesce(sum(o.balance), 0) from obligations o),
    'open_obligations', (select count(*) from obligations o where o.balance > 0),
    'paid_obligations', (select count(*) from obligations o where o.financial_status = 'PAID'),
    'partial_obligations', (select count(*) from obligations o where o.financial_status = 'PARTIAL'),
    'reconciliation_open', (select count(*) from public.club_finance_cases_read_f1f c
      where c.club_id = p_club_id and c.review_status <> 'RESOLVED'),
    'methods', coalesce((select jsonb_agg(to_jsonb(m)) from (
      select coalesce(p.provider, p.method) method, sum(p.amount) amount from payments p group by 1
    ) m), '[]'::jsonb),
    'tournaments', coalesce((select jsonb_agg(to_jsonb(t) order by t.pending desc, t.tournament_name) from tournaments t), '[]'::jsonb),
    'aging', coalesce((select jsonb_agg(to_jsonb(a)) from aging a), '[]'::jsonb)) into v_result;
  return v_result;
end; $$;

create function public.list_club_finance_f1f(
  p_club_id uuid, p_kind text, p_filter text default 'ALL', p_search text default '',
  p_from date default null, p_to date default null, p_limit integer default 21,
  p_before_at timestamptz default null, p_before_id uuid default null
) returns table(item jsonb) language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_start timestamptz; v_end timestamptz;
begin
  if p_club_id is null or auth.uid() is null or not coalesce(public.has_club_capability(p_club_id, 'finance:view'), false) then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_kind not in ('OBLIGATIONS', 'PAYMENTS', 'MOVEMENTS', 'CASES') or p_kind is null
    or p_limit is null or p_limit not between 1 and 501 or p_search is null or length(p_search) > 120
    or p_filter is null or p_filter not in ('ALL', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED', 'CASH', 'BANK_TRANSFER', 'MERCADO_PAGO', 'REVERSED', 'OPEN', 'RESOLVED')
    or (p_from is null) <> (p_to is null) or p_to < p_from or p_to - p_from > 366
    or (p_before_at is null) <> (p_before_id is null) then
    raise exception 'FINANCE_PAGE_INVALID' using errcode = '22023';
  end if;
  v_start := p_from::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_end := (p_to + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  if p_kind = 'OBLIGATIONS' then
    return query select to_jsonb(o) - 'club_id' from public.club_finance_obligations_read_f1f o
    where o.club_id = p_club_id and (p_filter = 'ALL' or o.financial_status = p_filter
      or (p_filter = 'PENDING' and o.balance > 0))
      and (p_from is null or (o.created_at >= v_start and o.created_at < v_end))
      and position(lower(btrim(p_search)) in lower(concat_ws(' ', o.debtor_name, o.tournament_name, o.concept))) > 0
      and (p_before_at is null or (o.created_at, o.id) < (p_before_at, p_before_id))
    order by o.created_at desc, o.id desc limit p_limit;
  elsif p_kind = 'PAYMENTS' then
    return query select to_jsonb(p) - 'club_id' from public.club_finance_payments_read_f1f p
    where p.club_id = p_club_id
      and (p_from is null or (p.paid_at >= v_start and p.paid_at < v_end))
      and (p_filter = 'ALL' or p.status = p_filter or coalesce(p.provider, p.method) = p_filter)
      and (p_before_at is null or (p.paid_at, p.id) < (p_before_at, p_before_id))
    order by p.paid_at desc, p.id desc limit p_limit;
  elsif p_kind = 'MOVEMENTS' then
    return query with movements as (
      select j.id, p.id payment_id,
        case when j.event_type = 'PAYMENT_RECEIVED' then p.paid_at else p.reversed_at end occurred_at,
        j.event_type, case when j.event_type = 'PAYMENT_REVERSED' then -p.amount else p.amount end amount,
        p.currency_code, p.method, p.provider, p.reference, p.debtor_name, p.concept, p.tournament_name
      from public.club_finance_journals j
      join public.club_finance_payments_read_f1f p on p.club_id = j.club_id and p.id = j.payment_id
      where j.club_id = p_club_id and j.event_type in ('PAYMENT_RECEIVED', 'PAYMENT_REVERSED')
    ) select to_jsonb(m) from movements m
    where (p_from is null or (m.occurred_at >= v_start and m.occurred_at < v_end))
      and (p_filter = 'ALL' or coalesce(m.provider, m.method) = p_filter
        or (p_filter = 'REVERSED' and m.event_type = 'PAYMENT_REVERSED'))
      and (p_before_at is null or (m.occurred_at, m.id) < (p_before_at, p_before_id))
    order by m.occurred_at desc, m.id desc limit p_limit;
  else
    return query select to_jsonb(c) - 'club_id' - 'payer_user_id' from public.club_finance_cases_read_f1f c
    where c.club_id = p_club_id
      and (p_filter = 'ALL' or (p_filter = 'OPEN' and c.review_status <> 'RESOLVED') or c.review_status = p_filter)
      and (p_before_at is null or (c.occurred_at, c.id) < (p_before_at, p_before_id))
    order by c.occurred_at desc, c.id desc limit p_limit;
  end if;
end; $$;

create function public.get_club_finance_case_f1f(p_club_id uuid, p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_case jsonb; v_history jsonb;
begin
  if p_club_id is null or auth.uid() is null or not coalesce(public.has_club_capability(p_club_id, 'finance:manage'), false) then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  select to_jsonb(c) - 'club_id' - 'payer_user_id' into v_case
  from public.club_finance_cases_read_f1f c where c.club_id = p_club_id and c.kind = p_kind and c.id = p_id;
  if v_case is null then raise exception 'FINANCE_CASE_NOT_FOUND' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'action', h.action, 'note', h.note,
    'created_at', h.created_at, 'actor_name', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.display_name, 'Administrador'))
    order by h.created_at desc, h.id desc), '[]'::jsonb) into v_history
  from public.club_finance_review_history_f1f h left join public.profiles p on p.user_id = h.actor_id
  where h.club_id = p_club_id and ((p_kind = 'INTENT' and h.intent_id = p_id) or (p_kind = 'EVENT' and h.result_id = p_id));
  return jsonb_build_object('case', v_case, 'history', v_history);
end; $$;

create function public.record_club_finance_review_f1f(
  p_club_id uuid, p_kind text, p_id uuid, p_source_version text,
  p_action text, p_note text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_existing public.club_finance_review_history_f1f%rowtype; v_id uuid;
begin
  if p_club_id is null or auth.uid() is null or not coalesce(public.has_club_capability(p_club_id, 'finance:manage'), false) then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null or p_source_version is null or length(p_source_version) not between 1 and 100
    or p_kind is null or p_kind not in ('INTENT', 'EVENT') or p_action is null or p_action not in ('NOTE', 'REVIEWED', 'RESOLVED')
    or p_note is null or length(btrim(p_note)) not between 3 and 2000 or p_idempotency_key is null then
    raise exception 'FINANCE_REVIEW_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || p_kind || p_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || p_idempotency_key::text, 1));
  select * into v_existing from public.club_finance_review_history_f1f h where h.club_id = p_club_id and h.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.actor_id <> auth.uid() or v_existing.action <> p_action or v_existing.note <> btrim(p_note)
      or v_existing.source_version <> p_source_version
      or coalesce(v_existing.intent_id, v_existing.result_id) <> p_id
      or (v_existing.intent_id is not null) <> (p_kind = 'INTENT') then
      raise exception 'FINANCE_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    return v_existing.id;
  end if;
  -- Revalidate a real club-scoped source; no actor supplied by the browser.
  if not exists (select 1 from public.club_finance_cases_read_f1f c
    where c.club_id = p_club_id and c.kind = p_kind and c.id = p_id and c.source_version = p_source_version) then
    raise exception 'FINANCE_CASE_CHANGED' using errcode = '40001';
  end if;
  if p_action <> 'NOTE' and exists (select 1 from public.club_finance_cases_read_f1f c
    where c.club_id = p_club_id and c.kind = p_kind and c.id = p_id and c.review_status = 'RESOLVED') then
    raise exception 'FINANCE_CASE_ALREADY_RESOLVED' using errcode = '22023';
  end if;
  insert into public.club_finance_review_history_f1f(club_id, intent_id, result_id, source_version, action, note, actor_id, idempotency_key)
  values (p_club_id, case when p_kind = 'INTENT' then p_id end, case when p_kind = 'EVENT' then p_id end,
    p_source_version, p_action, btrim(p_note), auth.uid(), p_idempotency_key) returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.get_club_finance_report_f1f(uuid, date, date) from public, anon, authenticated, service_role;
revoke all on function public.list_club_finance_f1f(uuid, text, text, text, date, date, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_club_finance_case_f1f(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_club_finance_review_f1f(uuid, text, uuid, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_club_finance_report_f1f(uuid, date, date) to authenticated;
grant execute on function public.list_club_finance_f1f(uuid, text, text, text, date, date, integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_club_finance_case_f1f(uuid, text, uuid) to authenticated;
grant execute on function public.record_club_finance_review_f1f(uuid, text, uuid, text, text, text, uuid) to authenticated;
commit;
