begin;

do $qa$
declare
  v_actor uuid;
  v_registered record;
  v_manual record;
  v_result jsonb;
begin
  select cp.id, cp.club_id, cp.user_id, cm.id membership_id
    into v_registered
  from public.club_players cp
  join public.club_memberships cm on cm.club_id = cp.club_id and cm.user_id = cp.user_id
  where cp.operational_status = 'ACTIVE'::public.club_player_operational_status
    and cm.role = 'PLAYER'::public.club_role
    and cm.status = 'APPROVED'::public.membership_status
    and exists (
      select 1
      from public.club_memberships actor_membership
      where actor_membership.club_id = cp.club_id
        and actor_membership.role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
        and actor_membership.status = 'APPROVED'::public.membership_status
        and actor_membership.approved_at is not null
    )
  order by cp.created_at
  limit 1;

  if v_registered.id is null then raise exception 'QA_BLOCKED: falta PLAYER ACTIVE registrado'; end if;

  select user_id into v_actor
  from public.club_memberships
  where club_id = v_registered.club_id
    and role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
    and status = 'APPROVED'::public.membership_status
    and approved_at is not null
  order by case role when 'OWNER'::public.club_role then 0 else 1 end
  limit 1;

  if v_actor is null then raise exception 'QA_BLOCKED: falta OWNER/ADMIN autorizado'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);

  perform public.leave_club_player_safely_atomic(v_registered.club_id, v_registered.id, 'QA reincorporación registrada');
  select public.reincorporate_club_player_atomic(v_registered.club_id, v_registered.id) into v_result;
  if v_result->>'code' <> 'REINCORPORATED'
     or (select operational_status from public.club_players where id = v_registered.id) <> 'ACTIVE'::public.club_player_operational_status
     or (select status from public.club_memberships where id = v_registered.membership_id) <> 'APPROVED'::public.membership_status then
    raise exception 'QA_FAIL: reincorporación registrada inconsistente';
  end if;

  perform set_config('role', 'postgres', true);
  select cp.id, cp.club_id
    into v_manual
  from public.club_players cp
  left join public.club_memberships cm on cm.club_id = cp.club_id and cm.user_id = cp.user_id
  left join public.profiles p on p.user_id = cp.user_id
  where cp.club_id = v_registered.club_id
    and cp.operational_status = 'ACTIVE'::public.club_player_operational_status
    and cm.id is null
    and (cp.user_id is null or p.email ~* '^manual-[a-z0-9-]+@manual\.[a-z0-9.-]+$')
  order by cp.created_at
  limit 1;

  if v_manual.id is not null then
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.leave_club_player_safely_atomic(v_manual.club_id, v_manual.id, 'QA reincorporación manual');
    select public.reincorporate_club_player_atomic(v_manual.club_id, v_manual.id) into v_result;
    if v_result->>'code' <> 'REINCORPORATED'
       or (select operational_status from public.club_players where id = v_manual.id) <> 'ACTIVE'::public.club_player_operational_status then
      raise exception 'QA_FAIL: reincorporación manual inconsistente';
    end if;
  end if;
end
$qa$;

select 'PASS | LEFT se reincorpora sobre el mismo club_player registrado y manual cuando existe fixture' result;
rollback;
