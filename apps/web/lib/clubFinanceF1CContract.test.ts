import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { financePage, formatFinanceMoney, normalizeFinanceOverview, validFinanceAmount } from './clubFinanceF1C'

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const migration = source('../supabase/migrations/20261006114657_20261002170000_club_finance_f1c_read_model.sql')
const api = source('../app/api/clubs/finance/core/route.ts')
const ui = source('../app/(app)/club/contabilidad/page.tsx')
const oldApi = source('../app/api/clubs/finance/route.ts')
const qa = source('../supabase/qa/20261002170000_club_finance_f1c_read_model_validation.sql')

test('empty summary and ARS presentation remain explicit', () => {
  assert.match(migration, /coalesce\(sum\(greatest\(o\.original_amount - coalesce\(paid\.amount, 0\), 0\)\), 0\)/)
  assert.match(migration, /coalesce\(sum\(p\.amount\), 0\)/)
  assert.match(migration, /'currency_code', 'ARS'/)
  assert.match(formatFinanceMoney(0), /0/)
  assert.deepEqual(normalizeFinanceOverview(null), {
    currency_code: 'ARS', total_pending: 0, total_received: 0, open_obligations: 0,
  })
  assert.match(ui, /No hay cobros pendientes/)
  assert.match(ui, /Todavía no hay movimientos/)
})

test('pending, partial, paid, cancelled and reversal use net POSTED money', () => {
  assert.match(migration, /p\.status = 'POSTED'/)
  assert.match(migration, /o\.status = 'OPEN'/)
  assert.match(migration, /when b\.status = 'CANCELLED' then 'CANCELLED'/)
  assert.match(migration, /when b\.balance = 0 then 'PAID'/)
  assert.match(migration, /when b\.allocated_net > 0 then 'PARTIAL'/)
  assert.match(migration, /else 'PENDING'/)
  assert.match(migration, /v_filter = 'PENDING' and b\.status = 'OPEN' and b\.balance > 0/)
  assert.match(qa, /QA_F1C_PARTIAL_BALANCE_INVALID/)
  assert.match(qa, /QA_F1C_PAID_BALANCE_INVALID/)
  assert.match(qa, /QA_F1C_REVERSAL_NET_INVALID/)
  assert.match(qa, /QA_F1C_CANCELLED_PENDING_INVALID/)
})

test('open_obligations counts only OPEN ARS obligations with net balance > 0; derived PAID is excluded', () => {
  const overview = migration.slice(
    migration.indexOf('create function public.get_club_finance_overview_f1c('),
    migration.indexOf('create function public.list_club_finance_obligations_f1c('),
  )
  assert.match(overview, /sum\(a\.amount\) amount[\s\S]*join public\.club_finance_payments p[\s\S]*p\.status = 'POSTED'/)
  assert.match(overview, /count\(\*\) filter \(where greatest\(o\.original_amount - coalesce\(paid\.amount, 0\), 0\) > 0\)\s+into v_pending, v_open/)
  assert.match(overview, /left join paid on paid\.obligation_id = o\.id\s+where o\.club_id = p_club_id and o\.currency_code = 'ARS' and o\.status = 'OPEN'/)
  assert.doesNotMatch(overview, /\b(?:update|insert|delete)\b/i)
  assert.match(qa, /QA_F1C_OPEN_BALANCE_CREATED_INVALID/)
  assert.match(qa, /QA_F1C_PAID_NOT_OPEN_INVALID/)
  assert.match(qa, /QA_F1C_REVERSED_OPEN_BALANCE_INVALID/)
  assert.match(qa, /QA_F1C_PARTIAL_STILL_OPEN_INVALID/)
})

test('read model is scoped, batch and cursor paginated without legacy amounts', () => {
  assert.match(migration, /has_club_capability\(p_club_id, 'finance:view'\)/)
  assert.match(migration, /revoke all on function public\.get_club_finance_overview_f1c\(uuid\)[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.get_club_finance_overview_f1c\(uuid\) to authenticated/)
  assert.match(migration, /left join public\.profiles p1/)
  assert.match(migration, /left join public\.profiles p2/)
  assert.match(migration, /\(b\.created_at, b\.id\) < \(p_before_created_at, p_before_id\)/)
  assert.match(migration, /\(p\.paid_at, p\.id\) < \(p_before_paid_at, p_before_id\)/)
  assert.doesNotMatch(migration, /club_receivables|club_financial_transactions|tournament_payments/)
  assert.doesNotMatch(ui, /\/api\/clubs\/finance\?/)
  assert.match(oldApi, /club_receivables/)
  assert.match(api, /Promise\.all\(\[/)
  assert.match(api, /p_limit: pageSize \+ 1/)
  assert.match(qa, /QA_F1C_CROSS_CLUB_VISIBLE/)
  const page = financePage([{ id: '2', created_at: 'b' }, { id: '1', created_at: 'a' }], 1, 'created_at')
  assert.deepEqual(page.nextCursor, { at: 'b', id: '2' })
})

test('writes use F1A RPCs, require finance:manage and preserve idempotency', () => {
  assert.match(api, /requireClubCapability\(req, clubId, 'finance:manage'\)/)
  assert.match(api, /register_club_finance_payment/)
  assert.match(api, /reverse_club_finance_payment/)
  assert.match(api, /result\.error\.code !== '40001'/)
  assert.match(api, /p_idempotency_key: key/)
  assert.match(api, /CLUB_FINANCE_OVER_ALLOCATION: 'El importe supera el saldo pendiente\.'/)
  assert.match(ui, /canManage && payable/)
  assert.match(ui, /canManage && row\.status === 'POSTED'/)
  assert.match(ui, /submitting\.current/)
  assert.match(ui, /crypto\.randomUUID\(\)/)
  assert.equal(validFinanceAmount('0', 100), false)
  assert.equal(validFinanceAmount('101', 100), false)
  assert.equal(validFinanceAmount('25.50', 100), true)
  assert.equal(validFinanceAmount('1.001', 100), false)
})
