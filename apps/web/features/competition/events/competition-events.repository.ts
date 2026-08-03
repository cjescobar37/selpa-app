import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionEventDetail,CompetitionSeriesEvent } from './competition-events.types'
function fail(op:string,error:{message:string;code?:string}|null){return Object.assign(new Error(`${op}: ${error?.message??'error'}`),{code:error?.code})}
export async function eventRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>){const {data,error}=await client.rpc(name,args);if(error)throw fail(name,error);return data as T}
export async function listEvents(client:SupabaseClient,clubId:string,seriesId:string){const {data,error}=await client.from('competition_series_events').select('*').eq('club_id',clubId).eq('series_id',seriesId).order('sequence');if(error)throw fail('list events',error);return data??[]}
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
