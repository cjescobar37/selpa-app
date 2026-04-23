import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  generateGroupMatchesForTournament,
  TournamentGroupMatchesGenerationError,
} from '@/lib/tournamentGroupMatchesGeneration'

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
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para generar partidos de grupos.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const result = await generateGroupMatchesForTournament({ clubId, tournamentId })

    return NextResponse.json(
      {
        ok: true,
        tournamentId,
        groupsCount: result.groupsCount,
        matchesCreated: result.matchesCreated,
        perGroupCounts: result.perGroupCounts,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof TournamentGroupMatchesGenerationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: getErrorMessage(error, 'Error generando partidos de grupos.') },
      { status: 500 }
    )
  }
}
