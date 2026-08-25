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
    const { data, error } = await auth.client.rpc('get_competition_series_ranking', { p_club_id: clubId, p_series_id: seriesId })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    const ranking = ((data ?? []) as Array<CompetitionSeriesRankingRow & { ranking_position?: number }>).map(({ ranking_position, ...row }) => ({ ...row, position: Number(ranking_position) }))
    return NextResponse.json({ ranking })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
