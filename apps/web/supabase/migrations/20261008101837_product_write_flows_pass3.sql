-- Follow-up only: do not rewrite applied migrations or historical identities.
begin;

alter table public.club_requests
  add column resolved_club_id uuid references public.clubs(id) on delete set null,
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users(id),
  add column rejection_reason text,
  add column submission_fingerprint text;

-- Backend-only: the route normalizes/allowlists the payload; no frontend actor.
create function public.submit_club_request_pass3(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_input public.club_requests%rowtype;
  v_existing public.club_requests%rowtype;
  v_fingerprint text := md5(p_payload::text);
begin
  v_input := jsonb_populate_record(null::public.club_requests, p_payload);
  if p_request_id is null or nullif(trim(v_input.club_name),'') is null
    or nullif(trim(v_input.owner_name),'') is null
    or nullif(trim(v_input.contact_email),'') is null
    or nullif(trim(v_input.owner_email),'') is null then
    raise exception 'WRITE_VALIDATION' using errcode = '22023';
  end if;
  -- Same applicant/club serialized even if a refresh generated a different key.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_input.owner_email)||'|'||lower(trim(v_input.club_name)), 0));
  select * into v_existing from public.club_requests where id = p_request_id for update;
  if found then
    if v_existing.submission_fingerprint is distinct from v_fingerprint then
      raise exception 'WRITE_INTENT_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('ok',true,'id',v_existing.id,'status',v_existing.status,'replayed',true);
  end if;
  select * into v_existing from public.club_requests
    where lower(owner_email) = lower(v_input.owner_email)
      and lower(trim(club_name)) = lower(trim(v_input.club_name)) and status = 'PENDING'
    order by created_at, id limit 1 for update;
  if found then
    if v_existing.submission_fingerprint is distinct from v_fingerprint then
      raise exception 'WRITE_PENDING_REQUEST' using errcode = '23505';
    end if;
    return jsonb_build_object('ok',true,'id',v_existing.id,'status',v_existing.status,'replayed',true);
  end if;
  insert into public.club_requests (id,club_name,brand_name,legal_name,cuit,contact_email,
    phone,website,instagram,address,city,province,country,opening_hours,courts_count,
    courts_surface,logo_url,rules_pdf_url,notes,owner_name,owner_email,owner_phone,theme_key,submission_fingerprint)
  values (p_request_id,v_input.club_name,v_input.brand_name,v_input.legal_name,v_input.cuit,v_input.contact_email,
    v_input.phone,v_input.website,v_input.instagram,v_input.address,v_input.city,v_input.province,v_input.country,
    v_input.opening_hours,v_input.courts_count,v_input.courts_surface,v_input.logo_url,v_input.rules_pdf_url,
    v_input.notes,v_input.owner_name,v_input.owner_email,v_input.owner_phone,v_input.theme_key,v_fingerprint);
  insert into public.notifications(user_id,type,title,message,link,metadata)
    select user_id,'club_request_created','Nueva solicitud de club',v_input.club_name||' solicitó alta en la plataforma.',
      '/platform/solicitudes?focus='||p_request_id,
      jsonb_build_object('club_request_id',p_request_id,'scope','platform') from public.platform_admins;
  return jsonb_build_object('ok',true,'id',p_request_id,'status','PENDING');
end;
$$;

