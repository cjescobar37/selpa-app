export type FinanceRange = { from: string; to: string }
export type FinancePeriod = 'month' | 'previous' | '30days' | 'custom'
export type FinanceReport = FinanceRange & {
  generated_at: string; total_received: number; total_pending: number
  open_obligations: number; paid_obligations: number; partial_obligations: number
  reconciliation_open: number
  methods: Array<{ method: string; amount: number }>
  tournaments: Array<{ tournament_name: string; pending: number; received: number }>
  aging: Array<{ bucket: string; amount: number; count: number }>
}
export type FinanceCase = {
  id: string; kind: 'INTENT' | 'EVENT'; source_version: string; occurred_at: string
  amount: number | null; currency_code: string | null; reason: string | null
  debtor_name: string | null; player_name: string; tournament_name: string | null
  balance: number | null; financial_status: string | null
  review_status: 'OPEN' | 'NOTE' | 'REVIEWED' | 'RESOLVED'
}
export type FinanceCaseDetail = { case: FinanceCase; history: Array<{
  id: string; action: string; note: string; actor_name: string; created_at: string
}> }
export function financeCaseAmount(row: FinanceCase) {
  if (row.amount == null) return 'A verificar'
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(row.amount))
    + ` ${row.currency_code ?? 'moneda a verificar'}`
}
export type FinanceRequest = (url: string, init?: RequestInit) => Promise<Record<string, unknown>>
export const agingLabels: Record<string, string> = {
  NO_DUE_DATE: 'Sin vencimiento', CURRENT: 'Al día', DAYS_1_7: '1–7 días vencido',
  DAYS_8_30: '8–30 días', DAYS_31_PLUS: '+30 días',
}
export const movementFilters = [
  ['ALL', 'Todos'], ['CASH', 'Efectivo'], ['BANK_TRANSFER', 'Transferencia'],
  ['MERCADO_PAGO', 'Mercado Pago'], ['REVERSED', 'Revertidos'],
] as const
export function reconciliationReason(code: string | null) {
  const reasons: Record<string, string> = {
    BALANCE_CHANGED: 'El saldo cambió después de iniciar el pago.',
    AMOUNT_MISMATCH: 'Mercado Pago informó un importe distinto.',
    CURRENCY_MISMATCH: 'La moneda informada no coincide con ARS.',
    PROVIDER_OWNERSHIP_MISMATCH: 'El pago no corresponde a la cuenta conectada.',
    CHECKOUT_UNCERTAIN: 'No se pudo confirmar el estado del checkout.',
    EXTERNAL_REFERENCE_MISMATCH: 'No se pudo vincular el pago con su inscripción.',
    PROVIDER_STATUS_REQUIRES_REVIEW: 'El estado del pago requiere revisión manual.',
  }
  if (code?.startsWith('LEDGER_REJECTED_')) return 'El cobro no pudo registrarse en SELPA. Revisá su saldo y estado.'
  return reasons[code ?? ''] ?? 'El cobro necesita revisión manual.'
}
export function validFinanceRange(from: string, to: string): from is string {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
  return valid(from) && valid(to) && to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 <= 366
}
export function financePeriodRange(period: Exclude<FinancePeriod, 'custom'>, now = new Date()): FinanceRange {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now)
  const date = new Date(`${today}T12:00:00Z`)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (period === '30days') { date.setUTCDate(date.getUTCDate() - 29); return { from: iso(date), to: today } }
  if (period === 'previous') {
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0, 12))
    return { from: iso(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 12))), to: iso(end) }
  }
  return { from: `${today.slice(0, 7)}-01`, to: today }
}
