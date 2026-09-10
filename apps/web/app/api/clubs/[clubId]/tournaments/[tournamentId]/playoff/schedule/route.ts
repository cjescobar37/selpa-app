import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  normalizeTournamentCourts,
  readMatchScheduleAssignments,
  type TournamentCourtConfig,
} from '@/lib/tournamentSchedule'
import {
  buildPlayoffScheduleReservationKey,
  getExpectedPlayoffMatchCountFromRules,
  normalizePlayoffScheduleCategory,
  normalizePlayoffScheduleMatchOrder,
  normalizePlayoffSchedulePhase,
  normalizePlayoffScheduledAt,
  readPlayoffScheduleReservations,
  removePlayoffScheduleReservationFromRules,
  upsertPlayoffScheduleReservationInRules,
  type PlayoffScheduleReservation,
} from '@/lib/tournamentPlayoffScheduleReservations'
import {
  cleanupFuturePlayoffReservationForRealMatch,
  persistTournamentPlayoffSchedulingRulesIfCurrent,
  readTournamentPlayoffSchedulingContext,
} from '@/lib/tournamentPlayoffScheduleServer'

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

function sameCourt(
  left: Pick<PlayoffScheduleReservation, 'court_id' | 'court_name' | 'court_source'>,
  right: Pick<PlayoffScheduleReservation, 'court_id' | 'court_name' | 'court_source'>
) {
  if (left.court_id && right.court_id) return left.court_id === right.court_id
  return left.court_source === right.court_source &&
    left.court_name.trim().toLowerCase() === right.court_name.trim().toLowerCase()
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

  if (courtId) {
    return input.courts.find((court) => court.id === courtId) ?? null
  }
  if (!courtName) return null
  return input.courts.find((court) =>
    court.name.trim().toLowerCase() === courtName.toLowerCase() &&
    (!courtSource || court.source === courtSource)
  ) ?? null
}

async function findRealMatch(input: {
  clubId: string
  tournamentId: string
  phase: string
  matchOrder: number
}) {
  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id')
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .eq('phase', input.phase)
    .eq('match_order', input.matchOrder)
    .maybeSingle()

  if (error) throw new Error(`No pude validar el slot futuro: ${error.message}`)
  return data?.id ? String(data.id) : null
}

