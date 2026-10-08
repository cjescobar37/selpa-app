-- Pass 3: DISPOSABLE PostgreSQL/Supabase database ONLY, after all migrations.
-- Generates its own identities/club; no existing users, conflicts or economic data are rewritten.
-- Entire fixture, fault-injection triggers and journal entries roll back.
-- Run with psql -v ON_ERROR_STOP=1 in a fresh connection, never against production.
begin;
create temporary table pass3_fixture (name text, id uuid) on commit drop;

create function pg_temp.pass3_fault() returns trigger language plpgsql as $$
begin
  if current_setting('selpa.qa_pass3_fault',true)='on' then
    raise exception 'QA_PASS3_INJECTED_FAILURE';
  end if;
  return new;
end;
$$;
create trigger qa_pass3_request_fault before update on public.club_requests
  for each row execute function pg_temp.pass3_fault();
create trigger qa_pass3_legacy_fault before update on public.tournament_payments
  for each row execute function pg_temp.pass3_fault();
create trigger qa_pass3_change_fault before update on public.tournament_registration_change_requests
  for each row execute function pg_temp.pass3_fault();

do $$
declare
  v_platform uuid:=gen_random_uuid(); v_owner uuid:=gen_random_uuid();
  v_players uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_staff uuid:=gen_random_uuid(); v_user uuid; v_email text;
  v_request uuid:=gen_random_uuid(); v_reject uuid:=gen_random_uuid(); v_unknown uuid:=gen_random_uuid();
  v_club uuid; v_member uuid; v_owner_member uuid; v_pair uuid; v_invite uuid;
  v_cp uuid[]; v_tournament uuid; v_free_tournament uuid; v_team uuid;
  v_registration uuid; v_legacy uuid; v_obligation uuid; v_payment uuid; v_change uuid;
  v_result jsonb; v_input jsonb; v_notifications bigint; v_before bigint;
  v_category smallint; v_error text;
