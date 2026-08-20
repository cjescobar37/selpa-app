export type TournamentError = {
  code: string
  message: string
  status: number
}

const messages: Record<string, Omit<TournamentError, 'code'>> = {
  TOURNAMENT_PAUSED: { status: 409, message: 'El club pausó temporalmente las inscripciones de este torneo.' },
  TOURNAMENT_REGISTRATION_CLOSED: { status: 409, message: 'La inscripción para este torneo ya finalizó.' },
  TOURNAMENT_REGISTRATION_NOT_OPEN: { status: 409, message: 'Este torneo no está abierto para inscripciones.' },
  TOURNAMENT_FORBIDDEN: { status: 403, message: 'No tenés permisos para realizar esta acción en el torneo.' },
  UNAUTHORIZED: { status: 401, message: 'Tu sesión no es válida. Volvé a ingresar e intentá nuevamente.' },
  TOURNAMENT_DELETE_BLOCKED: { status: 409, message: 'Este torneo ya tiene actividad vinculada y no puede eliminarse. Podés cancelarlo para conservar el historial.' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'Esta solicitud ya se usó con datos diferentes. Revisá el torneo antes de volver a intentarlo.' },
  INVALID_STATUS_TRANSITION: { status: 409, message: 'Esta acción no está disponible para el estado actual del torneo.' },
  TOURNAMENT_NOT_FOUND: { status: 404, message: 'No encontramos este torneo en el club activo.' },
}

export function mapTournamentError(error: unknown, fallback = 'No pudimos completar la acción. Intentá nuevamente.'): TournamentError {
  const candidate = error && typeof error === 'object'
    ? `${String((error as { code?: unknown }).code ?? '')} ${String((error as { message?: unknown }).message ?? '')}`
    : String(error ?? '')
  const code = Object.keys(messages).find((value) => candidate.includes(value))
  if (code) return { code, ...messages[code] }
  if (candidate.includes('42501')) return { code: 'TOURNAMENT_FORBIDDEN', ...messages.TOURNAMENT_FORBIDDEN }
  if (candidate.includes('28000')) return { code: 'UNAUTHORIZED', ...messages.UNAUTHORIZED }
  return { code: 'TOURNAMENT_OPERATION_FAILED', message: fallback, status: 500 }
}
