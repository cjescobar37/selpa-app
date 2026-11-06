import { NextRequest, NextResponse } from 'next/server'
import { authorizeClubRankingRead } from '@/features/player-career/club-ranking.access'
import { readPairRankingPage, readPublicClub, readPublishedRankingContexts, readPublicRankingSeasons, readRankingContexts, readRankingPage, readRankingBranches, readRankingContextPublished } from '@/features/player-career/player-career.repository'
import { rankingContext, rankingReadIssue, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import { pageNumber, validId } from '@/features/player-career/player-career.rules'
import type { PublicRankingExperienceProps } from '@/components/public/PublicRankingExperience'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params
  if (!validId(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400, headers })
  const auth = await authorizeClubRankingRead(req, clubId)
  if (auth.error) return auth.error
  try {
    const search: RankingSearch = { clubId, scope: 'club' }
    for (const key of ['category', 'gender', 'season', 'division', 'modality', 'q', 'page'] as const) search[key] = req.nextUrl.searchParams.get(key) ?? undefined
    const modality = search.modality === 'PAIRS' ? 'PAIRS' : 'INDIVIDUAL'
    const [clubs, available, seasons, enabledBranches] = await Promise.all([
      readPublicClub(clubId), readRankingContexts(clubId, search.season, auth.access), readPublicRankingSeasons(clubId, auth.access), readRankingBranches(clubId, auth.access),
    ])
    const contexts = await readPublishedRankingContexts(available, auth.access)
    const context = rankingContext(contexts, search, modality)
    const page = pageNumber(search.page)
    const ranking = modality === 'INDIVIDUAL' ? await readRankingPage(context, search.q, page, auth.access) : { rows: [], count: 0, page, pageSize: 25, context }
    const pairs = modality === 'PAIRS' ? await readPairRankingPage(context, search.q, page, auth.access) : { rows: [], count: 0 }
    const privateSeason = Boolean(context && seasons.find(s => s.id === context.seasonId)?.is_public === false)
    const unpublishedContext = Boolean(context && !privateSeason && !await readRankingContextPublished(context))
    const canonical: RankingSearch = context ? { ...search, modality, season: context.seasonId, division: context.divisionId, gender: context.gender, category: context.category === null ? undefined : String(context.category) } : { ...search, modality }
    const data: PublicRankingExperienceProps = {
      clubs: clubs.clubs, clubsCount: clubs.count, contexts, ranking, pairs: pairs.rows, total: modality === 'PAIRS' ? pairs.count : ranking.count,
      params: canonical, error: null, presentation: { counts: { M: null, F: null }, leaderPoints: null }, seasons,
      privateSeason, unpublishedContext,
      enabledBranches,
    }
    return NextResponse.json(data, { headers })
  } catch (error) {
    return NextResponse.json({ error: 'No pudimos leer el ranking oficial.', code: rankingReadIssue(error) }, { status: 503, headers })
  }
}
