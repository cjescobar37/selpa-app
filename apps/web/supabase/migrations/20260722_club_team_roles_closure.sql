-- CLUB Equipo y Roles: operaciones atómicas, último OWNER y auditoría.
-- Aplicar después de 20260721_club_authorization_security.sql.

begin;

alter table public.club_user_invites
  add column if not exists expires_at timestamptz;
update public.club_user_invites set expires_at=created_at+interval '7 days' where expires_at is null;
alter table public.club_user_invites alter column expires_at set default (now()+interval '7 days');

create table if not exists public.club_team_audit (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in (
    'INVITE_CREATED', 'INVITE_CANCELLED', 'INVITE_ACCEPTED', 'INVITE_DECLINED',
    'ROLE_CHANGED', 'MEMBER_REMOVED', 'OWNERSHIP_TRANSFERRED'
  )),
  target_user_id uuid references auth.users(id) on delete set null,
  membership_id uuid,
  invite_id uuid,
  old_role public.club_role,
  new_role public.club_role,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_club_team_audit_club_created
  on public.club_team_audit(club_id, created_at desc);

alter table public.club_team_audit enable row level security;
drop policy if exists club_team_audit_read_authorized on public.club_team_audit;
create policy club_team_audit_read_authorized on public.club_team_audit
for select to authenticated
using (public.has_club_capability(club_id, 'audit:view'));

revoke all on table public.club_team_audit from public, anon, authenticated;
grant select on table public.club_team_audit to authenticated;

create or replace function public.protect_club_owner_membership()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.role='OWNER' and (tg_op='DELETE' or new.role <> 'OWNER' or new.status <> 'APPROVED' or new.approved_at is null)
     and current_setting('selpa.allow_owner_transfer', true) <> 'on' then
    raise exception 'OWNER membership requires atomic ownership transfer' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_protect_club_owner_membership on public.club_memberships;
create trigger trg_protect_club_owner_membership
before update or delete on public.club_memberships
for each row execute function public.protect_club_owner_membership();

create or replace function public.change_club_staff_role_atomic(
  p_club_id uuid, p_membership_id uuid, p_new_role public.club_role, p_actor_user_id uuid
) returns public.club_memberships
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor public.club_memberships; v_target public.club_memberships; v_old_role public.club_role;
begin
  select * into v_actor from public.club_memberships
   where club_id=p_club_id and user_id=p_actor_user_id and status='APPROVED' and approved_at is not null
     and role in ('OWNER','ADMIN') for update;
  if not found then raise exception 'Actor not authorized' using errcode='42501'; end if;
  if p_new_role not in ('ADMIN','PLANILLERO') then raise exception 'Invalid managed role' using errcode='22023'; end if;
  select * into v_target from public.club_memberships
   where id=p_membership_id and club_id=p_club_id and status='APPROVED' and approved_at is not null for update;
  if not found then raise exception 'Membership not found' using errcode='P0002'; end if;
  if v_target.role='OWNER' then raise exception 'OWNER requires ownership transfer' using errcode='42501'; end if;
  v_old_role := v_target.role;
  update public.club_memberships set role=p_new_role, updated_at=now() where id=v_target.id returning * into v_target;
  insert into public.club_team_audit(club_id,actor_user_id,action,target_user_id,membership_id,old_role,new_role)
  values(p_club_id,p_actor_user_id,'ROLE_CHANGED',v_target.user_id,v_target.id,v_old_role,p_new_role);
  return v_target;
end $$;

