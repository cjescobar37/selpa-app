import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionEvents } from '@/features/competition/events/competition-events.auth'
import { eventErrorResponse, readEventJson } from '@/features/competition/events/competition-events.http'
import { isUuid } from '@/features/competition/series/competition-series.validation'

type Context = { params: Promise<{ clubId: string; seriesId: string }> }

function dateCreationError(error: unknown) {
  const coded = error instanceof Error ? error as Error & { code?: string } : null
  if (coded?.code === '23514' && coded.message.includes('no admite nuevas fechas')) return NextResponse.json({ error: 'Este circuito no admite nuevas fechas.' }, { status: 409 })
  return eventErrorResponse(error)
}

export async function GET(request: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionEvents(request, clubId, 'write')
  if (auth.error || !auth.client) return auth.error
  try {
    const { data, error } = await auth.client.rpc('get_competition_date_creation_context', { p_club_id: clubId, p_series_id: seriesId })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return NextResponse.json({ context: data })
  } catch (error) {
    return dateCreationError(error)
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { clubId, seriesId } = await context.params
  if (!isUuid(clubId) || !isUuid(seriesId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  const auth = await authorizeCompetitionEvents(request, clubId, 'write')
  if (auth.error || !auth.client) return auth.error
  const body = await readEventJson(request)
  if ('error' in body) return body.error
  const value = body.value as Record<string, unknown>
  const key = typeof value.idempotencyKey === 'string' ? value.idempotencyKey.trim() : ''
  const revision = Number(value.seriesRevision)
  const ruleRevision = Number(value.ruleRevision)
  if (!isUuid(String(value.seriesDivisionId ?? '')) || !isUuid(String(value.ruleId ?? '')) || !Number.isInteger(revision) || !Number.isInteger(ruleRevision) || key.length < 8 || key.length > 200 || !value.eventPayload || !value.tournamentPayload) {
    return NextResponse.json({ error: 'La fecha del circuito no está lista para crear.' }, { status: 400 })
  }
  try {
    const { data, error } = await auth.client.rpc('create_competition_date_tournament_atomic', {
      p_club_id: clubId,
      p_series_id: seriesId,
      p_series_revision: revision,
      p_series_division_id: value.seriesDivisionId,
      p_rule_id: value.ruleId,
      p_rule_revision: ruleRevision,
      p_idempotency_key: key,
      p_event_payload: value.eventPayload,
      p_tournament_payload: value.tournamentPayload,
    })
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return NextResponse.json({ result: data }, { status: 201 })
  } catch (error) {
    return dateCreationError(error)
  }
}
