import type { PairRankingRow } from '@/components/ranking/PairRankingBoard'
import type { RankingContext, SportsStanding } from './player-career.types'

export type RankingSearch = {clubId?:string;club?:string;category?:string;gender?:string;season?:string;division?:string;modality?:string;q?:string;page?:string;clubsPage?:string}
export type RankingReadIssue = 'MODEL_UNAVAILABLE' | 'READ_UNAVAILABLE'
export type RankingEntry = {
  id:string; position:number; points:number; name:string; subtitle:string; isTied:boolean;
  avatars:Array<{name:string;url:string|null}>; href:string|null;
}

/** Presentation only: never calculate points, sort by a new score, or renumber. */
export function individualRankingEntries(rows:SportsStanding[]):RankingEntry[] {
  return rows.map(row=>({id:row.club_player_id,position:row.position,points:row.ranking_points,name:row.full_name,
    subtitle:row.category_name,isTied:row.is_tied,avatars:[{name:row.full_name,url:row.avatar_url}],
    href:`/jugadores/${row.user_id}?clubId=${row.club_id}`}))
}
export function pairRankingEntries(rows:PairRankingRow[]):RankingEntry[] {
  return rows.map(row=>({id:row.partnership_id,position:row.position,points:row.combined_points,
    name:`${row.player1_name} / ${row.player2_name}`,subtitle:'Puntos logrados juntos',
    isTied:rows.some(other=>other.partnership_id!==row.partnership_id && other.position===row.position),
    avatars:[{name:row.player1_name,url:row.player1_avatar_url},{name:row.player2_name,url:row.player2_avatar_url}],href:null}))
}
export function rankingTiers(rows:RankingEntry[]) {
  return {leaders:rows.filter(row=>row.position===1),challengers:rows.filter(row=>row.position>=2 && row.position<=5),rest:rows.filter(row=>row.position>5)}
}
export function rankingHref(params:RankingSearch,overrides:Partial<Record<keyof RankingSearch,string|undefined>>={}) {
  const merged={...params,...overrides}
  return '/ranking?'+new URLSearchParams(Object.fromEntries(Object.entries(merged).filter(([,value])=>value!==undefined && value!=='')) as Record<string,string>)
}
export function rankingContext(contexts:RankingContext[],params:RankingSearch,modality:string) {
  const requested=contexts.find(c=>c.divisionId===params.division)
  if (params.division && !requested) return null
  const gender=params.gender ?? requested?.gender
  const category=requested ? requested.category : params.category ? Number(params.category) : undefined
  const available=contexts.filter(c=>c.modality===modality && (!gender || c.gender===gender) && (category===undefined || c.category===category))
  return (gender ? available[0] : available.find(c=>c.gender==='M') ?? available[0]) ?? null
}
export function rankingReadIssue(error:unknown):RankingReadIssue {
  const code=error && typeof error==='object' && 'code' in error ? String(error.code) : ''
  return ['PGRST205','PGRST202','42P01','42883'].includes(code)?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE'
}
