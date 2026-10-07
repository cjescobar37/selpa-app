// SELPA Billing DTOs: deliberately independent of Club Finance amounts and states.
export type BillingCursor = { at: string; id: string }
export type BillingRow = {
  id: string; created_at: string; club_id?: string; club_name?: string; name?: string; code?: string;
  description?: string; billing_interval?: string; price?: number; active?: boolean; config?: { payment_instructions?: string; features?: string[] };
  revision?: number; plan_id?: string; plan_name?: string; next_plan_name?: string; balance?: number;
  next_plan_id?: string; next_plan_price?: number; next_plan_interval?: string; catalog_price?: number; catalog_interval?: string;
  financial_status?: string; status?: string; current_period_start?: string; current_period_end?: string;
  period_start?: string; period_end?: string; generated_current?: boolean; invoice_number?: string;
  total?: number; allocated_net?: number; due_at?: string; paid_at?: string; amount?: number; method?: string;
  reference?: string; reversal_reason?: string; void_reason?: string; clubs?: number; billed?: number; overdue?: number;
  operation?: string; actor_id?: string; payload?: Record<string, unknown>; response?: Record<string, unknown>;
  cancel_at_period_end?: boolean; allocations?: Array<{ invoice_id: string; invoice_number: string; amount: number }>;
}
export type BillingPage = { items: BillingRow[]; nextCursor: BillingCursor | null }
export type BillingOverview = {
  from: string; to: string; received: number; pending: number; overdue: number; active_clubs: number;
  clubs_with_debt: number; subscription: BillingRow | null; currency_code: 'ARS'
}
export const billingOperations = ['SAVE_PLAN','ASSIGN_PLAN','CHANGE_PLAN','GENERATE_PERIOD','REGISTER_PAYMENT','REVERSE_PAYMENT','VOID_INVOICE','SUSPEND','REACTIVATE','CANCEL_AT_END'] as const
export const billingLists = ['plans','subscriptions','invoices','payments','periods','balances','plan_reports','clubs','history'] as const
export const billingLabels: Record<string,string> = {
  ACTIVE:'Activa', TRIAL:'Prueba', PAST_DUE:'Con deuda vencida', SUSPENDED:'Suspendida', CANCELLED:'Cancelada',
  ISSUED:'Pendiente', PARTIAL:'Parcial', PAID:'Pagada', VOID:'Anulada', OVERDUE:'Vencida', DRAFT:'Borrador',
  POSTED:'Cobrado', REVERSED:'Revertido', MONTHLY:'Mensual', ANNUAL:'Anual', FREE:'Sin cargo',
  INVOICED:'Facturado', OPEN:'Abierto', CASH:'Efectivo', BANK_TRANSFER:'Transferencia', MERCADO_PAGO:'Mercado Pago', OTHER:'Otro',
  SAVE_PLAN:'Plan guardado', ASSIGN_PLAN:'Plan asignado', CHANGE_PLAN:'Cambio de plan', GENERATE_PERIOD:'Período generado',
  REGISTER_PAYMENT:'Pago registrado', REVERSE_PAYMENT:'Pago revertido', VOID_INVOICE:'Comprobante anulado',
  SUSPEND:'Suscripción suspendida', REACTIVATE:'Suscripción reactivada', CANCEL_AT_END:'Cancelación al cierre',
}
export const billingMoney = (value: unknown) => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(value ?? 0))
export function billingDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'})
    .format(new Date(value.length===10 ? `${value}T12:00:00-03:00` : value))
}
export function billingValidMoney(value: unknown,positive=false) {
  return typeof value==='number' && Number.isFinite(value) && value >= (positive ? 0.01 : 0) && value < 1e12 && Math.abs(value*100-Math.round(value*100))<1e-6
}
