import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { isUuid } from '@/features/competition/series/competition-series.validation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichCompetitionRankingAvatars } from '@/features/competition/ranking/competition-ranking.avatars'

type Context = { params: Promise<{ clubId: string; seriesId: string }> }
type CompetitionSeriesRankingRow = {
  position: number
  series_division_id?: string
  club_player_id: string
  player_id: string
  display_name: string
  avatar_url: string | null
  points: number
  events_played: number
  titles: number
}

function isMissingPairRankingResource(error: { code?: string; message?: string } | null, resource: string) {
  return Boolean(error && ['PGRST202', 'PGRST205', '42P01'].includes(error.code ?? '') &&
    (error.message ?? '').includes(resource))
}

export async function GET(request: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const byDivision = request.nextUrl.searchParams.get('scope') === 'division'
  const includePairs = request.nextUrl.searchParams.get('include') === 'pairs'
  const auth = await authorizeCompetitionSeries(request, clubId, 'read')
  if (auth.error || !auth.client) return auth.error
  try {
    const seriesResult = await auth.client.from('competition_series').select('status').eq('club_id', clubId).eq('id', seriesId).maybeSingle()
    if (seriesResult.error) throw Object.assign(new Error(seriesResult.error.message), { code: seriesResult.error.code })
    if (!seriesResult.data) return NextResponse.json({ error: 'Circuito inexistente.' }, { status: 404 })
    if (seriesResult.data.status === 'CLOSED') {
      const finalResult = await auth.client.from('competition_series_final_rankings')
        .select('series_division_id,ranking_position,club_player_id,player_id,display_name,avatar_url,points,events_played,titles')
        .eq('club_id', clubId).eq('series_id', seriesId).order('series_division_id').order('ranking_position')
      if (finalResult.error) throw Object.assign(new Error(finalResult.error.message), { code: finalResult.error.code })
      const ranking = (finalResult.data ?? []).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
      if (!includePairs) {
        const enriched = await enrichCompetitionRankingAvatars(supabaseAdmin, ranking, [])
        return NextResponse.json({ ranking: enriched.individual, finalized: true })
      }
      const pairResult = await auth.client.from('competition_series_final_pair_rankings')
        .select('season_id,series_division_id,division_id,ranking_position,player1_user_id,player2_user_id,player1_name,player2_name,player1_avatar_url,player2_avatar_url,pair_key,points,events_played,titles,finals,semifinals')
        .eq('club_id', clubId).eq('series_id', seriesId).order('series_division_id').order('ranking_position')
      if (pairResult.error && !isMissingPairRankingResource(pairResult.error, 'competition_series_final_pair_rankings')) {
        throw Object.assign(new Error(pairResult.error.message), { code: pairResult.error.code })
      }
      const pairs = (pairResult.data ?? []).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
      const enriched = await enrichCompetitionRankingAvatars(supabaseAdmin, ranking, pairs)
      return NextResponse.json({ ranking: enriched.individual, individual: enriched.individual, pairs: enriched.pairs, pairsUnavailable: Boolean(pairResult.error), finalized: true })
    }
    const { data, error } = await auth.client.rpc(byDivision ? 'get_competition_series_ranking_by_division' : 'get_competition_series_ranking', { p_club_id: clubId, p_series_id: seriesId })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    const ranking = ((data ?? []) as Array<CompetitionSeriesRankingRow & { ranking_position?: number }>).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
    if (!includePairs) {
      const enriched = await enrichCompetitionRankingAvatars(supabaseAdmin, ranking, [])
      return NextResponse.json({ ranking: enriched.individual, finalized: false })
    }
    const pairResult = await auth.client.rpc('get_competition_series_pair_ranking', { p_club_id: clubId, p_series_id: seriesId })
    if (pairResult.error && !isMissingPairRankingResource(pairResult.error, 'get_competition_series_pair_ranking')) {
      throw Object.assign(new Error(pairResult.error.message), { code: pairResult.error.code })
    }
    const pairs = ((pairResult.data ?? []) as Array<{ ranking_position: number; player1_user_id?: string; player2_user_id?: string } & Record<string, unknown>>)
      .map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
    const enriched = await enrichCompetitionRankingAvatars(supabaseAdmin, ranking, pairs)
    return NextResponse.json({ ranking: enriched.individual, individual: enriched.individual, pairs: enriched.pairs, pairsUnavailable: Boolean(pairResult.error), finalized: false })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
