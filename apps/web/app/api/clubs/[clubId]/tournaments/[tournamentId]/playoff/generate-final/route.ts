import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { generateZonePlayoffFinal, PlayoffGenerationError } from '@/lib/tournamentPlayoff'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await userHasClubCapability(user.id, clubId, 'playoff:generate')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para generar la final.' }, { status: 403 })
    }

    const result = await generateZonePlayoffFinal({ clubId, tournamentId })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof PlayoffGenerationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    return NextResponse.json({ error: getErrorMessage(error, 'Error generando final.') }, { status: 500 })
  }
}
