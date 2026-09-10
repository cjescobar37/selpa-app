import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  normalizeTournamentCourts,
  readMatchScheduleAssignments,
  type MatchScheduleAssignment,
  type TournamentCourtConfig,
} from '@/lib/tournamentSchedule'
import {
  buildPlayoffScheduleReservationKey,
  normalizePlayoffSchedulePhase,
  normalizePlayoffScheduledAt,
  readPlayoffScheduleReservations,
  removeMatchScheduleAssignmentFromRules,
  setMatchScheduleAssignmentInRules,
  type PlayoffScheduleReservation,
} from '@/lib/tournamentPlayoffScheduleReservations'
import {
  persistTournamentPlayoffSchedulingRulesIfCurrent,
  readTournamentPlayoffSchedulingContext,
} from '@/lib/tournamentPlayoffScheduleServer'

type MatchRow = {
  id: string
  club_id: string
  tournament_id: string
  phase: string | null
  match_order: number | null
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

function hasLoadedScore(score: Record<string, unknown> | null) {
  return Boolean(score && Object.keys(score).length > 0)
}

function isSchedulable(match: MatchRow) {
  return String(match.status ?? '').toUpperCase() === 'PENDING' &&
    !match.winner_team_id &&
    !hasLoadedScore(match.score)
}

function resolveConfiguredCourt(input: {
  courts: TournamentCourtConfig[]
  courtId: unknown
  courtName: unknown
  courtSource: unknown
}) {
  const courtId = String(input.courtId ?? '').trim()
  const courtName = String(input.courtName ?? '').trim()
  const courtSource = String(input.courtSource ?? '').trim().toUpperCase()
  if (courtId) return input.courts.find((court) => court.id === courtId) ?? null
  if (!courtName) return null
  return input.courts.find((court) =>
    court.name.trim().toLowerCase() === courtName.toLowerCase() &&
    (!courtSource || court.source === courtSource)
  ) ?? null
}

function sameCourt(
  left: Pick<PlayoffScheduleReservation, 'court_id' | 'court_name' | 'court_source'>,
  right: Pick<PlayoffScheduleReservation, 'court_id' | 'court_name' | 'court_source'>
) {
  if (left.court_id && right.court_id) return left.court_id === right.court_id
  return left.court_source === right.court_source &&
    left.court_name.trim().toLowerCase() === right.court_name.trim().toLowerCase()
}

async function authorize(req: NextRequest, clubId: string) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const canSchedule = await userHasClubCapability(user.id, clubId, 'matches:schedule')
  if (!canSchedule) return NextResponse.json({ error: 'No autorizado para cambiar horarios del torneo.' }, { status: 403 })
  return null
}

