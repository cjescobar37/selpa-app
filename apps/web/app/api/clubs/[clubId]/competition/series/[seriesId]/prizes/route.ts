import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { readSeriesJson, seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { rpc } from '@/features/competition/series/competition-series.repository'
import type { CompetitionSeriesPrize } from '@/features/competition/series/competition-series.types'
import { isUuid, validatePrizes } from '@/features/competition/series/competition-series.validation'

type Context = { params: Promise<{ clubId: string; seriesId: string }> }

export async function GET(req: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionSeries(req, clubId, 'read')
  if (auth.error || !auth.client) return auth.error
  const { data, error } = await auth.client.from('competition_series_prizes').select('*').eq('club_id', clubId).eq('series_id', seriesId).order('sort_order').order('position_from')
  if (error) return seriesErrorResponse(Object.assign(new Error(error.message), { code: error.code }))
  return NextResponse.json({ prizes: data ?? [] })
}

export async function PUT(req: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionSeries(req, clubId, 'write')
  if (auth.error || !auth.client) return auth.error
  const body = await readSeriesJson(req)
  if ('error' in body) return body.error
  const validation = validatePrizes(body.value)
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
  try {
    const prizes = await rpc<CompetitionSeriesPrize[]>(auth.client, 'replace_competition_series_prizes', { p_club_id: clubId, p_series_id: seriesId, p_series_revision: validation.value.seriesRevision, p_prizes: validation.value.prizes })
    return NextResponse.json({ prizes, seriesRevision: validation.value.seriesRevision + 1 })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
