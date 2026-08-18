begin;

-- Ejecutar con fixtures de QA válidos para el rol autenticado. No deja datos persistentes.
do $$
declare
  v_club uuid;
  v_draft uuid;
  v_actor uuid;
  v_result jsonb;
begin
  select t.club_id, t.id into v_club, v_draft
  from public.tournaments t
  where t.status = 'DRAFT'
    and not exists (select 1 from public.competition_series_event_tournament_links l where l.tournament_id = t.id)
    and not exists (select 1 from public.competition_event_homologations h where h.tournament_id = t.id)
  order by t.id
  limit 1;

  if v_draft is null then
    raise exception 'QA requires a disposable DRAFT tournament fixture';
  end if;

  select membership.user_id into v_actor
  from public.club_memberships membership
  where membership.club_id = v_club
    and membership.status = 'APPROVED'
    and membership.role in ('OWNER', 'ADMIN')
  order by membership.user_id
  limit 1;

  if v_actor is null then
    raise exception 'QA requires an approved OWNER or ADMIN for the fixture club';
  end if;

  -- La RPC valida auth.uid() y capability; la QA debe reproducir esos claims.
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  v_result := public.delete_tournament_draft_atomic(v_club, v_draft);
  if coalesce((v_result ->> 'deleted')::boolean, false) is not true
     or exists (select 1 from public.tournaments where id = v_draft)
     or exists (select 1 from public.tournament_venues where tournament_id = v_draft)
     or exists (select 1 from public.tournament_court_assignments where tournament_id = v_draft) then
    raise exception 'Atomic DRAFT deletion did not remove all disposable dependencies';
  end if;
end $$;

rollback;
