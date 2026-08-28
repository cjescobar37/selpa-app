export type TournamentDisplayStatusKey =
  | 'live'
  | 'registration_open'
  | 'upcoming'
  | 'finished'
  | 'draft'
  | 'paused'
  | 'cancelled'

export type TournamentDisplayStatus = {
  key: TournamentDisplayStatusKey
  label: string
  priority: number
  className: string
}

export type OperationalStage =
  | 'BORRADOR'
  | 'INSCRIPCIONES'
  | 'LISTO_PARA_INICIAR'
  | 'GRUPOS'
  | 'PLAYOFF'
  | 'FINALIZADO'

export type TournamentOperationalStatusTone =
  | 'registration'
  | 'running'
  | 'live'
  | 'finished'
  | 'draft'
  | 'paused'
  | 'cancelled'

type TournamentOperationalCounts = {
  groups?: number | null
  groupMatches?: number | { total?: number | null } | null
  playoffMatches?: number | null
}

type DisplayStatusInput = {
  operationalStage?: OperationalStage | string | null
  status?: string | null
  registrationDeadline?: string | null
  signupDeadline?: string | null
  counts?: TournamentOperationalCounts | null
  final?: { status?: string | null } | null
  champion?: unknown | null
  currentPlayoffPhase?: string | null
}

type TournamentDisplayInput = Record<string, unknown>

const openStatusValues = new Set(['OPEN', 'PUBLISHED', 'REGISTRATION_OPEN'])
const liveStatusValues = new Set(['IN_PROGRESS', 'ACTIVE', 'LIVE', 'RUNNING', 'PLAYING', 'STARTED', 'GROUPS', 'PLAYOFF'])
const finishedStatusValues = new Set(['FINISHED', 'COMPLETED', 'FINALIZADO', 'CLOSED'])
const cancelledStatusValues = new Set(['CANCELLED', 'CANCELED', 'CANCELADO', 'ARCHIVED'])

const displayByStage: Record<OperationalStage, string> = {
  BORRADOR: 'Borrador',
  INSCRIPCIONES: 'Abierto: Inscripciones',
  LISTO_PARA_INICIAR: 'Cerrado: Por jugarse',
  GRUPOS: 'En curso: Grupos',
  PLAYOFF: 'En curso: Playoff',
  FINALIZADO: 'Finalizado',
}

const legacyToneByOperationalTone: Record<TournamentOperationalStatusTone, string> = {
  registration: 'active',
  running: 'active',
  live: 'live',
  finished: 'done',
  draft: 'draft',
  paused: 'muted',
  cancelled: 'muted',
}

function parseTournamentDate(value?: string | null) {
  if (!value) return null

  const localDateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  )

  if (localDateTimeMatch) {
    const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] = localDateTimeMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    )
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function parseTournamentEndDate(value?: string | null) {
  if (!value) return null
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
  }
  return parseTournamentDate(value)
}

function isLegacyDisplayInput(value: unknown): value is DisplayStatusInput {
  return Boolean(value && typeof value === 'object' && 'operationalStage' in value)
}

function asObject(value: unknown): TournamentDisplayInput {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return asObject(parsed)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as TournamentDisplayInput
}

