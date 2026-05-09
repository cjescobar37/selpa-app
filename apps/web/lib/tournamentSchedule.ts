export type ScheduleMode = 'AUTO' | 'MANUAL'

export type ScheduleWindow = {
  date: string
  start_time: string
  end_time: string
}

export type ScheduleConfig = {
  mode: ScheduleMode
  match_duration_minutes: number
  groups: ScheduleWindow
  playoff: ScheduleWindow
}

export type TournamentCourtConfig = {
  id?: string
  name: string
  complex_name?: string | null
  source: 'OWN_CLUB' | 'EXTERNAL_COMPLEX'
}

export type MatchScheduleAssignment = {
  match_id: string
  scheduled_at: string
  court_name: string
  court_id?: string
  court_source: 'OWN_CLUB' | 'EXTERNAL_COMPLEX'
}

export type ScheduleCapacity = {
  totalMinutes: number
  slotsPerCourt: number
  totalCapacity: number
  isEnough: boolean
  requiredCourts: number
  overflowMatches: number
}

type ScheduleFallbackDates = {
  startDate?: string | null
  endDate?: string | null
}

type SchedulableMatch = {
  id: string
  groupOrder?: number | null
  round?: number | null
  matchOrder?: number | null
}

export type ProfessionalSchedulableMatch = SchedulableMatch & {
  team1Id: string
  team2Id: string
  phase?: string | null
  groupId?: string | null
}

export type ProfessionalSchedulerWarningCode =
  | 'INSUFFICIENT_CAPACITY'
  | 'REST_RELAXED'
  | 'BACK_TO_BACK_UNAVOIDABLE'
  | 'TEAM_REPEATED_COURT'
  | 'UNASSIGNED_MATCHES'

export type ProfessionalSchedulerConflictCode =
  | 'INSUFFICIENT_CAPACITY'
  | 'NO_FEASIBLE_SLOT'
  | 'TEAM_SLOT_COLLISION'
  | 'COURT_SLOT_COLLISION'

export type ProfessionalSchedulerWarning = {
  code: ProfessionalSchedulerWarningCode
  message: string
  matchId?: string
}

export type ProfessionalSchedulerConflict = {
  code: ProfessionalSchedulerConflictCode
  message: string
  matchId?: string
  relatedMatchIds?: string[]
}

export type ProfessionalScheduleAssignment = MatchScheduleAssignment & {
  court_index: number
  court_complex_name?: string | null
  slot_index: number
  start_minutes: number
  end_minutes: number
  team1_id: string
  team2_id: string
  phase?: string | null
  group_id?: string | null
}

export type ProfessionalSchedulePlan = {
  capacity: ScheduleCapacity
  assignments: ProfessionalScheduleAssignment[]
  warnings: ProfessionalSchedulerWarning[]
  conflicts: ProfessionalSchedulerConflict[]
  unassignedMatchIds: string[]
  isComplete: boolean
}

type ScheduleSlot = {
  court: TournamentCourtConfig
  courtIndex: number
  slotIndex: number
  startMinutes: number
  endMinutes: number
  scheduledAt: string
}

