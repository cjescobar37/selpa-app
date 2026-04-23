import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { updateMatchResult, type MatchScore } from '@/lib/tournamentMatches'
import { validateStructuredMatchScore } from '@/lib/tournamentScore'

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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string; id: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId, id } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para cargar resultados.' }, { status: 403 })
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from('tournament_matches')
      .select('id,tournament_id,club_id,status,team1_id,team2_id,phase')
      .eq('id', id)
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 })
    }

    if (!current) {
      return NextResponse.json({ error: 'Partido no encontrado para este torneo.' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const validation = validateStructuredMatchScore(body?.score, current.phase ?? 'GROUP')

    if (!validation.ok) {
      return NextResponse.json({ code: validation.code, error: validation.error }, { status: 400 })
    }

    const derivedWinnerTeamId = validation.winnerSide === 'team1' ? current.team1_id : current.team2_id
    const manualWinnerTeamId = typeof body?.winner_team_id === 'string' ? body.winner_team_id : null

    if (manualWinnerTeamId && manualWinnerTeamId !== derivedWinnerTeamId) {
      return NextResponse.json(
        { code: 'WINNER_MISMATCH', error: 'El ganador enviado no coincide con el score cargado.' },
        { status: 400 }
      )
    }

    const result = await updateMatchResult({
      matchId: id,
      status: 'PLAYED',
      score: validation.score as unknown as MatchScore,
      winnerTeamId: derivedWinnerTeamId,
    })

    return NextResponse.json({ ok: true, match: result.match })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error cargando resultado del partido.') }, { status: 500 })
  }
}