begin
  perform set_config('selpa.qa_pass3_fault','off',true);
  foreach v_user in array array[v_platform,v_owner,v_staff]||v_players loop
    v_email:='pass3-'||v_user::text||'@example.invalid';
    insert into auth.users(id,aud,email,role,raw_app_meta_data,raw_user_meta_data)
      values(v_user,'authenticated',v_email,'authenticated','{}',jsonb_build_object('first_name','Pass3','last_name','Fixture'));
    insert into public.profiles(id,user_id,email,first_name,last_name,display_name,birth_date,gender)
      values(v_user,v_user,v_email,'Pass3','Fixture','Pass3 Fixture','1990-01-01','MALE')
      on conflict(user_id) do update set email=excluded.email,first_name=excluded.first_name,
        last_name=excluded.last_name,birth_date=excluded.birth_date,gender=excluded.gender;
  end loop;
  insert into public.platform_admins(user_id) values(v_platform);
  v_input:=jsonb_build_object('club_name','Pass3 isolated '||v_request::text,'contact_email','pass3-contact@example.invalid',
    'owner_email','pass3-'||v_owner::text||'@example.invalid','owner_name','Pass3 Owner','courts_count',2,'theme_key','cyan');
  perform public.submit_club_request_pass3(v_request,v_input);
  perform public.submit_club_request_pass3(v_request,v_input);
  v_result:=public.submit_club_request_pass3(gen_random_uuid(),v_input);
  if (v_result->>'id')::uuid<>v_request then raise exception 'QA_PASS3_DUPLICATE_REQUEST'; end if;
  begin
    perform public.submit_club_request_pass3(v_request,v_input||jsonb_build_object('notes','Changed intent'));
    raise exception 'QA_PASS3_CHANGED_INTENT_ACCEPTED';
  exception when unique_violation then null; end;
  begin
    perform public.resolve_club_request_pass3(v_request,v_players[1],'approve');
    raise exception 'QA_PASS3_NON_PLATFORM_APPROVED_CLUB';
  exception when insufficient_privilege then null; end;
  select count(*) into v_before from public.clubs;
  perform set_config('selpa.qa_pass3_fault','on',true);
  begin
    perform public.resolve_club_request_pass3(v_request,v_platform,'approve');
    raise exception 'QA_PASS3_FAULT_NOT_FIRED';
  exception when raise_exception then
    get stacked diagnostics v_error=message_text;
    if v_error<>'QA_PASS3_INJECTED_FAILURE' then raise; end if;
  end;
  perform set_config('selpa.qa_pass3_fault','off',true);
  if (select count(*) from public.clubs)<>v_before
    or (select status from public.club_requests where id=v_request)<>'PENDING'
    or exists(select 1 from public.club_memberships where user_id=v_owner and role='OWNER') then
    raise exception 'QA_PASS3_ONBOARDING_NOT_ATOMIC';
  end if;
  v_result:=public.resolve_club_request_pass3(v_request,v_platform,'approve');
  v_club:=(v_result->>'clubId')::uuid;
  select count(*) into v_notifications from public.notifications;
  perform public.resolve_club_request_pass3(v_request,v_platform,'approve');
  if (select count(*) from public.notifications)<>v_notifications
    or (select resolved_club_id from public.club_requests where id=v_request)<>v_club
    or not exists(select 1 from public.user_settings where user_id=v_owner and active_club_id=v_club) then
    raise exception 'QA_PASS3_OWNER_CONTEXT_OR_REPLAY_INVALID';
  end if;
  select id into v_owner_member from public.club_memberships where club_id=v_club and user_id=v_owner;
  perform public.submit_club_request_pass3(v_reject,v_input||jsonb_build_object('club_name','Pass3 rejected '||v_reject));
  perform public.resolve_club_request_pass3(v_reject,v_platform,'reject','Fixture rejection');
  perform public.resolve_club_request_pass3(v_reject,v_platform,'reject','Fixture rejection');
  if (select status from public.club_requests where id=v_reject)<>'REJECTED' then raise exception 'QA_PASS3_REJECTION_LOST'; end if;
  begin
    perform public.resolve_club_request_pass3(v_reject,v_platform,'approve');
    raise exception 'QA_PASS3_REJECTED_APPROVED';
  exception when unique_violation then null; end;
  perform public.submit_club_request_pass3(v_unknown,v_input||jsonb_build_object('club_name','Pass3 no owner '||v_unknown,'owner_email','unregistered-'||v_unknown||'@example.invalid'));
  begin
    perform public.resolve_club_request_pass3(v_unknown,v_platform,'approve');
    raise exception 'QA_PASS3_OWNERLESS_CLUB_CREATED';
  exception when unique_violation then
    get stacked diagnostics v_error=message_text;
    if v_error<>'WRITE_OWNER_ACCOUNT_REQUIRED' then raise; end if;
  end;
  if (select status from public.club_requests where id=v_unknown)<>'PENDING' then raise exception 'QA_PASS3_OWNERLESS_REQUEST_CHANGED'; end if;

  -- Reapply/replay, approved sporting row, identity separation and auth.uid authorization.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  foreach v_user in array v_players loop
    perform public.request_player_membership_pass3(v_club,v_user);
    perform public.request_player_membership_pass3(v_club,v_user);
    select id into v_member from public.club_memberships where club_id=v_club and user_id=v_user;
    if v_user=v_players[3] then
      perform public.resolve_player_membership_pass3(v_member,'reject','Fixture rejection');
      perform public.resolve_player_membership_pass3(v_member,'reject','Fixture rejection');
      perform public.request_player_membership_pass3(v_club,v_user);
    end if;
    perform public.resolve_player_membership_pass3(v_member,'approve');
    perform public.resolve_player_membership_pass3(v_member,'approve');
    if (select count(*) from public.club_players where club_id=v_club and user_id=v_user and approved_at is not null)<>1 then
      raise exception 'QA_PASS3_PLAYER_ROW_DUPLICATED_OR_MISSING';
    end if;
  end loop;
  begin
    perform public.request_player_membership_pass3(v_club,v_owner);
    raise exception 'QA_PASS3_STAFF_BECAME_PLAYER';
  exception when check_violation or insufficient_privilege then null; end;
  begin
    update public.club_memberships set role='ADMIN' where club_id=v_club and user_id=v_players[1];
    raise exception 'QA_PASS3_PLAYER_BECAME_STAFF';
  exception when check_violation or insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_players[1]::text,true);
  begin
    perform public.resolve_player_membership_pass3(v_owner_member,'reject','Fixture');
    raise exception 'QA_PASS3_PLAYER_RESOLVED_OWNER';
  exception when insufficient_privilege then null; end;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club,v_staff,'ADMIN','APPROVED',now(),v_owner);
  select array_agg(id order by array_position(v_players,user_id)) into v_cp
    from public.club_players where club_id=v_club and user_id=any(v_players);
  insert into public.player_partner_invites(club_id,sender_club_player_id,receiver_club_player_id)
    values(v_club,v_cp[1],v_cp[2]) returning id into v_invite;
  begin
    perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[3],'accept');
    raise exception 'QA_PASS3_UNRELATED_ACCEPTED_PAIR';
  exception when insufficient_privilege then null; end;
  v_result:=public.resolve_partner_invite_pass3(v_club,v_invite,v_players[2],'accept');
  v_pair:=(v_result->'partnership'->>'id')::uuid;
  perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[2],'accept');
  if (select count(*) from public.player_active_partnerships where accepted_invite_id=v_invite)<>1 then raise exception 'QA_PASS3_PAIR_REPLAY_DUPLICATED'; end if;
  begin
    insert into public.player_active_partnerships(club_id,player1_club_player_id,player2_club_player_id,status,created_by)
      values(v_club,least(v_cp[1],v_cp[3]),greatest(v_cp[1],v_cp[3]),'ACTIVE',v_owner);
    raise exception 'QA_PASS3_OVERLAPPING_PAIR_ACCEPTED';
  exception when unique_violation then null; end;
  begin
    insert into public.player_partner_invites(club_id,sender_club_player_id,receiver_club_player_id)
      values(v_club,v_cp[3],v_cp[3]);
    raise exception 'QA_PASS3_SELF_PAIR_ACCEPTED';
  exception when check_violation then null; end;
  update public.player_active_partnerships set status='ENDED',ended_at=now() where id=v_pair;
  insert into public.player_partner_invites(club_id,sender_club_player_id,receiver_club_player_id)
    values(v_club,v_cp[1],v_cp[3]) returning id into v_invite;
  perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[3],'decline');
  perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[3],'decline');
  insert into public.player_partner_invites(club_id,sender_club_player_id,receiver_club_player_id)
    values(v_club,v_cp[1],v_cp[3]) returning id into v_invite;
  perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[1],'cancel');
  perform public.resolve_partner_invite_pass3(v_club,v_invite,v_players[1],'cancel');

  -- Entry through existing sporting RPC; no synthetic full tournament settlement.
  select id into v_category from public.categories order by id limit 1;
  if v_category is null then raise exception 'QA_PASS3_CATEGORY_SEED_REQUIRED'; end if;
  update public.club_players set category=6,gender='MALE' where club_id=v_club and user_id=any(v_players);
  insert into public.tournaments(club_id,name,type,category_id,category,gender,start_date,end_date,status,registration_deadline,price_per_player)
    values(v_club,'Pass3 priced fixture','OPEN',v_category,6,'MALE',current_date+30,current_date+32,'OPEN',now()+interval '20 days',50)
    returning id into v_tournament;
  perform set_config('request.jwt.claim.sub',v_players[1]::text,true);
  select r.team_id,r.registration_id into v_team,v_registration
    from public.register_team_for_tournament(v_tournament,v_club,v_players[2]) r;
  if exists(select 1 from public.club_finance_obligations where source_id=v_registration) then raise exception 'QA_PASS3_PENDING_CHARGED'; end if;
  begin
    perform public.register_team_for_tournament(v_tournament,v_club,v_players[2]);
    raise exception 'QA_PASS3_DUPLICATE_REGISTRATION_ACCEPTED';
  exception when raise_exception or unique_violation or check_violation then
    get stacked diagnostics v_error=message_text;
    if v_error='QA_PASS3_DUPLICATE_REGISTRATION_ACCEPTED' then raise; end if;
  end;
  insert into public.tournament_payments(club_id,tournament_id,team_id,registration_id,user_id,amount,method,status)
    values(v_club,v_tournament,v_team,v_registration,v_players[1],100,'CASH_ON_SITE_REQUEST','PENDING') returning id into v_legacy;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('selpa.qa_pass3_fault','on',true);
  begin
    perform public.resolve_tournament_payment_request_pass3(v_club,v_legacy,v_owner,'APPROVED');
    raise exception 'QA_PASS3_LEGACY_FAULT_NOT_FIRED';
  exception when raise_exception then
    get stacked diagnostics v_error=message_text;
    if v_error<>'QA_PASS3_INJECTED_FAILURE' then raise; end if;
  end;
  perform set_config('selpa.qa_pass3_fault','off',true);
  if (select status from public.tournament_registrations where id=v_registration)<>'PENDING'
    or exists(select 1 from public.club_finance_obligations where source_id=v_registration)
    or (select status from public.tournament_payments where id=v_legacy)<>'PENDING' then raise exception 'QA_PASS3_LEGACY_NOT_ATOMIC'; end if;
  perform public.resolve_tournament_payment_request_pass3(v_club,v_legacy,v_owner,'APPROVED');
  perform public.resolve_tournament_payment_request_pass3(v_club,v_legacy,v_owner,'APPROVED');
  select id into v_obligation from public.club_finance_obligations where club_id=v_club and source_id=v_registration;
  if (select count(*) from public.club_finance_obligations where club_id=v_club and source_id=v_registration)<>1
    or not exists(select 1 from public.club_finance_obligations where id=v_obligation and original_amount=100 and currency_code='ARS' and due_date is null and created_by=v_owner)
    or not exists(select 1 from public.club_finance_journals where obligation_id=v_obligation and actor_id=v_owner)
    or exists(select 1 from public.club_finance_payments where club_id=v_club) then raise exception 'QA_PASS3_F1B_ACTOR_AMOUNT_OR_LEGACY_SEPARATION_INVALID'; end if;
  insert into public.tournament_registration_change_requests(club_id,tournament_id,team_id,registration_id,requested_by,type,reason)
    values(v_club,v_tournament,v_team,v_registration,v_players[1],'CANCEL_REGISTRATION','Fixture withdrawal') returning id into v_change;
  perform set_config('selpa.qa_pass3_fault','on',true);
  begin
    perform public.resolve_registration_change_request_pass3(v_club,v_change,v_owner,'APPROVED');
    raise exception 'QA_PASS3_CANCEL_FAULT_NOT_FIRED';
  exception when raise_exception then
    get stacked diagnostics v_error=message_text;
    if v_error<>'QA_PASS3_INJECTED_FAILURE' then raise; end if;
  end;
  perform set_config('selpa.qa_pass3_fault','off',true);
  if (select status from public.tournament_registrations where id=v_registration)<>'CONFIRMED'
    or (select status from public.club_finance_obligations where id=v_obligation)<>'OPEN'
    or (select status from public.tournament_registration_change_requests where id=v_change)<>'PENDING' then raise exception 'QA_PASS3_CANCEL_NOT_ATOMIC'; end if;
  perform public.resolve_registration_change_request_pass3(v_club,v_change,v_owner,'APPROVED');
  perform public.resolve_registration_change_request_pass3(v_club,v_change,v_owner,'APPROVED');
  if (select status from public.tournament_registrations where id=v_registration)<>'CANCELLED'
    or (select status from public.club_finance_obligations where id=v_obligation)<>'CANCELLED' then raise exception 'QA_PASS3_UNPAID_CANCEL_INVALID'; end if;
  insert into public.tournaments(club_id,name,type,category_id,category,gender,start_date,status,registration_deadline,price_per_player)
    values(v_club,'Pass3 free fixture','OPEN',v_category,6,'MALE',current_date+30,'OPEN',now()+interval '20 days',0) returning id into v_free_tournament;
  perform set_config('request.jwt.claim.sub',v_players[1]::text,true);
  select r.team_id,r.registration_id into v_team,v_registration from public.register_team_for_tournament(v_free_tournament,v_club,v_players[2]) r;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.transition_tournament_registration_finance_f1b(v_club,v_free_tournament,v_registration,'CONFIRMED',v_owner);
  if exists(select 1 from public.club_finance_obligations where source_id=v_registration) then raise exception 'QA_PASS3_FREE_REGISTRATION_CHARGED'; end if;

  -- Existing F1A commands: cash partial, transfer completion, same-key retry and reversal.
  v_result:=public.create_club_finance_obligation(v_club,jsonb_build_object(
    'source_type','MANUAL','source_id',gen_random_uuid(),'debtor_type','TEAM','debtor_team_id',v_team,
    'concept','Pass3 manual fixture','original_amount',100,'currency_code','ARS'), 'pass3-charge-'||v_request::text);
  -- RPC returns a JSON receipt; obligation remains physically OPEN after full payment.
  v_obligation:=(v_result->>'id')::uuid;
  if v_obligation is null then raise exception 'QA_PASS3_OBLIGATION_RECEIPT_INVALID'; end if;
  v_result:=public.register_club_finance_payment(v_club,v_obligation,20,'ARS','CASH','pass3-cash-'||v_request::text);
  perform public.register_club_finance_payment(v_club,v_obligation,20,'ARS','CASH','pass3-cash-'||v_request::text);
  v_result:=public.register_club_finance_payment(v_club,v_obligation,80,'ARS','BANK_TRANSFER','pass3-transfer-'||v_request::text);
  v_payment:=(v_result->>'payment_id')::uuid;
  if (public.club_finance_obligation_projection_internal(v_club,v_obligation)->>'balance')::numeric<>0 then raise exception 'QA_PASS3_FULL_PAYMENT_BALANCE'; end if;
  perform public.reverse_club_finance_payment(v_club,v_payment,'Fixture reversal','pass3-reverse-'||v_request::text);
  perform public.reverse_club_finance_payment(v_club,v_payment,'Fixture reversal','pass3-reverse-'||v_request::text);
  if (public.club_finance_obligation_projection_internal(v_club,v_obligation)->>'balance')::numeric<>80
    or (select count(*) from public.club_finance_payments where club_id=v_club)<>2 then raise exception 'QA_PASS3_RETRY_OR_REVERSE_DUPLICATED_PAYMENT'; end if;
  insert into pass3_fixture values('club',v_club);
  raise notice 'QA_PASS3_SEQUENTIAL_PASS (all fixture data will roll back)';
