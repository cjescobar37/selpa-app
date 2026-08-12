import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { isUuid } from '@/features/competition/series/competition-series.validation'
import { rpc } from '@/features/competition/series/competition-series.repository'

type Context = { params: Promise<{ clubId: string }> }

export async function POST(request: NextRequest, context: Context) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionSeries(request, clubId, 'write')
  if (auth.error || !auth.client) return auth.error

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? ''
  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'La configuración del circuito es inválida.' }, { status: 400 })
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json({ error: 'La solicitud no se puede identificar.' }, { status: 400 })
  }

  try {
    const result = await rpc<{ series_id: string; status: string; reused: boolean }>(
      auth.client,
      'create_competition_series_from_wizard',
      { p_club_id: clubId, p_idempotency_key: idempotencyKey, p_payload: payload },
    )
    return NextResponse.json({ seriesId: result.series_id, status: result.status, reused: result.reused }, { status: 201 })
  } catch (error) {
    return seriesErrorResponse(error)
  }
}
