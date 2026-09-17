import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTournamentEditableCapabilities, tournamentConfigurationEditGuard, type OperationalTournament, type TournamentConfigurationDetail } from './tournamentOperationalConfiguration'
export async function readTournamentOperationalConfiguration(clubId: string, tournamentId: string): Promise<TournamentConfigurationDetail | null> {
  const result = await supabaseAdmin.from('tournaments')
    .select('id,club_id,name,status,updated_at,registration_deadline,min_pairs,max_pairs,price_per_player,start_date,end_date,rules_json')
    .eq('club_id',clubId).eq('id',tournamentId).maybeSingle()
  if (result.error) throw new Error('No pudimos cargar la configuración del torneo.')
  if (!result.data) return null
  const [seeds, matches, groups, teams, registrations] = await Promise.all([
    supabaseAdmin.from('tournament_team_seed_snapshots').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId),
    supabaseAdmin.from('tournament_matches').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId),
    supabaseAdmin.from('tournament_groups').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId),
    supabaseAdmin.from('tournament_teams').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId),
    supabaseAdmin.from('tournament_registrations').select('id',{count:'exact',head:true}).eq('tournament_id',tournamentId).eq('status','CONFIRMED'),
  ])
  if ([seeds,matches,groups,teams,registrations].some(query=>query.error)) throw new Error('No pudimos verificar si la configuración está bloqueada.')
  const seedsFrozen=(seeds.count??0)>0, fixtureGenerated=(matches.count??0)>0||(groups.count??0)>0
  const tournament=result.data as OperationalTournament
  const blockedReason=tournamentConfigurationEditGuard(tournament.status,seedsFrozen,fixtureGenerated)
  const hasGroups=(groups.count??0)>0, hasMatches=(matches.count??0)>0, registrationCount=registrations.count??0
  const capabilities=getTournamentEditableCapabilities({tournamentStatus:tournament.status,hasSeedSnapshot:seedsFrozen,hasGroups,hasMatches,registrationCount})
  const links=await supabaseAdmin.from('competition_series_event_tournament_links').select('event_division_id').eq('club_id',clubId).eq('tournament_id',tournamentId).eq('status','ACTIVE')
  if(links.error)throw new Error('No pudimos verificar la zona horaria de la fecha.')
  let timezone:string|null=null
  if(links.data?.length){
    const divisions=await supabaseAdmin.from('competition_series_event_divisions').select('event_id').eq('club_id',clubId).in('id',links.data.map(link=>link.event_division_id))
    if(divisions.error)throw new Error('No pudimos verificar la zona horaria de la fecha.')
    const events=await supabaseAdmin.from('competition_series_events').select('timezone').eq('club_id',clubId).in('id',(divisions.data??[]).map(division=>division.event_id))
    if(events.error)throw new Error('No pudimos verificar la zona horaria de la fecha.')
    const zones=[...new Set((events.data??[]).map(event=>event.timezone))]
    if(zones.length!==1)throw new Error('El torneo tiene fechas vinculadas con zonas horarias distintas.')
    timezone=zones[0]??null
  }
  return {tournament,teams:teams.count??0,registrationCount,hasGroups,hasMatches,timezone,capabilities,seedsFrozen,fixtureGenerated,canEdit:!blockedReason,blockedReason}
}