const defaultTimeWindow = {
  start: '10:00',
  end: '22:00',
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeDate(value: unknown, fallback: string) {
  const text = normalizeText(value)
  if (!text) return fallback
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function normalizeTime(value: unknown, fallback: string) {
  const text = normalizeText(value)
  if (!text) return fallback
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback
}

function normalizeMode(value: unknown): ScheduleMode {
  return String(value ?? '').trim().toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO'
}

function normalizeDuration(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 90
}

function normalizeWindow(value: unknown, fallbackDate: string): ScheduleWindow {
  const safeValue = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  return {
    date: normalizeDate(safeValue.date, fallbackDate),
    start_time: normalizeTime(safeValue.start_time, defaultTimeWindow.start),
    end_time: normalizeTime(safeValue.end_time, defaultTimeWindow.end),
  }
}

export function buildDefaultScheduleConfig(fallbacks?: ScheduleFallbackDates): ScheduleConfig {
  const groupDate = normalizeDate(fallbacks?.startDate, '')
  const playoffDate = normalizeDate(fallbacks?.endDate, groupDate || normalizeDate(fallbacks?.startDate, ''))

  return {
    mode: 'AUTO',
    match_duration_minutes: 90,
    groups: {
      date: groupDate,
      start_time: defaultTimeWindow.start,
      end_time: defaultTimeWindow.end,
    },
    playoff: {
      date: playoffDate,
      start_time: defaultTimeWindow.start,
      end_time: defaultTimeWindow.end,
    },
  }
}

export function normalizeScheduleConfig(value: unknown, fallbacks?: ScheduleFallbackDates): ScheduleConfig {
  const defaults = buildDefaultScheduleConfig(fallbacks)
  const safeValue = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  return {
    mode: normalizeMode(safeValue.mode),
    match_duration_minutes: normalizeDuration(safeValue.match_duration_minutes),
    groups: normalizeWindow(safeValue.groups, defaults.groups.date),
    playoff: normalizeWindow(safeValue.playoff, defaults.playoff.date),
  }
}

export function normalizeTournamentCourts(value: unknown): TournamentCourtConfig[] {
  if (!Array.isArray(value)) return []

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const safeEntry = entry as Record<string, unknown>
      const name = normalizeText(safeEntry.name)
      if (!name) return []

      return [{
        ...(normalizeText(safeEntry.id) ? { id: normalizeText(safeEntry.id) ?? undefined } : {}),
        name,
        complex_name: normalizeText(safeEntry.complex_name),
        source: normalizeText(safeEntry.source) === 'EXTERNAL_COMPLEX' ? 'EXTERNAL_COMPLEX' : 'OWN_CLUB',
      } satisfies TournamentCourtConfig]
    })
}

export function readMatchScheduleAssignments(value: unknown) {
  const safeValue = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  return Object.entries(safeValue).reduce<Record<string, MatchScheduleAssignment>>((acc, [matchId, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return acc
    const safeEntry = entry as Record<string, unknown>
    const scheduledAt = normalizeText(safeEntry.scheduled_at)
    const courtName = normalizeText(safeEntry.court_name)
    if (!scheduledAt || !courtName) return acc

    acc[matchId] = {
      match_id: matchId,
      scheduled_at: scheduledAt,
      court_name: courtName,
      ...(normalizeText(safeEntry.court_id) ? { court_id: normalizeText(safeEntry.court_id) ?? undefined } : {}),
      court_source: normalizeText(safeEntry.court_source) === 'EXTERNAL_COMPLEX' ? 'EXTERNAL_COMPLEX' : 'OWN_CLUB',
    }
    return acc
  }, {})
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part))
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  return hours * 60 + minutes
}

function buildScheduledAt(date: string, startTime: string, offsetMinutes: number) {
  const [year, month, day] = date.split('-').map((part) => Number(part))
  const [hours, minutes] = startTime.split(':').map((part) => Number(part))
  const scheduled = new Date(year, month - 1, day, hours, minutes + offsetMinutes, 0, 0)
  return scheduled.toISOString()
}

function compareSchedulableMatches(left: SchedulableMatch, right: SchedulableMatch) {
  const leftGroupOrder = left.groupOrder ?? Number.MAX_SAFE_INTEGER
  const rightGroupOrder = right.groupOrder ?? Number.MAX_SAFE_INTEGER
  if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder

  const leftMatchOrder = left.matchOrder ?? Number.MAX_SAFE_INTEGER
  const rightMatchOrder = right.matchOrder ?? Number.MAX_SAFE_INTEGER
  if (leftMatchOrder !== rightMatchOrder) return leftMatchOrder - rightMatchOrder

  const leftRound = left.round ?? Number.MAX_SAFE_INTEGER
  const rightRound = right.round ?? Number.MAX_SAFE_INTEGER
  if (leftRound !== rightRound) return leftRound - rightRound

  return left.id.localeCompare(right.id)
}

