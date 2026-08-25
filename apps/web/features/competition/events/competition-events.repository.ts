import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionEventDetail,CompetitionSeriesEvent } from './competition-events.types'
function fail(op:string,error:{message:string;code?:string}|null){return Object.assign(new Error(`${op}: ${error?.message??'error'}`),{code:error?.code})}
export async function eventRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>){const {data,error}=await client.rpc(name,args);if(error)throw fail(name,error);return data as T}

export type TournamentCircuitContext={
  tournament_id:string
  series_id:string
  series_name:string
  event_id:string
  event_number:number|null
  planned_events_count:number|null
}

/** Resolves the persisted Competition bridge without adding data to tournaments. */
export async function getTournamentCircuitContexts(client:SupabaseClient,clubId:string,tournamentIds:string[]):Promise<Record<string,TournamentCircuitContext>>{
  const ids=[...new Set(tournamentIds.filter(Boolean))]
  if(!ids.length)return {}
  const links=await client.from('competition_series_event_tournament_links').select('tournament_id,event_division_id').eq('club_id',clubId).eq('status','ACTIVE').in('tournament_id',ids)
  if(links.error)throw fail('list tournament circuit links',links.error)
  const activeLinks=links.data??[]
  const divisionIds=[...new Set(activeLinks.map((link)=>link.event_division_id).filter(Boolean))]
  if(!divisionIds.length)return {}
  const divisions=await client.from('competition_series_event_divisions').select('id,event_id').eq('club_id',clubId).in('id',divisionIds)
  if(divisions.error)throw fail('list linked event divisions',divisions.error)
  const eventByDivision=new Map((divisions.data??[]).map((division)=>[division.id,division.event_id]))
  const eventIds=[...new Set([...eventByDivision.values()])]
  if(!eventIds.length)return {}
  const events=await client.from('competition_series_events').select('id,series_id,event_number,sequence').eq('club_id',clubId).in('id',eventIds)
  if(events.error)throw fail('list linked events',events.error)
  const eventById=new Map((events.data??[]).map((event)=>[event.id,event]))
  const seriesIds=[...new Set((events.data??[]).map((event)=>event.series_id).filter(Boolean))]
  if(!seriesIds.length)return {}
  const series=await client.from('competition_series').select('id,name,planned_events_count').eq('club_id',clubId).in('id',seriesIds)
  if(series.error)throw fail('list linked series',series.error)
  const seriesById=new Map((series.data??[]).map((item)=>[item.id,item]))
  // `sequence` is an ordering key with intentional gaps (10, 20, ...), not the
  // human-facing date number. Derive the ordinal from persisted event order.
  const orderedEvents=await client.from('competition_series_events').select('id,series_id').eq('club_id',clubId).in('series_id',seriesIds).order('sequence')
  if(orderedEvents.error)throw fail('list linked series event order',orderedEvents.error)
  const eventPositionById=new Map<string,number>()
  const orderedBySeries=new Map<string,Array<{id:string}>>()
  for(const row of (orderedEvents.data??[]) as Array<{id:string;series_id:string}>){
    const ordered=orderedBySeries.get(row.series_id)??[]
    ordered.push(row)
    orderedBySeries.set(row.series_id,ordered)
  }
  for(const ordered of orderedBySeries.values())ordered.forEach((row,index)=>eventPositionById.set(row.id,index+1))
  const contexts:Record<string,TournamentCircuitContext>={}
  for(const link of activeLinks){
    if(contexts[link.tournament_id])continue
    const eventId=eventByDivision.get(link.event_division_id)
    const event=eventId?eventById.get(eventId):null
    const parent=event?seriesById.get(event.series_id):null
    if(!event||!parent)continue
    contexts[link.tournament_id]={tournament_id:link.tournament_id,series_id:parent.id,series_name:parent.name,event_id:event.id,event_number:eventPositionById.get(event.id)??event.event_number??null,planned_events_count:parent.planned_events_count??null}
  }
  return contexts
}

