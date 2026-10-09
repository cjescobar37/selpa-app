/** Synthetic RPC response doubles for local UI/handler QA, not a finance engine.
 * No production connections, financial writes, provider requests or migrations.
 * Existing F1D/F2 SQL contracts independently verify accounting semantics.
 */
import {CLUB,id} from './block1-fixture.mjs'
const at='2026-10-01T12:00:00Z'
export const financeReadRpcs=new Set(['get_platform_billing_overview_f2','list_platform_billing_f2',
  'get_player_finance_overview_f1d','list_player_finance_obligations_f1d','list_player_finance_movements_f1d'])
const obligation=(n,status,original,paid,balance)=>({id:id(90000+n),created_at:at,club_id:CLUB,club_name:'Club Central',
  tournament_name:`Torneo de prueba ${n}`,concept:'Inscripción',debtor_type:'TEAM',debtor_name:'Nombre quinto / Compañero',
  original_amount:original,allocated_net:paid,balance,currency_code:'ARS',financial_status:status})
const charges=[obligation(1,'PENDING',50000,0,50000),obligation(2,'PARTIAL',50000,20000,30000),
  obligation(3,'PAID',50000,50000,0),obligation(4,'CANCELLED',50000,0,0)]
const movements=['POSTED','REVERSED'].map((status,n)=>({id:id(91000+n),obligation_id:id(90002),paid_at:at,
  club_id:CLUB,club_name:'Club Central',tournament_name:'Torneo de prueba 2',concept:'Inscripción',debtor_type:'TEAM',
  amount:20000,currency_code:'ARS',method:'BANK_TRANSFER',status}))
const subscription={id:id(92000),club_id:CLUB,club_name:'Club Central',plan_name:'Plan Club',status:'ACTIVE',
  price:15000,billing_interval:'MONTHLY',current_period_start:'2026-10-01',current_period_end:'2026-11-01',created_at:at,
  config:{payment_instructions:'Coordiná el pago con SELPA. Datos sintéticos, no transferir.'}}
export function financeRpcResult(name,args,scenario) {
  const populated=scenario==='populated'
  if(name==='get_player_finance_overview_f1d') return {currency_code:'ARS',total_pending:populated?80000:0,total_paid:populated?70000:0,open_obligations:populated?2:0}
  if(name==='list_player_finance_obligations_f1d') return (populated?charges.filter(r=>args.p_filter==='PAID'?r.financial_status==='PAID':args.p_filter==='PENDING'?r.balance>0:true):[]).map(item=>({item}))
  if(name==='list_player_finance_movements_f1d') return (populated?movements:[]).map(item=>({item}))
  if(name==='get_platform_billing_overview_f2') return {from:args.p_from,to:args.p_to,received:populated?15000:0,pending:populated?5000:0,
    overdue:0,active_clubs:populated?1:0,clubs_with_debt:populated?1:0,subscription:populated?subscription:null,currency_code:'ARS'}
  if(name==='list_platform_billing_f2') {
    const rows=args.p_kind==='invoices'?[{id:id(93000),club_id:CLUB,invoice_number:'SELPA-QA-1',created_at:at,period_start:'2026-10-01',period_end:'2026-11-01',due_at:'2026-10-15',status:'ISSUED',financial_status:'PARTIAL',total:15000,allocated_net:10000,balance:5000}]
      :args.p_kind==='payments'?[{id:id(94000),club_id:CLUB,club_name:'Club Central',created_at:at,paid_at:at,amount:10000,method:'BANK_TRANSFER',status:'POSTED',allocations:[{invoice_number:'SELPA-QA-1',amount:10000}]}]:[]
    return {items:populated?rows:[],nextCursor:null}
  }
  throw Error('Unapproved financial RPC')
}
