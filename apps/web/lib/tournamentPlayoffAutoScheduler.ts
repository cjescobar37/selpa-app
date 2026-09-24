import type { TournamentCourtConfig } from './tournamentSchedule'
import type { PlayoffSchedulePhase, PlayoffScheduleReservation } from './tournamentPlayoffScheduleReservations'

const PHASES: PlayoffSchedulePhase[] = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL']

export type PlayoffAutoScheduleFixedSlot = {
  phase: PlayoffSchedulePhase
  matchOrder: number
  bracketPairOrder?: number
  scheduledAt: string
  courtName: string
  courtId?: string
  courtSource?: 'OWN_CLUB' | 'EXTERNAL_COMPLEX'
}

export type PlayoffAutoScheduleBlocker = {
  code: 'PLAYOFF_SCHEDULE_CAPACITY_INSUFFICIENT'
  pendingSlots: string[]
  earliestRequiredAt: string | null
  suggestedEndTime: string | null
  requiredCourts: number
}

export type PlayoffAutoScheduleResult = {
  reservations: PlayoffScheduleReservation[]
  blocker: PlayoffAutoScheduleBlocker | null
}

function atLocal(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime()
}

function phaseForBracketSize(bracketSize: number) {
  return ({ 64: 'ROUND_OF_32', 32: 'ROUND_OF_16', 16: 'EIGHTHS', 8: 'QUARTER', 4: 'SEMI', 2: 'FINAL' } as const)[bracketSize as 64 | 32 | 16 | 8 | 4 | 2] ?? null
}

function courtKey(court: { courtId?: string; courtName: string }) {
  return court.courtId ? `id:${court.courtId}` : `name:${court.courtName.trim().toLowerCase()}`
}

/** Extra recovery is intentionally zero; match duration already advances to the next free slot. */
export function getPlayoffMinimumRestMinutes(matchDurationMinutes: number) {
  void matchDurationMinutes
  return 0
}

