-- CLUB Equipo y Roles: búsqueda y promoción segura de jugadores a staff.
-- Aplicar después de 20260725_club_existing_player_staff_promotion.sql.

begin;

create or replace function public.search_club_staff_candidates(
  p_club_id uuid,
  p_query text,
  p_actor_user_id uuid,
  p_limit integer default 10
)
returns table(
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  category integer,
  candidate_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_query text := btrim(coalesce(p_query,''));
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users users where users.id=p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode='P0001';
  end if;
  if not exists(
    select 1 from public.club_memberships actor
    where actor.club_id=p_club_id and actor.user_id=p_actor_user_id
      and actor.status='APPROVED' and actor.approved_at is not null
      and actor.role in ('OWNER','ADMIN')
  ) then raise exception 'SELPA_CODE:forbidden' using errcode='P0001'; end if;
  if char_length(v_query) < 2 then return; end if;

  return query
  select users.id,
    coalesce(nullif(profile.display_name,''),nullif(concat_ws(' ',profile.first_name,profile.last_name),''),users.email),
    lower(users.email), profile.avatar_url, player.category,
    case when membership.id is not null then 'Jugador aprobado' else 'Jugador deportivo' end
  from auth.users users
  left join public.profiles profile on profile.user_id=users.id
  left join public.club_memberships membership
    on membership.club_id=p_club_id and membership.user_id=users.id
  left join public.club_players player
    on player.club_id=p_club_id and player.user_id=users.id and player.approved_at is not null
  where users.email is not null
    and (
      (membership.role='PLAYER' and membership.status='APPROVED' and membership.approved_at is not null)
      or (membership.id is null and player.id is not null)
    )
    and not exists(
      select 1 from public.club_user_invites invite
      where invite.club_id=p_club_id and invite.status='PENDING'
        and invite.role in ('ADMIN','OPERADOR','PLANILLERO')
        and (invite.target_user_id=users.id or lower(invite.email)=lower(users.email))
    )
    and (
      coalesce(profile.first_name,'') ilike '%'||v_query||'%'
      or coalesce(profile.last_name,'') ilike '%'||v_query||'%'
      or concat_ws(' ',profile.first_name,profile.last_name) ilike '%'||v_query||'%'
      or coalesce(profile.display_name,'') ilike '%'||v_query||'%'
      or users.email ilike '%'||v_query||'%'
    )
  order by coalesce(nullif(profile.display_name,''),users.email),users.id
  limit least(greatest(coalesce(p_limit,10),1),20);
end;
$$;

create or replace function public.promote_club_player_to_staff_atomic(
  p_club_id uuid,
  p_target_user_id uuid,
  p_role public.club_role,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor public.club_memberships;
  v_membership public.club_memberships;
  v_player public.club_players;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users users where users.id=p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode='P0001';
  end if;
  if p_role is null or p_role::text not in ('ADMIN','OPERADOR','PLANILLERO') then
    raise exception 'SELPA_CODE:invalid_role' using errcode='P0001';
  end if;
  if p_target_user_id is null or not exists(select 1 from auth.users users where users.id=p_target_user_id) then
    raise exception 'SELPA_CODE:player_not_eligible' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,2));

  select membership.* into v_actor
  from public.club_memberships membership
  where membership.club_id=p_club_id and membership.user_id=p_actor_user_id
    and membership.status='APPROVED' and membership.approved_at is not null
  for update;
  if not found or v_actor.role::text not in ('OWNER','ADMIN') then
    raise exception 'SELPA_CODE:forbidden' using errcode='P0001';
  end if;

  if exists(
    select 1 from public.club_user_invites invite
    join auth.users users on users.id=p_target_user_id
    where invite.club_id=p_club_id and invite.status='PENDING'
      and invite.role in ('ADMIN','OPERADOR','PLANILLERO')
      and (invite.target_user_id=p_target_user_id or lower(invite.email)=lower(users.email))
  ) then raise exception 'SELPA_CODE:pending_invite_exists' using errcode='P0001'; end if;

  select membership.* into v_membership
  from public.club_memberships membership
  where membership.club_id=p_club_id and membership.user_id=p_target_user_id
  for update;

  if found then
    case v_membership.status::text
      when 'APPROVED' then
        if v_membership.role='OWNER' then
          raise exception 'SELPA_CODE:owner_already_exists' using errcode='P0001';
        elsif v_membership.role::text in ('ADMIN','OPERADOR','PLANILLERO') then
          raise exception 'SELPA_CODE:staff_already_exists' using errcode='P0001';
        elsif v_membership.role='PLAYER' then
          select changed.* into v_membership
          from public.change_club_staff_role_atomic(
            p_club_id,v_membership.id,p_role,p_actor_user_id
          ) changed;
        else raise exception 'SELPA_CODE:player_not_eligible' using errcode='P0001';
        end if;
      when 'PENDING' then raise exception 'SELPA_CODE:membership_pending' using errcode='P0001';
      when 'REJECTED' then raise exception 'SELPA_CODE:membership_rejected' using errcode='P0001';
      when 'BANNED' then raise exception 'SELPA_CODE:membership_banned' using errcode='P0001';
      else raise exception 'SELPA_CODE:player_not_eligible' using errcode='P0001';
    end case;
  else
    select player.* into v_player
    from public.club_players player
    where player.club_id=p_club_id and player.user_id=p_target_user_id
      and player.approved_at is not null
    for update;
    if not found then raise exception 'SELPA_CODE:player_not_eligible' using errcode='P0001'; end if;

    insert into public.club_memberships(
      club_id,user_id,role,status,approved_at,approved_by,rejection_reason
    ) values (
      p_club_id,p_target_user_id,p_role,'APPROVED',now(),p_actor_user_id,null
    ) returning * into v_membership;

    insert into public.club_team_audit(
      club_id,actor_user_id,action,target_user_id,membership_id,old_role,new_role,metadata
    ) values (
      p_club_id,p_actor_user_id,'ROLE_CHANGED',p_target_user_id,v_membership.id,'PLAYER',p_role,
      jsonb_build_object('source','club_players','previous_role','PLAYER','new_role',p_role)
    );
  end if;

  return jsonb_build_object(
    'operation','PROMOTED','membership_id',v_membership.id,'club_id',v_membership.club_id,
    'user_id',v_membership.user_id,'role',v_membership.role,'status',v_membership.status
  );
exception when unique_violation then
  raise exception 'SELPA_CODE:concurrent_update' using errcode='P0001';
end;
$$;

revoke all on function public.search_club_staff_candidates(uuid,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.promote_club_player_to_staff_atomic(uuid,uuid,public.club_role,uuid) from public,anon,authenticated;
grant execute on function public.search_club_staff_candidates(uuid,text,uuid,integer) to service_role;
grant execute on function public.promote_club_player_to_staff_atomic(uuid,uuid,public.club_role,uuid) to service_role;

commit;
