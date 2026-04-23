import { supabaseAdmin } from '@/lib/supabaseAdmin'

type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'
type AdmissionStatus =
  | 'NONE'
  | 'MANUAL_PAYMENT_VALIDATED'
  | 'PAY_AT_VENUE_APPROVED'
  | 'EXCEPTION_APPROVED'
  | 'BLOCKED'
type PaymentStatus = 'SIN_PAGO' | 'PENDIENTE' | 'PAGADO' | 'FALLIDO'

type RegistrationRow = {
  id: string
  status: RegistrationStatus
  admission_status: AdmissionStatus
}

type PaymentRow = {
  registration_id: string | null
  status: 'pending' | 'paid' | 'failed' | 'refunded'
}

export type RegistrationEligibilityGateResult = {
  count: number
  blockedCount: number
  blockedRegistrationIds: string[]
}

function derivePaymentStatus(payments: PaymentRow[]): PaymentStatus {
  if (payments.some((payment) => payment.status === 'paid')) return 'PAGADO'
  if (payments.some((payment) => payment.status === 'pending')) return 'PENDIENTE'
  if (payments.some((payment) => payment.status === 'failed' || payment.status === 'refunded')) return 'FALLIDO'
  return 'SIN_PAGO'
}

function isAdmissionEligible(admissionStatus: AdmissionStatus) {
  return (
    admissionStatus === 'MANUAL_PAYMENT_VALIDATED' ||
    admissionStatus === 'PAY_AT_VENUE_APPROVED' ||
    admissionStatus === 'EXCEPTION_APPROVED'
  )
}

function isRegistrationEligible(registration: RegistrationRow, paymentStatus: PaymentStatus) {
  return (
    registration.status === 'CONFIRMED' &&
    registration.admission_status !== 'BLOCKED' &&
    (paymentStatus === 'PAGADO' || isAdmissionEligible(registration.admission_status))
  )
}

export async function getTournamentRegistrationEligibilityGate(input: {
  clubId: string
  tournamentId: string
}): Promise<RegistrationEligibilityGateResult> {
  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id,status,admission_status')
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .eq('status', 'CONFIRMED')

  if (registrationsError) throw new Error(`No pude validar elegibilidad de inscripciones: ${registrationsError.message}`)

  const registrationRows = (registrations ?? []) as RegistrationRow[]
  const registrationIds = registrationRows.map((registration) => registration.id)
  if (registrationIds.length === 0) {
    return { count: 0, blockedCount: 0, blockedRegistrationIds: [] }
  }

  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('registration_id,status')
    .in('registration_id', registrationIds)

  if (paymentsError) throw new Error(`No pude validar pagos de inscripciones: ${paymentsError.message}`)

  const paymentsByRegistration = ((payments ?? []) as PaymentRow[]).reduce((map, payment) => {
    if (!payment.registration_id) return map
    const current = map.get(payment.registration_id) ?? []
    current.push(payment)
    map.set(payment.registration_id, current)
    return map
  }, new Map<string, PaymentRow[]>())

  const blockedRegistrationIds = registrationRows
    .filter((registration) => {
      const paymentStatus = derivePaymentStatus(paymentsByRegistration.get(registration.id) ?? [])
      return !isRegistrationEligible(registration, paymentStatus)
    })
    .map((registration) => registration.id)

  return {
    count: blockedRegistrationIds.length,
    blockedCount: blockedRegistrationIds.length,
    blockedRegistrationIds,
  }
}
