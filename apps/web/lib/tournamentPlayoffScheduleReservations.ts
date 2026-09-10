import {
  readMatchScheduleAssignments,
  type MatchScheduleAssignment,
} from './tournamentSchedule'

export const PLAYOFF_SCHEDULE_PHASES = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'EIGHTHS',
  'QUARTER',
  'SEMI',
  'FINAL',
] as const

export type PlayoffSchedulePhase = (typeof PLAYOFF_SCHEDULE_PHASES)[number]
export type PlayoffScheduleCategory = string | number
export type PlayoffScheduleReservation = {
  category: string
  phase: PlayoffSchedulePhase
  match_order: number
  scheduled_at: string
  court_name: string
  court_id?: string
  court_source: 'OWN_CLUB' | 'EXTERNAL_COMPLEX'
}

type PlayoffSlotIdentity = {
  category: PlayoffScheduleCategory
  phase: PlayoffSchedulePhase | string
  matchOrder: number
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

export function normalizePlayoffScheduleCategory(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return normalizeText(value)
}

export function normalizePlayoffSchedulePhase(value: unknown): PlayoffSchedulePhase | null {
  const phase = String(value ?? '').trim().toUpperCase()
  return PLAYOFF_SCHEDULE_PHASES.includes(phase as PlayoffSchedulePhase)
    ? phase as PlayoffSchedulePhase
    : null
}

export function normalizePlayoffScheduleMatchOrder(value: unknown) {
  const order = Number(value)
  return Number.isInteger(order) && order > 0 ? order : null
}

export function normalizePlayoffScheduledAt(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function buildPlayoffScheduleReservationKey(input: PlayoffSlotIdentity) {
  const category = normalizePlayoffScheduleCategory(input.category)
  const phase = normalizePlayoffSchedulePhase(input.phase)
  const matchOrder = normalizePlayoffScheduleMatchOrder(input.matchOrder)
  if (!category || !phase || !matchOrder) {
    throw new Error('Identidad de slot de playoff inválida.')
  }
  return `category:${encodeURIComponent(category)}:${phase}:${matchOrder}`
}

export function resolveTournamentPlayoffScheduleCategory(input: {
  category_id?: unknown
  category?: unknown
}) {
  return normalizePlayoffScheduleCategory(input.category_id)
    ?? normalizePlayoffScheduleCategory(input.category)
}

export function readPlayoffScheduleReservations(value: unknown) {
  const safeValue = isPlainRecord(value) ? value : {}
  return Object.entries(safeValue).reduce<Record<string, PlayoffScheduleReservation>>((acc, [key, entry]) => {
    if (!isPlainRecord(entry)) return acc
    const category = normalizePlayoffScheduleCategory(entry.category)
    const phase = normalizePlayoffSchedulePhase(entry.phase)
    const matchOrder = normalizePlayoffScheduleMatchOrder(entry.match_order)
    const scheduledAt = normalizePlayoffScheduledAt(entry.scheduled_at)
    const courtName = normalizeText(entry.court_name)
    if (!category || !phase || !matchOrder || !scheduledAt || !courtName) return acc

    const expectedKey = buildPlayoffScheduleReservationKey({ category, phase, matchOrder })
    if (expectedKey !== key) return acc

    acc[key] = {
      category,
      phase,
      match_order: matchOrder,
      scheduled_at: scheduledAt,
      court_name: courtName,
      ...(normalizeText(entry.court_id) ? { court_id: normalizeText(entry.court_id) ?? undefined } : {}),
      court_source: normalizeText(entry.court_source) === 'EXTERNAL_COMPLEX'
        ? 'EXTERNAL_COMPLEX'
        : 'OWN_CLUB',
    }
    return acc
  }, {})
}

export function getPlayoffScheduleReservation(
  rules: Record<string, unknown>,
  identity: PlayoffSlotIdentity
) {
  const key = buildPlayoffScheduleReservationKey(identity)
  return readPlayoffScheduleReservations(rules.playoff_schedule_reservations)[key] ?? null
}

function withReservationMap(
  rules: Record<string, unknown>,
  reservations: Record<string, unknown>
) {
  if (Object.keys(reservations).length > 0) {
    return { ...rules, playoff_schedule_reservations: reservations }
  }
  const nextRules = { ...rules }
  delete nextRules.playoff_schedule_reservations
  return nextRules
}

export function upsertPlayoffScheduleReservationInRules(
  rules: Record<string, unknown>,
  reservation: PlayoffScheduleReservation
) {
  const key = buildPlayoffScheduleReservationKey({
    category: reservation.category,
    phase: reservation.phase,
    matchOrder: reservation.match_order,
  })
  const rawReservations = isPlainRecord(rules.playoff_schedule_reservations)
    ? rules.playoff_schedule_reservations
    : {}
  return {
    ...rules,
    playoff_schedule_reservations: {
      ...rawReservations,
      [key]: reservation,
    },
  }
}

export function removePlayoffScheduleReservationFromRules(
  rules: Record<string, unknown>,
  identity: PlayoffSlotIdentity
) {
  const key = buildPlayoffScheduleReservationKey(identity)
  const rawReservations = isPlainRecord(rules.playoff_schedule_reservations)
    ? { ...rules.playoff_schedule_reservations }
    : {}
  const existed = Object.prototype.hasOwnProperty.call(rawReservations, key)
  delete rawReservations[key]
  return {
    rules: withReservationMap(rules, rawReservations),
    removed: existed,
  }
}

export function clearPlayoffScheduleReservationsFromRules(rules: Record<string, unknown>) {
  const nextRules = { ...rules }
  delete nextRules.playoff_schedule_reservations
  return nextRules
}

export function promotePlayoffScheduleReservationInRules(input: {
  rules: Record<string, unknown>
  category: PlayoffScheduleCategory
  phase: PlayoffSchedulePhase | string
  matchOrder: number
  matchId: string
}) {
  const identity = {
    category: input.category,
    phase: input.phase,
    matchOrder: input.matchOrder,
  }
  const reservation = getPlayoffScheduleReservation(input.rules, identity)
  const currentAssignments = readMatchScheduleAssignments(input.rules.match_schedule_assignments)
  const existingAssignment = currentAssignments[input.matchId] ?? null
  const removal = removePlayoffScheduleReservationFromRules(input.rules, identity)

  if (existingAssignment) {
    return {
      rules: removal.rules,
      assignment: existingAssignment,
      reservation,
      mode: 'existing_assignment' as const,
      removedReservation: removal.removed,
    }
  }

  if (!reservation) {
    return {
      rules: removal.rules,
      assignment: null,
      reservation: null,
      mode: 'none' as const,
      removedReservation: removal.removed,
    }
  }

  const assignment: MatchScheduleAssignment = {
    match_id: input.matchId,
    scheduled_at: reservation.scheduled_at,
    court_name: reservation.court_name,
    ...(reservation.court_id ? { court_id: reservation.court_id } : {}),
    court_source: reservation.court_source,
  }
  const rawAssignments = isPlainRecord(removal.rules.match_schedule_assignments)
    ? removal.rules.match_schedule_assignments
    : {}

  return {
    rules: {
      ...removal.rules,
      match_schedule_assignments: {
        ...rawAssignments,
        [input.matchId]: assignment,
      },
    },
    assignment,
    reservation,
    mode: 'promoted' as const,
    removedReservation: true,
  }
}

export function setMatchScheduleAssignmentInRules(input: {
  rules: Record<string, unknown>
  assignment: MatchScheduleAssignment
  playoffIdentity?: PlayoffSlotIdentity | null
}) {
  const rawAssignments = isPlainRecord(input.rules.match_schedule_assignments)
    ? input.rules.match_schedule_assignments
    : {}
  let nextRules: Record<string, unknown> = {
    ...input.rules,
    match_schedule_assignments: {
      ...rawAssignments,
      [input.assignment.match_id]: input.assignment,
    },
  }

  if (input.playoffIdentity) {
    nextRules = removePlayoffScheduleReservationFromRules(nextRules, input.playoffIdentity).rules
  }
  return nextRules
}

export function removeMatchScheduleAssignmentFromRules(input: {
  rules: Record<string, unknown>
  matchId: string
  playoffIdentity?: PlayoffSlotIdentity | null
}) {
  const rawAssignments = isPlainRecord(input.rules.match_schedule_assignments)
    ? { ...input.rules.match_schedule_assignments }
    : {}
  delete rawAssignments[input.matchId]
  let nextRules: Record<string, unknown> = {
    ...input.rules,
    match_schedule_assignments: rawAssignments,
  }
  if (input.playoffIdentity) {
    nextRules = removePlayoffScheduleReservationFromRules(nextRules, input.playoffIdentity).rules
  }
  return nextRules
}

const phaseByBracketSize: Record<number, PlayoffSchedulePhase> = {
  64: 'ROUND_OF_32',
  32: 'ROUND_OF_16',
  16: 'EIGHTHS',
  8: 'QUARTER',
  4: 'SEMI',
  2: 'FINAL',
}

export function getExpectedPlayoffMatchCountFromRules(
  rules: Record<string, unknown>,
  phaseInput: unknown
) {
  const phase = normalizePlayoffSchedulePhase(phaseInput)
  if (!phase) return null
  const plan = isPlainRecord(rules.playoff_plan) ? rules.playoff_plan : null
  const bracketSize = Number(plan?.bracket_size)
  const startPhase = phaseByBracketSize[bracketSize]
  if (!startPhase) return null
  const startIndex = PLAYOFF_SCHEDULE_PHASES.indexOf(startPhase)
  const phaseIndex = PLAYOFF_SCHEDULE_PHASES.indexOf(phase)
  if (phaseIndex < startIndex) return null
  const roundOffset = phaseIndex - startIndex
  return Math.max(1, bracketSize / (2 ** (roundOffset + 1)))
}
