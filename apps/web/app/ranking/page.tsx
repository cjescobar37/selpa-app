import PublicRankingExperience from '@/components/public/PublicRankingExperience'
import { redirect } from 'next/navigation'
import { readPublicClubs, readPublicClub, readRankingContexts, readRankingPage, readPairRankingPage } from '@/features/player-career/player-career.repository'
import { pageNumber, validId } from '@/features/player-career/player-career.rules'
import type { RankingPage } from '@/features/player-career/player-career.types'
export const dynamic='force-dynamic'
export type RankingSearch={clubId?:string;club?:string;category?:string;gender?:string;season?:string;division?:string;modality?:string;q?:string;page?:string;clubsPage?:string}
export default async function RankingPublicPage({searchParams}:{searchParams?:Promise<RankingSearch>}) {
  const params=await searchParams ?? {};const clubId=params.clubId ?? params.club
  const clubs=clubId ? await readPublicClub(clubId) : await readPublicClubs(pageNumber(params.clubsPage))
  const contexts=validId(clubId) ? await readRankingContexts(clubId,params.season) : []
  const modality=params.modality==='PAIRS' || params.modality==='PAIR' ? 'PAIRS':'INDIVIDUAL'
  const requested=contexts.find(c=>c.divisionId===params.division)
  const context=(params.division ? requested?.modality===modality ? requested : requested ?
    contexts.find(c=>c.modality===modality && c.category===requested.category && c.gender===requested.gender):undefined:
    contexts.find(c=>c.modality===modality && (!params.category || String(c.category)===params.category) && (!params.gender || c.gender===params.gender))) ?? null
  const canonical=context ? {...params,clubId:context.clubId,division:context.divisionId,season:context.seasonId,gender:context.gender,category:context.category===null?'':String(context.category),modality}:params
  if (context && Object.entries(canonical).some(([key,value])=>params[key as keyof RankingSearch]!==value)) {
    redirect('/ranking?'+new URLSearchParams(Object.fromEntries(Object.entries(canonical).filter(([,value])=>value!==undefined)) as Record<string,string>))
  }
  let ranking:RankingPage={rows:[],count:0,page:pageNumber(params.page),pageSize:25,context}
  let pairs:Awaited<ReturnType<typeof readPairRankingPage>>={rows:[],count:0}
  let error=false
  try {if (modality==='PAIRS') pairs=await readPairRankingPage(context,params.q,pageNumber(params.page));else ranking=await readRankingPage(context,params.q,pageNumber(params.page))}
  catch {error=true}
  return <PublicRankingExperience clubs={clubs.clubs} clubsCount={clubs.count} contexts={contexts} ranking={ranking} pairs={pairs.rows}
    total={modality==='PAIRS'?pairs.count:ranking.count} params={canonical} error={error}/>
}