export async function listEvents(client:SupabaseClient,clubId:string,seriesId:string){
  const {data,error}=await client.from('competition_series_events').select('*').eq('club_id',clubId).eq('series_id',seriesId).order('sequence')
  if(error)throw fail('list events',error)
  const events=(data??[]) as CompetitionSeriesEvent[]
  if(!events.length)return events
  const eventIds=events.map((event)=>event.id)
  const divisions=await client.from('competition_series_event_divisions').select('id,event_id').eq('club_id',clubId).in('event_id',eventIds)
  if(divisions.error)throw fail('list event divisions',divisions.error)
  const divisionIds=(divisions.data??[]).map((division)=>division.id)
  if(!divisionIds.length)return events
  const links=await client.from('competition_series_event_tournament_links').select('event_division_id,tournament_id,status,created_at').eq('club_id',clubId).in('event_division_id',divisionIds).eq('status','ACTIVE').order('created_at',{ascending:false})
  if(links.error)throw fail('list event tournament links',links.error)
  const eventByDivision=new Map((divisions.data??[]).map((division)=>[division.id,division.event_id]))
  const tournamentByEvent=new Map<string,string>()
  for(const link of links.data??[]){const eventId=eventByDivision.get(link.event_division_id);if(eventId&&!tournamentByEvent.has(eventId))tournamentByEvent.set(eventId,link.tournament_id)}
  const tournamentIds=[...new Set(tournamentByEvent.values())]
  const tournaments=tournamentIds.length?await client.from('tournaments').select('id,start_date,end_date').in('id',tournamentIds):{data:[],error:null}
  if(tournaments.error)throw fail('list linked tournaments',tournaments.error)
  const tournamentDates=new Map((tournaments.data??[]).map((tournament)=>[tournament.id,{start:tournament.start_date as string|null,end:tournament.end_date as string|null}]))
  return events.map((event)=>{const tournamentId=tournamentByEvent.get(event.id)??null,date=tournamentId?tournamentDates.get(tournamentId):null;return {...event,tournament_id:tournamentId,tournament_starts_at:date?.start??null,tournament_ends_at:date?.end??null}})
}
export async function getEventDetail(client:SupabaseClient,clubId:string,eventId:string):Promise<CompetitionEventDetail>{
  const eventResult=await client.from('competition_series_events').select('*').eq('club_id',clubId).eq('id',eventId).maybeSingle();if(eventResult.error)throw fail('event',eventResult.error);if(!eventResult.data)throw Object.assign(new Error('Evento inexistente.'),{code:'P0002'});const event=eventResult.data as CompetitionSeriesEvent
  const [series,season,divisions,history,completeness]=await Promise.all([
    client.from('competition_series').select('id,name,status,revision,planned_events_count,archived_at').eq('club_id',clubId).eq('id',event.series_id).single(),
    client.from('competition_seasons').select('id,name,status,starts_on,ends_on').eq('club_id',clubId).eq('id',event.season_id).single(),
    client.from('competition_series_event_divisions').select('*,competition_series_rules(*,competition_series_eligibility(*)),competition_event_tiers(*)').eq('club_id',clubId).eq('event_id',event.id).order('sort_order'),
    client.from('competition_series_event_schedule_history').select('*').eq('club_id',clubId).eq('event_id',event.id).order('changed_at',{ascending:false}),
    client.rpc('get_competition_series_event_completeness',{p_club_id:clubId,p_event_id:event.id})])
  for(const result of [series,season,divisions,history,completeness])if(result.error)throw fail('event detail',result.error)
  const divisionIds=(divisions.data??[]).map((item)=>item.id)
  const links=divisionIds.length?await client.from('competition_series_event_tournament_links').select('*').eq('club_id',clubId).in('event_division_id',divisionIds).order('created_at',{ascending:false}):{data:[],error:null}
  if(links.error)throw fail('event links',links.error)
  const allLinks=links.data??[]
  return {event,series:series.data as Record<string,unknown>,season:season.data as Record<string,unknown>,divisions:(divisions.data??[]).map((d)=>{const item=d as Record<string,unknown>;const own=allLinks.filter((l)=>l.event_division_id===item.id);return {...item,rule:(item.competition_series_rules??null) as Record<string,unknown>|null,tier:(item.competition_event_tiers??null) as Record<string,unknown>|null,active_tournament_link:(own.find((l)=>l.status==='ACTIVE')??null) as Record<string,unknown>|null,link_history:own as Record<string,unknown>[]}}),schedule_history:(history.data??[]) as Record<string,unknown>[],completeness:completeness.data as Record<string,unknown>}
}

