import { financeCsv, financeXlsx } from './clubFinanceF1FExport'
import { billingLabels, type BillingRow } from './platformBillingF2'

export function billingExportTable(kind:string,rows:BillingRow[]) {
  const date=(s?:string)=>s ? new Date(s.length===10 ? `${s}T00:00:00Z` : `${new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(s)).replace(' ','T')}Z`) : null
  const label=(s?:string)=>billingLabels[s??'']??s??''
  const text=(s?:string)=>s??''
  const number=(s?:number)=>Number(s??0)
  if(kind==='invoices') return {name:'Comprobantes',headers:['Número','Club','Inicio período','Fin período (exclusivo)','Emisión','Vencimiento','Total','Aplicado neto','Saldo','Estado','Moneda'],
    rows:rows.map(r=>[text(r.invoice_number),text(r.club_name),date(r.period_start),date(r.period_end),date(r.created_at),date(r.due_at),number(r.total),number(r.allocated_net),number(r.balance),label(r.financial_status),'ARS'])}
  if(kind==='payments') return {name:'Pagos',headers:['Cobro','Club','Importe','Método','Referencia','Estado','Moneda'],rows:rows.map(r=>[date(r.paid_at),text(r.club_name),number(r.amount),label(r.method),text(r.reference),label(r.status),'ARS'])}
  if(kind==='subscriptions') return {name:'Suscripciones',headers:['Club','Plan','Estado','Inicio período','Próxima renovación','Precio actual','Saldo','Moneda'],rows:rows.map(r=>[text(r.club_name),text(r.plan_name),label(r.financial_status),date(r.current_period_start),date(r.current_period_end),number(r.price),number(r.balance),'ARS'])}
  return {name:'Saldos por club',headers:['Club','Pendiente','Vencido','Moneda'],rows:rows.map(r=>[text(r.club_name),number(r.balance),number(r.overdue),'ARS'])}
}
export const billingCsv = financeCsv
export const billingXlsx = financeXlsx
