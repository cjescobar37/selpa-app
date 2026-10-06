-- F1D QA: disposable DB only, with F1A/F1B/F1C/F1D installed. Everything rolls back.
-- Requires two clubs with approved OWNERs, a tournament in the first club, and
-- three distinct auth users without finance:view in that club (A, B, outsider C).
begin;

do $$
declare
  v_actor uuid; v_other_actor uuid; v_club uuid; v_other_club uuid;
  v_a uuid; v_b uuid; v_c uuid; v_players uuid[];
  v_tournament uuid; v_other_tournament uuid; v_category smallint;
  v_team uuid; v_other_team uuid;
  v_pending uuid; v_partial uuid; v_paid uuid; v_cancelled uuid;
  v_user_a uuid; v_user_c uuid; v_hidden uuid; v_other uuid;
  v_payment uuid; v_result jsonb; v_now jsonb; v_base_a jsonb; v_base_b jsonb;
  v_cursor_at timestamptz; v_cursor_id uuid; v_row record;
  v_seen uuid[] := '{}'::uuid[]; v_count integer; v_expected integer;
begin
  select m.club_id, m.user_id, t.category_id into v_club, v_actor, v_category
  from public.club_memberships m join public.tournaments t on t.club_id = m.club_id
  where m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null limit 1;
  select m.club_id, m.user_id into v_other_club, v_other_actor
  from public.club_memberships m
  where m.club_id <> v_club and m.role = 'OWNER' and m.status = 'APPROVED'
    and m.approved_at is not null limit 1;
  if v_actor is null or v_other_actor is null then raise exception 'QA_F1D_REQUIRES_TWO_CLUB_OWNERS'; end if;
  select array_agg(x.id) into v_players from (
    select u.id from auth.users u
    where u.id not in (v_actor, v_other_actor)
      and not exists (select 1 from public.club_memberships m
        where m.user_id = u.id and m.club_id = v_club and m.status = 'APPROVED'
          and m.approved_at is not null and m.role in ('OWNER', 'ADMIN'))
    order by u.id limit 3
  ) x;
  if coalesce(cardinality(v_players), 0) <> 3 then raise exception 'QA_F1D_REQUIRES_THREE_PLAYERS'; end if;
  v_a := v_players[1]; v_b := v_players[2]; v_c := v_players[3];

  foreach v_cursor_id in array array[v_a, v_b] loop
    perform set_config('request.jwt.claim.sub', v_cursor_id::text, true);
    if public.has_club_capability(v_club, 'finance:view') then raise exception 'QA_F1D_PLAYER_HAS_ADMIN_CAPABILITY'; end if;
  end loop;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_base_a := public.get_player_finance_overview_f1d(v_club);
  v_now := public.get_player_finance_overview_f1d(gen_random_uuid());
  if v_now <> '{"currency_code":"ARS","total_pending":0,"total_paid":0,"open_obligations":0}'::jsonb then
    raise exception 'QA_F1D_EMPTY_INVALID';
  end if;
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  v_base_b := public.get_player_finance_overview_f1d(v_club);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  insert into public.tournaments(club_id, name, type, start_date, category_id, price_per_player)
    values (v_club, 'QA F1D', 'OPEN', current_date, v_category, 50) returning id into v_tournament;
  insert into public.tournament_teams(tournament_id, club_id, player1_user_id, player2_user_id, created_by)
    values (v_tournament, v_club, v_a, v_b, v_actor) returning id into v_team;
  for v_count in 1..4 loop
    v_result := public.create_club_finance_obligation(v_club,
      jsonb_build_object('debtor_type', 'TEAM', 'debtor_team_id', v_team,
        'team_id', v_team, 'tournament_id', v_tournament, 'concept', 'QA F1D pareja ' || v_count,
        'currency_code', 'ARS', 'original_amount', 100), 'qa-f1d-team-' || v_count);
    case v_count
      when 1 then v_pending := (v_result->>'obligation_id')::uuid;
      when 2 then v_partial := (v_result->>'obligation_id')::uuid;
      when 3 then v_paid := (v_result->>'obligation_id')::uuid;
      when 4 then v_cancelled := (v_result->>'obligation_id')::uuid;
    end case;
  end loop;
  v_result := public.create_club_finance_obligation(v_club,
    jsonb_build_object('debtor_type', 'USER', 'debtor_user_id', v_a, 'concept', 'QA F1D personal A',
      'currency_code', 'ARS', 'original_amount', 30), 'qa-f1d-user-a');
  v_user_a := (v_result->>'obligation_id')::uuid;
  v_result := public.create_club_finance_obligation(v_club,
    jsonb_build_object('debtor_type', 'USER', 'debtor_user_id', v_c, 'concept', 'QA F1D personal C',
      'currency_code', 'ARS', 'original_amount', 70), 'qa-f1d-user-c');
  v_user_c := (v_result->>'obligation_id')::uuid;
  v_result := public.create_club_finance_obligation(v_club,
    '{"debtor_type":"THIRD_PARTY","debtor_name":"QA F1D tercero","concept":"QA F1D privado","currency_code":"ARS","original_amount":900}'::jsonb,
    'qa-f1d-third-party');
  v_hidden := (v_result->>'obligation_id')::uuid;
  perform public.register_club_finance_payment(v_club, v_partial, 20, 'ARS', 'CASH', 'qa-f1d-partial');
  v_result := public.register_club_finance_payment(v_club, v_paid, 100, 'ARS', 'BANK_TRANSFER', 'qa-f1d-full');
  v_payment := (v_result->>'payment_id')::uuid;
  perform public.cancel_club_finance_obligation(v_club, v_cancelled, 'QA F1D cancelación', 'qa-f1d-cancel');
  perform public.register_club_finance_payment(v_club, v_hidden, 50, 'ARS', 'CASH', 'qa-f1d-hidden-payment');

  perform set_config('request.jwt.claim.sub', v_other_actor::text, true);
  insert into public.tournaments(club_id, name, type, start_date, category_id)
    values (v_other_club, 'QA F1D otro club', 'OPEN', current_date, v_category) returning id into v_other_tournament;
  insert into public.tournament_teams(tournament_id, club_id, player1_user_id, player2_user_id, created_by)
    values (v_other_tournament, v_other_club, v_c, v_other_actor, v_other_actor) returning id into v_other_team;
  v_result := public.create_club_finance_obligation(v_other_club,
    jsonb_build_object('debtor_type', 'TEAM', 'debtor_team_id', v_other_team,
      'concept', 'QA F1D otro club', 'currency_code', 'ARS', 'original_amount', 100), 'qa-f1d-other-club');
  v_other := (v_result->>'obligation_id')::uuid;
  perform public.register_club_finance_payment(v_other_club, v_other, 10, 'ARS', 'CASH', 'qa-f1d-other-payment');

  -- Reads run with the actual Data API role, not the fixture-writing superuser.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_now := public.get_player_finance_overview_f1d(v_club);
  if (v_now->>'total_pending')::numeric <> (v_base_a->>'total_pending')::numeric + 210
     or (v_now->>'total_paid')::numeric <> (v_base_a->>'total_paid')::numeric + 120
     or (v_now->>'open_obligations')::bigint <> (v_base_a->>'open_obligations')::bigint + 3 then
    raise exception 'QA_F1D_NET_SUMMARY_INVALID';
  end if;
  if not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'PENDING', 51) x
    where x.item->>'id' = v_pending::text and (x.item->>'balance')::numeric = 100
      and x.item->>'financial_status' = 'PENDING') then raise exception 'QA_F1D_PENDING_INVALID'; end if;
  if not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'PARTIAL', 51) x
    where x.item->>'id' = v_partial::text and (x.item->>'balance')::numeric = 80
      and (x.item->>'allocated_net')::numeric = 20) then raise exception 'QA_F1D_PARTIAL_INVALID'; end if;
  if not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'PAID', 51) x
    where x.item->>'id' = v_paid::text and (x.item->>'balance')::numeric = 0)
    then raise exception 'QA_F1D_PAID_INVALID'; end if;
  if not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'CANCELLED', 51) x
    where x.item->>'id' = v_cancelled::text and (x.item->>'balance')::numeric = 0)
    then raise exception 'QA_F1D_CANCELLED_INVALID'; end if;
  if exists (select 1 from public.list_player_finance_obligations_f1d(null, 'ALL', 51) x
    where x.item->>'id' in (v_user_c::text, v_hidden::text, v_other::text))
    or exists (select 1 from public.list_player_finance_movements_f1d(null, 51) x
      where x.item->>'obligation_id' in (v_hidden::text, v_other::text)) then
    raise exception 'QA_F1D_CROSS_TEAM_CLUB_VISIBLE';
  end if;
  if exists (select 1 from public.list_player_finance_obligations_f1d(v_other_club, 'ALL', 51) x
    where x.item->>'id' in (v_pending::text, v_other::text)) then raise exception 'QA_F1D_CLUB_SELECTOR_LEAK'; end if;
  if exists (select 1 from public.club_finance_obligations where id = v_pending) then
    raise exception 'QA_F1D_RAW_TABLE_BYPASSED_RLS';
  end if;
  begin
    perform public.player_finance_visible_obligations_f1d(v_club);
    raise exception 'QA_F1D_INTERNAL_HELPER_EXPOSED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', v_b::text, true);
  v_now := public.get_player_finance_overview_f1d(v_club);
  if (v_now->>'total_pending')::numeric <> (v_base_b->>'total_pending')::numeric + 180
     or (v_now->>'total_paid')::numeric <> (v_base_b->>'total_paid')::numeric + 120
     or not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'ALL', 51) x
       where x.item->>'id' = v_pending::text and (x.item->>'original_amount')::numeric = 100)
     or exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'ALL', 51) x
       where x.item->>'id' = v_user_a::text) then raise exception 'QA_F1D_PLAYER2_OR_USER_VISIBILITY_INVALID'; end if;
  perform set_config('request.jwt.claim.sub', v_c::text, true);
  if exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'ALL', 51) x
    where x.item->>'id' in (v_pending::text, v_partial::text, v_paid::text, v_user_a::text))
    or exists (select 1 from public.list_player_finance_movements_f1d(v_club, 51) x
      where x.item->>'obligation_id' in (v_partial::text, v_paid::text)) then
    raise exception 'QA_F1D_OUTSIDER_VISIBLE';
  end if;
  if not exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'ALL', 51) x
    where x.item->>'id' = v_user_c::text) then raise exception 'QA_F1D_USER_DEBTOR_INVISIBLE'; end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  if exists (select 1 from public.list_player_finance_obligations_f1d(v_club, 'ALL', 51) x
    where x.item->>'id' = v_pending::text) then raise exception 'QA_F1D_ADMIN_CAPABILITY_BYPASS'; end if;
  perform public.reverse_club_finance_payment(v_club, v_payment, 'QA F1D reversión', 'qa-f1d-reverse');
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_now := public.get_player_finance_overview_f1d(v_club);
  if (v_now->>'total_pending')::numeric <> (v_base_a->>'total_pending')::numeric + 310
     or (v_now->>'total_paid')::numeric <> (v_base_a->>'total_paid')::numeric + 20
     or (v_now->>'open_obligations')::bigint <> (v_base_a->>'open_obligations')::bigint + 4
     or not exists (select 1 from public.list_player_finance_movements_f1d(v_club, 51) x
       where x.item->>'obligation_id' = v_paid::text and x.item->>'status' = 'REVERSED') then
    raise exception 'QA_F1D_REVERSAL_NET_INVALID';
  end if;
  v_cursor_at := null; v_cursor_id := null;
  loop
    v_count := 0;
    for v_row in select item from public.list_player_finance_obligations_f1d(v_club, 'ALL', 2, v_cursor_at, v_cursor_id) loop
      if (v_row.item->>'id')::uuid = any(v_seen) then raise exception 'QA_F1D_CURSOR_DUPLICATED'; end if;
      v_seen := array_append(v_seen, (v_row.item->>'id')::uuid);
      v_cursor_at := (v_row.item->>'created_at')::timestamptz;
      v_cursor_id := (v_row.item->>'id')::uuid;
      v_count := v_count + 1;
    end loop;
    exit when v_count = 0;
  end loop;
  execute 'reset role';
  select count(*) into v_expected from public.player_finance_visible_obligations_f1d(v_club);
  if cardinality(v_seen) <> v_expected then raise exception 'QA_F1D_CURSOR_SKIPPED'; end if;
  execute 'set local role authenticated';
  v_seen := '{}'::uuid[]; v_cursor_at := null; v_cursor_id := null;
  loop
    v_count := 0;
    for v_row in select item from public.list_player_finance_movements_f1d(v_club, 1, v_cursor_at, v_cursor_id) loop
      if (v_row.item->>'id')::uuid = any(v_seen) then raise exception 'QA_F1D_MOVEMENT_CURSOR_DUPLICATED'; end if;
      v_seen := array_append(v_seen, (v_row.item->>'id')::uuid);
      v_cursor_at := (v_row.item->>'paid_at')::timestamptz;
      v_cursor_id := (v_row.item->>'id')::uuid;
      v_count := v_count + 1;
    end loop;
    exit when v_count = 0;
  end loop;
  execute 'reset role';
  select count(*) into v_expected
  from public.player_finance_visible_obligations_f1d(v_club) o
  join public.club_finance_allocations a on a.club_id = o.club_id and a.obligation_id = o.id
  join public.club_finance_payments p on p.club_id = a.club_id and p.id = a.payment_id;
  if cardinality(v_seen) <> v_expected then raise exception 'QA_F1D_MOVEMENT_CURSOR_SKIPPED'; end if;
  if has_function_privilege('anon', 'public.get_player_finance_overview_f1d(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.get_player_finance_overview_f1d(uuid)', 'EXECUTE') then
    raise exception 'QA_F1D_UNEXPECTED_EXECUTE';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_player_finance_overview_f1d(v_club);
    raise exception 'QA_F1D_ANON_VISIBLE';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set constraints all immediate;
rollback;
