import PublicRankingExperience from '@/components/public/PublicRankingExperience'
import RankingDefaultBoundary from '@/components/ranking/RankingDefaultBoundary'
import { redirect } from 'next/navigation'
import { readRankingDirectory, readPublicClub, readRankingContexts, readPublicRankingSeasons, readPublishedRankingContexts, readRankingPage, readPairRankingPage, readRankingBranches } from '@/features/player-career/player-career.repository'
import { pageNumber, validId } from '@/features/player-career/player-career.rules'
import { rankingContext, rankingHref, rankingReadIssue, rankingSearchParams, hasRankingSelection, type RankingSearch, type RankingReadIssue } from '@/features/player-career/public-ranking.presentation'
import type { RankingContext, RankingPage } from '@/features/player-career/player-career.types'
import {sportsDemoEnabled} from '@/features/preview-sports-demo/demo-data'
import PreviewSportsNotice from '@/components/public/PreviewSportsNotice'
export type { RankingSearch } from '@/features/player-career/public-ranking.presentation'
export const dynamic='force-dynamic'
export default async function RankingPublicPage({searchParams}:{searchParams?:Promise<RankingSearch>}) {
  const params=rankingSearchParams(await searchParams ?? {}),clubId=params.clubId ?? params.club
  const modality=params.modality==='PAIRS' ? 'PAIRS':'INDIVIDUAL'
  let clubs:{clubs:Array<{id:string;name:string;logo_url:string|null;theme_key:string|null;categoryCount?:number|null}>;count:number}={clubs:[],count:0}
  let contexts:RankingContext[]=[],error:RankingReadIssue|null=null
  let seasons:Awaited<ReturnType<typeof readPublicRankingSeasons>>=[]
  let enabledBranches:Awaited<ReturnType<typeof readRankingBranches>>|undefined
  try {clubs=clubId ? await readPublicClub(clubId) : await readRankingDirectory(pageNumber(params.clubsPage))}
  catch (failure) {error=rankingReadIssue(failure)}
  if (!error && validId(clubId) && clubs.clubs.length) {
    try {[contexts,seasons,enabledBranches]=await Promise.all([readRankingContexts(clubId,params.season),readPublicRankingSeasons(clubId),readRankingBranches(clubId)])}
    catch (failure) {error=rankingReadIssue(failure)}
    if (!error) {
      try {contexts=await readPublishedRankingContexts(contexts)}
      catch (failure) {error=rankingReadIssue(failure)}
    }
  }
  const context=rankingContext(contexts,params,modality)
  const canonical=context ? {...params,club:undefined,clubId:context.clubId,division:context.divisionId,season:context.seasonId,gender:context.gender,category:context.category===null?undefined:String(context.category),modality}: {...params,modality}
  // /ranking always remains public, even if somebody supplies scope=club.
  canonical.scope=undefined
  if (context && hasRankingSelection(params) && Object.entries(canonical).some(([key,value])=>params[key as keyof RankingSearch]!==value)) redirect(rankingHref(canonical))
  let ranking:RankingPage={rows:[],count:0,page:pageNumber(params.page),pageSize:25,context}
  let pairs:Awaited<ReturnType<typeof readPairRankingPage>>={rows:[],count:0}
  const presentation:{counts:{M:number|null;F:number|null};leaderPoints:number|null}={counts:{M:null,F:null},leaderPoints:null}
  if (!error && context) {
    try {
      if (modality==='PAIRS') pairs=await readPairRankingPage(context,params.q,pageNumber(params.page))
      else ranking=await readRankingPage(context,params.q,pageNumber(params.page))
    } catch (failure) {error=rankingReadIssue(failure)}
  }
  if (error) console.warn('[selpa-public-ranking]',{clubId:validId(clubId)?clubId:null,issue:error})
  const board = <PublicRankingExperience clubs={clubs.clubs} clubsCount={clubs.count} contexts={contexts} ranking={ranking} pairs={pairs.rows}
    total={modality==='PAIRS'?pairs.count:ranking.count} params={canonical} error={error} presentation={presentation} seasons={seasons} enabledBranches={enabledBranches}/>
  return <>{sportsDemoEnabled()&&(error==='MODEL_UNAVAILABLE'||clubs.clubs.some(c=>c.categoryCount===null))?<PreviewSportsNotice/>:null}
    {!hasRankingSelection(params) ? <RankingDefaultBoundary requestedClubId={clubId} board={{clubs:clubs.clubs,clubsCount:clubs.count,contexts,ranking,pairs:pairs.rows,total:modality==='PAIRS'?pairs.count:ranking.count,params:canonical,error,presentation,seasons,enabledBranches}}>{board}</RankingDefaultBoundary> : board}</>
}
