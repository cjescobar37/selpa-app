import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { generateTournamentSeedSnapshot, TournamentSeedingError } from '@/lib/tournamentTeamSeeding'

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
      return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await userHasClubCapability(user.id, clubId, 'groups:generate')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para generar seed.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const result = await generateTournamentSeedSnapshot({
      clubId,
      tournamentId,
      userId: user.id,
    })

    return NextResponse.json(
      {
        ok: true,
        tournamentId,
        snapshotAt: result.snapshotAt,
        seededTeamsCount: result.generatedCount,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof TournamentSeedingError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: getErrorMessage(error, 'Error generando seed del torneo.') },
      { status: 500 }
    )
  }
}
