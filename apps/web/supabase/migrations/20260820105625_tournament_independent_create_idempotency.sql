-- Durable idempotency for the independent Tournament Engine creation flow.
-- It intentionally wraps the existing canonical primitive instead of replacing it.

begin;

create table public.tournament_create_commands (
  club_id uuid not null references public.clubs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_hash text not null,
  tournament_id uuid references public.tournaments(id) on delete restrict,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (club_id, actor_id, idempotency_key),
  constraint tournament_create_commands_key_chk check (length(btrim(idempotency_key)) between 8 and 200),
  constraint tournament_create_commands_hash_chk check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint tournament_create_commands_response_chk check (response_payload is null or jsonb_typeof(response_payload) = 'object')
);

create index tournament_create_commands_tournament_idx
  on public.tournament_create_commands(club_id, tournament_id, created_at desc);

alter table public.tournament_create_commands enable row level security;
revoke all on table public.tournament_create_commands from public, anon, authenticated;

create policy tournament_create_commands_actor_read
  on public.tournament_create_commands
  for select
  to authenticated
  using (
    actor_id = auth.uid()
    and (public.is_platform_admin() or public.has_club_capability(club_id, 'tournaments:create'))
  );

create or replace function public.create_tournament_canonical(
  p_club_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns public.tournaments
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_command public.tournament_create_commands%rowtype;
  v_result public.tournaments%rowtype;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload de torneo inválido.' using errcode = '22023';
  end if;
  if length(v_key) not between 8 and 200 then
    raise exception 'Idempotency-Key inválida.' using errcode = '22023';
  end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'tournaments:create') then
    raise exception 'TOURNAMENT_FORBIDDEN' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_club_id::text || ':' || v_actor::text || ':' || v_key, 0)
  );

  select * into v_command
  from public.tournament_create_commands command
  where command.club_id = p_club_id
    and command.actor_id = v_actor
    and command.idempotency_key = v_key
  for update;

  if found then
    if v_command.request_hash is distinct from v_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    if v_command.tournament_id is null then
      raise exception 'La solicitud todavía está en proceso.' using errcode = '55P03';
    end if;
    select * into v_result
    from public.tournaments tournament
    where tournament.id = v_command.tournament_id and tournament.club_id = p_club_id;
    if not found then
      raise exception 'IDEMPOTENCY_RESULT_MISSING' using errcode = 'P0002';
    end if;
    return v_result;
  end if;

  insert into public.tournament_create_commands(club_id, actor_id, idempotency_key, request_hash)
  values (p_club_id, v_actor, v_key, v_hash);

  v_result := public.create_tournament_canonical(p_club_id, p_payload);

  update public.tournament_create_commands command
  set tournament_id = v_result.id,
      response_payload = jsonb_build_object('tournament_id', v_result.id, 'reused', false),
      completed_at = now()
  where command.club_id = p_club_id
    and command.actor_id = v_actor
    and command.idempotency_key = v_key;

  return v_result;
end;
$$;

revoke all on function public.create_tournament_canonical(uuid, jsonb, text) from public, anon;
grant execute on function public.create_tournament_canonical(uuid, jsonb, text) to authenticated, service_role;

comment on table public.tournament_create_commands is
  'Durable idempotency commands for independent Tournament creation. A failed transaction leaves no command or Tournament.';
comment on function public.create_tournament_canonical(uuid, jsonb, text) is
  'Idempotent wrapper for the canonical independent Tournament DRAFT creation primitive.';

commit;