async function authorize(req: NextRequest, clubId: string) {
  const user = await getTokenUser(req)
  if (!user) return { response: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }) }
  const canSchedule = await userHasClubCapability(user.id, clubId, 'matches:schedule')
  if (!canSchedule) {
    return { response: NextResponse.json({ error: 'No autorizado para programar el playoff.' }, { status: 403 }) }
  }
  return { user }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const { clubId, tournamentId } = await context.params
    const auth = await authorize(req, clubId)
    if ('response' in auth) return auth.response

    const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
    const reservations = readPlayoffScheduleReservations(scheduleContext.rules.playoff_schedule_reservations)
    const filtered = Object.fromEntries(
      Object.entries(reservations).filter(([, reservation]) => reservation.category === scheduleContext.category)
    )

    return NextResponse.json({
      category: scheduleContext.category,
      reservations: filtered,
      courts: normalizeTournamentCourts(scheduleContext.rules.tournament_courts),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo reservas del playoff.') }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const { clubId, tournamentId } = await context.params
    const auth = await authorize(req, clubId)
    if ('response' in auth) return auth.response

    const body = await req.json().catch(() => ({}))
    const category = normalizePlayoffScheduleCategory(body?.category)
    const phase = normalizePlayoffSchedulePhase(body?.phase)
    const matchOrder = normalizePlayoffScheduleMatchOrder(body?.match_order)
    const scheduledAt = normalizePlayoffScheduledAt(body?.scheduled_at)
    if (!category || !phase || !matchOrder || !scheduledAt) {
      return NextResponse.json({ error: 'category, phase, match_order y scheduled_at son obligatorios y válidos.' }, { status: 400 })
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
      if (!scheduleContext.category || category !== scheduleContext.category) {
        return NextResponse.json({ error: 'La categoría no corresponde a este torneo.' }, { status: 400 })
      }

      const expectedMatches = getExpectedPlayoffMatchCountFromRules(scheduleContext.rules, phase)
      if (!expectedMatches || matchOrder > expectedMatches) {
        return NextResponse.json({ error: 'El slot solicitado no existe en el cuadro actual.' }, { status: 400 })
      }

      const realMatchId = await findRealMatch({ clubId, tournamentId, phase, matchOrder })
      if (realMatchId) {
        return NextResponse.json(
          { error: 'El partido ya está materializado; editá el horario del match real.', match_id: realMatchId },
          { status: 409 }
        )
      }

      const courts = normalizeTournamentCourts(scheduleContext.rules.tournament_courts)
      const court = resolveConfiguredCourt({
        courts,
        courtId: body?.court_id,
        courtName: body?.court_name,
        courtSource: body?.court_source,
      })
      if (!court) {
        return NextResponse.json({ error: 'La cancha no pertenece a la configuración de este torneo.' }, { status: 400 })
      }

      const reservation: PlayoffScheduleReservation = {
        category,
        phase,
        match_order: matchOrder,
        scheduled_at: scheduledAt,
        court_name: court.name,
        ...(court.id ? { court_id: court.id } : {}),
        court_source: court.source,
      }
      const key = buildPlayoffScheduleReservationKey({ category, phase, matchOrder })
      const existingReservations = readPlayoffScheduleReservations(scheduleContext.rules.playoff_schedule_reservations)
      const assignments = readMatchScheduleAssignments(scheduleContext.rules.match_schedule_assignments)
      const reservationCollision = Object.entries(existingReservations).find(([candidateKey, candidate]) =>
        candidateKey !== key && candidate.scheduled_at === scheduledAt && sameCourt(candidate, reservation)
      )
      const assignmentCollision = Object.values(assignments).find((assignment) =>
        assignment.scheduled_at === scheduledAt && sameCourt(assignment, reservation)
      )
      if (reservationCollision || assignmentCollision) {
        return NextResponse.json({ error: 'La cancha ya está ocupada en ese horario.' }, { status: 409 })
      }

      const nextRules = upsertPlayoffScheduleReservationInRules(scheduleContext.rules, reservation)
      const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
        tournamentId,
        clubId,
        expectedUpdatedAt: scheduleContext.updatedAt,
        rules: nextRules,
      })
      if (!persisted) continue

      // Si el match apareció justo después del write, la reserva deja de ser válida.
      const materializedMatchId = await findRealMatch({ clubId, tournamentId, phase, matchOrder })
      if (materializedMatchId) {
        await cleanupFuturePlayoffReservationForRealMatch({
          tournamentId,
          clubId,
          phase,
          matchOrder,
        })
        return NextResponse.json(
          { error: 'El partido se materializó mientras se guardaba; editá el horario del match real.', match_id: materializedMatchId },
          { status: 409 }
        )
      }

      return NextResponse.json({ ok: true, key, reservation })
    }

    return NextResponse.json({ error: 'La programación cambió en paralelo; reintentá.' }, { status: 409 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error guardando la reserva del playoff.') }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const { clubId, tournamentId } = await context.params
    const auth = await authorize(req, clubId)
    if ('response' in auth) return auth.response

    const body = await req.json().catch(() => ({}))
    const category = normalizePlayoffScheduleCategory(body?.category)
    const phase = normalizePlayoffSchedulePhase(body?.phase)
    const matchOrder = normalizePlayoffScheduleMatchOrder(body?.match_order)
    if (!category || !phase || !matchOrder) {
      return NextResponse.json({ error: 'category, phase y match_order son obligatorios.' }, { status: 400 })
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
      if (!scheduleContext.category || scheduleContext.category !== category) {
        return NextResponse.json({ error: 'La categoría no corresponde a este torneo.' }, { status: 400 })
      }

      const removal = removePlayoffScheduleReservationFromRules(scheduleContext.rules, { category, phase, matchOrder })
      if (!removal.removed) return NextResponse.json({ ok: true, removed: false })

      const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
        tournamentId,
        clubId,
        expectedUpdatedAt: scheduleContext.updatedAt,
        rules: removal.rules,
      })
      if (persisted) return NextResponse.json({ ok: true, removed: true })
    }

    return NextResponse.json({ error: 'La programación cambió en paralelo; reintentá.' }, { status: 409 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error eliminando la reserva del playoff.') }, { status: 500 })
  }
}
