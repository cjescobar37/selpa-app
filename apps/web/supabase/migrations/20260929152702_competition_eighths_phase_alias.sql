begin;

-- Tournament Engine persists both names for the round of 16. Competition
-- treats them as the same canonical placement for the losing team.
create or replace function public.competition_result_role_for_playoff_phase(
  p_phase text,
  p_is_winner boolean
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when upper(btrim(coalesce(p_phase, ''))) = 'FINAL' and p_is_winner then 'CHAMPION'
    when upper(btrim(coalesce(p_phase, ''))) = 'FINAL' then 'RUNNER_UP'
    when p_is_winner then null
    when upper(btrim(coalesce(p_phase, ''))) = 'SEMI' then 'SEMIFINALIST'
    when upper(btrim(coalesce(p_phase, ''))) = 'QUARTER' then 'QUARTERFINALIST'
    when upper(btrim(coalesce(p_phase, ''))) in ('ROUND_OF_16', 'EIGHTHS') then 'EIGHTH_FINALIST'
    when upper(btrim(coalesce(p_phase, ''))) = 'ROUND_OF_32' then 'SIXTEENTH_FINALIST'
    else null
  end
$$;

-- INTERNAL: the extractor owner invokes it; no Data API role may execute it.
revoke all on function public.competition_result_role_for_playoff_phase(text, boolean)
  from public, anon, authenticated, service_role;

commit;
