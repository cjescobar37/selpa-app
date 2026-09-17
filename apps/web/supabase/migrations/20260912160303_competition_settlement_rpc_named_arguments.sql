begin;

create or replace function public.submit_competition_event_settlement(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.transition_competition_event_settlement(
    p_club_id,
    p_settlement_id,
    p_revision,
    'SUBMIT',
    p_idempotency_key,
    '{}'::jsonb
  )
$$;

create or replace function public.approve_competition_event_settlement(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.transition_competition_event_settlement(
    p_club_id,
    p_settlement_id,
    p_revision,
    'APPROVE',
    p_idempotency_key,
    '{}'::jsonb
  )
$$;

create or replace function public.publish_competition_event_settlement(
  p_club_id uuid,
  p_settlement_id uuid,
  p_revision integer,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.transition_competition_event_settlement(
    p_club_id,
    p_settlement_id,
    p_revision,
    'PUBLISH',
    p_idempotency_key,
    '{}'::jsonb
  )
$$;

revoke all on function public.submit_competition_event_settlement(uuid, uuid, integer, text) from public, anon;
revoke all on function public.approve_competition_event_settlement(uuid, uuid, integer, text) from public, anon;
revoke all on function public.publish_competition_event_settlement(uuid, uuid, integer, text) from public, anon;

grant execute on function public.submit_competition_event_settlement(uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.approve_competition_event_settlement(uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.publish_competition_event_settlement(uuid, uuid, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