create function public.resolve_club_request_pass3(p_request_id uuid, p_actor_id uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_request public.club_requests%rowtype;
  v_owner public.profiles%rowtype;
  v_club_id uuid;
  v_name text;
begin
  if p_actor_id is null or not exists (select 1 from public.platform_admins where user_id = p_actor_id) then
    raise exception 'WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve','reject') then
    raise exception 'WRITE_VALIDATION' using errcode = '22023';
  end if;
  select * into v_request from public.club_requests where id = p_request_id for update;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_request.status = case p_action when 'approve' then 'APPROVED' else 'REJECTED' end then
    return jsonb_build_object('ok',true,'status',v_request.status,'clubId',v_request.resolved_club_id,'clubName',v_request.club_name,'replayed',true);
  end if;
  if v_request.status <> 'PENDING' then raise exception 'WRITE_ALREADY_RESOLVED' using errcode = '23505'; end if;
  select * into v_owner from public.profiles where lower(email) = lower(v_request.owner_email);
  if p_action = 'reject' then
    if nullif(trim(p_reason),'') is null then raise exception 'WRITE_REASON_REQUIRED' using errcode = '22023'; end if;
    update public.club_requests set status='REJECTED',resolved_at=now(),resolved_by=p_actor_id,rejection_reason=trim(p_reason)
      where id=p_request_id;
    if v_owner.user_id is not null then
      insert into public.notifications(user_id,type,title,message,link,metadata) values
        (v_owner.user_id,'club_request_rejected','Solicitud de club rechazada',
        'La solicitud para '||v_request.club_name||' fue rechazada. Motivo: '||trim(p_reason),
        '/unir-mi-club',jsonb_build_object('club_request_id',p_request_id));
    end if;
    return jsonb_build_object('ok',true,'status','REJECTED');
  end if;
  -- Never activate a club with no administrative account capable of entering it.
  if v_owner.user_id is null then raise exception 'WRITE_OWNER_ACCOUNT_REQUIRED' using errcode = '23505'; end if;
  perform public.account_assert_identity(array[v_owner.user_id],true);
  perform pg_advisory_xact_lock(hashtextextended('club-name|'||lower(trim(v_request.club_name)),0));
  if exists (select 1 from public.clubs where lower(trim(name))=lower(trim(v_request.club_name))) then
    raise exception 'WRITE_CLUB_EXISTS' using errcode = '23505';
  end if;
  v_name := coalesce(nullif(v_owner.display_name,''),nullif(trim(concat_ws(' ',v_owner.first_name,v_owner.last_name)),''),v_request.owner_name);
  insert into public.clubs(name,brand_name,legal_name,cuit,slug,city,province,country,address,phone,contact_email,
    website,instagram,opening_hours,courts_count,courts_surface,logo_url,notes,rules_pdf_url,
    owner_name,owner_email,owner_phone,owner_user_id,theme_key,theme_locked,is_active,status)
  values (v_request.club_name,v_request.brand_name,v_request.legal_name,v_request.cuit,
    'club-'||replace(p_request_id::text,'-',''),v_request.city,v_request.province,coalesce(v_request.country,'Argentina'),
    v_request.address,v_request.phone,v_request.contact_email,v_request.website,v_request.instagram,v_request.opening_hours,
    v_request.courts_count,v_request.courts_surface,v_request.logo_url,v_request.notes,v_request.rules_pdf_url,
    v_name,v_request.owner_email,v_request.owner_phone,v_owner.user_id,coalesce(v_request.theme_key,'cyan'),true,true,'ACTIVE')
  returning id into v_club_id;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club_id,v_owner.user_id,'OWNER','APPROVED',now(),p_actor_id);
  insert into public.user_settings(user_id,active_club_id) values(v_owner.user_id,v_club_id)
    on conflict(user_id) do update set active_club_id=excluded.active_club_id;
  update public.club_requests set status='APPROVED',resolved_club_id=v_club_id,resolved_at=now(),resolved_by=p_actor_id
    where id=p_request_id;
  insert into public.notifications(user_id,type,title,message,link,metadata) values
    (v_owner.user_id,'club_request_approved','Solicitud de club aprobada','Tu solicitud para '||v_request.club_name||' fue aprobada.',
    '/club',jsonb_build_object('club_request_id',p_request_id,'club_id',v_club_id,'scope','club'));
  return jsonb_build_object('ok',true,'status','APPROVED','clubId',v_club_id,'clubName',v_request.club_name);
end;
$$;

