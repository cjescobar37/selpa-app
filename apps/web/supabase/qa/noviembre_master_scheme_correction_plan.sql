-- READ-ONLY correction plan. It does not execute the configuration RPC.
-- Read current optimistic revisions immediately before invoking the domain RPC.
begin transaction read only;

select jsonb_build_object(
  'event_id', event.id,
  'event_status', event.status,
  'current_event_revision', event.revision,
  'expected_event_revision_after_rpc', event.revision + 1,
  'event_division_id', division.id,
  'division_status', division.status,
  'current_division_revision', division.revision,
  'expected_division_revision_after_rpc', division.revision + 1,
  'current_scheme_id', division.points_scheme_override_id,
  'target_scheme_id', master_scheme.id,
  'series_rule_id_unchanged', division.series_rule_id,
  'can_apply', event.status in ('DRAFT', 'SCHEDULED')
    and division.status in ('DRAFT', 'SCHEDULED')
    and division.scoring_mode = 'POINTS'
    and not exists (
      select 1 from public.competition_event_homologations homologation
      where homologation.event_division_id = division.id
    )
    and not exists (
      select 1 from public.competition_event_settlements settlement
      where settlement.event_division_id = division.id
    ),
  'rpc_name', 'set_competition_event_division_points_scheme',
  'rpc_arguments', jsonb_build_object(
    'p_club_id', division.club_id,
    'p_event_id', event.id,
    'p_event_division_id', division.id,
    'p_event_revision', event.revision,
    'p_division_revision', division.revision,
    'p_points_scheme_id', master_scheme.id
  )
) as correction_plan
from public.competition_series_event_divisions division
join public.competition_series_events event
  on event.id = division.event_id and event.club_id = division.club_id
join public.points_schemes master_scheme
  on master_scheme.id = '19bbd434-af09-4684-b791-12f81a9e5184'::uuid
  and master_scheme.club_id = division.club_id
where event.id = 'b6e81e5c-e5f3-4f11-b7e2-9ae9fbbd3dfa'::uuid
  and division.id = '68346ad8-3e23-42ad-8e82-8621dad954b3'::uuid;

rollback;
