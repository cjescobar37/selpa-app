-- F1C read-only club finance projections. F1A/F1B economic writes stay unchanged.
begin;

-- The obligations screen pages by club/currency and newest source creation.
create index club_finance_obligation_f1c_page_idx
  on public.club_finance_obligations(club_id, currency_code, created_at desc, id desc);

create function public.get_club_finance_overview_f1c(p_club_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_pending numeric(14,2); v_received numeric(14,2); v_open bigint;
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  with paid as (
    select a.obligation_id, sum(a.amount) amount
    from public.club_finance_allocations a
    join public.club_finance_payments p on p.id = a.payment_id and p.club_id = a.club_id
    where a.club_id = p_club_id and p.status = 'POSTED'
    group by a.obligation_id
  )
  -- OPEN is the lifecycle status; derived PAID obligations have no pending balance.
  select coalesce(sum(greatest(o.original_amount - coalesce(paid.amount, 0), 0)), 0),
    count(*) filter (where greatest(o.original_amount - coalesce(paid.amount, 0), 0) > 0)
    into v_pending, v_open
  from public.club_finance_obligations o
  left join paid on paid.obligation_id = o.id
  where o.club_id = p_club_id and o.currency_code = 'ARS' and o.status = 'OPEN';
  select coalesce(sum(p.amount), 0) into v_received
  from public.club_finance_payments p
  where p.club_id = p_club_id and p.currency_code = 'ARS' and p.status = 'POSTED';
  return jsonb_build_object('currency_code', 'ARS', 'total_pending', v_pending,
    'total_received', v_received, 'open_obligations', v_open);
end;
$$;

create function public.list_club_finance_obligations_f1c(
  p_club_id uuid, p_filter text default 'ALL', p_limit integer default 21,
  p_before_created_at timestamptz default null, p_before_id uuid default null
) returns table(item jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_filter text := upper(coalesce(p_filter, 'ALL'));
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_filter not in ('ALL', 'PENDING', 'PARTIAL', 'PAID')
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'CLUB_FINANCE_PAGE_INVALID' using errcode = '22023';
  end if;
  return query
    with paid as (
      select a.obligation_id, sum(a.amount) amount
      from public.club_finance_allocations a
      join public.club_finance_payments p on p.id = a.payment_id and p.club_id = a.club_id
      where a.club_id = p_club_id and p.status = 'POSTED'
      group by a.obligation_id
    ), balances as (
      select o.*, coalesce(paid.amount, 0) allocated_net,
        case when o.status = 'CANCELLED' then 0
          else greatest(o.original_amount - coalesce(paid.amount, 0), 0) end balance
      from public.club_finance_obligations o
      left join paid on paid.obligation_id = o.id
      where o.club_id = p_club_id and o.currency_code = 'ARS'
    ), filtered as (
      select b.* from balances b
      where (p_before_created_at is null or
        (b.created_at, b.id) < (p_before_created_at, p_before_id))
        and (v_filter = 'ALL'
          or (v_filter = 'PENDING' and b.status = 'OPEN' and b.balance > 0)
          or (v_filter = 'PARTIAL' and b.status = 'OPEN'
            and b.balance > 0 and b.allocated_net > 0)
          or (v_filter = 'PAID' and b.status = 'OPEN' and b.balance = 0))
      order by b.created_at desc, b.id desc
      limit p_limit
    )
    select jsonb_build_object(
      'id', b.id, 'created_at', b.created_at,
      'concept', b.concept, 'tournament_name', t.name,
      'debtor_name', case when b.debtor_type = 'TEAM' then
        concat_ws(' + ',
          coalesce(nullif(btrim(concat_ws(' ', p1.first_name, p1.last_name)), ''),
            nullif(btrim(p1.display_name), ''), 'Jugador 1'),
          coalesce(nullif(btrim(concat_ws(' ', p2.first_name, p2.last_name)), ''),
            nullif(btrim(p2.display_name), ''), 'Jugador 2'))
        when b.debtor_type = 'USER' then
          coalesce(nullif(btrim(concat_ws(' ', pu.first_name, pu.last_name)), ''),
            nullif(btrim(pu.display_name), ''), 'Jugador')
        else coalesce(nullif(btrim(b.debtor_name), ''), 'Tercero') end,
      'original_amount', b.original_amount, 'allocated_net', b.allocated_net,
      'balance', b.balance, 'currency_code', b.currency_code,
      'financial_status', case when b.status = 'CANCELLED' then 'CANCELLED'
        when b.balance = 0 then 'PAID'
        when b.allocated_net > 0 then 'PARTIAL'
        else 'PENDING' end
    )
    from filtered b
    left join public.tournament_teams team
      on team.id = coalesce(b.team_id, b.debtor_team_id) and team.club_id = p_club_id
    left join public.profiles p1 on p1.user_id = team.player1_user_id
    left join public.profiles p2 on p2.user_id = team.player2_user_id
    left join public.profiles pu on pu.user_id = b.debtor_user_id
    left join public.tournaments t on t.id = b.tournament_id and t.club_id = p_club_id
    order by b.created_at desc, b.id desc;
end;
$$;

create function public.list_club_finance_movements_f1c(
  p_club_id uuid, p_limit integer default 21,
  p_before_paid_at timestamptz default null, p_before_id uuid default null
) returns table(item jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.has_club_capability(p_club_id, 'finance:view') then
    raise exception 'CLUB_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
     or (p_before_paid_at is null) <> (p_before_id is null) then
    raise exception 'CLUB_FINANCE_PAGE_INVALID' using errcode = '22023';
  end if;
  return query
    select jsonb_build_object(
      'id', p.id, 'obligation_id', o.id, 'paid_at', p.paid_at,
      'amount', p.amount, 'currency_code', p.currency_code,
      'method', p.payment_method, 'status', p.status,
      'reference', p.reference, 'concept', o.concept,
      'debtor_name', case when o.debtor_type = 'TEAM' then
        concat_ws(' + ',
          coalesce(nullif(btrim(concat_ws(' ', p1.first_name, p1.last_name)), ''),
            nullif(btrim(p1.display_name), ''), 'Jugador 1'),
          coalesce(nullif(btrim(concat_ws(' ', p2.first_name, p2.last_name)), ''),
            nullif(btrim(p2.display_name), ''), 'Jugador 2'))
        when o.debtor_type = 'USER' then
          coalesce(nullif(btrim(concat_ws(' ', pu.first_name, pu.last_name)), ''),
            nullif(btrim(pu.display_name), ''), 'Jugador')
        else coalesce(nullif(btrim(o.debtor_name), ''), 'Tercero') end
    )
    from public.club_finance_payments p
    join public.club_finance_allocations a
      on a.club_id = p.club_id and a.payment_id = p.id
    join public.club_finance_obligations o
      on o.club_id = a.club_id and o.id = a.obligation_id
    left join public.tournament_teams team
      on team.id = coalesce(o.team_id, o.debtor_team_id) and team.club_id = p_club_id
    left join public.profiles p1 on p1.user_id = team.player1_user_id
    left join public.profiles p2 on p2.user_id = team.player2_user_id
    left join public.profiles pu on pu.user_id = o.debtor_user_id
    where p.club_id = p_club_id and p.currency_code = 'ARS'
      and (p_before_paid_at is null or
        (p.paid_at, p.id) < (p_before_paid_at, p_before_id))
    order by p.paid_at desc, p.id desc
    limit p_limit;
end;
$$;

revoke all on function public.get_club_finance_overview_f1c(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_club_finance_obligations_f1c(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_club_finance_movements_f1c(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_club_finance_overview_f1c(uuid) to authenticated;
grant execute on function public.list_club_finance_obligations_f1c(uuid, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_club_finance_movements_f1c(uuid, integer, timestamptz, uuid)
  to authenticated;

commit;
