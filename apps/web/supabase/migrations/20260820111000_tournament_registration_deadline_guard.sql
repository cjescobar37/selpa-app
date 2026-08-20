-- Lifecycle corrective: the canonical registration primitive must not allow a
-- direct RPC caller to bypass an already elapsed registration deadline.
create or replace function public.register_team_for_tournament(
  p_tournament_id uuid,
  p_club_id uuid,
  p_partner_user_id uuid
)
returns table(team_id uuid, registration_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_team_id uuid;
  v_reg_id uuid;
  v_exists int;
  v_status text;
  v_registration_deadline timestamptz;
begin
  if v_me is null then raise exception 'No auth user'; end if;

  select status, registration_deadline
  into v_status, v_registration_deadline
  from public.tournaments
  where id = p_tournament_id and club_id = p_club_id
  for share;

  if not found then raise exception 'Torneo no encontrado'; end if;
  if v_status = 'PAUSED' then raise exception 'TOURNAMENT_PAUSED' using errcode = '23514'; end if;
  if v_status <> 'OPEN' then raise exception 'TOURNAMENT_REGISTRATION_NOT_OPEN' using errcode = '23514'; end if;
  if v_registration_deadline is not null and v_registration_deadline <= now() then
    raise exception 'TOURNAMENT_REGISTRATION_CLOSED' using errcode = '23514';
  end if;
  if exists(select 1 from public.profiles where user_id = v_me and status = 'SUSPENDED') then raise exception 'Usuario suspendido'; end if;
  if exists(select 1 from public.profiles where user_id = p_partner_user_id and status = 'SUSPENDED') then raise exception 'El compañero está suspendido'; end if;
  if p_partner_user_id = v_me then raise exception 'No podés inscribirte con vos mismo'; end if;
  if not exists(select 1 from public.club_players where club_id = p_club_id and user_id = v_me) then raise exception 'No sos jugador del club'; end if;
  if not exists(select 1 from public.club_players where club_id = p_club_id and user_id = p_partner_user_id) then raise exception 'El compañero no pertenece al club'; end if;
  select count(*) into v_exists from public.tournament_teams where tournament_id = p_tournament_id and (player1_user_id = v_me or player2_user_id = v_me);
  if v_exists > 0 then raise exception 'Ya estás inscripto en este torneo'; end if;
  select count(*) into v_exists from public.tournament_teams where tournament_id = p_tournament_id and (player1_user_id = p_partner_user_id or player2_user_id = p_partner_user_id);
  if v_exists > 0 then raise exception 'Tu compañero ya está inscripto en este torneo'; end if;
  insert into public.tournament_teams(tournament_id,club_id,player1_user_id,player2_user_id,created_by)
  values(p_tournament_id,p_club_id,v_me,p_partner_user_id,v_me) returning id into v_team_id;
  insert into public.tournament_registrations(tournament_id,club_id,team_id,status,created_by)
  values(p_tournament_id,p_club_id,v_team_id,'PENDING'::public.tournament_reg_status,v_me) returning id into v_reg_id;
  return query select v_team_id, v_reg_id;
end;
$$;

revoke all on function public.register_team_for_tournament(uuid, uuid, uuid) from public, anon;
grant execute on function public.register_team_for_tournament(uuid, uuid, uuid) to authenticated, service_role;

comment on function public.register_team_for_tournament(uuid, uuid, uuid) is
  'Registers a team through the canonical Tournament lifecycle; PAUSED and elapsed registration deadlines are rejected server-side.';