function buildScheduleSlots(input: {
  courts: TournamentCourtConfig[]
  date: string
  startTime: string
  endTime: string
  matchDurationMinutes: number
}) {
  const capacity = calculateScheduleCapacity({
    courtsCount: input.courts.length,
    startTime: input.startTime,
    endTime: input.endTime,
    matchDurationMinutes: input.matchDurationMinutes,
    totalMatches: 0,
  })
  const startMinutes = toMinutes(input.startTime)
  if (capacity.slotsPerCourt === 0 || startMinutes === null) return [] as ScheduleSlot[]

  const slots: ScheduleSlot[] = []
  for (let slotIndex = 0; slotIndex < capacity.slotsPerCourt; slotIndex += 1) {
    const offsetMinutes = slotIndex * input.matchDurationMinutes
    const start = startMinutes + offsetMinutes
    const end = start + input.matchDurationMinutes

    for (let courtIndex = 0; courtIndex < input.courts.length; courtIndex += 1) {
      const court = input.courts[courtIndex]
      if (!court) continue
      slots.push({
        court,
        courtIndex,
        slotIndex,
        startMinutes: start,
        endMinutes: end,
        scheduledAt: buildScheduledAt(input.date, input.startTime, offsetMinutes),
      })
    }
  }

  return slots
}

