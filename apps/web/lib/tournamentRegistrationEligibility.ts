import { supabaseAdmin } from '@/lib/supabaseAdmin'

type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'
type AdmissionStatus = 'NONE' | 'MANUAL_PAYMENT_VALIDATED' | 'PAY_AT_VENUE_APPROVED' | 'EXCEPTION_APPROVED' | 'BLOCKED'
type PaymentStatus = 'SIN_PAGO' | 'PENDIENTE' | 'PAGADO' | 'FALLIDO'

type RegistrationRow = { id: string; status: RegistrationStatus; admission_status: AdmissionStatus }
type PaymentRow = { registration_id: string | null; status: 'pending' | 'paid' | 'failed' | 'refunded' }

export type RegistrationEligibilityGateResult = { count: number; blockedCount: number; blockedRegistrationIds: string[] }

function derivePaymentStatus(payments: PaymentRow[]): PaymentStatus {
  if (payments.some((payment) => payment.status === 'paid')) return 'PAGADO'
  if (payments.some((payment) => payment.status === 'pending')) return 'PENDIENTE'
  if (payments.some((payment) => payment.status === 'failed' || payment.status === 'refunded')) return 'FALLIDO'
  return 'SIN_PAGO'
}

function isAdmissionEligible(status: AdmissionStatus) {
  return status === 'MANUAL_PAYMENT_VALIDATED' || status === 'PAY_AT_VENUE_APPROVED' || status === 'EXCEPTION_APPROVED'
}

export async function getTournamentRegistrationEligibilityGate(input: { clubId: string; tournamentId: string }): Promise<RegistrationEligibilityGateResult> {
  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id,status,admission_status')
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .eq('status', 'CONFIRMED')
  if (registrationsError) throw new Error(`No pude validar elegibilidad de inscripciones: ${registrationsError.message}`)

  const rows = (registrations ?? []) as RegistrationRow[]
  const ids = rows.map((registration) => registration.id)
  if (!ids.length) return { count: 0, blockedCount: 0, blockedRegistrationIds: [] }

  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('registration_id,status')
    .in('registration_id', ids)
  if (paymentsError) throw new Error(`No pude validar pagos de inscripciones: ${paymentsError.message}`)

  const byRegistration = ((payments ?? []) as PaymentRow[]).reduce((map, payment) => {
    if (payment.registration_id) (map.get(payment.registration_id) ?? map.set(payment.registration_id, []).get(payment.registration_id)!).push(payment)
    return map
  }, new Map<string, PaymentRow[]>())
  const blockedRegistrationIds = rows
    .filter((registration) => registration.admission_status === 'BLOCKED' || (derivePaymentStatus(byRegistration.get(registration.id) ?? []) !== 'PAGADO' && !isAdmissionEligible(registration.admission_status)))
    .map((registration) => registration.id)
  return { count: blockedRegistrationIds.length, blockedCount: blockedRegistrationIds.length, blockedRegistrationIds }
}

type TournamentEligibility = {
  category?: number | null
  gender?: string | null
  startDate?: string | null
  endDate?: string | null
}

type RegistrationCandidate = {
  userId?: string | null
  category?: number | null
  gender?: string | null
  approvedAt?: string | null
  operationalStatus?: string | null
  membershipStatus?: string | null
  membershipApprovedAt?: string | null
  profileStatus?: string | null
  birthDate?: string | null
  alreadyRegistered?: boolean
}

type TournamentAgeCategory = {
  minAge?: number | null
  maxAge?: number | null
  referenceRule?: string | null
  referenceConfig?: Record<string, unknown> | null
} | null

export function normalizeTournamentGender(value?: string | null) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'M' || normalized === 'MALE' || normalized === 'MASCULINO') return 'MALE'
  if (normalized === 'F' || normalized === 'FEMALE' || normalized === 'FEMENINO' || normalized === 'MUJERES') return 'FEMALE'
  if (normalized.includes('MIX')) return 'MIXED'
  return normalized || null
}

function ageAtDate(birthDate: string, referenceDate: string) {
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`)
  const reference = new Date(`${referenceDate.slice(0, 10)}T00:00:00Z`)
  let age = reference.getUTCFullYear() - birth.getUTCFullYear()
  if (reference.getUTCMonth() < birth.getUTCMonth() || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate())) age -= 1
  return age
}

function ageReferenceDate(tournament: TournamentEligibility, ageCategory: TournamentAgeCategory) {
  if (!ageCategory) return null
  const rule = String(ageCategory.referenceRule ?? '')
  const config = ageCategory.referenceConfig ?? {}
  if (rule === 'CALENDAR_YEAR_END') {
    const source = tournament.startDate ?? tournament.endDate ?? ''
    const year = source.slice(0, 4)
    return /^\d{4}$/.test(year) ? `${year}-12-31` : null
  }
  if (rule === 'FIXED_DATE') return String(config.date ?? '')
  return String(tournament.startDate ?? '')
}

/**
 * Reglas de preselección compartidas por búsqueda y submit. La RPC canónica
 * conserva la última validación para cubrir carreras entre búsqueda y alta.
 */
export function getTournamentRegistrationIneligibility(
  tournament: TournamentEligibility,
  candidate: RegistrationCandidate,
  ageCategory: TournamentAgeCategory,
) {
  if (!candidate.userId) return 'El jugador no pertenece al club.'
  if (!candidate.approvedAt || String(candidate.membershipStatus ?? '').toUpperCase() !== 'APPROVED' || !candidate.membershipApprovedAt) {
    return 'El jugador todavía no está aprobado en el club.'
  }
  if (String(candidate.operationalStatus ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') {
    return 'El jugador no está habilitado para competir.'
  }
  if (['BANNED', 'SUSPENDED', 'BLOCKED', 'LEFT'].includes(String(candidate.profileStatus ?? '').toUpperCase())) {
    return 'El jugador no está habilitado para competir.'
  }
  if (candidate.alreadyRegistered) return 'El jugador ya está inscripto en este torneo.'

  const tournamentCategory = Number(tournament.category ?? 0)
  if (tournamentCategory > 0 && Number(candidate.category ?? 0) < tournamentCategory) {
    return `La categoría del jugador no habilita este torneo (${tournamentCategory}).`
  }

  const tournamentGender = normalizeTournamentGender(tournament.gender)
  if (tournamentGender && tournamentGender !== 'MIXED') {
    const candidateGender = normalizeTournamentGender(candidate.gender)
    if (candidateGender && candidateGender !== tournamentGender) return 'La rama del jugador no coincide con la del torneo.'
  }

  if (ageCategory) {
    const birthDate = String(candidate.birthDate ?? '')
    const referenceDate = ageReferenceDate(tournament, ageCategory)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
      return 'El jugador no tiene los datos de edad necesarios para este torneo.'
    }
    const age = ageAtDate(birthDate, referenceDate)
    if ((ageCategory.minAge !== null && ageCategory.minAge !== undefined && age < Number(ageCategory.minAge)) ||
      (ageCategory.maxAge !== null && ageCategory.maxAge !== undefined && age > Number(ageCategory.maxAge))) {
      return 'El jugador no cumple la edad requerida para este torneo.'
    }
  }

  return null
}
