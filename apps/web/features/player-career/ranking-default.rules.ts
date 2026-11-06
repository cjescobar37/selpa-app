import type { RankingContext } from './player-career.types'
export type PersonalRankingDefault = { context: RankingContext; published: boolean; club: { id:string; name:string; logo_url:string|null; theme_key:string|null } } | null
/** Pair awards are evidence of actual pair competition. Individual projections
 * can also contain those players, so never infer an individual contribution. */
export function choosePersonalRanking(contexts:RankingContext[], pairDivisionIds:string[], seasons:string[], membership:{category:number|null;gender:string|null}) {
  for (const season of seasons) {
    let candidates=contexts.filter(c=>c.seasonId===season)
    if (!candidates.length) continue
    const matching=candidates.filter(c=>(membership.category===null||c.category===membership.category)&&(membership.gender===null||c.gender===membership.gender||c.gender==='MIXED'))
    if (matching.length) candidates=matching
    const pairs=candidates.filter(c=>c.modality==='PAIRS' && pairDivisionIds.includes(c.divisionId))
    if (pairs.length) return pairs.length===1 ? pairs[0] : null
    const activePairs=candidates.filter(c=>c.modality==='PAIRS')
    if(activePairs.length) return activePairs.length===1 ? activePairs[0] : null
    const singles=candidates.filter(c=>c.modality==='INDIVIDUAL' && c.gender!=='MIXED' && !c.segmentId)
    return singles.length===1 ? singles[0] : null
  }
  return null
}
