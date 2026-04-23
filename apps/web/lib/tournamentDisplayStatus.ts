export type OperationalStage =
  | 'BORRADOR'
  | 'INSCRIPCIONES'
  | 'LISTO_PARA_INICIAR'
  | 'GRUPOS'
  | 'PLAYOFF'
  | 'FINALIZADO'

type DisplayStatusInput = {
  operationalStage?: OperationalStage | string | null
  status?: string | null
  registrationDeadline?: string | null
  signupDeadline?: string | null
}

const displayByStage: Record<OperationalStage, string> = {
  BORRADOR: 'Borrador',
  INSCRIPCIONES: 'Abierto: Inscripciones',
  LISTO_PARA_INICIAR: 'Cerrado: Por jugarse',
  GRUPOS: 'En curso: Grupos',
  PLAYOFF: 'En curso: Playoff',
  FINALIZADO: 'Finalizado',
}

export function getTournamentDisplayStatus(input: DisplayStatusInput) {
  const stage = String(input.operationalStage ?? '').toUpperCase() as OperationalStage
  const status = String(input.status ?? '').toUpperCase()
  const registrationClosed = isTournamentRegistrationClosed(input)

  if (stage === 'INSCRIPCIONES' && registrationClosed) return displayByStage.LISTO_PARA_INICIAR
  if (stage in displayByStage) return displayByStage[stage]

  if (status === 'DRAFT') return 'Borrador'
  if (status === 'FINISHED' || status === 'COMPLETED') return 'Finalizado'
  if (status === 'OPEN' && registrationClosed) return displayByStage.LISTO_PARA_INICIAR
  return 'Abierto: Inscripciones'
}

export function getTournamentDisplayStatusTone(input: DisplayStatusInput) {
  const stage = String(input.operationalStage ?? '').toUpperCase()
  const status = String(input.status ?? '').toUpperCase()
  const registrationClosed = isTournamentRegistrationClosed(input)

  if (stage === 'FINALIZADO' || status === 'FINISHED' || status === 'COMPLETED') return 'done'
  if (stage === 'GRUPOS' || stage === 'PLAYOFF') return 'active'
  if (stage === 'LISTO_PARA_INICIAR' || (stage === 'INSCRIPCIONES' && registrationClosed)) return 'ready'
  if (stage === 'INSCRIPCIONES') return 'active'
  if (status === 'DRAFT') return 'draft'
  if (status === 'OPEN' && registrationClosed) return 'ready'
  return 'active'
}

export function isTournamentRegistrationClosed(input: DisplayStatusInput, now = new Date()) {
  const deadline = input.registrationDeadline ?? input.signupDeadline ?? null
  if (!deadline) return false

  const deadlineTime = new Date(deadline).getTime()
  if (Number.isNaN(deadlineTime)) return false

  return now.getTime() > deadlineTime
}