end;
$$;

do $$
declare v_name text; v_signature text;
begin
  foreach v_name in array array['submit_club_request_pass3(uuid,jsonb)','resolve_club_request_pass3(uuid,uuid,text,text)',
    'request_player_membership_pass3(uuid,uuid)','resolve_partner_invite_pass3(uuid,uuid,uuid,text)',
    'resolve_tournament_payment_request_pass3(uuid,uuid,uuid,text,text)','resolve_registration_change_request_pass3(uuid,uuid,uuid,text)'] loop
    v_signature:='public.'||v_name;
    if has_function_privilege('anon',v_signature,'EXECUTE') or has_function_privilege('authenticated',v_signature,'EXECUTE')
      or not has_function_privilege('service_role',v_signature,'EXECUTE') then raise exception 'QA_PASS3_RPC_ACL_INVALID %',v_name; end if;
  end loop;
  if not has_function_privilege('authenticated','public.resolve_player_membership_pass3(uuid,text,text)','EXECUTE')
    or has_function_privilege('anon','public.resolve_player_membership_pass3(uuid,text,text)','EXECUTE')
    or has_function_privilege('service_role','public.resolve_player_membership_pass3(uuid,text,text)','EXECUTE')
    or has_function_privilege('service_role','public.guard_active_partnership_pass3()','EXECUTE') then raise exception 'QA_PASS3_USER_OR_INTERNAL_ACL_INVALID'; end if;
end;
$$;
set constraints all immediate;
rollback;
