-- F1B integration QA. Disposable database only; requires an existing priced
-- tournament, approved OWNER, two auth users and a second club. No production.
begin;

do $$
declare
  v_actor uuid;
  v_partner uuid;
  v_third uuid;
  v_legacy_payment uuid;
  v_club uuid;
  v_other_club uuid;
  v_tournament uuid;
  v_price numeric;
  v_team uuid;
  v_team_unpaid uuid;
  v_registration uuid;
  v_registration_unpaid uuid;
  v_obligation uuid;
  v_obligation_unpaid uuid;
  v_payment uuid;
  v_result jsonb;
  v_count integer;
  v_error text;
begin
  select m.user_id, t.club_id, t.id, t.price_per_player
    into v_actor, v_club, v_tournament, v_price
  from public.tournaments t
  join public.club_memberships m on m.club_id = t.club_id
    and m.role = 'OWNER' and m.status = 'APPROVED' and m.approved_at is not null
  join public.profiles profile on profile.user_id = m.user_id
  where t.price_per_player > 0
  order by t.created_at desc limit 1;
  if v_actor is null then raise exception 'QA_F1B_REQUIRES_PRICED_TOURNAMENT_OWNER'; end if;
  select u.id into v_partner from auth.users u
  where u.id <> v_actor
    and not exists (
      select 1 from public.tournament_teams team
      where team.tournament_id = v_tournament
        and ((team.player1_user_id = v_actor and team.player2_user_id = u.id)
          or (team.player1_user_id = u.id and team.player2_user_id = v_actor))
    )
  limit 1;
  if v_partner is null then raise exception 'QA_F1B_REQUIRES_SECOND_AUTH_USER'; end if;
  select u.id into v_third from auth.users u
  where u.id not in (v_actor, v_partner)
    and not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
    and not exists (select 1 from public.club_memberships m
      where m.club_id = v_club and m.user_id = u.id
        and m.status = 'APPROVED' and m.approved_at is not null
        and m.role in ('OWNER', 'ADMIN', 'OPERADOR'))
    and not exists (
      select 1 from public.tournament_teams team
      where team.tournament_id = v_tournament
        and ((team.player1_user_id = v_actor and team.player2_user_id = u.id)
          or (team.player1_user_id = u.id and team.player2_user_id = v_actor))
    )
  limit 1;
  if v_third is null then raise exception 'QA_F1B_REQUIRES_THIRD_AUTH_USER'; end if;
  -- A and B are distinct human admins; changes remain inside the rollback.
  insert into public.club_memberships(
    club_id, user_id, role, status, approved_at, approved_by
  ) values (v_club, v_partner, 'ADMIN', 'APPROVED', now(), v_actor)
  on conflict (club_id, user_id) do update set
    role = 'ADMIN', status = 'APPROVED', approved_at = now(), approved_by = v_actor;
  select id into v_other_club from public.clubs where id <> v_club limit 1;
  if v_other_club is null then raise exception 'QA_F1B_REQUIRES_SECOND_CLUB'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  if not public.has_club_capability(v_club, 'finance:manage')
     or not public.has_club_capability(v_club, 'finance:view') then
    raise exception 'QA_F1B_OWNER_LACKS_FINANCE_CAPABILITY';
  end if;

  insert into public.tournament_teams(
    tournament_id, club_id, player1_user_id, player2_user_id, created_by
  ) values (v_tournament, v_club, v_actor, v_partner, v_actor) returning id into v_team;
  insert into public.tournament_registrations(
    tournament_id, club_id, team_id, status, created_by
  ) values (v_tournament, v_club, v_team, 'PENDING', v_partner)
  returning id into v_registration;
  if exists (select 1 from public.club_finance_obligations
    where source_type = 'TOURNAMENT_REGISTRATION' and source_id = v_registration) then
    raise exception 'QA_F1B_PENDING_CREATED_CHARGE';
  end if;

  perform public.transition_tournament_registration_finance_f1b(
    v_club, v_tournament, v_registration, 'CONFIRMED', v_actor);
  select id into v_obligation from public.club_finance_obligations
  where club_id = v_club and source_type = 'TOURNAMENT_REGISTRATION'
    and source_id = v_registration;
  if v_obligation is null then raise exception 'QA_F1B_NO_OBLIGATION'; end if;
  if not exists (
    select 1 from public.club_finance_obligations o
    where o.id = v_obligation and o.debtor_type = 'TEAM'
      and o.debtor_team_id = v_team and o.team_id = v_team
      and o.registration_id = v_registration and o.tournament_id = v_tournament
      and o.club_id = v_club and o.currency_code = 'ARS'
      and o.original_amount = v_price * 2 and o.status = 'OPEN'
      and o.created_by = v_actor and o.due_date is null
  ) then raise exception 'QA_F1B_SOURCE_AMOUNT_CURRENCY_INVALID'; end if;
  if not exists (select 1 from public.club_finance_journals j
    where j.obligation_id = v_obligation and j.event_type = 'OBLIGATION_CREATED'
      and j.actor_id = v_actor) then
    raise exception 'QA_F1B_ADMIN_A_ACTOR_NOT_RECORDED';
  end if;
  if (select created_by from public.tournament_registrations
      where id = v_registration) = v_actor then
    raise exception 'QA_F1B_CREATOR_NOT_DISTINCT_FROM_APPROVER';
  end if;
  if (public.club_finance_obligation_projection_internal(v_club, v_obligation)
      ->>'financial_status') <> 'PENDING' then
    raise exception 'QA_F1B_INITIAL_STATUS_INVALID';
  end if;
  if (select count(*) from public.get_tournament_registration_finance_f1b(
      v_club, v_tournament) where registration_id = v_registration) <> 1 then
    raise exception 'QA_F1B_BATCH_PROJECTION_INVALID';
  end if;

  perform public.transition_tournament_registration_finance_f1b(
    v_club, v_tournament, v_registration, 'CONFIRMED', v_actor);
  select count(*) into v_count from public.club_finance_obligations
  where club_id = v_club and source_type = 'TOURNAMENT_REGISTRATION'
    and source_id = v_registration;
  if v_count <> 1 then raise exception 'QA_F1B_RETRY_DUPLICATED_OBLIGATION'; end if;

  -- Legacy payment approval by admin B must not inherit the registration creator.
  -- No money applied: cancellation retains the obligation and compensates it.
  insert into public.tournament_teams(
    tournament_id, club_id, player1_user_id, player2_user_id, created_by
  ) values (v_tournament, v_club, v_actor, v_third, v_actor)
  returning id into v_team_unpaid;
  insert into public.tournament_registrations(
    tournament_id, club_id, team_id, status, created_by
  ) values (v_tournament, v_club, v_team_unpaid, 'PENDING', v_actor)
  returning id into v_registration_unpaid;
  insert into public.tournament_payments(
    tournament_id, club_id, team_id, registration_id, user_id, amount,
    currency, method, status
  ) values (
    v_tournament, v_club, v_team_unpaid, v_registration_unpaid, v_actor,
    v_price * 2, 'ARS', 'CASH_ON_SITE_REQUEST', 'PENDING'
  ) returning id into v_legacy_payment;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    update public.tournament_registrations set status = 'CONFIRMED'
    where id = v_registration_unpaid;
    raise exception 'QA_F1B_SERVICE_ROLE_DIRECT_WRITE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.transition_tournament_registration_finance_f1b(
      v_club, v_tournament, v_registration_unpaid, 'CONFIRMED', v_third,
      v_legacy_payment);
    raise exception 'QA_F1B_UNAUTHORIZED_ACTOR_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
  if (select status from public.tournament_registrations
      where id = v_registration_unpaid) <> 'PENDING'
     or exists (select 1 from public.club_finance_obligations
       where source_type = 'TOURNAMENT_REGISTRATION'
         and source_id = v_registration_unpaid) then
    raise exception 'QA_F1B_UNAUTHORIZED_ACTOR_BROKE_ATOMICITY';
  end if;
  perform public.transition_tournament_registration_finance_f1b(
    v_club, v_tournament, v_registration_unpaid, 'CONFIRMED', v_partner,
    v_legacy_payment);
  select id into v_obligation_unpaid from public.club_finance_obligations
  where club_id = v_club and source_type = 'TOURNAMENT_REGISTRATION'
    and source_id = v_registration_unpaid;
  if v_obligation_unpaid is null or not exists (
    select 1 from public.club_finance_obligations o
    join public.club_finance_journals j on j.obligation_id = o.id
    where o.id = v_obligation_unpaid and o.created_by = v_partner
      and j.event_type = 'OBLIGATION_CREATED' and j.actor_id = v_partner
  ) then
    raise exception 'QA_F1B_ADMIN_B_LEGACY_ACTOR_NOT_RECORDED';
  end if;
  perform public.transition_tournament_registration_finance_f1b(
    v_club, v_tournament, v_registration_unpaid, 'CANCELLED', v_actor);
  if (select status from public.club_finance_obligations
      where id = v_obligation_unpaid) <> 'CANCELLED'
     or (select count(*) from public.club_finance_journals
      where obligation_id = v_obligation_unpaid
        and event_type = 'OBLIGATION_CANCELLED' and actor_id = v_actor) <> 1 then
    raise exception 'QA_F1B_UNPAID_CANCEL_FAILED';
  end if;

  -- Legacy APPROVED is an operational request, never confirmed F1A money.
  update public.tournament_payments set status = 'APPROVED'
  where id = v_legacy_payment;
  if exists (select 1 from public.club_finance_payments
    where club_id = v_club and id in (
      select a.payment_id from public.club_finance_allocations a
      where a.obligation_id = v_obligation
    )) then raise exception 'QA_F1B_LEGACY_APPROVED_CREATED_PAYMENT'; end if;

  -- Cross-club references cannot become a confirmed financial charge.
  begin
    update public.tournament_registrations
    set club_id = v_other_club, status = 'PENDING' where id = v_registration;
    update public.tournament_registrations
    set status = 'CONFIRMED' where id = v_registration;
    raise exception 'QA_F1B_CROSS_CLUB_NOT_BLOCKED';
  exception when foreign_key_violation or insufficient_privilege then
    null;
  end;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.register_club_finance_payment(
    v_club, v_obligation, least(v_price * 2, 1), 'ARS', 'CASH', 'qa-f1b-payment-0001'
  );
  v_payment := (v_result->>'payment_id')::uuid;
  begin
    perform public.transition_tournament_registration_finance_f1b(
      v_club, v_tournament, v_registration, 'CANCELLED', v_actor);
    raise exception 'QA_F1B_PAID_CANCEL_NOT_BLOCKED';
  exception when check_violation then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'CLUB_FINANCE_REGISTRATION_REQUIRES_PAYMENT_RESOLUTION' then
      raise;
    end if;
  end;
  if (select status from public.tournament_registrations
      where id = v_registration) <> 'CONFIRMED'
     or (select status from public.club_finance_obligations
      where id = v_obligation) <> 'OPEN' then
    raise exception 'QA_F1B_FAILED_CANCEL_CHANGED_STATE';
  end if;

  perform public.reverse_club_finance_payment(
    v_club, v_payment, 'QA reversal', 'qa-f1b-reverse-0001'
  );
  perform public.transition_tournament_registration_finance_f1b(
    v_club, v_tournament, v_registration, 'CANCELLED', v_actor);
  if (select status from public.club_finance_obligations
      where id = v_obligation) <> 'CANCELLED'
     or (public.club_finance_obligation_projection_internal(v_club, v_obligation)
      ->>'financial_status') <> 'CANCELLED' then
    raise exception 'QA_F1B_CANCEL_AFTER_RESOLUTION_FAILED';
  end if;
end;
$$;

-- Force deferred F1A journal coverage and balance checks before rollback.
set constraints all immediate;
rollback;
