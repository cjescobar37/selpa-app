-- F1D: player reads only their own USER or shared TEAM obligations. No economic writes.
begin;

-- Identity lookup paths used by the player read model; existing F1A/F1C indexes remain.
create index club_finance_obligation_f1d_user_idx
  on public.club_finance_obligations(debtor_user_id, created_at desc, id desc)
  where debtor_type = 'USER' and currency_code = 'ARS';
create index club_finance_obligation_f1d_team_idx
  on public.club_finance_obligations(debtor_team_id, club_id, created_at desc, id desc)
  where debtor_type = 'TEAM' and currency_code = 'ARS';
create index tournament_team_f1d_player1_idx
  on public.tournament_teams(player1_user_id, club_id, id);
create index tournament_team_f1d_player2_idx
  on public.tournament_teams(player2_user_id, club_id, id);

-- INTERNAL: no Data API grant. Every public read goes through this visibility boundary.
create function public.player_finance_visible_obligations_f1d(p_club_id uuid default null)
returns setof public.club_finance_obligations
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'PLAYER_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select o.* from public.club_finance_obligations o
    where o.currency_code = 'ARS' and o.debtor_type = 'USER'
      and o.debtor_user_id = v_user
      and (p_club_id is null or o.club_id = p_club_id)
    union all
    select o.* from public.club_finance_obligations o
    join public.tournament_teams team
      on team.id = o.debtor_team_id and team.club_id = o.club_id
    where o.currency_code = 'ARS' and o.debtor_type = 'TEAM'
      and (team.player1_user_id = v_user or team.player2_user_id = v_user)
      and (p_club_id is null or o.club_id = p_club_id);
end;
$$;

create function public.get_player_finance_overview_f1d(p_club_id uuid default null)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  with visible as (
    select * from public.player_finance_visible_obligations_f1d(p_club_id)
  ), paid as (
    select a.club_id, a.obligation_id, sum(a.amount) amount
    from visible o
    join public.club_finance_allocations a on a.club_id = o.club_id and a.obligation_id = o.id
    join public.club_finance_payments p
      on p.club_id = a.club_id and p.id = a.payment_id and p.currency_code = a.currency_code
    where p.status = 'POSTED'
    group by a.club_id, a.obligation_id
  ), balances as (
    select o.status, coalesce(paid.amount, 0) allocated_net,
      case when o.status = 'CANCELLED' then 0
        else greatest(o.original_amount - coalesce(paid.amount, 0), 0) end balance
    from visible o
    left join paid on paid.club_id = o.club_id and paid.obligation_id = o.id
  )
  select jsonb_build_object('currency_code', 'ARS',
    'total_pending', coalesce(sum(balance), 0),
    'total_paid', coalesce(sum(allocated_net), 0),
    'open_obligations', count(*) filter (where status = 'OPEN' and balance > 0))
  from balances;
$$;