type CompletionIssue={code:string;message:string}
export type EventDivisionCompletionPreflight={ready:boolean;blockers:CompletionIssue[];warnings:CompletionIssue[];tournament:{id:string;name:string;status:string|null}|null}
export async function getEventDivisionCompletionPreflight(client:SupabaseClient,clubId:string,eventId:string,eventDivisionId:string):Promise<EventDivisionCompletionPreflight>{
  const blockers:CompletionIssue[]=[],warnings:CompletionIssue[]=[]
  const division=await client.from('competition_series_event_divisions').select('id,status,event_id,competition_series_events!inner(id,status,club_id,competition_series!inner(status,club_id))').eq('club_id',clubId).eq('event_id',eventId).eq('id',eventDivisionId).maybeSingle()
  if(division.error)throw fail('division completion preflight',division.error);if(!division.data)throw Object.assign(new Error('Recurso inexistente.'),{code:'P0002'})
  const eventRelation=division.data.competition_series_events as unknown as Record<string,unknown>,seriesRelation=eventRelation.competition_series as Record<string,unknown>
  if(division.data.status!=='SCHEDULED')blockers.push({code:'DIVISION_NOT_SCHEDULED',message:'La división no está programada.'})
  if(eventRelation.status!=='SCHEDULED')blockers.push({code:'EVENT_NOT_SCHEDULED',message:'La fecha no está programada.'})
  if(seriesRelation.status!=='ACTIVE')blockers.push({code:'SERIES_NOT_ACTIVE',message:'El circuito no está activo.'})
  const link=await client.from('competition_series_event_tournament_links').select('tournament_id').eq('club_id',clubId).eq('event_division_id',eventDivisionId).eq('status','ACTIVE').maybeSingle()
  if(link.error)throw fail('division tournament link',link.error)
  if(!link.data){blockers.push({code:'TOURNAMENT_LINK_MISSING',message:'La división no tiene un torneo vinculado.'});return{ready:false,blockers,warnings,tournament:null}}
  const tournament=await client.from('tournaments').select('id,name,status,club_id').eq('id',link.data.tournament_id).maybeSingle()
  if(tournament.error)throw fail('linked tournament',tournament.error)
  if(!tournament.data||tournament.data.club_id!==clubId){blockers.push({code:'TOURNAMENT_SCOPE_INVALID',message:'El torneo vinculado no pertenece al club.'});return{ready:false,blockers,warnings,tournament:null}}
  const matches=await client.from('tournament_matches').select('id,phase,status,team1_id,team2_id,winner_team_id,match_order,created_at').eq('tournament_id',tournament.data.id)
  if(matches.error)throw fail('linked tournament matches',matches.error);const rows=matches.data??[]
  if(!rows.length)blockers.push({code:'MATCHES_MISSING',message:'El torneo todavía no tiene partidos.'})
  const incomplete=rows.filter(match=>String(match.status??'').toUpperCase()!=='PLAYED'||!match.winner_team_id)
  if(incomplete.length)blockers.push({code:'MATCHES_INCOMPLETE',message:`Quedan ${incomplete.length} partidos sin resultado definitivo.`})
  const inconsistent=rows.filter(match=>match.winner_team_id&&match.winner_team_id!==match.team1_id&&match.winner_team_id!==match.team2_id)
  if(inconsistent.length)blockers.push({code:'RESULTS_INCONSISTENT',message:'Hay resultados con un ganador que no participa del partido.'})
  const finals=rows.filter(match=>String(match.phase??'').toUpperCase()==='FINAL').sort((a,b)=>Number(b.match_order??0)-Number(a.match_order??0)||String(b.created_at??'').localeCompare(String(a.created_at??''))),final=finals[0]
  if(!final)blockers.push({code:'FINAL_MISSING',message:'El torneo todavía no tiene una final.'})
  else if(String(final.status??'').toUpperCase()!=='PLAYED'||!final.team1_id||!final.team2_id||!final.winner_team_id)blockers.push({code:'FINAL_INCOMPLETE',message:'La final todavía no tiene un campeón válido.'})
  else if(final.winner_team_id!==final.team1_id&&final.winner_team_id!==final.team2_id)blockers.push({code:'FINAL_INVALID',message:'El campeón no coincide con los finalistas.'})
  if(finals.length>1)warnings.push({code:'MULTIPLE_FINALS',message:'El torneo registra más de una final; se usará la última llave vigente.'})
  return{ready:blockers.length===0,blockers,warnings,tournament:{id:tournament.data.id,name:tournament.data.name,status:tournament.data.status}}
}