function getField(item: TournamentDisplayInput, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function asStatus(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function getTournamentDisplayStatusInfo(tournament: unknown, now = new Date()): TournamentDisplayStatus {
  const item = asObject(tournament)
  const rules = asObject(item.rules ?? item.rules_json)
  const legacyStage = asStatus(item.operationalStage)
  const status = asStatus(item.status)
  const phase = asStatus(getField(item, 'phase', 'current_phase') ?? getField(rules, 'phase', 'current_phase') ?? legacyStage)
  const startedAt = parseTournamentDate(String(getField(item, 'starts_on', 'startDate', 'start_date') ?? '') || null)
  // A date-only end date is inclusive for the full sporting day. Treating it as
  // midnight incorrectly moves a tournament to "Finalizado" on its final day.
  const endedAt = parseTournamentEndDate(String(getField(item, 'ends_on', 'endDate', 'end_date') ?? '') || null)
  const registrationDeadline = parseTournamentDate(String(getField(item, 'registrationDeadline', 'registration_deadline', 'signup_deadline') ?? '') || null)
  const time = now.getTime()

  if (status === 'DRAFT' || legacyStage === 'BORRADOR') {
    return { key: 'draft', label: 'Borrador', priority: 90, className: 'is-draft' }
  }

  if (status === 'PAUSED') {
    return { key: 'paused', label: 'Pausado', priority: 15, className: 'is-paused' }
  }

  if (cancelledStatusValues.has(status)) {
    return { key: 'cancelled', label: 'Cancelado', priority: 95, className: 'is-cancelled' }
  }

  if (legacyStage === 'FINALIZADO' || finishedStatusValues.has(status) || (endedAt && endedAt.getTime() < time)) {
    return { key: 'finished', label: 'Finalizado', priority: 40, className: 'is-finished' }
  }

  if (
    liveStatusValues.has(status) ||
    ['GRUPOS', 'PLAYOFF', 'GROUPS', 'LIVE', 'IN_PROGRESS'].includes(phase) ||
    (startedAt && startedAt.getTime() <= time && (!endedAt || endedAt.getTime() >= time))
  ) {
    return { key: 'live', label: 'En juego', priority: 0, className: 'is-live' }
  }

  if (
    openStatusValues.has(status) &&
    (!startedAt || startedAt.getTime() > time) &&
    (!registrationDeadline || registrationDeadline.getTime() >= time)
  ) {
    return { key: 'registration_open', label: 'Inscripción abierta', priority: 10, className: 'is-open' }
  }

  return { key: 'upcoming', label: 'Próximo', priority: 20, className: 'is-upcoming' }
}

export function getTournamentDisplayStatus(input: DisplayStatusInput & { operationalStage?: OperationalStage | string | null }): string
export function getTournamentDisplayStatus(tournament: unknown, now?: Date): TournamentDisplayStatus
export function getTournamentDisplayStatus(input: unknown, now = new Date()) {
  if (isLegacyDisplayInput(input)) return getTournamentOperationalStatus(input).label
  return getTournamentDisplayStatusInfo(input, now)
}

export function getTournamentDisplayStatusTone(input: DisplayStatusInput) {
  return legacyToneByOperationalTone[getTournamentOperationalStatus(input).tone]
}

export function getTournamentOperationalStatus(input: DisplayStatusInput): {
  label: string
  tone: TournamentOperationalStatusTone
  stage: OperationalStage | 'FINAL' | 'CANCELLED' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'EIGHTHS' | 'QUARTER' | 'SEMI'
} {
  const stage = normalizeOperationalStage(input.operationalStage)
  const status = String(input.status ?? '').toUpperCase()
  const finalStatus = String(input.final?.status ?? '').toUpperCase()
  const currentPlayoffPhase = String(input.currentPlayoffPhase ?? '').toUpperCase()
  const registrationClosed = isTournamentRegistrationClosed(input)
  const hasGroups = getGroupMatchesCount(input.counts) > 0 || Number(input.counts?.groups ?? 0) > 0
  const hasPlayoff = Number(input.counts?.playoffMatches ?? 0) > 0
  const hasFinalInProgress =
    (stage === 'PLAYOFF' || hasPlayoff) &&
    (currentPlayoffPhase === 'FINAL' || Boolean(input.final)) &&
    finalStatus !== 'PLAYED'

  if (status === 'DRAFT' || stage === 'BORRADOR') {
    return { label: displayByStage.BORRADOR, tone: 'draft', stage: 'BORRADOR' }
  }

  if (status === 'PAUSED') {
    return { label: 'Pausado', tone: 'paused', stage: 'INSCRIPCIONES' }
  }

  if (cancelledStatusValues.has(status)) {
    return { label: 'Cancelado', tone: 'cancelled', stage: 'CANCELLED' }
  }

  if (stage === 'FINALIZADO' || input.champion || finalStatus === 'PLAYED' || finishedStatusValues.has(status)) {
    return { label: displayByStage.FINALIZADO, tone: 'finished', stage: 'FINALIZADO' }
  }

  if (hasFinalInProgress) {
    return { label: 'En vivo: Final', tone: 'live', stage: 'FINAL' }
  }

  if ((stage === 'PLAYOFF' || hasPlayoff) && currentPlayoffPhase) {
    return {
      label: `En vivo: ${formatPlayoffPhaseStatusLabel(currentPlayoffPhase)}`,
      tone: 'live',
      stage: currentPlayoffPhase as 'ROUND_OF_32' | 'ROUND_OF_16' | 'EIGHTHS' | 'QUARTER' | 'SEMI' | 'FINAL',
    }
  }

  if (stage === 'PLAYOFF' || hasPlayoff) {
    return { label: displayByStage.PLAYOFF, tone: 'running', stage: 'PLAYOFF' }
  }

  if (stage === 'GRUPOS' || hasGroups) {
    return { label: displayByStage.GRUPOS, tone: 'running', stage: 'GRUPOS' }
  }

  if (stage === 'LISTO_PARA_INICIAR' || (stage === 'INSCRIPCIONES' && registrationClosed)) {
    return { label: displayByStage.LISTO_PARA_INICIAR, tone: 'running', stage: 'LISTO_PARA_INICIAR' }
  }

  if (stage === 'INSCRIPCIONES' || (isPublishedOrOpenStatus(status) && !registrationClosed)) {
    return { label: displayByStage.INSCRIPCIONES, tone: 'registration', stage: 'INSCRIPCIONES' }
  }

  if (isPublishedOrOpenStatus(status) && registrationClosed) {
    return { label: displayByStage.LISTO_PARA_INICIAR, tone: 'running', stage: 'LISTO_PARA_INICIAR' }
  }

  return { label: displayByStage.INSCRIPCIONES, tone: 'registration', stage: 'INSCRIPCIONES' }
}

export function isPublishedOrOpenStatus(status?: string | null) {
  return openStatusValues.has(String(status ?? '').toUpperCase())
}

export function isTournamentRegistrationOpen(input: DisplayStatusInput) {
  return isPublishedOrOpenStatus(input.status) && !isTournamentRegistrationClosed(input)
}

export function isTournamentRegistrationClosed(input: DisplayStatusInput, now = new Date()) {
  const deadline = input.registrationDeadline ?? input.signupDeadline ?? null
  if (!deadline) return false

  const parsedDeadline = parseTournamentDate(deadline)
  if (!parsedDeadline) return false

  const deadlineTime = parsedDeadline.getTime()

  return now.getTime() > deadlineTime
}

function normalizeOperationalStage(stage?: OperationalStage | string | null) {
  const normalized = String(stage ?? '').toUpperCase()
  return normalized in displayByStage ? (normalized as OperationalStage) : null
}

function getGroupMatchesCount(counts?: TournamentOperationalCounts | null) {
  const groupMatches = counts?.groupMatches
  if (typeof groupMatches === 'number') return groupMatches
  return Number(groupMatches?.total ?? 0)
}

function formatPlayoffPhaseStatusLabel(phase: string) {
  const labels: Record<string, string> = {
    ROUND_OF_32: '32vos',
    ROUND_OF_16: '16vos',
    EIGHTHS: 'Octavos',
    QUARTER: 'Cuartos',
    SEMI: 'Semifinales',
    FINAL: 'Final',
  }

  return labels[phase] ?? phase.replaceAll('_', ' ')
}