async function readMatch(input: { clubId: string; tournamentId: string; matchId: string }) {
  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,club_id,tournament_id,phase,match_order,status,score,winner_team_id,scheduled_at')
    .eq('id', input.matchId)
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el partido: ${error.message}`)
  return data ? data as MatchRow : null
}

async function restoreScheduledAtIfStill(input: {
  clubId: string
  tournamentId: string
  matchId: string
  expectedCurrent: string | null
  restore: string | null
}) {
  let query = supabaseAdmin
    .from('tournament_matches')
    .update({ scheduled_at: input.restore })
    .eq('id', input.matchId)
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)

  query = input.expectedCurrent === null
    ? query.is('scheduled_at', null)
    : query.eq('scheduled_at', input.expectedCurrent)
  await query
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string; id: string }> }
) {
  const { clubId, tournamentId, id: matchId } = await context.params
  let originalScheduledAt: string | null = null
  let requestedScheduledAt: string | null = null

  try {
    const authResponse = await authorize(req, clubId)
    if (authResponse) return authResponse

    const initialMatch = await readMatch({ clubId, tournamentId, matchId })
    if (!initialMatch) return NextResponse.json({ error: 'Partido no encontrado para este torneo.' }, { status: 404 })
    if (!isSchedulable(initialMatch)) {
      return NextResponse.json({ error: 'Solo se puede programar un partido pendiente y sin resultado.' }, { status: 400 })
    }
    originalScheduledAt = initialMatch.scheduled_at

    const body = await req.json().catch(() => ({}))
    const scheduledAt = normalizePlayoffScheduledAt(body?.scheduled_at)
    if (!scheduledAt) return NextResponse.json({ error: 'scheduled_at inválido.' }, { status: 400 })
    requestedScheduledAt = scheduledAt

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const match = await readMatch({ clubId, tournamentId, matchId })
      if (!match || !isSchedulable(match)) {
        await restoreScheduledAtIfStill({ clubId, tournamentId, matchId, expectedCurrent: scheduledAt, restore: originalScheduledAt })
        return NextResponse.json({ error: 'El partido dejó de estar disponible para programación.' }, { status: 409 })
      }

      const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
      const court = resolveConfiguredCourt({
        courts: normalizeTournamentCourts(scheduleContext.rules.tournament_courts),
        courtId: body?.court_id,
        courtName: body?.court_name,
        courtSource: body?.court_source,
      })
      if (!court) {
        return NextResponse.json({ error: 'La cancha no pertenece a la configuración de este torneo.' }, { status: 400 })
      }

      const nextAssignment: MatchScheduleAssignment = {
        match_id: match.id,
        scheduled_at: scheduledAt,
        court_name: court.name,
        ...(court.id ? { court_id: court.id } : {}),
        court_source: court.source,
      }
      const phase = normalizePlayoffSchedulePhase(match.phase)
      const playoffIdentity = phase && scheduleContext.category && match.match_order
        ? { category: scheduleContext.category, phase, matchOrder: match.match_order }
        : null
      const ownReservationKey = playoffIdentity
        ? buildPlayoffScheduleReservationKey(playoffIdentity)
        : null
      const currentAssignments = readMatchScheduleAssignments(scheduleContext.rules.match_schedule_assignments)
      const reservations = readPlayoffScheduleReservations(scheduleContext.rules.playoff_schedule_reservations)
      const assignmentCollision = Object.values(currentAssignments).find((assignment) =>
        assignment.match_id !== match.id && assignment.scheduled_at === scheduledAt && sameCourt(assignment, nextAssignment)
      )
      const reservationCollision = Object.entries(reservations).find(([reservationKey, reservation]) =>
        reservationKey !== ownReservationKey &&
        reservation.scheduled_at === scheduledAt &&
        sameCourt(reservation, nextAssignment)
      )
      if (assignmentCollision || reservationCollision) {
        await restoreScheduledAtIfStill({ clubId, tournamentId, matchId, expectedCurrent: scheduledAt, restore: originalScheduledAt })
        return NextResponse.json({ error: 'La cancha ya está ocupada en ese horario.' }, { status: 409 })
      }

      const nextRules = setMatchScheduleAssignmentInRules({
        rules: scheduleContext.rules,
        assignment: nextAssignment,
        playoffIdentity,
      })

      const { data: updatedMatch, error: matchUpdateError } = await supabaseAdmin
        .from('tournament_matches')
        .update({ scheduled_at: scheduledAt })
        .eq('id', match.id)
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .eq('status', 'PENDING')
        .is('winner_team_id', null)
        .select('id')
        .maybeSingle()
      if (matchUpdateError) return NextResponse.json({ error: matchUpdateError.message }, { status: 500 })
      if (!updatedMatch?.id) {
        return NextResponse.json({ error: 'El partido dejó de estar disponible para programación.' }, { status: 409 })
      }

      const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
        tournamentId,
        clubId,
        expectedUpdatedAt: scheduleContext.updatedAt,
        rules: nextRules,
      })
      if (persisted) return NextResponse.json({ ok: true, assignment: nextAssignment })
    }

    await restoreScheduledAtIfStill({
      clubId,
      tournamentId,
      matchId,
      expectedCurrent: requestedScheduledAt,
      restore: originalScheduledAt,
    })
    return NextResponse.json({ error: 'La programación cambió en paralelo; reintentá.' }, { status: 409 })
  } catch (error: unknown) {
    if (requestedScheduledAt !== null) {
      await restoreScheduledAtIfStill({
        clubId,
        tournamentId,
        matchId,
        expectedCurrent: requestedScheduledAt,
        restore: originalScheduledAt,
      }).catch(() => undefined)
    }
    return NextResponse.json({ error: getErrorMessage(error, 'Error actualizando horario/cancha.') }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string; id: string }> }
) {
  const { clubId, tournamentId, id: matchId } = await context.params
  let originalScheduledAt: string | null = null

  try {
    const authResponse = await authorize(req, clubId)
    if (authResponse) return authResponse

    const initialMatch = await readMatch({ clubId, tournamentId, matchId })
    if (!initialMatch) return NextResponse.json({ error: 'Partido no encontrado para este torneo.' }, { status: 404 })
    if (!isSchedulable(initialMatch)) {
      return NextResponse.json({ error: 'Solo se puede desprogramar un partido pendiente y sin resultado.' }, { status: 400 })
    }
    originalScheduledAt = initialMatch.scheduled_at

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const match = await readMatch({ clubId, tournamentId, matchId })
      if (!match || !isSchedulable(match)) {
        await restoreScheduledAtIfStill({ clubId, tournamentId, matchId, expectedCurrent: null, restore: originalScheduledAt })
        return NextResponse.json({ error: 'El partido dejó de estar disponible para programación.' }, { status: 409 })
      }

      const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
      const phase = normalizePlayoffSchedulePhase(match.phase)
      const playoffIdentity = phase && scheduleContext.category && match.match_order
        ? { category: scheduleContext.category, phase, matchOrder: match.match_order }
        : null
      const nextRules = removeMatchScheduleAssignmentFromRules({
        rules: scheduleContext.rules,
        matchId: match.id,
        playoffIdentity,
      })

      const { data: updatedMatch, error: matchUpdateError } = await supabaseAdmin
        .from('tournament_matches')
        .update({ scheduled_at: null })
        .eq('id', match.id)
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .eq('status', 'PENDING')
        .is('winner_team_id', null)
        .select('id')
        .maybeSingle()
      if (matchUpdateError) return NextResponse.json({ error: matchUpdateError.message }, { status: 500 })
      if (!updatedMatch?.id) {
        return NextResponse.json({ error: 'El partido dejó de estar disponible para programación.' }, { status: 409 })
      }

      const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
        tournamentId,
        clubId,
        expectedUpdatedAt: scheduleContext.updatedAt,
        rules: nextRules,
      })
      if (persisted) return NextResponse.json({ ok: true })
    }

    await restoreScheduledAtIfStill({ clubId, tournamentId, matchId, expectedCurrent: null, restore: originalScheduledAt })
    return NextResponse.json({ error: 'La programación cambió en paralelo; reintentá.' }, { status: 409 })
  } catch (error: unknown) {
    await restoreScheduledAtIfStill({
      clubId,
      tournamentId,
      matchId,
      expectedCurrent: null,
      restore: originalScheduledAt,
    }).catch(() => undefined)
    return NextResponse.json({ error: getErrorMessage(error, 'Error quitando horario/cancha.') }, { status: 500 })
  }
}
