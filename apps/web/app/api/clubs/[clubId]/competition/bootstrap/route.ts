import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionSeries } from '@/features/competition/series/competition-series.auth'
import { seriesErrorResponse } from '@/features/competition/series/competition-series.http'
import { isUuid } from '@/features/competition/series/competition-series.validation'
import { bootstrapCompetitionEnvironment } from '@/features/competition/bootstrap/competition-bootstrap.service'

type Context = { params: Promise<{ clubId: string }> }
export async function POST(req: NextRequest, context: Context) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionSeries(req, clubId, 'write')
  if (auth.error || !auth.client) return auth.error
  try {
    const body = await req.json().catch(() => ({})) as { schemeId?: string }
    return NextResponse.json({ ok: true, ...(await bootstrapCompetitionEnvironment(auth.client, clubId, body.schemeId)) })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'POINTS_SCHEME_REQUIRED') {
      return NextResponse.json({ error: 'Antes de inicializar el circuito, configurá cómo se otorgan los puntos.', setupRequired: true, action: 'CREATE_POINTS_SCHEME', url: '/club/competition/points-schemes' }, { status: 412 })
    }
    if (error instanceof Error && error.message === 'POINTS_SCHEME_SELECTION_REQUIRED') {
      return NextResponse.json({ error: 'Elegí qué esquema de puntos querés usar.', setupRequired: true, action: 'SELECT_POINTS_SCHEME' }, { status: 409 })
    }
    return seriesErrorResponse(error)
  }
}
