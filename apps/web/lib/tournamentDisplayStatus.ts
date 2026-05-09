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

const openStatusValues = new Set(['OPEN', 'PUBLISHED', 'REGISTRATION_OPEN'])
const finishedStatusValues = new Set(['FINISHED', 'COMPLETED', 'FINALIZADO'])
const cancelledStatusValues = new Set(['CANCELLED', 'CANCELED', 'CANCELADO'])

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

export function getTournamentDisplayStatus(input: DisplayStatusInput) {
  return getTournamentOperationalStatus(input).label
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
