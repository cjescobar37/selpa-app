import type { PairRankingRow } from '@/components/ranking/PairRankingBoard'
import type { RankingContext, SportsStanding } from './player-career.types'

export type RankingSearch = {clubId?:string;club?:string;category?:string;gender?:string;season?:string;division?:string;modality?:string;q?:string;page?:string;clubsPage?:string;demo?:string;scope?:string}
export type RankingReadIssue = 'MODEL_UNAVAILABLE' | 'READ_UNAVAILABLE'
export type RankingEntry = {
  id:string; position:number; points:number; name:string; subtitle:string; isTied:boolean;
  avatars:Array<{name:string;url:string|null}>; href:string|null; userIds?:string[];
}

/** Next search params can contain arrays; the UI and SQL reader must agree on
 * the same bounded string instead of throwing while rendering a public URL. */
export function rankingSearchParams(input:Record<string,unknown>):RankingSearch {
  const result:RankingSearch={}
  for (const key of ['clubId','club','category','gender','season','division','modality','q','page','clubsPage'] as const) {
    const value=Array.isArray(input[key])?input[key][0]:input[key]
    if (typeof value==='string') result[key]=value.slice(0,key==='q'?80:128)
  }
  return result
}

/** Presentation only: never calculate points, sort by a new score, or renumber. */
export function individualRankingEntries(rows:SportsStanding[]):RankingEntry[] {
  return rows.map(row=>({id:row.club_player_id,position:row.position,points:row.ranking_points,name:row.full_name,
    subtitle:row.category_name,isTied:row.is_tied,avatars:[{name:row.full_name,url:row.avatar_url}],
    href:`/jugadores/${row.user_id}?clubId=${row.club_id}`,userIds:[row.user_id]}))
}
export function pairRankingEntries(rows:PairRankingRow[]):RankingEntry[] {
  return rows.map(row=>({id:row.partnership_id,position:row.position,points:row.combined_points,
    name:`${row.player1_name} / ${row.player2_name}`,subtitle:'Puntos logrados juntos',
    isTied:rows.some(other=>other.partnership_id!==row.partnership_id && other.position===row.position),
    avatars:[{name:row.player1_name,url:row.player1_avatar_url},{name:row.player2_name,url:row.player2_avatar_url}],href:null,
    userIds:[row.player1_user_id,row.player2_user_id]}))
}
export function rankingTiers(rows:RankingEntry[]) {
  return {leaders:rows.filter(row=>row.position>=1 && row.position<=3),challengers:rows.filter(row=>row.position>=4 && row.position<=5),rest:rows.filter(row=>row.position>5)}
}
export function rankingHref(params:RankingSearch,overrides:Partial<Record<keyof RankingSearch,string|undefined>>={}) {
  const merged={...params,...overrides}
  return (params.demo==='1'?'/preview/demo?':params.scope==='club'?'/club/ranking?':'/ranking?')+new URLSearchParams(Object.fromEntries(Object.entries(merged).filter(([key,value])=>key!=='scope' && value!==undefined && value!=='')) as Record<string,string>)
}
/** Keep the same category number, never reuse a division from another branch. */
export function rankingBranchHref(params:RankingSearch,gender:'M'|'F'|'MIXED',currentCategory?:number|null,contexts?:RankingContext[]) {
  const requested=params.category ?? (currentCategory == null ? undefined : String(currentCategory))
  const compatible=!contexts || contexts.some(c=>c.gender===gender && c.modality===(params.modality ?? 'PAIRS') && String(c.category)===requested)
  return rankingHref(params,{gender,division:undefined,category:compatible?requested:undefined,page:undefined})
}
export function rankingContext(contexts:RankingContext[],params:RankingSearch,modality:string) {
  const requested=contexts.find(c=>c.divisionId===params.division)
  if (params.division && !requested) return null
  const gender=params.gender ?? requested?.gender ?? (contexts.some(c=>c.modality===modality && c.gender==='M')?'M':contexts.find(c=>c.modality===modality)?.gender ?? 'M')
  const category=requested ? requested.category : params.category ? Number(params.category) : undefined
  const available=contexts.filter(c=>c.modality===modality && (!gender || c.gender===gender) && (category===undefined || c.category===category))
  if (contexts.some(c=>c.rankedCount!==undefined)) {
    // Prefer a populated category within the chosen branch. Configured empty
    // divisions stay selectable; a default never switches Caballeros to Damas.
    if (requested && requested.modality===modality && (!gender || requested.gender===gender)) return requested
    return available
      .sort((a,b)=>(b.rankedCount ?? 0)-(a.rankedCount ?? 0)||a.divisionId.localeCompare(b.divisionId))[0] ?? null
  }
  return (gender ? available[0] : available.find(c=>c.gender==='M') ?? available[0]) ?? null
}
export function rankingReadIssue(error:unknown):RankingReadIssue {
  const code=error && typeof error==='object' && 'code' in error ? String(error.code) : ''
  return ['PGRST205','PGRST202','42P01','42883','HTTP404'].includes(code)?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE'
}
