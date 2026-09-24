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
  getExpectedPlayoffMatchCountFromRules,
  normalizePlayoffScheduleCategory,
  normalizePlayoffScheduleMatchOrder,
  normalizePlayoffSchedulePhase,
  normalizePlayoffScheduledAt,
  readPlayoffScheduleReservations,
  removePlayoffScheduleReservationFromRules,
  setMatchScheduleAssignmentInRules,
  upsertPlayoffScheduleReservationInRules,
  type PlayoffScheduleReservation,
} from '@/lib/tournamentPlayoffScheduleReservations'
import { buildCompletePlayoffSchedule, type PlayoffAutoScheduleFixedSlot } from '@/lib/tournamentPlayoffAutoScheduler'
import { normalizeScheduleConfig } from '@/lib/tournamentSchedule'
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
      assignments: readMatchScheduleAssignments(scheduleContext.rules.match_schedule_assignments),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo reservas del playoff.') }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const { clubId, tournamentId } = await context.params
    const auth = await authorize(req, clubId)
    if ('response' in auth) return auth.response
    const body = await req.json().catch(() => ({}))
    const scheduleContext = await readTournamentPlayoffSchedulingContext({ clubId, tournamentId })
    const config = normalizeScheduleConfig(scheduleContext.rules.schedule_config, {
      startDate: scheduleContext.startDate,
      endDate: scheduleContext.endDate,
    })
    if (config.mode !== 'AUTO') return NextResponse.json({ error: 'Completar calendario sólo está disponible en modo AUTO.' }, { status: 400 })
    const plan = scheduleContext.rules.playoff_plan as {
      bracket_size?: number
      bracket_slots?: Array<{ pair_order?: number; is_bye_slot?: boolean }>
      first_round_matches?: Array<{ match_order?: number; bracket_pair_order?: number }>
    } | undefined
    const bracketSize = Number(plan?.bracket_size)
    const phase = ({ 64: 'ROUND_OF_32', 32: 'ROUND_OF_16', 16: 'EIGHTHS', 8: 'QUARTER', 4: 'SEMI', 2: 'FINAL' } as const)[bracketSize as 64 | 32 | 16 | 8 | 4 | 2]
    if (!phase || !scheduleContext.category) return NextResponse.json({ error: 'El cuadro no tiene un plan compatible para completar.' }, { status: 409 })
    const { data: matches, error: matchesError } = await supabaseAdmin
      .from('tournament_matches')
      .select('id,phase,match_order,status,scheduled_at,team1_id,team2_id')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
    if (matchesError) throw new Error(matchesError.message)
    const assignments = readMatchScheduleAssignments(scheduleContext.rules.match_schedule_assignments)
    const reservations = readPlayoffScheduleReservations(scheduleContext.rules.playoff_schedule_reservations)
    const fixedSlots: PlayoffAutoScheduleFixedSlot[] = []
    for (const match of matches ?? []) {
      const assignment = assignments[match.id]
      const normalizedPhase = normalizePlayoffSchedulePhase(match.phase)
      if (!normalizedPhase || !match.scheduled_at || !assignment) continue
      fixedSlots.push({ phase: normalizedPhase, matchOrder: Number(match.match_order), scheduledAt: match.scheduled_at, courtName: assignment.court_name, courtId: assignment.court_id, courtSource: assignment.court_source })
    }
    for (const reservation of Object.values(reservations)) {
      fixedSlots.push({ phase: reservation.phase, matchOrder: reservation.match_order, scheduledAt: reservation.scheduled_at, courtName: reservation.court_name, courtId: reservation.court_id, courtSource: reservation.court_source })
    }
    const byePairOrders = (plan?.bracket_slots ?? []).filter((slot) => slot.is_bye_slot).map((slot) => Number(slot.pair_order)).filter(Number.isInteger)
    const result = buildCompletePlayoffSchedule({
      category: scheduleContext.category,
      bracketSize,
      date: config.playoff.date,
      startTime: config.playoff.start_time,
      endTime: config.playoff.end_time,
      matchDurationMinutes: config.match_duration_minutes,
      courts: normalizeTournamentCourts(scheduleContext.rules.tournament_courts),
      firstRoundPairOrders: (plan?.first_round_matches ?? []).map((match) => Number(match.bracket_pair_order)).filter(Number.isInteger),
      byePairOrders,
      fixedSlots,
    })
    if (result.blocker) return NextResponse.json({ error: 'El playoff completo no entra en la ventana configurada.', ...result.blocker }, { status: 409 })
    const durationMs = config.match_duration_minutes * 60_000
    const configuredCourts = normalizeTournamentCourts(scheduleContext.rules.tournament_courts)
    const occupied = new Set<string>()
    const teamStarts = new Map<string, number[]>()
    for (const match of matches ?? []) {
      if (!match.scheduled_at) continue
      const assignment = assignments[match.id]
      if (assignment) occupied.add(`${assignment.court_id ?? assignment.court_name}:${match.scheduled_at}`)
      for (const teamId of [match.team1_id, match.team2_id]) {
        const starts = teamStarts.get(teamId) ?? []
        starts.push(Date.parse(match.scheduled_at))
        teamStarts.set(teamId, starts)
      }
    }
    for (const reservation of Object.values(reservations)) occupied.add(`${reservation.court_id ?? reservation.court_name}:${reservation.scheduled_at}`)
    const [groupYear, groupMonth, groupDay] = config.groups.date.split('-').map(Number)
    const [groupHour, groupMinute] = config.groups.start_time.split(':').map(Number)
    const [endHour, endMinute] = config.groups.end_time.split(':').map(Number)
    const groupStart = new Date(groupYear, groupMonth - 1, groupDay, groupHour, groupMinute).getTime()
    const groupEnd = new Date(groupYear, groupMonth - 1, groupDay, endHour, endMinute).getTime()
    const groupAssignments: MatchScheduleAssignment[] = []
    for (const match of (matches ?? []).filter((candidate) => candidate.phase === 'GROUP' && candidate.status === 'PENDING' && !candidate.scheduled_at)) {
      let selected: MatchScheduleAssignment | null = null
      for (let time = groupStart; time + durationMs <= groupEnd && !selected; time += durationMs) {
        const teamsReady = [match.team1_id, match.team2_id].every((teamId) => (teamStarts.get(teamId) ?? []).every((start) => Math.abs(start - time) >= durationMs * 2))
        if (!teamsReady) continue
        for (const court of configuredCourts) {
          const scheduledAt = new Date(time).toISOString()
          if (occupied.has(`${court.id ?? court.name}:${scheduledAt}`)) continue
          selected = { match_id: match.id, scheduled_at: scheduledAt, court_name: court.name, ...(court.id ? { court_id: court.id } : {}), court_source: court.source, schedule_origin: 'AUTO' }
          occupied.add(`${court.id ?? court.name}:${scheduledAt}`)
          for (const teamId of [match.team1_id, match.team2_id]) teamStarts.set(teamId, [...(teamStarts.get(teamId) ?? []), time])
          break
        }
      }
      if (!selected) return NextResponse.json({ error: 'Los partidos de grupos faltantes no entran en la ventana configurada.', code: 'PLAYOFF_SCHEDULE_CAPACITY_INSUFFICIENT' }, { status: 409 })
      groupAssignments.push(selected)
    }
    const realBySlot = new Map((matches ?? []).map((match) => [`${match.phase}:${match.match_order}`, match]))
    const missing = result.reservations.filter((reservation) => {
      const real = realBySlot.get(`${reservation.phase}:${reservation.match_order}`)
      return real ? !real.scheduled_at : !reservations[buildPlayoffScheduleReservationKey({ category: reservation.category, phase: reservation.phase, matchOrder: reservation.match_order })]
    })
    const preservedCount = (matches ?? []).filter((match) => Boolean(match.scheduled_at)).length + Object.keys(reservations).length
    if (body?.preview === true) return NextResponse.json({ ok: true, willSchedule: missing.length + groupAssignments.length, preservedCount })
    if (missing.length === 0 && groupAssignments.length === 0) {
      return NextResponse.json({
        ok: true,
        scheduledCount: 0,
        preservedCount,
        assignments,
        reservations,
      })
    }
    let nextRules = scheduleContext.rules
    const updates: Array<{ id: string; scheduled_at: string; previous: string | null }> = []
    for (const reservation of missing) {
      const real = realBySlot.get(`${reservation.phase}:${reservation.match_order}`)
      if (real) {
        const assignment: MatchScheduleAssignment = { match_id: real.id, scheduled_at: reservation.scheduled_at, court_name: reservation.court_name, ...(reservation.court_id ? { court_id: reservation.court_id } : {}), court_source: reservation.court_source, schedule_origin: 'AUTO' }
        nextRules = setMatchScheduleAssignmentInRules({ rules: nextRules, assignment, playoffIdentity: { category: scheduleContext.category, phase: reservation.phase, matchOrder: reservation.match_order } })
        updates.push({ id: real.id, scheduled_at: reservation.scheduled_at, previous: real.scheduled_at })
      } else {
        nextRules = upsertPlayoffScheduleReservationInRules(nextRules, { ...reservation, schedule_origin: 'AUTO' })
      }
    }
    for (const assignment of groupAssignments) {
      nextRules = setMatchScheduleAssignmentInRules({ rules: nextRules, assignment })
      const real = (matches ?? []).find((match) => match.id === assignment.match_id)
      updates.push({ id: assignment.match_id, scheduled_at: assignment.scheduled_at, previous: real?.scheduled_at ?? null })
    }
    for (const update of updates) {
      const { error } = await supabaseAdmin.from('tournament_matches').update({ scheduled_at: update.scheduled_at }).eq('id', update.id).eq('club_id', clubId).eq('tournament_id', tournamentId).eq('status', 'PENDING')
      if (error) throw new Error(error.message)
    }
    const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({ tournamentId, clubId, expectedUpdatedAt: scheduleContext.updatedAt, rules: nextRules })
    if (!persisted) {
      await Promise.all(updates.map((update) => supabaseAdmin.from('tournament_matches').update({ scheduled_at: update.previous }).eq('id', update.id)))
      return NextResponse.json({ error: 'La programación cambió en paralelo; reintentá.' }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      scheduledCount: missing.length + groupAssignments.length,
      preservedCount,
      assignments: readMatchScheduleAssignments(nextRules.match_schedule_assignments),
      reservations: readPlayoffScheduleReservations(nextRules.playoff_schedule_reservations),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error completando el calendario.') }, { status: 500 })
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
      const requestedDay = scheduledAt.slice(0, 10)
      if (!scheduleContext.startDate || !scheduleContext.endDate || requestedDay < scheduleContext.startDate || requestedDay > scheduleContext.endDate) {
        return NextResponse.json({ error: 'Ampliá primero las fechas del torneo para programar este partido.' }, { status: 400 })
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
        schedule_origin: 'MANUAL',
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
