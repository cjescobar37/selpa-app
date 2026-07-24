begin;

create or replace function pg_temp.run_club_sponsors_advertising_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_club_a uuid;
  v_club_b uuid;
  v_sponsor uuid;
  v_campaign uuid;
  v_other_campaign uuid;
  v_count integer;
begin
  if to_regclass('public.club_sponsors') is null
     or to_regclass('public.club_ad_campaigns') is null
     or to_regclass('public.club_ad_campaign_placements') is null
     or to_regclass('public.club_ad_events') is null
     or not exists (
       select 1
       from information_schema.columns column_info
       where column_info.table_schema = 'public'
         and column_info.table_name = 'club_sponsors'
         and column_info.column_name = 'category'
     )
     or to_regprocedure('public.record_club_ad_event(uuid,text,text,text)') is null then
    return query select
      'FAIL',
      'QA no ejecutable: primero aplicá 20260728_club_sponsors_advertising.sql';
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

  if v_owner is null or v_club_a is null or v_club_b is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren un OWNER aprobado y dos clubes reales';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  insert into public.club_sponsors(
    club_id, name, category, status, starts_on, ends_on, contribution_amount,
    currency_code, visual_priority, created_by
  ) values (
    v_club_a, 'QA Sponsor', 'MAIN', 'active', current_date, current_date + 30,
    1000.00, 'ARS', 10, v_owner
  ) returning id into v_sponsor;

  insert into public.club_ad_campaigns(
    club_id, sponsor_id, slot_id, internal_name, title, description, image_url,
    target_url, cta_label, template_key, status, starts_at, ends_at, sort_order, created_by
  ) values (
    v_club_a, v_sponsor, 'CLUB_HOME_HERO', 'QA campaña', 'QA visible', 'Validación',
    'https://example.com/qa.webp', 'https://example.com', 'Conocer más',
    'BANNER_HORIZONTAL', 'active', now() - interval '1 minute', now() + interval '1 day', 1, v_owner
  ) returning id into v_campaign;

  insert into public.club_ad_campaign_placements(club_id, campaign_id, placement_key)
  values
    (v_club_a, v_campaign, 'CLUB_HOME_HERO'),
    (v_club_a, v_campaign, 'CLUB_HOME_AFTER_NEWS');

  if not public.record_club_ad_event(v_campaign, 'CLUB_HOME_HERO', 'impression', 'qa-session-key-0000000001') then
    raise exception 'no se registró la impresión';
  end if;
  perform public.record_club_ad_event(v_campaign, 'CLUB_HOME_HERO', 'impression', 'qa-session-key-0000000001');
  perform public.record_club_ad_event(v_campaign, 'CLUB_HOME_HERO', 'click', 'qa-session-key-0000000001');

  reset role;
  select count(*) into v_count from public.club_ad_events event
  where event.campaign_id = v_campaign and event.event_type = 'impression';
  if v_count <> 1 then raise exception 'deduplicación de impresiones inválida'; end if;

  update public.club_ad_campaigns campaign set status = 'paused' where campaign.id = v_campaign;
  if public.record_club_ad_event(v_campaign, 'CLUB_HOME_HERO', 'click', 'qa-session-key-0000000002') then
    raise exception 'una campaña pausada aceptó eventos';
  end if;

  insert into public.club_ad_campaigns(
    club_id, slot_id, internal_name, title, status, created_by
  ) values (
    v_club_b, 'CLUB_HOME_HERO', 'QA otro club', 'QA aislada', 'draft', v_owner
  ) returning id into v_other_campaign;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  begin
    update public.club_ad_campaigns campaign set title = 'No permitido'
    where campaign.id = v_other_campaign;
    if found then raise exception 'aislamiento entre clubes vulnerado'; end if;
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  return query select 'PASS', 'Sponsors, campañas, ubicaciones, vigencia, pausa, métricas, permisos y aislamiento válidos';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_club_sponsors_advertising_qa();

rollback;
