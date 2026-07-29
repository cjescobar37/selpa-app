import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionCatalog } from '@/features/competition/catalogs/competition-catalogs.auth'
import { competitionCatalogErrorResponse } from '@/features/competition/catalogs/competition-catalogs.http'
import {
  createEventTier,
  getEventTier,
  listEventTiers,
  updateEventTier,
} from '@/features/competition/catalogs/competition-catalogs.repository'
import { isUuid, validateEventTierInput } from '@/features/competition/catalogs/competition-catalogs.validation'

type RouteContext = { params: Promise<{ clubId: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400 })

  const auth = await authorizeCompetitionCatalog(req, clubId, 'read')
  if (auth.error) return auth.error

  try {
    return NextResponse.json({ eventTiers: await listEventTiers(clubId) })
  } catch (error: unknown) {
    return competitionCatalogErrorResponse(error)
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400 })

  const auth = await authorizeCompetitionCatalog(req, clubId, 'write')
  if (auth.error) return auth.error
  if (!auth.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const validation = validateEventTierInput(await req.json().catch(() => null))
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 })

  try {
    const eventTier = await createEventTier(clubId, auth.user.id, validation.value)
    return NextResponse.json({ ok: true, eventTier }, { status: 201 })
  } catch (error: unknown) {
    return competitionCatalogErrorResponse(error)
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return NextResponse.json({ error: 'Club inválido.' }, { status: 400 })

  const auth = await authorizeCompetitionCatalog(req, clubId, 'write')
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isUuid((body as Record<string, unknown>).id)) {
    return NextResponse.json({ error: 'La jerarquía de evento es inválida.' }, { status: 400 })
  }

  const id = String((body as Record<string, unknown>).id)
  try {
    const current = await getEventTier(clubId, id)
    const validation = validateEventTierInput({ ...current, ...body })
    if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
    const eventTier = await updateEventTier(clubId, id, validation.value)
    return NextResponse.json({ ok: true, eventTier })
  } catch (error: unknown) {
    return competitionCatalogErrorResponse(error)
  }
}
