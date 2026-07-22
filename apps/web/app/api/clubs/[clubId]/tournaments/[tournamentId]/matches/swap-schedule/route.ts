import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { readMatchScheduleAssignments, type MatchScheduleAssignment } from '@/lib/tournamentSchedule'

type TournamentRow = {
  id: string
  club_id: string
  rules_json: Record<string, unknown> | null
}

type MatchRow = {
  id: string
  club_id: string
  tournament_id: string
  status: string | null
  score: Record<string, unknown> | null
  winner_team_id: string | null
  scheduled_at: string | null
}

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasLoadedScore(score: Record<string, unknown> | null) {
  if (!score) return false
  return Object.keys(score).length > 0
}

function isPendingWithoutResult(match: MatchRow) {
  return String(match.status ?? '').toUpperCase() === 'PENDING' &&
    !match.winner_team_id &&
    !hasLoadedScore(match.score)
}

function swapAssignment(
  sourceMatchId: string,
  targetMatchId: string,
  sourceAssignment: MatchScheduleAssignment,
  targetAssignment: MatchScheduleAssignment
) {
  return {
    [sourceMatchId]: {
      ...targetAssignment,
      match_id: sourceMatchId,
    },
    [targetMatchId]: {
      ...sourceAssignment,
      match_id: targetMatchId,
    },
  }
}

async function restoreScheduledAt(sourceMatch: MatchRow, targetMatch: MatchRow) {
  await Promise.allSettled([
    supabaseAdmin
      .from('tournament_matches')
      .update({ scheduled_at: sourceMatch.scheduled_at })
      .eq('id', sourceMatch.id)
      .eq('club_id', sourceMatch.club_id)
      .eq('tournament_id', sourceMatch.tournament_id),
    supabaseAdmin
      .from('tournament_matches')
      .update({ scheduled_at: targetMatch.scheduled_at })
      .eq('id', targetMatch.id)
      .eq('club_id', targetMatch.club_id)
      .eq('tournament_id', targetMatch.tournament_id),
  ])
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
    const canManage = await userHasClubCapability(user.id, clubId, 'matches:schedule')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para cambiar horarios del torneo.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const sourceMatchId = String(body?.sourceMatchId ?? '').trim()
    const targetMatchId = String(body?.targetMatchId ?? '').trim()

    if (!sourceMatchId || !targetMatchId) {
      return NextResponse.json({ error: 'Seleccioná el partido origen y el partido destino.' }, { status: 400 })
    }

    if (sourceMatchId === targetMatchId) {
      return NextResponse.json({ error: 'Seleccioná dos partidos distintos para intercambiar.' }, { status: 400 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,rules_json')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
    }

    const { data: matches, error: matchesError } = await supabaseAdmin
      .from('tournament_matches')
      .select('id,club_id,tournament_id,status,score,winner_team_id,scheduled_at')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .in('id', [sourceMatchId, targetMatchId])

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 500 })
    }

    const matchRows = (matches ?? []) as MatchRow[]
    const sourceMatch = matchRows.find((match) => match.id === sourceMatchId) ?? null
    const targetMatch = matchRows.find((match) => match.id === targetMatchId) ?? null

    if (!sourceMatch || !targetMatch) {
      return NextResponse.json({ error: 'Alguno de los partidos no pertenece a este torneo.' }, { status: 404 })
    }

    if (!isPendingWithoutResult(sourceMatch) || !isPendingWithoutResult(targetMatch)) {
      return NextResponse.json(
        { error: 'Solo se pueden intercambiar partidos pendientes y sin resultado cargado.' },
        { status: 400 }
      )
    }

    if (!sourceMatch.scheduled_at || !targetMatch.scheduled_at) {
      return NextResponse.json(
        { error: 'Ambos partidos deben tener horario asignado para poder intercambiar.' },
        { status: 400 }
      )
    }

    const tournamentRow = tournament as TournamentRow
    const rulesJson: Record<string, unknown> = isPlainRecord(tournamentRow.rules_json)
      ? tournamentRow.rules_json
      : {}
    const rawAssignments = isPlainRecord(rulesJson.match_schedule_assignments)
      ? rulesJson.match_schedule_assignments
      : {}
    const currentAssignments = readMatchScheduleAssignments(rulesJson.match_schedule_assignments)
    const sourceAssignment = currentAssignments[sourceMatchId]
    const targetAssignment = currentAssignments[targetMatchId]

    if (!sourceAssignment || !targetAssignment) {
      return NextResponse.json(
        { error: 'Ambos partidos deben tener cancha asignada para poder intercambiar.' },
        { status: 400 }
      )
    }

    const nextAssignments = {
      ...rawAssignments,
      ...swapAssignment(sourceMatchId, targetMatchId, sourceAssignment, targetAssignment),
    }
    const nextRulesJson = {
      ...rulesJson,
      match_schedule_assignments: nextAssignments,
    }

    const [sourceUpdate, targetUpdate] = await Promise.all([
      supabaseAdmin
        .from('tournament_matches')
        .update({ scheduled_at: targetMatch.scheduled_at })
        .eq('id', sourceMatchId)
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .select('id,scheduled_at,status')
        .single(),
      supabaseAdmin
        .from('tournament_matches')
        .update({ scheduled_at: sourceMatch.scheduled_at })
        .eq('id', targetMatchId)
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .select('id,scheduled_at,status')
        .single(),
    ])

    if (sourceUpdate.error || targetUpdate.error) {
      await restoreScheduledAt(sourceMatch, targetMatch)
      return NextResponse.json(
        { error: sourceUpdate.error?.message ?? targetUpdate.error?.message ?? 'No pude actualizar los horarios.' },
        { status: 500 }
      )
    }

    const { error: rulesUpdateError } = await supabaseAdmin
      .from('tournaments')
      .update({ rules_json: nextRulesJson })
      .eq('id', tournamentId)
      .eq('club_id', clubId)

    if (rulesUpdateError) {
      await restoreScheduledAt(sourceMatch, targetMatch)
      return NextResponse.json({ error: rulesUpdateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      matches: [sourceUpdate.data, targetUpdate.data],
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error intercambiando horario/cancha.') }, { status: 500 })
  }
}
