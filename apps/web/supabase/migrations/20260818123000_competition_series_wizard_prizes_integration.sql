begin;

create or replace function public.create_competition_series_with_prizes_from_wizard(
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
  v_response jsonb;
  v_series_id uuid;
  v_series_revision integer;
begin
  v_response := public.create_competition_series_from_wizard(
    p_club_id,
    p_idempotency_key,
    p_payload
  );

  if coalesce((v_response ->> 'reused')::boolean, false) then
    return v_response;
  end if;

  if p_payload ? 'prizes' then
    v_series_id := (v_response ->> 'series_id')::uuid;

    select series.revision
      into v_series_revision
    from public.competition_series series
    where series.id = v_series_id
      and series.club_id = p_club_id
    for update;

    if not found then
      raise exception 'SERIES_NOT_FOUND' using errcode = 'P0002';
    end if;

    perform public.replace_competition_series_prizes(
      p_club_id,
      v_series_id,
      v_series_revision,
      p_payload -> 'prizes'
    );
  end if;

  return v_response;
end;
$$;

revoke all on function public.create_competition_series_with_prizes_from_wizard(uuid,text,jsonb) from public, anon;
grant execute on function public.create_competition_series_with_prizes_from_wizard(uuid,text,jsonb) to authenticated, service_role;

comment on function public.create_competition_series_with_prizes_from_wizard(uuid,text,jsonb)
is 'Orquesta el alta idempotente del circuito y sus premios normalizados dentro de la misma transacción.';

commit;
