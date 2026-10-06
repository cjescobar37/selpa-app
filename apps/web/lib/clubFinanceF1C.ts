export type FinanceStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED'
export type FinanceFilter = 'ALL' | 'PENDING' | 'PARTIAL' | 'PAID'
export type FinanceMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER'

export type FinanceOverview = {
  currency_code: 'ARS'
  total_pending: number
  total_received: number
  open_obligations: number
}

export function normalizeFinanceOverview(value: Partial<FinanceOverview> | null): FinanceOverview {
  return {
    currency_code: 'ARS',
    total_pending: Number(value?.total_pending ?? 0),
    total_received: Number(value?.total_received ?? 0),
    open_obligations: Number(value?.open_obligations ?? 0),
  }
}

export type FinanceObligation = {
  id: string
  created_at: string
  concept: string
  tournament_name: string | null
  debtor_name: string
  original_amount: number
  allocated_net: number
  balance: number
  currency_code: 'ARS'
  financial_status: FinanceStatus
}

export type FinanceMovement = {
  id: string
  obligation_id: string
  paid_at: string
  amount: number
  currency_code: 'ARS'
  method: FinanceMethod
  status: 'POSTED' | 'REVERSED'
  reference: string | null
  concept: string
  debtor_name: string
}

export type FinanceCursor = { at: string; id: string } | null
export type FinancePage<T> = { items: T[]; nextCursor: FinanceCursor }

export const financeMethodLabels: Record<FinanceMethod, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  OTHER: 'Otro',
}

export const financeStatusLabels: Record<FinanceStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
}

export function formatFinanceMoney(value: number | string) {
  const amount = Number(value)
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export function financePage<T extends { id: string }>(
  rows: T[], size: number, dateKey: keyof T,
): FinancePage<T> {
  const items = rows.slice(0, size)
  const last = items.at(-1)
  return {
    items,
    nextCursor: rows.length > size && last
      ? { at: String(last[dateKey]), id: last.id }
      : null,
  }
}

export function validFinanceAmount(value: unknown, balance: number) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return false
  const amount = Number(raw)
  return Number.isFinite(amount) && amount > 0 && amount <= balance
}
