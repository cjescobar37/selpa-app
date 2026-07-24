begin;

create or replace function pg_temp.run_club_analytics_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_users uuid[];
  v_category smallint;
  v_tournament uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_campaign uuid;
  v_sponsor uuid;
  v_count integer;
  v_income numeric;
  v_expense numeric;
  v_usd numeric;
begin
  if to_regclass('public.club_financial_transactions') is null
     or to_regclass('public.club_ad_events') is null
     or to_regclass('public.tournament_matches') is null then
    return query select 'FAIL', 'QA no ejecutable: aplicá primero las migraciones 20260727, 20260728 y 20260729';
    return;
  end if;

  select membership.user_id, membership.club_id
  into v_owner, v_club_a
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  select club.id into v_club_b
  from public.clubs club
  where club.id <> v_club_a
  order by club.created_at
  limit 1;

  select array_agg(candidate.id order by candidate.created_at)
  into v_users
  from (
    select auth_user.id, auth_user.created_at
    from auth.users auth_user
    where auth_user.id <> v_owner
    limit 5
  ) candidate;

  select category.id into v_category from public.categories category order by category.id limit 1;

  if v_owner is null or v_club_a is null or v_club_b is null or coalesce(array_length(v_users, 1), 0) < 5 or v_category is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren OWNER, dos clubes, cinco usuarios y una categoría reales';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if not public.has_club_capability(v_club_a, 'reports:operational_view') then
    raise exception 'OWNER sin reports:operational_view';
  end if;
  if public.has_club_capability(v_club_b, 'reports:operational_view') then
    raise exception 'aislamiento de permisos vulnerado';
  end if;

  insert into public.club_memberships(club_id, user_id, role, status, approved_by, approved_at)
  values (v_club_a, v_users[5], 'PLANILLERO', 'APPROVED', v_owner, now())
  on conflict (club_id, user_id) do update set role='PLANILLERO', status='APPROVED', approved_by=v_owner, approved_at=now();
  perform set_config('request.jwt.claim.sub', v_users[5]::text, true);
  if public.has_club_capability(v_club_a, 'reports:operational_view') then
    raise exception 'PLANILLERO obtuvo estadísticas administrativas';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.tournaments(
    club_id, name, type, format, gender, category_id, category, start_date,
    starts_on, ends_on, status, max_pairs, price_per_player, created_at
  ) values (
    v_club_a, 'QA Analytics', 'OPEN', 'GROUPS', 'MALE', v_category, greatest(1, least(7, v_category)),
    current_date, current_date, current_date + 1, 'PUBLISHED', 8, 5000, now()
  ) returning id into v_tournament;

  insert into public.tournament_teams(tournament_id, club_id, player1_user_id, player2_user_id, created_by)
  values (v_tournament, v_club_a, v_users[1], v_users[2], v_owner) returning id into v_team_a;
  insert into public.tournament_teams(tournament_id, club_id, player1_user_id, player2_user_id, created_by)
  values (v_tournament, v_club_a, v_users[3], v_users[4], v_owner) returning id into v_team_b;
  insert into public.tournament_registrations(tournament_id, club_id, team_id, status, created_by)
  values (v_tournament, v_club_a, v_team_a, 'CONFIRMED', v_owner);
  insert into public.tournament_matches(tournament_id, club_id, team1_id, team2_id, status, winner_team_id, scheduled_at)
  values (v_tournament, v_club_a, v_team_a, v_team_b, 'PLAYED', v_team_a, now());

  select count(*) into v_count
  from public.tournament_registrations registration
  where registration.club_id = v_club_a
    and registration.tournament_id = v_tournament
    and registration.created_at >= date_trunc('month', now());
  if v_count <> 1 then raise exception 'inscripciones por rango incorrectas'; end if;

  select count(*) into v_count
  from public.tournament_matches match_row
  where match_row.club_id = v_club_a and match_row.status = 'PLAYED' and match_row.tournament_id = v_tournament;
  if v_count <> 1 then raise exception 'actividad competitiva incorrecta'; end if;

  insert into public.club_financial_transactions(
    club_id, transaction_type, concept, category, amount, currency_code,
    payment_method, status, occurred_at, created_by, updated_by
  ) values
    (v_club_a, 'INCOME', 'QA ingreso', 'Torneos', 10000, 'ARS', 'CASH', 'POSTED', now(), v_owner, v_owner),
    (v_club_a, 'EXPENSE', 'QA gasto', 'Operación', 3000, 'ARS', 'CASH', 'POSTED', now(), v_owner, v_owner),
    (v_club_a, 'INCOME', 'QA USD', 'Sponsor', 100, 'USD', 'BANK_TRANSFER', 'POSTED', now(), v_owner, v_owner);

  select
    coalesce(sum(transaction.amount) filter (where transaction.currency_code='ARS' and transaction.transaction_type='INCOME'),0),
    coalesce(sum(transaction.amount) filter (where transaction.currency_code='ARS' and transaction.transaction_type='EXPENSE'),0),
    coalesce(sum(transaction.amount) filter (where transaction.currency_code='USD' and transaction.transaction_type='INCOME'),0)
  into v_income, v_expense, v_usd
  from public.club_financial_transactions transaction
  where transaction.club_id=v_club_a and transaction.concept like 'QA %' and transaction.status='POSTED';
  if v_income <> 10000 or v_expense <> 3000 or v_usd <> 100 then
    raise exception 'agregación o separación de monedas incorrecta';
  end if;

  insert into public.club_sponsors(club_id,name,category,status,starts_on,ends_on,created_by)
  values(v_club_a,'QA Analytics Sponsor','MAIN','active',current_date,current_date+10,v_owner)
  returning id into v_sponsor;
  insert into public.club_ad_campaigns(
    club_id,sponsor_id,slot_id,internal_name,title,image_url,status,starts_at,ends_at,created_by
  ) values(
    v_club_a,v_sponsor,'CLUB_HOME_HERO','QA Analytics Campaign','QA Analytics',
    'https://example.com/qa.webp','active',now()-interval '1 minute',now()+interval '1 day',v_owner
  ) returning id into v_campaign;
  insert into public.club_ad_campaign_placements(club_id,campaign_id,placement_key)
  values(v_club_a,v_campaign,'CLUB_HOME_HERO');
  if not public.record_club_ad_event(v_campaign,'CLUB_HOME_HERO','impression','analytics-qa-session-000001') then
    raise exception 'impresión de contenido no registrada';
  end if;
  perform public.record_club_ad_event(v_campaign,'CLUB_HOME_HERO','click','analytics-qa-session-000001');

  select count(*) into v_count from public.club_ad_events event
  where event.club_id=v_club_a and event.campaign_id=v_campaign;
  if v_count <> 2 then raise exception 'métricas de contenido incorrectas'; end if;
  if exists(select 1 from public.club_ad_events event where event.club_id=v_club_b and event.campaign_id=v_campaign) then
    raise exception 'aislamiento de contenido vulnerado';
  end if;

  return query select 'PASS', 'Resumen, jugadores, torneos, actividad, finanzas, contenido, rangos, monedas, permisos y aislamiento válidos';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_club_analytics_qa();

rollback;
