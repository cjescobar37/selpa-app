import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCompetitionSeriesListSummaries, type CompetitionSeriesSummaryEvent } from './competition-series-list-summary'
import type { CompetitionSeries, CompetitionSeriesDetail, CompetitionSeriesListItem } from './competition-series.types'

function fail(operation:string,error:{message:string;code?:string}|null) { const wrapped=new Error(`${operation}: ${error?.message ?? 'error desconocido'}`); return Object.assign(wrapped,{code:error?.code}) }
export async function listSeries(client:SupabaseClient,clubId:string,seasonId?:string|null):Promise<CompetitionSeriesListItem[]> {
  let query=client.from('competition_series').select('id,club_id,season_id,name,code,description,starts_on,ends_on,status,planned_events_count,minimum_events_count,is_public,revision,archived_at,created_at,updated_at').eq('club_id',clubId).order('created_at',{ascending:false})
  if (seasonId) query=query.eq('season_id',seasonId)
  const {data,error}=await query
  if(error) throw fail('No pude listar los circuitos',error)
  const series=(data??[]) as CompetitionSeries[]
  if(!series.length)return []

  const seriesIds=series.map((item)=>item.id)
  const eventsResult=await client
    .from('competition_series_events')
    .select('id,series_id,status,planned_starts_at')
    .eq('club_id',clubId)
    .in('series_id',seriesIds)
    .order('sequence')
  if(eventsResult.error)throw fail('No pude resumir las fechas de los circuitos',eventsResult.error)

  const baseEvents=(eventsResult.data??[]) as Array<{id:string;series_id:string;status:string;planned_starts_at:string|null}>
  if(!baseEvents.length){
    const summaries=buildCompetitionSeriesListSummaries(series,[])
    return series.map((item)=>({...item,summary:summaries[item.id]}))
  }

  const eventIds=baseEvents.map((event)=>event.id)
  const divisions=await client
    .from('competition_series_event_divisions')
    .select('id,event_id')
    .eq('club_id',clubId)
    .in('event_id',eventIds)
  if(divisions.error)throw fail('No pude resumir las divisiones de las fechas',divisions.error)

  const divisionIds=(divisions.data??[]).map((division)=>division.id)
  const links=divisionIds.length
    ? await client
        .from('competition_series_event_tournament_links')
        .select('event_division_id,tournament_id,created_at')
        .eq('club_id',clubId)
        .in('event_division_id',divisionIds)
        .eq('status','ACTIVE')
        .order('created_at',{ascending:false})
    : {data:[],error:null}
  if(links.error)throw fail('No pude resumir los torneos de las fechas',links.error)

  const eventByDivision=new Map((divisions.data??[]).map((division)=>[division.id,division.event_id]))
  const tournamentByEvent=new Map<string,{tournamentId:string;divisionId:string}>()
  for(const link of links.data??[]){
    const eventId=eventByDivision.get(link.event_division_id)
    if(eventId&&!tournamentByEvent.has(eventId)){
      tournamentByEvent.set(eventId,{tournamentId:link.tournament_id,divisionId:link.event_division_id})
    }
  }
  const tournamentIds=[...new Set([...tournamentByEvent.values()].map((link)=>link.tournamentId))]

  const [tournaments,finals,homologations,settlements]=await Promise.all([
    tournamentIds.length
      ? client.from('tournaments').select('id,status,start_date,end_date,registration_deadline').eq('club_id',clubId).in('id',tournamentIds)
      : Promise.resolve({data:[],error:null}),
    tournamentIds.length
      ? client.from('tournament_matches').select('tournament_id,status,team1_id,team2_id,winner_team_id').eq('club_id',clubId).in('tournament_id',tournamentIds).eq('phase','FINAL')
      : Promise.resolve({data:[],error:null}),
    divisionIds.length
      ? client.from('competition_event_homologations').select('event_division_id,status,version').eq('club_id',clubId).in('event_division_id',divisionIds).order('version',{ascending:false})
      : Promise.resolve({data:[],error:null}),
    divisionIds.length
      ? client.from('competition_event_settlements').select('event_division_id,status,version').eq('club_id',clubId).in('event_division_id',divisionIds).order('version',{ascending:false})
      : Promise.resolve({data:[],error:null}),
  ])
  for(const result of [tournaments,finals,homologations,settlements]){
    if(result.error)throw fail('No pude completar el resumen de los circuitos',result.error)
  }

  const tournamentState=new Map((tournaments.data??[]).map((tournament)=>[tournament.id,tournament]))
  const sportsComplete=new Set((finals.data??[])
    .filter((match)=>String(match.status??'').toUpperCase()==='PLAYED'&&Boolean(match.winner_team_id)&&(match.winner_team_id===match.team1_id||match.winner_team_id===match.team2_id))
    .map((match)=>match.tournament_id))
  const latestHomologation=new Map<string,string>()
  for(const row of homologations.data??[]){if(!latestHomologation.has(row.event_division_id))latestHomologation.set(row.event_division_id,String(row.status))}
  const latestSettlement=new Map<string,string>()
  for(const row of settlements.data??[]){if(!latestSettlement.has(row.event_division_id))latestSettlement.set(row.event_division_id,String(row.status))}

  const summaryEvents:CompetitionSeriesSummaryEvent[]=baseEvents.map((event)=>{
    const link=tournamentByEvent.get(event.id)
    const tournament=link?tournamentState.get(link.tournamentId):null
    return {
      id:event.id,
      series_id:event.series_id,
      status:event.status,
      planned_starts_at:event.planned_starts_at,
      tournament_status:tournament?.status??null,
      tournament_registration_deadline:tournament?.registration_deadline??null,
      tournament_starts_at:tournament?.start_date??null,
      sports_complete:link?sportsComplete.has(link.tournamentId):false,
      circuit_context:link?{
        homologation_status:latestHomologation.get(link.divisionId)??null,
        settlement_status:latestSettlement.get(link.divisionId)??null,
      }:null,
    }
  })
  const summaries=buildCompetitionSeriesListSummaries(series,summaryEvents)
  return series.map((item)=>({...item,summary:summaries[item.id]}))
}
export async function getSeriesDetail(client:SupabaseClient,clubId:string,seriesId:string):Promise<CompetitionSeriesDetail> {
  const {data:series,error}=await client.from('competition_series').select('*').eq('club_id',clubId).eq('id',seriesId).maybeSingle()
  if(error) throw fail('No pude leer el circuito',error); if(!series) throw Object.assign(new Error('Circuito inexistente.'),{code:'P0002'})
  const {data:divisions,error:divisionError}=await client.from('competition_series_divisions').select('*,division:competition_divisions!competition_series_divisions_division_fkey(id,modality,branch:competition_branches(name,slug),segment:competition_segments(name,slug),category:competition_categories(name,legacy_category_id))').eq('club_id',clubId).eq('series_id',seriesId).order('sort_order')
  if(divisionError) throw fail('No pude leer las divisiones',divisionError)
  const ids=(divisions??[]).map((item)=>item.id); const rules=ids.length ? await client.from('competition_series_rules').select('*').in('series_division_id',ids).order('version',{ascending:false}) : {data:[],error:null}
  if(rules.error) throw fail('No pude leer las reglas',rules.error)
  const ruleIds=(rules.data??[]).map((item)=>item.id); const eligibility=ruleIds.length ? await client.from('competition_series_eligibility').select('*,age_category:competition_age_categories(name)').in('series_rule_id',ruleIds) : {data:[],error:null}
  if(eligibility.error) throw fail('No pude leer la elegibilidad',eligibility.error)
  const [finalization,finalRanking]=await Promise.all([
    client.rpc('get_competition_series_finalization_preflight',{p_club_id:clubId,p_series_id:seriesId}),
    client.from('competition_series_final_rankings').select('*').eq('club_id',clubId).eq('series_id',seriesId).order('series_division_id').order('ranking_position'),
  ])
  if(finalization.error)throw fail('No pude validar el cierre del circuito',finalization.error)
  if(finalRanking.error)throw fail('No pude leer el ranking final',finalRanking.error)
  const finalPairs=series.status==='CLOSED'
    ? await client.from('competition_series_final_pair_rankings').select('*').eq('club_id',clubId).eq('series_id',seriesId).order('series_division_id').order('ranking_position')
    : {data:[],error:null}
  if(finalPairs.error && !(['PGRST205','42P01'].includes(finalPairs.error.code) && finalPairs.error.message.includes('competition_series_final_pair_rankings')))
    throw fail('No pude leer el ranking final de parejas',finalPairs.error)
  return {series,divisions:(divisions??[]).map((division)=>({...division,rules:(rules.data??[]).filter((rule)=>rule.series_division_id===division.id).map((rule)=>({...rule,eligibility:(eligibility.data??[]).find((item)=>item.series_rule_id===rule.id)??null}))})),finalization:finalization.data,finalRanking:finalRanking.data??[],finalPairRanking:finalPairs.data??[]} as CompetitionSeriesDetail
}
export async function rpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T> { const {data,error}=await client.rpc(name,args); if(error) throw fail(`Falló ${name}`,error); return data as T }
export async function getSeriesRevision(client:SupabaseClient,clubId:string,seriesId:string):Promise<number>{const {data,error}=await client.from('competition_series').select('revision').eq('club_id',clubId).eq('id',seriesId).single();if(error)throw fail('No pude leer la revisión del circuito',error);return Number(data.revision)}
export async function assertSeriesDivision(client:SupabaseClient,clubId:string,seriesId:string,divisionLinkId:string) {
  const {data,error}=await client.from('competition_series_divisions').select('id').eq('club_id',clubId).eq('series_id',seriesId).eq('id',divisionLinkId).maybeSingle()
  if(error)throw fail('No pude validar la división',error);if(!data)throw Object.assign(new Error('Recurso inexistente.'),{code:'P0002'})
}
export async function assertSeriesRule(client:SupabaseClient,clubId:string,seriesId:string,ruleId:string) {
  const links=await client.from('competition_series_divisions').select('id').eq('club_id',clubId).eq('series_id',seriesId)
  if(links.error)throw fail('No pude validar el circuito',links.error)
  const ids=(links.data??[]).map((item)=>item.id);if(!ids.length)throw Object.assign(new Error('Recurso inexistente.'),{code:'P0002'})
  const {data,error}=await client.from('competition_series_rules').select('id').eq('id',ruleId).in('series_division_id',ids).maybeSingle()
  if(error)throw fail('No pude validar la regla',error);if(!data)throw Object.assign(new Error('Recurso inexistente.'),{code:'P0002'})
}
