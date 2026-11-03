import { NextRequest, NextResponse } from 'next/server'
import { authorizeCompetitionCatalog } from '@/features/competition/catalogs/competition-catalogs.auth'
import { validId } from '@/features/player-career/player-career.rules'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const headers = { 'Cache-Control': 'private, no-store' }
const fields = 'id,name,slug,is_active,is_visible,updated_at'
const slugs = ['caballeros', 'damas', 'mixto']
type Context = { params: Promise<{ clubId: string }> }
const failure = (error: string, status: number) => NextResponse.json({ error }, { status, headers })

export async function GET(req: NextRequest, { params }: Context) {
  const { clubId } = await params
  if (!validId(clubId)) return failure('Club inválido.', 400)
  const auth = await authorizeCompetitionCatalog(req, clubId, 'write')
  if (auth.error) return auth.error
  const read = await supabaseAdmin.from('competition_branches').select(fields).eq('club_id', clubId).in('slug', slugs).order('sort_order')
  if (read.error) return failure('No pudimos leer las ramas.', 503)
  return NextResponse.json({ branches: read.data ?? [] }, { headers })
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { clubId } = await params
  if (!validId(clubId)) return failure('Club inválido.', 400)
  const auth = await authorizeCompetitionCatalog(req, clubId, 'write')
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null)
  if (!validId(body?.id) || typeof body?.visible !== 'boolean' || typeof body?.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return failure('Rama o versión inválida.', 400)
  // Existing publication flag only. Does not activate branches, publish seasons,
  // change divisions, create rankings or modify Tournament Engine eligibility.
  const write = await supabaseAdmin.from('competition_branches').update({ is_visible: body.visible })
    .eq('club_id', clubId).eq('id', body.id).in('slug', slugs).eq('is_active', true).eq('updated_at', body.expectedUpdatedAt).select(fields).maybeSingle()
  if (write.error) return failure('No pudimos guardar la visibilidad.', 503)
  if (!write.data) return failure('La rama cambió o ya no está activa. Volvé a cargar.', 409)
  return NextResponse.json({ branch: write.data }, { headers })
}
