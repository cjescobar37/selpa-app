begin;

do $$
begin
  if to_regclass('public.competition_event_settlements') is null
     or to_regclass('public.competition_event_settlement_awards') is null
     or to_regclass('public.competition_event_settlement_issues') is null then
    raise exception 'Stage 5A.5 debe estar aplicada antes de corregir sus grants.';
  end if;
end
$$;

grant select on table
  public.competition_event_settlements,
  public.competition_event_settlement_awards,
  public.competition_event_settlement_issues
to authenticated;

revoke all on table public.competition_event_settlement_commands
from public, anon, authenticated;

commit;