create function public.request_player_membership_pass3(p_club_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_member public.club_memberships%rowtype; v_name text;
begin
  if p_user_id is null then raise exception 'WRITE_FORBIDDEN' using errcode='42501'; end if;
  perform public.account_assert_identity(array[p_user_id],false);
  select name into v_name from public.clubs where id=p_club_id and status='ACTIVE';
  if not found then raise exception 'WRITE_CLUB_UNAVAILABLE' using errcode='42501'; end if;
  select * into v_member from public.club_memberships where club_id=p_club_id and user_id=p_user_id for update;
  if found then
    if v_member.role <> 'PLAYER' or v_member.status='BANNED' then raise exception 'WRITE_FORBIDDEN' using errcode='42501'; end if;
    if v_member.status in ('PENDING','APPROVED') then
      return jsonb_build_object('ok',true,'status',v_member.status,'replayed',true);
    end if;
    update public.club_memberships set status='PENDING',approved_by=null,approved_at=null,rejection_reason=null where id=v_member.id;
  else
    insert into public.club_memberships(club_id,user_id,role,status) values(p_club_id,p_user_id,'PLAYER','PENDING') returning * into v_member;
  end if;
  insert into public.notifications(user_id,type,title,message,link,metadata)
    select user_id,'club_membership_requested','Nueva solicitud de jugador','Un jugador quiere sumarse a '||v_name||'.',
      '/club/solicitudes',jsonb_build_object('club_id',p_club_id,'membership_id',v_member.id,'scope','club')
      from public.club_memberships where club_id=p_club_id and role in ('OWNER','ADMIN')
        and status='APPROVED' and approved_at is not null;
  return jsonb_build_object('ok',true,'status','PENDING','message','Tu solicitud a '||v_name||' quedó pendiente.');
end;
$$;

-- Verified-user RPC. Delegates sporting approval to the existing atomic engine.
create function public.resolve_player_membership_pass3(p_membership_id uuid, p_action text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_actor uuid:=auth.uid(); v_member public.club_memberships%rowtype; v_approval jsonb;
  v_target public.membership_status;
begin
  select * into v_member from public.club_memberships where id=p_membership_id;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  if v_actor is null or not (exists(select 1 from public.platform_admins where user_id=v_actor)
    or exists(select 1 from public.club_memberships where club_id=v_member.club_id and user_id=v_actor
      and role in ('OWNER','ADMIN') and status='APPROVED' and approved_at is not null)) then
    raise exception 'WRITE_FORBIDDEN' using errcode='42501';
  end if;
  if v_member.role <> 'PLAYER' or p_action is null or p_action not in ('approve','reject') then
    raise exception 'WRITE_VALIDATION' using errcode='22023';
  end if;
  -- Same lock order as join and the existing sporting identity guard: epoch -> row.
  if p_action='approve' then perform public.account_assert_identity(array[v_member.user_id],false); end if;
  select * into v_member from public.club_memberships where id=p_membership_id for update;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  if v_member.role <> 'PLAYER' then raise exception 'WRITE_FORBIDDEN' using errcode='42501'; end if;
  v_target := case p_action when 'approve' then 'APPROVED'::public.membership_status else 'REJECTED'::public.membership_status end;
  if v_member.status=v_target then
    return jsonb_build_object('ok',true,'status',v_member.status,'replayed',true);
  end if;
  if v_member.status <> 'PENDING' then raise exception 'WRITE_ALREADY_RESOLVED' using errcode='23505'; end if;
  if p_action='approve' then
    select to_jsonb(a) into v_approval from public.approve_player_membership_atomic(p_membership_id) a;
  else
    if nullif(trim(p_reason),'') is null then raise exception 'WRITE_REASON_REQUIRED' using errcode='22023'; end if;
    update public.club_memberships set status='REJECTED',approved_by=v_actor,approved_at=null,rejection_reason=trim(p_reason)
      where id=p_membership_id;
    -- Only repair the rejected context, never displace another approved club.
    update public.user_settings set active_club_id=null where user_id=v_member.user_id and active_club_id=v_member.club_id;
  end if;
  insert into public.notifications(user_id,type,title,message,metadata) values
    (v_member.user_id,case p_action when 'approve' then 'club_membership_approved' else 'club_membership_rejected' end,
      case p_action when 'approve' then 'Solicitud aprobada' else 'Solicitud rechazada' end,
      case p_action when 'approve' then 'Tu solicitud fue aprobada.' else 'Tu solicitud fue rechazada. Motivo: '||trim(p_reason) end,
      jsonb_build_object('club_id',v_member.club_id,'membership_id',p_membership_id));
  return jsonb_build_object('ok',true,'status',case p_action when 'approve' then 'APPROVED' else 'REJECTED' end,'approval',v_approval);
end;
$$;

-- Existing partner lifecycle, now one transaction instead of HTTP compensation.
create function public.resolve_partner_invite_pass3(p_club_id uuid, p_invite_id uuid, p_actor_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_invite public.player_partner_invites%rowtype;
  v_pair public.player_active_partnerships%rowtype;
  v_admin boolean;
  v_actor_player uuid;
  v_users uuid[];
  v_target text;
begin
  if p_actor_id is null then raise exception 'WRITE_FORBIDDEN' using errcode='42501'; end if;
  if p_action is null or p_action not in ('accept','decline','cancel') then raise exception 'WRITE_VALIDATION' using errcode='22023'; end if;
  select * into v_invite from public.player_partner_invites where id=p_invite_id and club_id=p_club_id for update;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  select exists(select 1 from public.platform_admins where user_id=p_actor_id)
    or exists(select 1 from public.club_memberships where club_id=p_club_id and user_id=p_actor_id
      and role in ('OWNER','ADMIN','OPERADOR') and status='APPROVED' and approved_at is not null) into v_admin;
  select id into v_actor_player from public.club_players where club_id=p_club_id and user_id=p_actor_id
    and public.is_club_player(p_club_id,p_actor_id);
  if not v_admin and (v_actor_player is null or v_actor_player <>
    case p_action when 'cancel' then v_invite.sender_club_player_id else v_invite.receiver_club_player_id end) then
    raise exception 'WRITE_FORBIDDEN' using errcode='42501';
  end if;
  v_target := case p_action when 'accept' then 'ACCEPTED' when 'decline' then 'DECLINED' else 'CANCELLED' end;
  if v_invite.status=v_target then
    select * into v_pair from public.player_active_partnerships where accepted_invite_id=p_invite_id order by created_at,id limit 1;
    return jsonb_build_object('invite',to_jsonb(v_invite),'partnership',case when v_pair.id is null then null else to_jsonb(v_pair) end,'replayed',true);
  end if;
  if v_invite.status<>'PENDING' then raise exception 'WRITE_ALREADY_RESOLVED' using errcode='23505'; end if;
  if p_action='accept' then
    if v_invite.expires_at is not null and v_invite.expires_at<=now() then raise exception 'WRITE_INVITE_EXPIRED' using errcode='23505'; end if;
    select array_agg(user_id order by user_id) into v_users from public.club_players
      where club_id=p_club_id and id in (v_invite.sender_club_player_id,v_invite.receiver_club_player_id);
    if coalesce(array_length(v_users,1),0)<>2 or v_invite.sender_club_player_id=v_invite.receiver_club_player_id then
      raise exception 'WRITE_VALIDATION' using errcode='22023';
    end if;
    -- Epochs serialize cross-club identity changes, including REPEATABLE READ.
    perform public.account_assert_identity(v_users,false);
    perform id from public.club_players where club_id=p_club_id
      and id in (v_invite.sender_club_player_id,v_invite.receiver_club_player_id) order by id for update;
    if exists(select 1 from unnest(v_users) u where not public.is_club_player(p_club_id,u)) then
      raise exception 'WRITE_FORBIDDEN' using errcode='42501';
    end if;
    if exists(select 1 from public.player_active_partnerships where club_id=p_club_id and status='ACTIVE'
      and (player1_club_player_id in (v_invite.sender_club_player_id,v_invite.receiver_club_player_id)
        or player2_club_player_id in (v_invite.sender_club_player_id,v_invite.receiver_club_player_id))) then
      raise exception 'WRITE_PAIR_UNAVAILABLE' using errcode='23505';
    end if;
    insert into public.player_active_partnerships(club_id,player1_club_player_id,player2_club_player_id,
      status,created_by,accepted_invite_id,accepted_at)
      values(p_club_id,least(v_invite.sender_club_player_id,v_invite.receiver_club_player_id),
        greatest(v_invite.sender_club_player_id,v_invite.receiver_club_player_id),'ACTIVE',p_actor_id,p_invite_id,now()) returning * into v_pair;
  end if;
  update public.player_partner_invites set status=v_target,responded_at=now() where id=p_invite_id returning * into v_invite;
  return jsonb_build_object('invite',to_jsonb(v_invite),'partnership',case when v_pair.id is null then null else to_jsonb(v_pair) end);
end;
$$;

-- Integration only: preserve F1B as the engine and never create a financial payment.
-- Registration confirmation, legacy decision and projection flag commit together.
create function public.resolve_tournament_payment_request_pass3(
  p_club_id uuid, p_payment_id uuid, p_actor_id uuid, p_status text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_payment public.tournament_payments%rowtype; v_user uuid; v_target public.tournament_payments.status%type;
begin
  if p_actor_id is null or not (exists(select 1 from public.platform_admins where user_id=p_actor_id)
    or exists(select 1 from public.club_memberships where club_id=p_club_id and user_id=p_actor_id
      and role in ('OWNER','ADMIN') and status='APPROVED' and approved_at is not null)) then
    raise exception 'WRITE_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('APPROVED','REJECTED','CANCELLED') then raise exception 'WRITE_VALIDATION' using errcode='22023'; end if;
  v_target:=p_status;
  select * into v_payment from public.tournament_payments where club_id=p_club_id and id=p_payment_id for update;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  if v_payment.status=v_target then return jsonb_build_object('ok',true,'payment',to_jsonb(v_payment),'replayed',true); end if;
  if v_payment.status<>'PENDING' then raise exception 'WRITE_ALREADY_RESOLVED' using errcode='23505'; end if;
  if p_status='APPROVED' and v_payment.registration_id is not null then
    perform public.transition_tournament_registration_finance_f1b(
      p_club_id,v_payment.tournament_id,v_payment.registration_id,'CONFIRMED',p_actor_id,p_payment_id
    );
  end if;
  update public.tournament_payments set status=v_target,updated_at=now(),notes=coalesce(p_notes,notes),
    approved_at=case when p_status='APPROVED' then now() else approved_at end,
    approved_by=case when p_status='APPROVED' then p_actor_id else approved_by end
    where id=p_payment_id returning * into v_payment;
  if v_payment.registration_id is not null then
    update public.tournament_registrations set payment_status=p_status where id=v_payment.registration_id
      and club_id=p_club_id and tournament_id=v_payment.tournament_id;
    if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  end if;
  for v_user in select distinct p.user_id from public.tournament_teams t
    cross join lateral unnest(array[t.player1_user_id,t.player2_user_id]) p(user_id)
    where t.id=v_payment.team_id and t.club_id=p_club_id and p.user_id is not null loop
    insert into public.notifications(user_id,type,title,message,link,metadata) values
      (v_user,'payment_'||lower(p_status),'Solicitud de pago resuelta',
        case p_status when 'APPROVED' then 'El club aprobó la solicitud de pago de tu inscripción.'
          when 'REJECTED' then 'El club rechazó la solicitud de pago.' else 'El club canceló la solicitud de pago.' end,
        '/torneos/'||v_payment.tournament_id,jsonb_build_object('club_id',p_club_id,'payment_id',p_payment_id,'registration_id',v_payment.registration_id,'scope','player'));
  end loop;
  return jsonb_build_object('ok',true,'payment',to_jsonb(v_payment));
end;
$$;
revoke all on function public.resolve_tournament_payment_request_pass3(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_tournament_payment_request_pass3(uuid,uuid,uuid,text,text) to service_role;

-- Request decision and the existing F1B cancellation must commit together.
create function public.resolve_registration_change_request_pass3(
  p_club_id uuid, p_request_id uuid, p_actor_id uuid, p_status text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_request public.tournament_registration_change_requests%rowtype; v_user uuid;
begin
  if p_actor_id is null or not (exists(select 1 from public.platform_admins where user_id=p_actor_id)
    or exists(select 1 from public.club_memberships where club_id=p_club_id and user_id=p_actor_id
      and role in ('OWNER','ADMIN','OPERADOR') and status='APPROVED' and approved_at is not null)) then
    raise exception 'WRITE_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('APPROVED','REJECTED') then raise exception 'WRITE_VALIDATION' using errcode='22023'; end if;
  select * into v_request from public.tournament_registration_change_requests
    where id=p_request_id and club_id=p_club_id for update;
  if not found then raise exception 'WRITE_NOT_FOUND' using errcode='P0002'; end if;
  if v_request.type<>'CANCEL_REGISTRATION' then raise exception 'WRITE_VALIDATION' using errcode='22023'; end if;
  if v_request.status=p_status then return jsonb_build_object('ok',true,'request',to_jsonb(v_request),'replayed',true); end if;
  if v_request.status<>'PENDING' then raise exception 'WRITE_ALREADY_RESOLVED' using errcode='23505'; end if;
  if p_status='APPROVED' and v_request.registration_id is not null then
    -- F1B rejects cancellation with unresolved allocations; the request stays pending on failure.
    perform public.transition_tournament_registration_finance_f1b(
      p_club_id,v_request.tournament_id,v_request.registration_id,'CANCELLED',p_actor_id
    );
  end if;
  update public.tournament_registration_change_requests
    set status=p_status,resolved_at=now(),resolved_by=p_actor_id
    where id=p_request_id returning * into v_request;
  for v_user in select v_request.requested_by union
    select p.user_id from public.tournament_teams t
      cross join lateral unnest(array[t.player1_user_id,t.player2_user_id]) p(user_id)
      where t.id=v_request.team_id and t.club_id=p_club_id and p.user_id is not null loop
    insert into public.notifications(user_id,type,title,message,link,metadata) values
      (v_user,case p_status when 'APPROVED' then 'registration_cancel_approved' else 'registration_cancel_rejected' end,
        case p_status when 'APPROVED' then 'Baja aprobada' else 'Baja rechazada' end,
        case p_status when 'APPROVED' then 'El club aprobó tu solicitud de baja del torneo.'
          else 'El club rechazó tu solicitud de baja. Tu inscripción permanece activa.' end,
        '/torneos/'||v_request.tournament_id,jsonb_build_object('club_id',p_club_id,'request_id',p_request_id,'registration_id',v_request.registration_id,'scope','player'));
  end loop;
  return jsonb_build_object('ok',true,'request',to_jsonb(v_request));
end;
$$;
revoke all on function public.resolve_registration_change_request_pass3(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_registration_change_request_pass3(uuid,uuid,uuid,text) to service_role;

-- Cover every existing insertion path (including manual admin assignment).
-- No cleanup/backfill: unchanged historical pairs remain untouched.
create function public.guard_active_partnership_pass3()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'ACTIVE' then return new; end if;
  if tg_op='UPDATE' and (new.club_id,new.player1_club_player_id,new.player2_club_player_id,new.status)
    is not distinct from (old.club_id,old.player1_club_player_id,old.player2_club_player_id,old.status) then return new; end if;
  -- account_guard_partnership runs first and locks sorted identity epochs.
  perform id from public.club_players where club_id=new.club_id
    and id in (new.player1_club_player_id,new.player2_club_player_id) order by id for update;
  if (select count(*) from public.club_players where club_id=new.club_id
    and id in (new.player1_club_player_id,new.player2_club_player_id)) <> 2 then
    raise exception 'WRITE_VALIDATION' using errcode='22023';
  end if;
  if exists(select 1 from public.player_active_partnerships where club_id=new.club_id and status='ACTIVE'
    and id<>new.id and (player1_club_player_id in (new.player1_club_player_id,new.player2_club_player_id)
      or player2_club_player_id in (new.player1_club_player_id,new.player2_club_player_id))) then
    raise exception 'WRITE_PAIR_UNAVAILABLE' using errcode='23505';
  end if;
  return new;
end;
$$;
create trigger write_guard_active_partner_pass3 before insert or update on public.player_active_partnerships
  for each row execute function public.guard_active_partnership_pass3();
revoke all on function public.guard_active_partnership_pass3() from public,anon,authenticated,service_role;

revoke all on function public.resolve_partner_invite_pass3(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_partner_invite_pass3(uuid,uuid,uuid,text) to service_role;
revoke all on function public.submit_club_request_pass3(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.resolve_club_request_pass3(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.request_player_membership_pass3(uuid,uuid) from public,anon,authenticated;
revoke all on function public.resolve_player_membership_pass3(uuid,text,text) from public,anon,service_role;
grant execute on function public.submit_club_request_pass3(uuid,jsonb) to service_role;
grant execute on function public.resolve_club_request_pass3(uuid,uuid,text,text) to service_role;
grant execute on function public.request_player_membership_pass3(uuid,uuid) to service_role;
grant execute on function public.resolve_player_membership_pass3(uuid,text,text) to authenticated;

commit;
