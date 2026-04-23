import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export type CommissionStatus = 'pending' | 'settled' | 'refunded' | 'cancelled'
export type SettlementStatus = 'pending' | 'approved' | 'paid' | 'failed' | 'cancelled'
export type PaymentSourceType = 'tournament_registration' | 'manual' | 'adjustment' | 'other'

type JsonRecord = Record<string, unknown>

export type CreatePaymentInput = {
  userId: string
  clubId: string
  tournamentId?: string | null
  teamId?: string | null
  registrationId?: string | null
  sourceType?: PaymentSourceType
  status?: PaymentStatus
  amount: number
  refundedAmount?: number
  currency?: string
  provider?: string | null
  providerPaymentId?: string | null
  providerPreferenceId?: string | null
  providerStatus?: string | null
  providerPayload?: JsonRecord | null
  failureReason?: string | null
  refundReason?: string | null
  paidAt?: string | null
  failedAt?: string | null
  refundedAt?: string | null
  actorUserId?: string | null
}

export type CalculateCommissionInput = {
  paymentId: string
  commissionRateBps: number
  ruleSnapshot?: JsonRecord | null
}

export type GenerateSettlementInput = {
  clubId: string
  periodStart: string
  periodEnd: string
  actorUserId?: string | null
  notes?: string | null
}

export type ApproveSettlementInput = {
  settlementId: string
  actorUserId: string
}

export type MarkSettlementPaidInput = {
  settlementId: string
  actorUserId: string
  paidAt?: string | null
}

export type RefundPaymentInput = {
  paymentId: string
  refundedAmount?: number | null
  refundReason?: string | null
  actorUserId?: string | null
}

const paymentStatuses: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded']
const paymentSourceTypes: PaymentSourceType[] = ['tournament_registration', 'manual', 'adjustment', 'other']

function assertUuid(value: string | null | undefined, label: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} inválido.`)
  }
}

function normalizeMoney(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} inválido.`)
  return Math.round(value * 100) / 100
}

function normalizeDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} debe tener formato YYYY-MM-DD.`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} inválido.`)
  return value
}

function toIsoOrNull(value: string | null | undefined, fallback: string | null) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('Fecha inválida.')
  return parsed.toISOString()
}

async function ensureClubExists(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('clubs')
    .select('id,name')
    .eq('id', clubId)
    .maybeSingle()

  if (error) throw new Error(`No pude validar el club: ${error.message}`)
  if (!data?.id) throw new Error('Club no encontrado.')
  return data
}

async function ensureUserExists(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error) throw new Error(`No pude validar el usuario: ${error.message}`)
  if (!data.user) throw new Error('Usuario no encontrado.')
  return data.user
}

async function validateTournamentScope(input: {
  clubId: string
  tournamentId?: string | null
  teamId?: string | null
  registrationId?: string | null
}) {
  let tournamentId = input.tournamentId || null
  let teamId = input.teamId || null
  const registrationId = input.registrationId || null

  if (tournamentId) {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id')
      .eq('id', tournamentId)
      .maybeSingle()

    if (error) throw new Error(`No pude validar el torneo: ${error.message}`)
    if (!data?.id) throw new Error('Torneo no encontrado.')
    if (data.club_id !== input.clubId) throw new Error('El torneo no pertenece al club indicado.')
  }

  if (teamId) {
    const { data, error } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,club_id,tournament_id')
      .eq('id', teamId)
      .maybeSingle()

    if (error) throw new Error(`No pude validar el equipo: ${error.message}`)
    if (!data?.id) throw new Error('Equipo de torneo no encontrado.')
    if (data.club_id !== input.clubId) throw new Error('El equipo no pertenece al club indicado.')
    if (tournamentId && data.tournament_id !== tournamentId) throw new Error('El equipo no pertenece al torneo indicado.')
    tournamentId = tournamentId || data.tournament_id
  }

  if (registrationId) {
    const { data, error } = await supabaseAdmin
      .from('tournament_registrations')
      .select('id,club_id,tournament_id,team_id')
      .eq('id', registrationId)
      .maybeSingle()

    if (error) throw new Error(`No pude validar la inscripción: ${error.message}`)
    if (!data?.id) throw new Error('Inscripción de torneo no encontrada.')
    if (data.club_id !== input.clubId) throw new Error('La inscripción no pertenece al club indicado.')
    if (tournamentId && data.tournament_id !== tournamentId) throw new Error('La inscripción no pertenece al torneo indicado.')
    if (teamId && data.team_id !== teamId) throw new Error('La inscripción no pertenece al equipo indicado.')
    tournamentId = tournamentId || data.tournament_id
    teamId = teamId || data.team_id
  }

  return { tournamentId, teamId, registrationId }
}