create function public.list_player_finance_obligations_f1d(
  p_club_id uuid default null, p_filter text default 'ALL', p_limit integer default 21,
  p_before_created_at timestamptz default null, p_before_id uuid default null
) returns table(item jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_filter text := upper(coalesce(p_filter, 'ALL'));
begin
  if auth.uid() is null then
    raise exception 'PLAYER_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_filter not in ('ALL', 'PENDING', 'PARTIAL', 'PAID', 'CANCELLED')
     or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'PLAYER_FINANCE_PAGE_INVALID' using errcode = '22023';
  end if;
  return query
    with visible as (
      select * from public.player_finance_visible_obligations_f1d(p_club_id)
    ), paid as (
      select a.club_id, a.obligation_id, sum(a.amount) amount
      from visible o
      join public.club_finance_allocations a on a.club_id = o.club_id and a.obligation_id = o.id
      join public.club_finance_payments p
        on p.club_id = a.club_id and p.id = a.payment_id and p.currency_code = a.currency_code
      where p.status = 'POSTED'
      group by a.club_id, a.obligation_id
    ), balances as (
      select o.*, coalesce(paid.amount, 0) allocated_net,
        case when o.status = 'CANCELLED' then 0
          else greatest(o.original_amount - coalesce(paid.amount, 0), 0) end balance
      from visible o
      left join paid on paid.club_id = o.club_id and paid.obligation_id = o.id
    ), page as (
      select b.* from balances b
      where (p_before_created_at is null or
        (b.created_at, b.id) < (p_before_created_at, p_before_id))
        and (v_filter = 'ALL'
          or (v_filter = 'PENDING' and b.status = 'OPEN' and b.balance > 0)
          or (v_filter = 'PARTIAL' and b.status = 'OPEN' and b.balance > 0 and b.allocated_net > 0)
          or (v_filter = 'PAID' and b.status = 'OPEN' and b.balance = 0)
          or (v_filter = 'CANCELLED' and b.status = 'CANCELLED'))
      order by b.created_at desc, b.id desc limit p_limit
    )
    select jsonb_build_object(
      'id', b.id, 'created_at', b.created_at, 'club_id', b.club_id,
      'club_name', coalesce(nullif(btrim(c.brand_name), ''), c.name),
      'tournament_name', t.name, 'concept', b.concept, 'debtor_type', b.debtor_type,
      'debtor_name', case when b.debtor_type = 'TEAM' then concat_ws(' + ',
        coalesce(nullif(btrim(concat_ws(' ', p1.first_name, p1.last_name)), ''),
          nullif(btrim(p1.display_name), ''), 'Jugador 1'),
        coalesce(nullif(btrim(concat_ws(' ', p2.first_name, p2.last_name)), ''),
          nullif(btrim(p2.display_name), ''), 'Jugador 2'))
        else 'Cargo personal' end,
      'currency_code', b.currency_code, 'original_amount', b.original_amount,
      'allocated_net', b.allocated_net, 'balance', b.balance,
      'financial_status', case when b.status = 'CANCELLED' then 'CANCELLED'
        when b.balance = 0 then 'PAID' when b.allocated_net > 0 then 'PARTIAL' else 'PENDING' end)
    from page b
    join public.clubs c on c.id = b.club_id
    left join public.tournaments t on t.id = b.tournament_id and t.club_id = b.club_id
    left join public.tournament_teams team on team.id = b.debtor_team_id and team.club_id = b.club_id
    left join public.profiles p1 on p1.user_id = team.player1_user_id
    left join public.profiles p2 on p2.user_id = team.player2_user_id
    order by b.created_at desc, b.id desc;
end;
$$;

create function public.list_player_finance_movements_f1d(
  p_club_id uuid default null, p_limit integer default 21,
  p_before_paid_at timestamptz default null, p_before_id uuid default null
) returns table(item jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'PLAYER_FINANCE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
     or (p_before_paid_at is null) <> (p_before_id is null) then
    raise exception 'PLAYER_FINANCE_PAGE_INVALID' using errcode = '22023';
  end if;
  return query
    with page as (
      select a.id, a.amount, p.paid_at, p.payment_method, p.status,
        o.id obligation_id, o.club_id, o.tournament_id, o.concept, o.debtor_type
      from public.player_finance_visible_obligations_f1d(p_club_id) o
      join public.club_finance_allocations a on a.club_id = o.club_id and a.obligation_id = o.id
      join public.club_finance_payments p
        on p.club_id = a.club_id and p.id = a.payment_id and p.currency_code = a.currency_code
      where (p_before_paid_at is null or (p.paid_at, a.id) < (p_before_paid_at, p_before_id))
      order by p.paid_at desc, a.id desc limit p_limit
    )
    -- One movement per visible allocation: never expose a payment's hidden allocations.
    select jsonb_build_object('id', b.id, 'obligation_id', b.obligation_id,
      'paid_at', b.paid_at, 'amount', b.amount, 'currency_code', 'ARS',
      'method', b.payment_method, 'status', b.status, 'club_id', b.club_id,
      'club_name', coalesce(nullif(btrim(c.brand_name), ''), c.name),
      'tournament_name', t.name, 'concept', b.concept, 'debtor_type', b.debtor_type)
    from page b
    join public.clubs c on c.id = b.club_id
    left join public.tournaments t on t.id = b.tournament_id and t.club_id = b.club_id
    order by b.paid_at desc, b.id desc;
end;
$$;

revoke all on function public.player_finance_visible_obligations_f1d(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_player_finance_overview_f1d(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_player_finance_obligations_f1d(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_player_finance_movements_f1d(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_finance_overview_f1d(uuid) to authenticated;
grant execute on function public.list_player_finance_obligations_f1d(uuid, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function public.list_player_finance_movements_f1d(uuid, integer, timestamptz, uuid)
  to authenticated;

commit;