function formatMinutes(value: number) {
  const safeValue = Math.max(0, Math.trunc(value))
  const hours = Math.floor(safeValue / 60)
  const minutes = safeValue % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getTeamIds(match: ProfessionalSchedulableMatch) {
  return [match.team1Id, match.team2Id]
}

function getTeamRestGapMinutes(match: ProfessionalSchedulableMatch, slot: ScheduleSlot, assignments: ProfessionalScheduleAssignment[]) {
  const teamIds = getTeamIds(match)
  let smallestGap: number | null = null

  for (const teamId of teamIds) {
    const lastAssignment = assignments
      .filter((assignment) => assignment.team1_id === teamId || assignment.team2_id === teamId)
      .sort((left, right) => right.end_minutes - left.end_minutes)[0]

    if (!lastAssignment) continue
    const gap = slot.startMinutes - lastAssignment.end_minutes
    if (smallestGap === null || gap < smallestGap) {
      smallestGap = gap
    }
  }

  return smallestGap
}

function hasTeamAtSlot(match: ProfessionalSchedulableMatch, slot: ScheduleSlot, assignments: ProfessionalScheduleAssignment[]) {
  const teamIds = new Set(getTeamIds(match))
  return assignments.some((assignment) => {
    if (assignment.slot_index !== slot.slotIndex) return false
    return teamIds.has(assignment.team1_id) || teamIds.has(assignment.team2_id)
  })
}

function countMatchesByCourt(assignments: ProfessionalScheduleAssignment[], courtName: string) {
  return assignments.filter((assignment) => assignment.court_name === courtName).length
}

function hasTeamRepeatedCourtRecently(match: ProfessionalSchedulableMatch, slot: ScheduleSlot, assignments: ProfessionalScheduleAssignment[]) {
  return getTeamIds(match).some((teamId) => {
    const lastAssignment = assignments
      .filter((assignment) => assignment.team1_id === teamId || assignment.team2_id === teamId)
      .sort((left, right) => right.end_minutes - left.end_minutes)[0]

    return lastAssignment?.court_name === slot.court.name
  })
}

function toProfessionalAssignment(match: ProfessionalSchedulableMatch, slot: ScheduleSlot): ProfessionalScheduleAssignment {
  return {
    match_id: match.id,
    scheduled_at: slot.scheduledAt,
    court_name: slot.court.name,
    ...(slot.court.id ? { court_id: slot.court.id } : {}),
    court_source: slot.court.source,
    court_index: slot.courtIndex,
    court_complex_name: slot.court.complex_name,
    slot_index: slot.slotIndex,
    start_minutes: slot.startMinutes,
    end_minutes: slot.endMinutes,
    team1_id: match.team1Id,
    team2_id: match.team2Id,
    phase: match.phase ?? null,
    group_id: match.groupId ?? null,
  }
}

export function buildProfessionalSchedulePlan(input: {
  matches: ProfessionalSchedulableMatch[]
  courts: TournamentCourtConfig[]
  date: string
  startTime: string
  endTime: string
  matchDurationMinutes: number
  minimumRestMinutes?: number
}): ProfessionalSchedulePlan {
  const warnings: ProfessionalSchedulerWarning[] = []
  const conflicts: ProfessionalSchedulerConflict[] = []
  const orderedMatches = [...input.matches].sort(compareSchedulableMatches)
  const capacity = calculateScheduleCapacity({
    courtsCount: input.courts.length,
    startTime: input.startTime,
    endTime: input.endTime,
    matchDurationMinutes: input.matchDurationMinutes,
    totalMatches: orderedMatches.length,
  })
  const minimumRestMinutes = Math.max(
    0,
    Math.trunc(
      Number.isFinite(input.minimumRestMinutes)
        ? Number(input.minimumRestMinutes)
        : input.matchDurationMinutes
    )
  )

  if (!capacity.isEnough) {
    warnings.push({
      code: 'INSUFFICIENT_CAPACITY',
      message: `La ventana permite ${capacity.totalCapacity} partidos, pero hay ${orderedMatches.length} para ubicar.`,
    })
    conflicts.push({
      code: 'INSUFFICIENT_CAPACITY',
      message: `Con ${input.courts.length} canchas entre ${input.startTime} y ${input.endTime} no alcanza la capacidad para todos los partidos.`,
      relatedMatchIds: orderedMatches.map((match) => match.id),
    })
  }

  const slots = buildScheduleSlots({
    courts: input.courts,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    matchDurationMinutes: input.matchDurationMinutes,
  })
  const assignments: ProfessionalScheduleAssignment[] = []
  const unassignedMatchIds: string[] = []

  for (const match of orderedMatches) {
    const candidateSlots = slots
      .filter((slot) => !assignments.some((assignment) => assignment.slot_index === slot.slotIndex && assignment.court_index === slot.courtIndex))
      .map((slot) => {
        const hasTeamCollision = hasTeamAtSlot(match, slot, assignments)
        const restGapMinutes = getTeamRestGapMinutes(match, slot, assignments)
        const respectsRest = restGapMinutes === null || restGapMinutes >= minimumRestMinutes
        const consecutiveGap = restGapMinutes !== null && restGapMinutes < input.matchDurationMinutes
        const courtLoad = countMatchesByCourt(assignments, slot.court.name)
        const repeatedCourt = hasTeamRepeatedCourtRecently(match, slot, assignments)
        const score =
          (hasTeamCollision ? 1_000_000 : 0) +
          (!respectsRest ? 100_000 + Math.max(0, minimumRestMinutes - (restGapMinutes ?? 0)) : 0) +
          (consecutiveGap ? 10_000 : 0) +
          (courtLoad * 100) +
          (repeatedCourt ? 10 : 0) +
          slot.slotIndex

        return {
          slot,
          hasTeamCollision,
          restGapMinutes,
          respectsRest,
          consecutiveGap,
          courtLoad,
          repeatedCourt,
          score,
        }
      })
      .sort((left, right) => left.score - right.score)

    const bestCandidate = candidateSlots[0]
    if (!bestCandidate || bestCandidate.hasTeamCollision) {
      unassignedMatchIds.push(match.id)
      conflicts.push({
        code: bestCandidate?.hasTeamCollision ? 'TEAM_SLOT_COLLISION' : 'NO_FEASIBLE_SLOT',
        message: bestCandidate?.hasTeamCollision
          ? 'No hay slot libre sin superponer al menos uno de los equipos.'
          : 'No hay slot disponible para ubicar este partido.',
        matchId: match.id,
      })
      continue
    }

    if (!bestCandidate.respectsRest) {
      warnings.push({
        code: bestCandidate.consecutiveGap ? 'BACK_TO_BACK_UNAVOIDABLE' : 'REST_RELAXED',
        message: bestCandidate.consecutiveGap
          ? `El partido ${match.id} quedó consecutivo respecto de uno de sus equipos.`
          : `El partido ${match.id} quedó con menos descanso del mínimo (${minimumRestMinutes} min).`,
        matchId: match.id,
      })
    }

    if (bestCandidate.repeatedCourt) {
      warnings.push({
        code: 'TEAM_REPEATED_COURT',
        message: `El partido ${match.id} repite cancha para al menos uno de sus equipos.`,
        matchId: match.id,
      })
    }

    assignments.push(toProfessionalAssignment(match, bestCandidate.slot))
  }

  if (unassignedMatchIds.length > 0) {
    warnings.push({
      code: 'UNASSIGNED_MATCHES',
      message: `${unassignedMatchIds.length} partido(s) quedaron sin ubicar en la planificación.`,
    })
  }

  return {
    capacity,
    assignments,
    warnings,
    conflicts,
    unassignedMatchIds,
    isComplete: unassignedMatchIds.length === 0 && conflicts.length === 0,
  }
}

export function calculateScheduleCapacity(input: {
  courtsCount: number
  startTime: string
  endTime: string
  matchDurationMinutes: number
  totalMatches?: number
}): ScheduleCapacity {
  const startMinutes = toMinutes(input.startTime)
  const endMinutes = toMinutes(input.endTime)
  const duration = Number.isFinite(input.matchDurationMinutes) && input.matchDurationMinutes > 0
    ? Math.trunc(input.matchDurationMinutes)
    : 0
  const totalMatches = Math.max(0, Math.trunc(input.totalMatches ?? 0))
  const courtsCount = Math.max(0, Math.trunc(input.courtsCount))

  const totalMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
    ? endMinutes - startMinutes
    : 0
  const slotsPerCourt = duration > 0 ? Math.floor(totalMinutes / duration) : 0
  const totalCapacity = slotsPerCourt * courtsCount
  const isEnough = totalMatches <= totalCapacity
  const requiredCourts = slotsPerCourt > 0
    ? Math.ceil(totalMatches / slotsPerCourt)
    : totalMatches > 0
      ? totalMatches
      : 0

  return {
    totalMinutes,
    slotsPerCourt,
    totalCapacity,
    isEnough,
    requiredCourts,
    overflowMatches: Math.max(0, totalMatches - totalCapacity),
  }
}

export function assignScheduleSlots(input: {
  matches: SchedulableMatch[]
  courts: TournamentCourtConfig[]
  date: string
  startTime: string
  endTime: string
  matchDurationMinutes: number
}) {
  const capacity = calculateScheduleCapacity({
    courtsCount: input.courts.length,
    startTime: input.startTime,
    endTime: input.endTime,
    matchDurationMinutes: input.matchDurationMinutes,
    totalMatches: input.matches.length,
  })

  const orderedMatches = [...input.matches].sort(compareSchedulableMatches)

  if (!capacity.isEnough || capacity.slotsPerCourt === 0) {
    return {
      capacity,
      assignments: [] as MatchScheduleAssignment[],
    }
  }

  const assignments = orderedMatches.map((match, index) => {
    const court = input.courts[index % input.courts.length]
    const slotIndex = Math.floor(index / input.courts.length)
    const offsetMinutes = slotIndex * input.matchDurationMinutes

    return {
      match_id: match.id,
      scheduled_at: buildScheduledAt(input.date, input.startTime, offsetMinutes),
      court_name: court?.name ?? 'Cancha',
      ...(court?.id ? { court_id: court.id } : {}),
      court_source: court?.source ?? 'OWN_CLUB',
    } satisfies MatchScheduleAssignment
  })

  return {
    capacity,
    assignments,
  }
}