export async function createPayment(input: CreatePaymentInput) {
  assertServiceRole()
  assertUuid(input.userId, 'userId')
  assertUuid(input.clubId, 'clubId')
  if (input.tournamentId) assertUuid(input.tournamentId, 'tournamentId')
  if (input.teamId) assertUuid(input.teamId, 'teamId')
  if (input.registrationId) assertUuid(input.registrationId, 'registrationId')

  const sourceType = input.sourceType ?? 'tournament_registration'
  const status = input.status ?? 'pending'
  if (!paymentSourceTypes.includes(sourceType)) throw new Error('sourceType inválido.')
  if (!paymentStatuses.includes(status)) throw new Error('status de pago inválido.')
  if (sourceType === 'tournament_registration' && !input.registrationId && !input.tournamentId) {
    throw new Error('Los pagos de inscripción necesitan registrationId o tournamentId.')
  }

  const amount = normalizeMoney(input.amount, 'amount')
  if (amount <= 0) throw new Error('amount debe ser mayor a cero.')

  const refundedAmount = normalizeMoney(
    input.refundedAmount ?? (status === 'refunded' ? amount : 0),
    'refundedAmount'
  )
  if (refundedAmount < 0 || refundedAmount > amount) throw new Error('refundedAmount debe estar entre 0 y amount.')

  await Promise.all([ensureUserExists(input.userId), ensureClubExists(input.clubId)])
  const scoped = await validateTournamentScope(input)

  if (input.providerPaymentId) {
    const { data: existing, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('provider_payment_id', input.providerPaymentId)
      .maybeSingle()

    if (error) throw new Error(`No pude verificar pago duplicado: ${error.message}`)
    if (existing?.id) return { payment: existing, created: false, duplicateReason: 'provider_payment_id' as const }
  }

  if (scoped.registrationId) {
    const { data: existing, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('registration_id', scoped.registrationId)
      .in('status', ['pending', 'paid'])
      .maybeSingle()

    if (error) throw new Error(`No pude verificar inscripción duplicada: ${error.message}`)
    if (existing?.id) return { payment: existing, created: false, duplicateReason: 'registration_id' as const }
  }

  const now = new Date().toISOString()
  const payload = {
    user_id: input.userId,
    club_id: input.clubId,
    tournament_id: scoped.tournamentId,
    team_id: scoped.teamId,
    registration_id: scoped.registrationId,
    source_type: sourceType,
    status,
    amount,
    refunded_amount: refundedAmount,
    currency: (input.currency || 'ARS').trim().toUpperCase(),
    provider: input.provider || null,
    provider_payment_id: input.providerPaymentId || null,
    provider_preference_id: input.providerPreferenceId || null,
    provider_status: input.providerStatus || null,
    provider_payload: input.providerPayload ?? {},
    paid_at: status === 'paid' ? toIsoOrNull(input.paidAt, now) : toIsoOrNull(input.paidAt, null),
    failed_at: status === 'failed' ? toIsoOrNull(input.failedAt, now) : toIsoOrNull(input.failedAt, null),
    refunded_at: status === 'refunded' ? toIsoOrNull(input.refundedAt, now) : toIsoOrNull(input.refundedAt, null),
    failure_reason: input.failureReason || null,
    refund_reason: input.refundReason || null,
    created_by: input.actorUserId || null,
    updated_by: input.actorUserId || null,
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert(payload)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`No pude registrar el pago: ${error.message}`)
  if (!data?.id) throw new Error('No pude registrar el pago.')
  return { payment: data, created: true, duplicateReason: null }
}

export async function calculateCommissionForPayment(input: CalculateCommissionInput) {
  assertServiceRole()
  assertUuid(input.paymentId, 'paymentId')
  if (!Number.isInteger(input.commissionRateBps) || input.commissionRateBps < 0 || input.commissionRateBps > 10000) {
    throw new Error('commissionRateBps debe ser un entero entre 0 y 10000.')
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('commissions')
    .select('*')
    .eq('payment_id', input.paymentId)
    .maybeSingle()

  if (existingError) throw new Error(`No pude verificar comisión existente: ${existingError.message}`)
  if (existing?.id) return { commission: existing, created: false }

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('id,club_id,tournament_id,status,amount,currency')
    .eq('id', input.paymentId)
    .maybeSingle()

  if (paymentError) throw new Error(`No pude buscar el pago: ${paymentError.message}`)
  if (!payment?.id) throw new Error('Pago no encontrado.')
  if (payment.status !== 'paid') throw new Error('Solo se puede calcular comisión sobre pagos paid.')

  const baseAmount = normalizeMoney(Number(payment.amount), 'baseAmount')
  const commissionAmount = normalizeMoney((baseAmount * input.commissionRateBps) / 10000, 'commissionAmount')
  const clubNetAmount = normalizeMoney(baseAmount - commissionAmount, 'clubNetAmount')

  const { data, error } = await supabaseAdmin
    .from('commissions')
    .insert({
      payment_id: payment.id,
      club_id: payment.club_id,
      tournament_id: payment.tournament_id,
      status: 'pending' satisfies CommissionStatus,
      base_amount: baseAmount,
      commission_rate_bps: input.commissionRateBps,
      commission_amount: commissionAmount,
      club_net_amount: clubNetAmount,
      currency: payment.currency || 'ARS',
      rule_snapshot: input.ruleSnapshot ?? {
        commission_rate_bps: input.commissionRateBps,
        calculated_at: new Date().toISOString(),
      },
    })
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`No pude calcular la comisión: ${error.message}`)
  if (!data?.id) throw new Error('No pude calcular la comisión.')
  return { commission: data, created: true }
}

export async function generateSettlement(input: GenerateSettlementInput) {
  assertServiceRole()
  assertUuid(input.clubId, 'clubId')
  const periodStart = normalizeDate(input.periodStart, 'periodStart')
  const periodEnd = normalizeDate(input.periodEnd, 'periodEnd')
  if (periodEnd < periodStart) throw new Error('periodEnd debe ser mayor o igual a periodStart.')

  await ensureClubExists(input.clubId)

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('settlements')
    .select('*')
    .eq('club_id', input.clubId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existingError) throw new Error(`No pude verificar liquidación existente: ${existingError.message}`)
  if (existing?.id) return { settlement: existing, items: [], generated: false, duplicateReason: 'club_period' as const }

  const { data: commissions, error: commissionsError } = await supabaseAdmin
    .from('commissions')
    .select('id,payment_id,club_id,status,base_amount,commission_amount,club_net_amount,currency,settlement_id')
    .eq('club_id', input.clubId)
    .eq('status', 'pending')
    .is('settlement_id', null)

  if (commissionsError) throw new Error(`No pude buscar comisiones pendientes: ${commissionsError.message}`)
  if (!commissions?.length) throw new Error('No hay comisiones pendientes para liquidar.')

  const paymentIds = commissions.map((commission: any) => commission.payment_id).filter(Boolean)
  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('id,status,paid_at')
    .in('id', paymentIds)

  if (paymentsError) throw new Error(`No pude buscar pagos de las comisiones: ${paymentsError.message}`)

  const paidPayments = new Map(
    (payments ?? [])
      .filter((payment: any) => {
        const paidAt = payment.paid_at ? String(payment.paid_at).slice(0, 10) : null
        return payment.status === 'paid' && paidAt && paidAt >= periodStart && paidAt <= periodEnd
      })
      .map((payment: any) => [payment.id, payment])
  )

  const includedCommissions = commissions.filter((commission: any) => paidPayments.has(commission.payment_id))
  if (!includedCommissions.length) throw new Error('No hay pagos paid dentro del período indicado.')

  const currencies = new Set(includedCommissions.map((commission: any) => commission.currency || 'ARS'))
  if (currencies.size > 1) throw new Error('No se puede generar una liquidación con múltiples monedas.')
  const currency = Array.from(currencies)[0] || 'ARS'

  const totals = includedCommissions.reduce(
    (acc, commission: any) => {
      acc.grossAmount += Number(commission.base_amount)
      acc.commissionAmount += Number(commission.commission_amount)
      acc.netAmount += Number(commission.club_net_amount)
      return acc
    },
    { grossAmount: 0, commissionAmount: 0, netAmount: 0 }
  )

  const { data: settlement, error: settlementError } = await supabaseAdmin
    .from('settlements')
    .insert({
      club_id: input.clubId,
      status: 'pending' satisfies SettlementStatus,
      period_start: periodStart,
      period_end: periodEnd,
      gross_amount: normalizeMoney(totals.grossAmount, 'grossAmount'),
      commission_amount: normalizeMoney(totals.commissionAmount, 'commissionAmount'),
      net_amount: normalizeMoney(totals.netAmount, 'netAmount'),
      currency,
      payments_count: includedCommissions.length,
      generated_by: input.actorUserId || null,
      notes: input.notes || null,
    })
    .select('*')
    .maybeSingle()

  if (settlementError) throw new Error(`No pude generar la liquidación: ${settlementError.message}`)
  if (!settlement?.id) throw new Error('No pude generar la liquidación.')

  const itemPayload = includedCommissions.map((commission: any) => ({
    settlement_id: settlement.id,
    payment_id: commission.payment_id,
    commission_id: commission.id,
    gross_amount: Number(commission.base_amount),
    commission_amount: Number(commission.commission_amount),
    net_amount: Number(commission.club_net_amount),
    currency,
  }))

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('settlement_items')
    .insert(itemPayload)
    .select('*')

  if (itemsError) {
    await supabaseAdmin.from('settlements').delete().eq('id', settlement.id)
    throw new Error(`No pude crear los ítems de la liquidación: ${itemsError.message}`)
  }

  const { error: updateError } = await supabaseAdmin
    .from('commissions')
    .update({
      settlement_id: settlement.id,
      status: 'settled' satisfies CommissionStatus,
    })
    .in('id', includedCommissions.map((commission: any) => commission.id))

  if (updateError) {
    await supabaseAdmin.from('settlements').delete().eq('id', settlement.id)
    throw new Error(`No pude marcar comisiones como liquidadas: ${updateError.message}`)
  }

  return { settlement, items: items ?? [], generated: true, duplicateReason: null }
}

export async function approveSettlement(input: ApproveSettlementInput) {
  assertServiceRole()
  assertUuid(input.settlementId, 'settlementId')
  assertUuid(input.actorUserId, 'actorUserId')

  const { data: current, error: currentError } = await supabaseAdmin
    .from('settlements')
    .select('*')
    .eq('id', input.settlementId)
    .maybeSingle()

  if (currentError) throw new Error(`No pude buscar la liquidación: ${currentError.message}`)
  if (!current?.id) throw new Error('Liquidación no encontrada.')
  if (current.status !== 'pending') throw new Error('Solo se pueden aprobar liquidaciones pending.')

  const approvedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('settlements')
    .update({
      status: 'approved' satisfies SettlementStatus,
      approved_by: input.actorUserId,
      approved_at: approvedAt,
    })
    .eq('id', input.settlementId)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`No pude aprobar la liquidación: ${error.message}`)
  if (!data?.id) throw new Error('No pude aprobar la liquidación.')
  return { settlement: data, previousStatus: current.status }
}

export async function markSettlementPaid(input: MarkSettlementPaidInput) {
  assertServiceRole()
  assertUuid(input.settlementId, 'settlementId')
  assertUuid(input.actorUserId, 'actorUserId')

  const { data: current, error: currentError } = await supabaseAdmin
    .from('settlements')
    .select('*')
    .eq('id', input.settlementId)
    .maybeSingle()

  if (currentError) throw new Error(`No pude buscar la liquidación: ${currentError.message}`)
  if (!current?.id) throw new Error('Liquidación no encontrada.')
  if (current.status !== 'approved') throw new Error('Solo se pueden marcar como pagadas liquidaciones approved.')

  const paidAt = toIsoOrNull(input.paidAt, new Date().toISOString())
  const { data, error } = await supabaseAdmin
    .from('settlements')
    .update({
      status: 'paid' satisfies SettlementStatus,
      paid_by: input.actorUserId,
      paid_at: paidAt,
    })
    .eq('id', input.settlementId)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`No pude marcar la liquidación como pagada: ${error.message}`)
  if (!data?.id) throw new Error('No pude marcar la liquidación como pagada.')
  return { settlement: data, previousStatus: current.status }
}

