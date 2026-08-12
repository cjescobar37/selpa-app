-- APB Circuit wizard: atomically creates the initial aggregate without exposing
-- intermediate Series/Division/Rule resources to the client.

create table if not exists public.competition_series_create_commands (
  club_id uuid not null references public.clubs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (club_id, actor_id, idempotency_key),
  constraint competition_series_create_commands_key_chk check (length(btrim(idempotency_key)) between 8 and 200),
  constraint competition_series_create_commands_payload_chk check (response_payload is null or jsonb_typeof(response_payload) = 'object')
);

alter table public.competition_series_create_commands enable row level security;
revoke all on table public.competition_series_create_commands from public, anon, authenticated;

create or replace function public.create_competition_series_from_wizard(
  p_club_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_command public.competition_series_create_commands%rowtype;
  v_season public.competition_seasons%rowtype;
  v_division public.competition_divisions%rowtype;
  v_scheme public.points_schemes%rowtype;
  v_age public.competition_age_categories%rowtype;
  v_segment public.competition_segments%rowtype;
  v_series public.competition_series%rowtype;
  v_series_division public.competition_series_divisions%rowtype;
  v_rule public.competition_series_rules%rowtype;
  v_response jsonb;
  v_name text := btrim(coalesce(p_payload->>'name', ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_count integer;
  v_mode text;
begin
  v_actor := public.require_competition_series_access(p_club_id, 'competition:manage');
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Payload inválido.' using errcode='22023'; end if;
  if length(v_key) not between 8 and 200 then raise exception 'Idempotency-Key inválida.' using errcode='22023'; end if;
  if v_name = '' then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  v_hash := md5(p_payload::text);

  insert into public.competition_series_create_commands(club_id, actor_id, idempotency_key, request_hash)
  values (p_club_id, v_actor, v_key, v_hash)
  on conflict (club_id, actor_id, idempotency_key) do nothing
  returning * into v_command;
  if not found then
    select * into v_command from public.competition_series_create_commands command
    where command.club_id = p_club_id and command.actor_id = v_actor and command.idempotency_key = v_key
    for update;
    if v_command.request_hash <> v_hash then raise exception 'La clave de solicitud ya se usó con otros datos.' using errcode='40001'; end if;
    if v_command.response_payload is not null then return v_command.response_payload; end if;
    raise exception 'La solicitud todavía está en proceso.' using errcode='55P03';
  end if;

  select * into v_season from public.competition_seasons season
  where season.id = nullif(p_payload->>'season_id', '')::uuid and season.club_id = p_club_id and season.status = 'ACTIVE';
  if not found then raise exception 'La temporada activa no pertenece al club.' using errcode='23514'; end if;
  select * into v_division from public.competition_divisions division
  where division.id = nullif(p_payload->>'division_id', '')::uuid and division.club_id = p_club_id and division.season_id = v_season.id and division.is_active;
  if not found then raise exception 'La categoría elegida no pertenece a la temporada activa.' using errcode='23514'; end if;
  select * into v_segment from public.competition_segments segment
  where segment.id = v_division.segment_id and segment.club_id = p_club_id and segment.is_active;
  if not found or v_segment.slug not in ('libres', 'menores', 'veteranos') then
    raise exception 'El grupo de la categoría no es válido para crear un circuito.' using errcode='23514';
  end if;
  if p_payload ? 'modality' and upper(btrim(p_payload->>'modality')) is distinct from v_division.modality then
    raise exception 'La modalidad no coincide con la categoría elegida.' using errcode='23514';
  end if;
  if p_payload ? 'branch_id' and nullif(p_payload->>'branch_id','')::uuid is distinct from v_division.branch_id then
    raise exception 'El género no coincide con la categoría elegida.' using errcode='23514';
  end if;
  if p_payload ? 'segment_id' and nullif(p_payload->>'segment_id','')::uuid is distinct from v_division.segment_id then
    raise exception 'El grupo no coincide con la categoría elegida.' using errcode='23514';
  end if;
  if p_payload ? 'category_id' and nullif(p_payload->>'category_id','')::uuid is distinct from v_division.category_id then
    raise exception 'La categoría no coincide con la categoría elegida.' using errcode='23514';
  end if;
  select * into v_scheme from public.points_schemes scheme
  where scheme.id = nullif(p_payload->>'points_scheme_id', '')::uuid and scheme.is_active and (scheme.is_global or scheme.club_id = p_club_id);
  if not found then raise exception 'La tabla de puntos no está disponible.' using errcode='23514'; end if;
  if v_segment.slug = 'libres' and nullif(p_payload->>'age_category_id', '') is not null then
    raise exception 'Libres no admite categoría etaria.' using errcode='23514';
  end if;
  if v_segment.slug in ('menores', 'veteranos') and nullif(p_payload->>'age_category_id', '') is null then
    raise exception 'El grupo elegido requiere categoría etaria.' using errcode='23514';
  end if;
  if nullif(p_payload->>'age_category_id', '') is not null then
    select * into v_age from public.competition_age_categories age
    where age.id = (p_payload->>'age_category_id')::uuid and age.club_id = p_club_id and age.is_active;
    if not found then raise exception 'La categoría de edad no está disponible.' using errcode='23514'; end if;
    if v_segment.slug = 'menores' and (v_age.max_age is null or v_age.max_age > 18) then
      raise exception 'La categoría etaria no corresponde a Menores.' using errcode='23514';
    end if;
    if v_segment.slug = 'veteranos' and (v_age.min_age is null or v_age.min_age < 18) then
      raise exception 'La categoría etaria no corresponde a Veteranos.' using errcode='23514';
    end if;
  end if;
  v_count := coalesce(nullif(p_payload->>'planned_events_count','')::integer, 0);
  if v_count < 0 then raise exception 'La cantidad de fechas es inválida.' using errcode='22023'; end if;
  v_mode := coalesce(nullif(upper(btrim(p_payload->>'accumulation_mode')), ''), 'ALL_RESULTS');
  if v_mode not in ('ALL_RESULTS','BEST_N') then raise exception 'La configuración de ranking es inválida.' using errcode='22023'; end if;

  v_series := public.create_competition_series(p_club_id, v_season.id, v_name);
  v_series := public.update_competition_series_draft(
    p_club_id, v_series.id, v_series.revision, v_name,
    'CIR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    nullif(btrim(coalesce(p_payload->>'description','')), ''),
    nullif(p_payload->>'starts_on','')::date, nullif(p_payload->>'ends_on','')::date,
    v_count, 0, false
  );
  v_series_division := public.add_competition_series_division(p_club_id, v_series.id, v_division.id, 0, v_series.revision);
  select * into v_series from public.competition_series series where series.id=v_series.id and series.club_id=p_club_id;
  v_rule := public.create_competition_series_rule_version(p_club_id, v_series.id, v_series.revision, v_series_division.id, v_scheme.id, null);
  select * into v_series from public.competition_series series where series.id=v_series.id and series.club_id=p_club_id;
  v_rule := public.update_competition_series_rule_draft(p_club_id, v_series.id, v_series.revision, v_rule.id, v_rule.revision,
    jsonb_build_object(
      'points_scheme_id', v_scheme.id,
      'accumulation_mode', v_mode,
      'best_results_count', case when v_mode = 'BEST_N' then coalesce(nullif(p_payload->>'best_results_count','')::integer, 1) else null end,
      'discard_worst_count', null,
      'minimum_participations', 0,
      'master_final_qualification_count', null,
      'master_final_multiplier', 1,
      'tie_breakers', jsonb_build_array(jsonb_build_object('criterion', 'TOURNAMENT_WINS', 'params', '{}'::jsonb))
    )
  );
  select * into v_series from public.competition_series series where series.id=v_series.id and series.club_id=p_club_id;
  perform public.set_competition_series_eligibility(p_club_id, v_series.id, v_series.revision, v_rule.id, null,
    jsonb_build_object(
      'requires_active_entry', true,
      'allow_invited_players', coalesce((p_payload->>'allow_invited_players')::boolean, false),
      'invited_points_policy', 'REQUIRE_ENTRY',
      'require_same_division_pair', true,
      'age_category_id', case when v_age.id is null then null else v_age.id::text end,
      'additional_rules', '{}'::jsonb
    )
  );
  select * into v_series from public.competition_series series where series.id=v_series.id and series.club_id=p_club_id;
  v_rule := public.activate_competition_series_rule_version(p_club_id, v_series.id, v_series.revision, v_rule.id, v_rule.revision);
  v_response := jsonb_build_object('series_id', v_series.id, 'status', v_series.status, 'reused', false);
  update public.competition_series_create_commands command
  set response_payload = v_response, completed_at = now()
  where command.club_id = p_club_id and command.actor_id = v_actor and command.idempotency_key = v_key;
  return v_response;
end;
$$;

revoke all on function public.create_competition_series_from_wizard(uuid, text, jsonb) from public, anon;
grant execute on function public.create_competition_series_from_wizard(uuid, text, jsonb) to authenticated;
