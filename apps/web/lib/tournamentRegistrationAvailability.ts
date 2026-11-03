import { getTournamentDisplayStatus, isTournamentRegistrationClosed } from './tournamentDisplayStatus'

/** Presentation of existing submit guards, never a replacement for backend authorization. */
export function tournamentRegistrationAvailability(input: {
  status?: string | null
  registrationDeadline?: string | null
  startDate?: string | null
  endDate?: string | null
}, capacity?: { maxPairs?: number | null; spotsLeft?: number | null }, now = new Date()) {
  const status = getTournamentDisplayStatus(input, now)
  if (status.key === 'finished') return { open: false, title: 'Torneo finalizado', message: 'Este torneo ya terminó. Podés consultar su información y tu carrera deportiva.' }
  if (status.key === 'cancelled') return { open: false, title: 'Torneo cancelado', message: 'Este torneo no recibe nuevas inscripciones.' }
  if (status.key === 'draft') return { open: false, title: 'Torneo no publicado', message: 'La organización todavía no abrió este torneo.' }
  if (status.key === 'paused') return { open: false, title: 'Torneo pausado', message: 'El club pausó temporalmente las inscripciones.' }
  if (status.key === 'registration_closed' || isTournamentRegistrationClosed(input, now)) return { open: false, title: 'Inscripción cerrada', message: 'La inscripción para este torneo ya finalizó.' }
  if (typeof capacity?.maxPairs === 'number' && capacity.maxPairs > 0 && capacity.spotsLeft === 0) return { open: false, title: 'Cupo completo', message: 'No hay lugares disponibles para nuevas parejas. Consultá al club organizador.' }
  return { open: true, title: 'Inscripción abierta', message: 'Enviá tu solicitud. El club debe confirmar tu lugar.' }
}
