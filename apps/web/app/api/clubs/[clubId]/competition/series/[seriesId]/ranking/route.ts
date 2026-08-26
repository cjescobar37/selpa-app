import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { isUuid } from '@/features/competition/series/competition-series.validation'

type Context = { params: Promise<{ clubId: string; seriesId: string }> }
type CompetitionSeriesRankingRow = {
  position: number
  club_player_id: string
  player_id: string
  display_name: string
  avatar_url: string | null
  points: number
  events_played: number
  titles: number
}

export async function GET(request: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionSeries(request, clubId, 'read')
  if (auth.error || !auth.client) return auth.error
  try {
    const seriesResult = await auth.client.from('competition_series').select('status').eq('club_id', clubId).eq('id', seriesId).maybeSingle()
    if (seriesResult.error) throw Object.assign(new Error(seriesResult.error.message), { code: seriesResult.error.code })
    if (!seriesResult.data) return NextResponse.json({ error: 'Circuito inexistente.' }, { status: 404 })
    if (seriesResult.data.status === 'CLOSED') {
      const finalResult = await auth.client.from('competition_series_final_rankings')
        .select('ranking_position,club_player_id,player_id,display_name,avatar_url,points,events_played,titles')
        .eq('club_id', clubId).eq('series_id', seriesId).order('series_division_id').order('ranking_position')
      if (finalResult.error) throw Object.assign(new Error(finalResult.error.message), { code: finalResult.error.code })
      return NextResponse.json({ ranking: (finalResult.data ?? []).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) })), finalized: true })
    }
    const { data, error } = await auth.client.rpc('get_competition_series_ranking', { p_club_id: clubId, p_series_id: seriesId })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    const ranking = ((data ?? []) as Array<CompetitionSeriesRankingRow & { ranking_position?: number }>).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
    return NextResponse.json({ ranking, finalized: false })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
