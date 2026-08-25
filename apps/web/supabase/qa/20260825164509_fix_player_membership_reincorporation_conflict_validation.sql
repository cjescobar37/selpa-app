begin;

do $qa$
declare
  v_candidate record;
  v_actor uuid;
  v_original_player_id uuid;
  v_result record;
begin
  select cp.id as club_player_id, cp.club_id, cp.user_id, cm.id as membership_id
    into v_candidate
  from public.club_players cp
  join public.club_memberships cm
    on cm.club_id = cp.club_id and cm.user_id = cp.user_id
  where cp.operational_status = 'ACTIVE'::public.club_player_operational_status
    and cm.role = 'PLAYER'::public.club_role
    and cm.status = 'APPROVED'::public.membership_status
    and exists (
      select 1 from public.club_memberships owner_membership
      where owner_membership.club_id = cp.club_id
        and owner_membership.role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
        and owner_membership.status = 'APPROVED'::public.membership_status
        and owner_membership.approved_at is not null
    )
  order by cp.created_at
  limit 1;

  if v_candidate.club_player_id is null then
    raise exception 'QA_BLOCKED: falta jugador PLAYER ACTIVE con OWNER/ADMIN autorizado';
  end if;

  select user_id into v_actor
  from public.club_memberships
  where club_id = v_candidate.club_id
    and role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
    and status = 'APPROVED'::public.membership_status
    and approved_at is not null
  order by case role when 'OWNER'::public.club_role then 0 else 1 end
  limit 1;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);

  v_original_player_id := v_candidate.club_player_id;
  perform public.leave_club_player_safely_atomic(
    v_candidate.club_id,
    v_candidate.club_player_id,
    'QA transaccional de reincorporación'
  );

  if (select operational_status from public.club_players where id = v_original_player_id)
       <> 'LEFT'::public.club_player_operational_status then
    raise exception 'QA_FAIL: la baja no dejó al jugador en LEFT';
  end if;

  select * into v_result
  from public.approve_player_membership_atomic(v_candidate.membership_id);

  if v_result.player_id <> v_original_player_id then
    raise exception 'QA_FAIL: la reincorporación creó otro club_player';
  end if;

  if (select operational_status from public.club_players where id = v_original_player_id)
       <> 'ACTIVE'::public.club_player_operational_status then
    raise exception 'QA_FAIL: la reincorporación no restauró ACTIVE';
  end if;

  if (select status from public.club_memberships where id = v_candidate.membership_id)
       <> 'APPROVED'::public.membership_status then
    raise exception 'QA_FAIL: la reincorporación no restauró APPROVED';
  end if;
end
$qa$;

select 'PASS | aprobación/reincorporación reutiliza el mismo club_player' as result;

rollback;
