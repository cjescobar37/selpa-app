export type TournamentError = {
  code: string
  message: string
  status: number
}

const messages: Record<string, Omit<TournamentError, 'code'>> = {
  TOURNAMENT_PAUSED: { status: 409, message: 'El club pausó temporalmente las inscripciones de este torneo.' },
  TOURNAMENT_REGISTRATION_CLOSED: { status: 409, message: 'La inscripción para este torneo ya finalizó.' },
  TOURNAMENT_REGISTRATION_NOT_OPEN: { status: 409, message: 'Este torneo no está abierto para inscripciones.' },
  CLUB_PLAYER_NOT_ELIGIBLE: { status: 409, message: 'Uno de los jugadores no está habilitado actualmente en el club.' },
  TOURNAMENT_FORBIDDEN: { status: 403, message: 'No tenés permisos para realizar esta acción en el torneo.' },
  UNAUTHORIZED: { status: 401, message: 'Tu sesión no es válida. Volvé a ingresar e intentá nuevamente.' },
  TOURNAMENT_DELETE_BLOCKED: { status: 409, message: 'Este torneo ya tiene actividad vinculada y no puede eliminarse. Podés cancelarlo para conservar el historial.' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'Esta solicitud ya se usó con datos diferentes. Revisá el torneo antes de volver a intentarlo.' },
  INVALID_STATUS_TRANSITION: { status: 409, message: 'Esta acción no está disponible para el estado actual del torneo.' },
  TOURNAMENT_NOT_FOUND: { status: 404, message: 'No encontramos este torneo en el club activo.' },
  TOURNAMENT_NAME_REQUIRED: { status: 422, message: 'Definí el nombre del torneo antes de publicarlo.' },
  TOURNAMENT_DATES_REQUIRED: { status: 422, message: 'Definí las fechas del torneo antes de publicarlo.' },
  TOURNAMENT_DATE_RANGE_INVALID: { status: 422, message: 'La fecha de finalización no puede ser anterior al inicio.' },
  REGISTRATION_DEADLINE_REQUIRED: { status: 422, message: 'Definí el cierre de inscripción antes de publicarlo.' },
  TOURNAMENT_PRICE_REQUIRED: { status: 422, message: 'Definí el precio por jugador antes de publicarlo.' },
  TOURNAMENT_MIN_PAIRS_INVALID: { status: 422, message: 'Definí al menos dos parejas para publicar el torneo.' },
  TOURNAMENT_CAPACITY_INVALID: { status: 422, message: 'El cupo máximo no puede ser menor al mínimo.' },
  TOURNAMENT_MATCHES_PENDING: { status: 409, message: 'Todavía hay partidos pendientes. Cargá sus resultados antes de finalizar.' },
  TOURNAMENT_FINAL_REQUIRED: { status: 409, message: 'El torneo todavía no tiene una final válida.' },
  TOURNAMENT_FINAL_RESULT_REQUIRED: { status: 409, message: 'Cargá el resultado de la final antes de finalizar el torneo.' },
  TOURNAMENT_FINAL_WINNER_INVALID: { status: 409, message: 'El ganador de la final no coincide con sus participantes.' },
  TOURNAMENT_FINALIZATION_SNAPSHOT_MISSING: { status: 409, message: 'El cierre anterior no tiene un campeón verificable. Revisá el torneo.' },
  TOURNAMENT_SCHEMA_SYNC_PENDING: { status: 503, message: 'La publicación se está preparando. Actualizá la página e intentá nuevamente en unos segundos.' },
}

export function mapTournamentError(error: unknown, fallback = 'No pudimos completar la acción. Intentá nuevamente.'): TournamentError {
  const candidate = error && typeof error === 'object'
    ? `${String((error as { code?: unknown }).code ?? '')} ${String((error as { message?: unknown }).message ?? '')}`
    : String(error ?? '')
  const code = Object.keys(messages).find((value) => candidate.includes(value))
  if (code) return { code, ...messages[code] }
  if (candidate.includes('PGRST202')) return { code: 'TOURNAMENT_SCHEMA_SYNC_PENDING', ...messages.TOURNAMENT_SCHEMA_SYNC_PENDING }
  if (candidate.includes('42501')) return { code: 'TOURNAMENT_FORBIDDEN', ...messages.TOURNAMENT_FORBIDDEN }
  if (candidate.includes('28000')) return { code: 'UNAUTHORIZED', ...messages.UNAUTHORIZED }
  return { code: 'TOURNAMENT_OPERATION_FAILED', message: fallback, status: 500 }
}
