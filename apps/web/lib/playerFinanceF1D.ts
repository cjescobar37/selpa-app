import type { FinanceCursor, FinanceMethod, FinancePage, FinanceStatus } from './clubFinanceF1C'

export type PlayerFinanceFilter = 'ALL' | 'PENDING' | 'PAID'
export type PlayerFinanceTab = 'obligations' | 'movements'
export type PlayerFinanceOverview = {
  currency_code: 'ARS'
  total_pending: number
  total_paid: number
  open_obligations: number
}
export type PlayerFinanceObligation = {
  id: string
  created_at: string
  club_id: string
  club_name: string
  tournament_name: string | null
  concept: string
  debtor_type: 'USER' | 'TEAM'
  debtor_name: string
  original_amount: number
  allocated_net: number
  balance: number
  currency_code: 'ARS'
  financial_status: FinanceStatus
}
export type PlayerFinanceMovement = {
  id: string
  obligation_id: string
  paid_at: string
  club_id: string
  club_name: string
  tournament_name: string | null
  concept: string
  debtor_type: 'USER' | 'TEAM'
  amount: number
  currency_code: 'ARS'
  method: FinanceMethod
  status: 'POSTED' | 'REVERSED'
}
export type PlayerFinanceData = {
  overview: PlayerFinanceOverview
  obligations: FinancePage<PlayerFinanceObligation>
  movements: FinancePage<PlayerFinanceMovement>
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const allowedParams = new Set(['clubId', 'view', 'filter', 'beforeAt', 'beforeId'])

// Identity and individual obligation/payment selectors are deliberately not accepted.
export function parsePlayerFinanceQuery(params: URLSearchParams) {
  for (const key of params.keys()) {
    if (!allowedParams.has(key) || params.getAll(key).length !== 1) return null
  }
  const clubId = params.get('clubId') || null
  const view = params.get('view') || 'dashboard'
  const filter = params.get('filter') || 'ALL'
  const at = params.get('beforeAt')
  const id = params.get('beforeId')
  if ((clubId && !uuidPattern.test(clubId))
      || !['dashboard', 'obligations', 'movements'].includes(view)
      || !['ALL', 'PENDING', 'PAID'].includes(filter)
      || (at === null) !== (id === null)
      || (at !== null && (!/^\d{4}-\d{2}-\d{2}T/.test(at) || Number.isNaN(Date.parse(at))))
      || (id !== null && !uuidPattern.test(id))
      || (view === 'dashboard' && at !== null)) return null
  return { clubId, view, filter: filter as PlayerFinanceFilter, cursor: at && id ? { at, id } : null }
}

export function playerFinanceQuery(tab?: PlayerFinanceTab, filter: PlayerFinanceFilter = 'ALL', cursor: FinanceCursor = null) {
  const params = new URLSearchParams({ view: tab ?? 'dashboard', filter })
  if (cursor) {
    params.set('beforeAt', cursor.at)
    params.set('beforeId', cursor.id)
  }
  return params.toString()
}

export function groupPlayerObligations(rows: PlayerFinanceObligation[]) {
  const groups = new Map<string, { id: string; name: string; rows: PlayerFinanceObligation[] }>()
  for (const row of rows) {
    const group = groups.get(row.club_id) ?? { id: row.club_id, name: row.club_name, rows: [] }
    group.rows.push(row)
    groups.set(row.club_id, group)
  }
  return [...groups.values()]
}

export function playerBalanceLabel(row: Pick<PlayerFinanceObligation, 'debtor_type' | 'financial_status'>) {
  if (row.financial_status === 'CANCELLED') return 'Cargo cancelado'
  if (row.financial_status === 'PAID') return row.debtor_type === 'TEAM' ? 'Pagado de la pareja' : 'Pagado personal'
  return row.debtor_type === 'TEAM' ? 'Pendiente de la pareja' : 'Pendiente personal'
}

export function playerMovementLabel(status: PlayerFinanceMovement['status']) {
  return status === 'REVERSED' ? 'Cobro revertido' : 'Registrado por el club'
}

export function playerMovementDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