export function buildCompletePlayoffSchedule(input: {
  category: string
  bracketSize: number
  date: string
  startTime: string
  endTime: string
  matchDurationMinutes: number
  courts: TournamentCourtConfig[]
  firstRoundPairOrders: number[]
  fixedSlots?: PlayoffAutoScheduleFixedSlot[]
  byePairOrders?: number[]
}): PlayoffAutoScheduleResult {
  const startPhase = phaseForBracketSize(input.bracketSize)
  const startIndex = startPhase ? PHASES.indexOf(startPhase) : -1
  const durationMs = input.matchDurationMinutes * 60_000
  const restMs = getPlayoffMinimumRestMinutes(input.matchDurationMinutes) * 60_000
  const windowStart = atLocal(input.date, input.startTime)
  const windowEnd = atLocal(input.date, input.endTime)
  if (!startPhase || startIndex < 0 || input.courts.length === 0 || !Number.isFinite(windowStart) || windowEnd <= windowStart) {
    return { reservations: [], blocker: { code: 'PLAYOFF_SCHEDULE_CAPACITY_INSUFFICIENT', pendingSlots: [], earliestRequiredAt: null, suggestedEndTime: null, requiredCourts: Math.max(1, input.courts.length) } }
  }

  const fixedBySlot = new Map((input.fixedSlots ?? []).map((slot) => [`${slot.phase}:${slot.matchOrder}`, slot]))
  const occupied = new Map<string, Set<number>>()
  for (const slot of input.fixedSlots ?? []) {
    const time = Date.parse(slot.scheduledAt)
    if (!Number.isFinite(time)) continue
    const key = courtKey({ courtId: slot.courtId, courtName: slot.courtName })
    const times = occupied.get(key) ?? new Set<number>()
    times.add(time)
    occupied.set(key, times)
  }

  const readiness = new Map<string, number>()
  const firstCount = input.bracketSize / 2
  const byePairs = new Set(input.byePairOrders ?? [])
  const actualPairByOrder = new Map(input.firstRoundPairOrders.map((pairOrder, index) => [index + 1, pairOrder]))
  for (let pairOrder = 1; pairOrder <= firstCount; pairOrder += 1) {
    const compactOrder = [...actualPairByOrder.entries()].find(([, pair]) => pair === pairOrder)?.[0]
    const fixed = compactOrder ? fixedBySlot.get(`${startPhase}:${compactOrder}`) : null
    const time = fixed ? Date.parse(fixed.scheduledAt) : NaN
    readiness.set(`${startPhase}:${pairOrder}`, Number.isFinite(time) ? time + durationMs + restMs : (byePairs.has(pairOrder) ? windowStart : Number.POSITIVE_INFINITY))
  }

  const reservations: PlayoffScheduleReservation[] = []
  const pendingSlots: string[] = []
  let earliestRequired = 0
  for (let phaseIndex = startIndex + 1; phaseIndex < PHASES.length; phaseIndex += 1) {
    const phase = PHASES[phaseIndex]
    const previousPhase = PHASES[phaseIndex - 1]
    const count = input.bracketSize / (2 ** (phaseIndex - startIndex + 1))
    const previousCount = count * 2
    const previousRoundReadiness = Array.from(
      { length: previousCount },
      (_, index) => readiness.get(`${previousPhase}:${index + 1}`) ?? Infinity
    )
    const roundBarrier = previousRoundReadiness.every(Number.isFinite)
      ? Math.max(...previousRoundReadiness)
      : Infinity

    for (let index = 0; index < count; index += 1) {
      const order = index + 1
      const key = `${phase}:${order}`
      const fixed = fixedBySlot.get(key)
      if (fixed) {
        const fixedTime = Date.parse(fixed.scheduledAt)
        readiness.set(key, Number.isFinite(fixedTime) ? fixedTime + durationMs + restMs : Infinity)
        continue
      }
      const readyAt = roundBarrier
      let chosen: { time: number; court: TournamentCourtConfig } | null = null
      if (Number.isFinite(readyAt)) {
        for (let time = Math.max(windowStart, readyAt); time + durationMs <= windowEnd; time += durationMs) {
          const court = input.courts.find((candidate) => !occupied.get(courtKey({ courtId: candidate.id, courtName: candidate.name }))?.has(time))
          if (court) { chosen = { time, court }; break }
        }
      }
      if (!chosen) {
        pendingSlots.push(key)
        earliestRequired = Math.max(earliestRequired, Number.isFinite(readyAt) ? readyAt : windowEnd)
        readiness.set(key, Infinity)
        continue
      }
      const keyCourt = courtKey({ courtId: chosen.court.id, courtName: chosen.court.name })
      const times = occupied.get(keyCourt) ?? new Set<number>()
      times.add(chosen.time)
      occupied.set(keyCourt, times)
      reservations.push({
        category: input.category,
        phase,
        match_order: order,
        scheduled_at: new Date(chosen.time).toISOString(),
        court_name: chosen.court.name,
        ...(chosen.court.id ? { court_id: chosen.court.id } : {}),
        court_source: chosen.court.source,
        schedule_origin: 'AUTO',
      })
      readiness.set(key, chosen.time + durationMs + restMs)
    }
  }

  const suggestedEnd = pendingSlots.length ? Math.max(windowEnd, earliestRequired + durationMs) : 0
  return {
    reservations,
    blocker: pendingSlots.length ? {
      code: 'PLAYOFF_SCHEDULE_CAPACITY_INSUFFICIENT',
      pendingSlots,
      earliestRequiredAt: earliestRequired ? new Date(earliestRequired).toISOString() : null,
      suggestedEndTime: suggestedEnd ? new Date(suggestedEnd).toISOString() : null,
      requiredCourts: Math.max(input.courts.length + 1, Math.ceil(pendingSlots.length / Math.max(1, (windowEnd - windowStart) / durationMs))),
    } : null,
  }
}