export async function refundPayment(input: RefundPaymentInput) {
  assertServiceRole()
  assertUuid(input.paymentId, 'paymentId')
  if (input.actorUserId) assertUuid(input.actorUserId, 'actorUserId')

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('id', input.paymentId)
    .maybeSingle()

  if (paymentError) throw new Error(`No pude buscar el pago: ${paymentError.message}`)
  if (!payment?.id) throw new Error('Pago no encontrado.')
  if (payment.status !== 'paid' && payment.status !== 'refunded') {
    throw new Error('Solo se pueden reembolsar pagos paid o refunded.')
  }

  const amount = normalizeMoney(Number(payment.amount), 'amount')
  const currentRefunded = normalizeMoney(Number(payment.refunded_amount ?? 0), 'refundedAmount')
  const requestedRefund = normalizeMoney(input.refundedAmount ?? amount, 'refundedAmount')
  if (requestedRefund <= 0) throw new Error('refundedAmount debe ser mayor a cero.')

  const nextRefundedAmount = normalizeMoney(
    input.refundedAmount == null ? amount : currentRefunded + requestedRefund,
    'refundedAmount'
  )
  if (nextRefundedAmount > amount) throw new Error('El reembolso supera el monto del pago.')

  const { data: commission, error: commissionError } = await supabaseAdmin
    .from('commissions')
    .select('id,status,settlement_id')
    .eq('payment_id', payment.id)
    .maybeSingle()

  if (commissionError) throw new Error(`No pude validar la comisión asociada: ${commissionError.message}`)
  if (commission?.settlement_id) {
    throw new Error('No se puede reembolsar un pago ya incluido en una liquidación.')
  }

  const refundedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'refunded' satisfies PaymentStatus,
      refunded_amount: nextRefundedAmount,
      refunded_at: refundedAt,
      refund_reason: input.refundReason || payment.refund_reason || null,
      updated_by: input.actorUserId || null,
    })
    .eq('id', payment.id)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`No pude registrar el reembolso: ${error.message}`)
  if (!data?.id) throw new Error('No pude registrar el reembolso.')

  if (commission?.id) {
    const { error: commissionUpdateError } = await supabaseAdmin
      .from('commissions')
      .update({ status: 'refunded' satisfies CommissionStatus })
      .eq('id', commission.id)

    if (commissionUpdateError) {
      throw new Error(`El pago fue reembolsado, pero no pude actualizar la comisión: ${commissionUpdateError.message}`)
    }
  }

  return {
    payment: data,
    previousStatus: payment.status as PaymentStatus,
    refundedAmount: requestedRefund,
    totalRefundedAmount: nextRefundedAmount,
  }
}
