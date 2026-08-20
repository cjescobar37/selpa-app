import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompetitionSeriesDetail } from './competition-series.types'

function fail(operation:string,error:{message:string;code?:string}|null) { const wrapped=new Error(`${operation}: ${error?.message ?? 'error desconocido'}`); return Object.assign(wrapped,{code:error?.code}) }
export async function listSeries(client:SupabaseClient,clubId:string,seasonId?:string|null) {
  let query=client.from('competition_series').select('*').eq('club_id',clubId).order('created_at',{ascending:false})
  if (seasonId) query=query.eq('season_id',seasonId)
  const {data,error}=await query; if(error) throw fail('No pude listar los circuitos',error); return data ?? []
}
export async function getSeriesDetail(client:SupabaseClient,clubId:string,seriesId:string):Promise<CompetitionSeriesDetail> {
  const {data:series,error}=await client.from('competition_series').select('*').eq('club_id',clubId).eq('id',seriesId).maybeSingle()
  if(error) throw fail('No pude leer el circuito',error); if(!series) throw Object.assign(new Error('Circuito inexistente.'),{code:'P0002'})
  const {data:divisions,error:divisionError}=await client.from('competition_series_divisions').select('*,division:competition_divisions(id,modality,branch:competition_branches(name),segment:competition_segments(name),category:competition_categories(name))').eq('club_id',clubId).eq('series_id',seriesId).order('sort_order')
  if(divisionError) throw fail('No pude leer las divisiones',divisionError)
  const ids=(divisions??[]).map((item)=>item.id); const rules=ids.length ? await client.from('competition_series_rules').select('*').in('series_division_id',ids).order('version',{ascending:false}) : {data:[],error:null}
  if(rules.error) throw fail('No pude leer las reglas',rules.error)
  const ruleIds=(rules.data??[]).map((item)=>item.id); const eligibility=ruleIds.length ? await client.from('competition_series_eligibility').select('*,age_category:competition_age_categories(name)').in('series_rule_id',ruleIds) : {data:[],error:null}
  if(eligibility.error) throw fail('No pude leer la elegibilidad',eligibility.error)
  return {series,divisions:(divisions??[]).map((division)=>({...division,rules:(rules.data??[]).filter((rule)=>rule.series_division_id===division.id).map((rule)=>({...rule,eligibility:(eligibility.data??[]).find((item)=>item.series_rule_id===rule.id)??null}))}))} as CompetitionSeriesDetail
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