create or replace function public.remove_club_staff_atomic(
  p_club_id uuid, p_membership_id uuid, p_actor_user_id uuid
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_actor public.club_memberships; v_target public.club_memberships;
begin
  select * into v_actor from public.club_memberships
   where club_id=p_club_id and user_id=p_actor_user_id and status='APPROVED' and approved_at is not null
     and role in ('OWNER','ADMIN') for update;
  if not found then raise exception 'Actor not authorized' using errcode='42501'; end if;
  select * into v_target from public.club_memberships where id=p_membership_id and club_id=p_club_id for update;
  if not found then raise exception 'Membership not found' using errcode='P0002'; end if;
  if v_target.role='OWNER' then raise exception 'OWNER cannot be removed; transfer ownership first' using errcode='42501'; end if;
  delete from public.club_memberships where id=v_target.id;
  update public.user_settings settings
     set active_club_id = (
       select membership.club_id from public.club_memberships membership
       where membership.user_id=v_target.user_id and membership.status='APPROVED' and membership.approved_at is not null
       order by membership.approved_at desc nulls last limit 1
     ), updated_at=now()
   where settings.user_id=v_target.user_id and settings.active_club_id=p_club_id;
  insert into public.club_team_audit(club_id,actor_user_id,action,target_user_id,membership_id,old_role)
  values(p_club_id,p_actor_user_id,'MEMBER_REMOVED',v_target.user_id,v_target.id,v_target.role);
  return v_target.id;
end $$;

create or replace function public.transfer_club_ownership_atomic(
  p_club_id uuid, p_new_owner_membership_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_owner public.club_memberships; v_target public.club_memberships;
begin
  select * into v_owner from public.club_memberships
   where club_id=p_club_id and user_id=p_actor_user_id and role='OWNER'
     and status='APPROVED' and approved_at is not null for update;
  if not found then raise exception 'Only current OWNER can transfer ownership' using errcode='42501'; end if;
  select * into v_target from public.club_memberships
   where id=p_new_owner_membership_id and club_id=p_club_id and status='APPROVED'
     and approved_at is not null and role in ('ADMIN','PLANILLERO') for update;
  if not found then raise exception 'Eligible target membership not found' using errcode='P0002'; end if;
  perform set_config('selpa.allow_owner_transfer','on',true);
  update public.club_memberships set role='ADMIN', updated_at=now() where id=v_owner.id;
  update public.club_memberships set role='OWNER', updated_at=now() where id=v_target.id;
  insert into public.club_team_audit(club_id,actor_user_id,action,target_user_id,membership_id,old_role,new_role,metadata)
  values(p_club_id,p_actor_user_id,'OWNERSHIP_TRANSFERRED',v_target.user_id,v_target.id,v_target.role,'OWNER',
    jsonb_build_object('previous_owner_user_id',v_owner.user_id,'previous_owner_membership_id',v_owner.id));
  return jsonb_build_object('previous_owner_membership_id',v_owner.id,'new_owner_membership_id',v_target.id);
end $$;

create or replace function public.accept_club_staff_invite_atomic(p_invite_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_invite public.club_user_invites; v_email text; v_membership public.club_memberships;
begin
  select lower(email) into v_email from auth.users where id=p_user_id;
  if v_email is null then raise exception 'User has no valid email' using errcode='22023'; end if;
  select * into v_invite from public.club_user_invites where id=p_invite_id for update;
  if not found then raise exception 'Invite not found' using errcode='P0002'; end if;
  if v_invite.status <> 'PENDING' then raise exception 'Invite already resolved' using errcode='23505'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'Invite expired' using errcode='22023'; end if;
  if lower(v_invite.email) <> v_email or (v_invite.target_user_id is not null and v_invite.target_user_id <> p_user_id)
    then raise exception 'Invite does not belong to user' using errcode='42501'; end if;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by,rejection_reason)
  values(v_invite.club_id,p_user_id,v_invite.role,'APPROVED',now(),v_invite.invited_by,null)
  on conflict(club_id,user_id) do update set role=excluded.role,status='APPROVED',approved_at=excluded.approved_at,
    approved_by=excluded.approved_by,rejection_reason=null,updated_at=now()
  returning * into v_membership;
  update public.club_user_invites set status='ACCEPTED',resolved_by=p_user_id,resolved_at=now(),target_user_id=p_user_id,updated_at=now()
   where id=v_invite.id;
  insert into public.club_team_audit(club_id,actor_user_id,action,target_user_id,membership_id,invite_id,new_role)
  values(v_invite.club_id,p_user_id,'INVITE_ACCEPTED',p_user_id,v_membership.id,v_invite.id,v_invite.role);
  return jsonb_build_object('invite_id',v_invite.id,'membership_id',v_membership.id,'club_id',v_invite.club_id);
end $$;

revoke all on function public.change_club_staff_role_atomic(uuid,uuid,public.club_role,uuid) from public, anon, authenticated;
revoke all on function public.remove_club_staff_atomic(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.transfer_club_ownership_atomic(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.accept_club_staff_invite_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.change_club_staff_role_atomic(uuid,uuid,public.club_role,uuid) to service_role;
grant execute on function public.remove_club_staff_atomic(uuid,uuid,uuid) to service_role;
grant execute on function public.transfer_club_ownership_atomic(uuid,uuid,uuid) to service_role;
grant execute on function public.accept_club_staff_invite_atomic(uuid,uuid) to service_role;

commit;
