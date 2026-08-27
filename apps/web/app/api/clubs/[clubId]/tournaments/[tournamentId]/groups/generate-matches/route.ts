import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  generateTournamentGroupsAndFixtureAtomic,
  TournamentGroupsFixtureAtomicError,
} from '@/lib/tournamentGroupsFixtureAtomic'

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
      return NextResponse.json({ error: 'No autorizado para generar partidos de grupos.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const result = await generateTournamentGroupsAndFixtureAtomic({ token, clubId, tournamentId })

    return NextResponse.json(
      {
        ok: true,
        tournamentId,
        groupsCount: result.groupCount,
        matchesCreated: result.matchesCreated,
        scheduleApplied: false,
        scheduleCapacity: null,
        generationStatus: result.status,
      },
      { status: result.status === 'ALREADY_GENERATED' ? 200 : 201 }
    )
  } catch (error: unknown) {
    if (error instanceof TournamentGroupsFixtureAtomicError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      )
    }

    console.error('[groups/generate-matches] unexpected error', getErrorMessage(error, 'unknown'))
    return NextResponse.json({ error: 'No pudimos generar los grupos y partidos.', code: 'TOURNAMENT_GROUPS_GENERATION_FAILED' }, { status: 500 })
  }
}
