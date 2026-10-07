import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { financePeriodRange, reconciliationReason, validFinanceRange, type FinanceReport } from './clubFinanceF1F'
import { financeCsv, financeExportTables, financeXlsx } from './clubFinanceF1FExport'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const sql = read('../supabase/migrations/20261007094742_20261007013543_club_finance_f1f_reports_reconciliation.sql')
const qa = read('../supabase/qa/20261007013543_club_finance_f1f_validation.sql')
const report: FinanceReport = {
  from: '2026-10-02', to: '2026-10-04', generated_at: '2026-10-04T18:00:00Z',
  total_received: 20, total_pending: 80, open_obligations: 1, paid_obligations: 0,
  partial_obligations: 1, reconciliation_open: 1,
  methods: [{ method: 'MERCADO_PAGO', amount: 20 }],
  tournaments: [{ tournament_name: 'Noviembre Master', pending: 80, received: 20 }],
  aging: [{ bucket: 'NO_DUE_DATE', amount: 80, count: 1 }],
}
const tables = financeExportTables(report,
  [{ created_at: '2026-10-02T03:00:00Z', debtor_name: '=HYPERLINK("bad")', original_amount: 100, allocated_net: 20,
    balance: 80, financial_status: 'PARTIAL', due_date: null }],
  [{ paid_at: '2026-10-02T03:00:00Z', amount: 20.5, status: 'POSTED', method: 'OTHER', provider: 'MERCADO_PAGO', reference: 'Referencia; "con comillas"' }],
  [{ occurred_at: '2026-10-03T03:00:00Z', amount: -100, event_type: 'PAYMENT_REVERSED', method: 'CASH' }])

test('F1F uses only net F1A amounts and canonical F1E provider links, never legacy', () => {
  assert.match(sql, /p\.status = 'POSTED'/)
  assert.match(sql, /case when o\.status = 'CANCELLED' then 0/)
  assert.match(sql, /when b\.balance = 0 then 'PAID' when b\.allocated_net > 0 then 'PARTIAL'/)
  assert.match(sql, /where o\.balance > 0/)
  assert.match(sql, /i\.finance_payment_id = p\.id/)
  assert.match(sql, /then -p\.amount else p\.amount/)
  assert.doesNotMatch(sql, /tournament_payments|club_receivables|club_financial_transactions|vault\./)
  for (const check of ['PARTIAL', 'PAID', 'REVERSAL_NET', 'CANCELLED', 'MP_METHOD', 'RANGE', 'AGING', 'NO_CAPABILITY', 'CROSS_CLUB', 'HISTORY', 'IDEMPOTENCY', 'IMMUTABLE', 'EVENT']) assert.match(qa, new RegExp(`QA_F1F_${check}`))
})
test('read/export ACL is finance:view; administrative actions are finance:manage and append-only', () => {
  assert.equal((sql.match(/has_club_capability\(p_club_id, 'finance:view'\)/g) ?? []).length, 2)
  assert.equal((sql.match(/has_club_capability\(p_club_id, 'finance:manage'\)/g) ?? []).length, 2)
  assert.match(sql, /has_club_capability\(p_club_id, 'finance:manage'\)/)
  assert.match(sql, /before update or delete on public\.club_finance_review_history_f1f/)
  assert.match(sql, /p_source_version[\s\S]*FINANCE_CASE_CHANGED/)
  assert.match(sql, /btrim\(p_note\), auth\.uid\(\), p_idempotency_key/)
  assert.match(sql, /h\.action in \('REVIEWED', 'RESOLVED'\)/)
  assert.match(sql, /c\.review_status <> 'RESOLVED'/)
  assert.match(sql, /from public, anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /(?:update|delete from|insert into) public\.(?:club_finance_payments|club_finance_journals|club_payment_intents|club_payment_provider_event)/i)
  assert.match(sql, /security_invoker = true/)
})
test('Argentina periods include calendar dates, previous month, leap day and midnight boundaries', () => {
  assert.deepEqual(financePeriodRange('month', new Date('2026-10-01T02:00:00Z')), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(financePeriodRange('previous', new Date('2024-03-10T12:00:00Z')), { from: '2024-02-01', to: '2024-02-29' })
  assert.deepEqual(financePeriodRange('30days', new Date('2026-10-06T12:00:00Z')), { from: '2026-09-07', to: '2026-10-06' })
  assert.equal(validFinanceRange('2026-10-02', '2026-10-04'), true)
  assert.equal(validFinanceRange('2026-02-30', '2026-03-01'), false)
  assert.equal(validFinanceRange('2026-10-04', '2026-10-02'), false)
  assert.equal(validFinanceRange('2020-01-01', '2026-10-02'), false)
  assert.match(sql, /\(p_to \+ 1\)::timestamp at time zone 'America\/Argentina\/Buenos_Aires'/)
  assert.match(sql, /p\.paid_at >= v_start and p\.paid_at < v_end/)
  assert.match(sql, /when o\.due_date is null then 'NO_DUE_DATE'/)
})
test('operator explanations do not expose provider codes as primary messages', () => {
  assert.equal(reconciliationReason('BALANCE_CHANGED'), 'El saldo cambió después de iniciar el pago.')
  assert.match(reconciliationReason('AMOUNT_MISMATCH'), /importe distinto/)
  assert.match(reconciliationReason('LEDGER_REJECTED_FORBIDDEN'), /no pudo registrarse/)
  assert.match(reconciliationReason('UNKNOWN_PRIVATE_CODE'), /revisión manual/)
})
test('Argentina CSV uses BOM, delimiter, numeric comma, quote escaping and formula-safe text', () => {
  const csv = financeCsv(tables[1])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv, /"Creación";"Jugador \/ pareja"/)
  assert.match(csv, /02\/10\/2026 00:00/)
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/)
  assert.match(financeCsv(tables[2]), /20,5/)
  assert.match(financeCsv(tables[2]), /Mercado Pago/)
  assert.match(financeCsv(tables[2]), /Referencia; ""con comillas""/)
  assert.match(financeCsv(tables[3]), /;-100;/)
  assert.match(financeCsv(tables[3]), /Reversión/)
})
test('XLSX is a real five-sheet OOXML ZIP with typed dates/numbers and styled headers', async () => {
  const require = createRequire(import.meta.url)
  const { unzipSync, strFromU8 } = require('fflate') as { unzipSync: (b: Uint8Array) => Record<string, Uint8Array>; strFromU8: (b: Uint8Array) => string }
  const buffer = await financeXlsx(tables)
  assert.equal(buffer.subarray(0, 2).toString(), 'PK')
  const files = unzipSync(buffer)
  const workbook = strFromU8(files['xl/workbook.xml'])
  for (const name of ['Resumen', 'Obligaciones', 'Pagos', 'Movimientos', 'Por torneo']) assert.ok(workbook.includes(name))
  const sheet = strFromU8(files['xl/worksheets/sheet2.xml'])
  assert.match(sheet, /<v>100<\/v>/)
  assert.match(sheet, /<v>80<\/v>/)
  assert.match(sheet, /state="frozen"/)
  assert.doesNotMatch(sheet, /<f[ >]/)
  assert.match(strFromU8(files['xl/styles.xml']), /071E3D|071e3d/)
  assert.match(strFromU8(files['xl/styles.xml']), /dd\/mm\/yyyy hh:mm/)
})

// Exercise real route handlers with isolated authorization/RPC doubles, not regex-only assertions.
function route(path: string, allowed: boolean, rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: null }>) {
  const exports: Record<string, (req: unknown) => Promise<Response>> = {}
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, Response, Uint8Array, URLSearchParams,
    require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } }
      if (name.endsWith('clubFinanceF1FServer')) return {
        financeAccess: async () => allowed ? { error: null, client: { rpc }, canManage: true } : { error: Response.json({ error: 'Forbidden' }, { status: 403 }), client: null },
        financeRangeParams: (q: URLSearchParams) => validFinanceRange(q.get('from') ?? '', q.get('to') ?? '') ? { p_from: q.get('from'), p_to: q.get('to') } : null,
        financeFailure: () => Response.json({ error: 'Failure' }, { status: 400 }),
      }
      if (name.endsWith('clubFinanceF1FExport')) return { financeCsv, financeExportTables, financeXlsx }
      throw new Error(name)
    },
  })
  return exports
}
const request = (query: string) => ({ nextUrl: new URL(`https://test.invalid/?${query}`), signal: new AbortController().signal })
test('report route denies users without capability before any RPC and scopes authorized read', async () => {
  let calls = 0
  const rpc = async (_name: string, params: Record<string, unknown>) => { calls++; assert.equal(params.p_club_id, 'club-A'); return { data: report, error: null } }
  const denied = await route('../app/api/clubs/finance/reports/route.ts', false, rpc).GET(request('clubId=club-B&from=2026-10-02&to=2026-10-04'))
  assert.equal(denied.status, 403); assert.equal(calls, 0)
  const ok = await route('../app/api/clubs/finance/reports/route.ts', true, rpc).GET(request('clubId=club-A&from=2026-10-02&to=2026-10-04'))
  assert.equal(ok.status, 200); assert.equal(calls, 1)
  assert.equal(ok.headers.get('Cache-Control'), 'no-store')
})
test('exports deny cross-club access, paginate by compound cursor and generate complete authorized CSV', async () => {
  let calls = 0
  const rpc = async (name: string, params: Record<string, unknown>) => {
    calls++; assert.equal(params.p_club_id, 'club-A')
    if (name === 'get_club_finance_report_f1f') return { data: report, error: null }
    assert.equal(params.p_kind, 'PAYMENTS'); assert.equal(params.p_from, '2026-10-02')
    return { data: params.p_before_id ? [{ item: { id: 'last', paid_at: '2026-10-02T12:00:00Z', amount: 1 } }]
      : Array.from({ length: 500 }, (_, i) => ({ item: { id: String(i), paid_at: '2026-10-03T12:00:00Z', amount: 1 } })), error: null }
  }
  const args = request('clubId=club-A&from=2026-10-02&to=2026-10-04&format=csv&kind=Pagos')
  assert.equal((await route('../app/api/clubs/finance/exports/route.ts', false, rpc).GET(args)).status, 403)
  assert.equal(calls, 0)
  const result = await route('../app/api/clubs/finance/exports/route.ts', true, rpc).GET(args)
  assert.equal(result.status, 200); assert.equal(calls, 3)
  assert.equal((await result.text()).trim().split('\r\n').length, 502)
  assert.match(result.headers.get('Content-Disposition') ?? '', /attachment/)
})
test('actual F1F authorization helper validates membership/club/capability and forwards only authenticated JWT', async () => {
  const exports: { financeAccess?: (req: unknown, id: string, write?: boolean) => Promise<{ error: Response | null; client: unknown }> } = {}
  const club = '11111111-1111-4111-8111-111111111111'
  let grants = true; let calls = 0; let clientCreations = 0; let capability = ''
  const code = ts.transpileModule(read('./clubFinanceF1FServer.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name === '@supabase/supabase-js') return { createClient: (_url: string, key: string, options: { global: { headers: { Authorization: string } } }) => {
        clientCreations++; assert.equal(key, 'public-test-key'); assert.equal(options.global.headers.Authorization, 'Bearer human-test-jwt'); return { rpc: () => null }
      } }
      if (name.endsWith('clubMembershipServer')) return { requireClubCapability: async (_req: unknown, id: string, needed: string) => {
        calls++; capability = needed
        return grants && id === club ? { error: null, membership: { role: 'ADMIN' } } : { error: Response.json({}, { status: 403 }) }
      } }
      if (name.endsWith('clubPermissions')) return { hasClubCapability: () => true }
      if (name.endsWith('clubFinanceF1F')) return { validFinanceRange }
      throw new Error(name)
    },
  })
  const req = { headers: new Headers({ authorization: 'Bearer human-test-jwt' }) }
  assert.equal((await exports.financeAccess!(req, 'not-uuid')).error?.status, 400)
  assert.equal(calls, 0)
  assert.equal((await exports.financeAccess!(req, club)).error, null); assert.equal(capability, 'finance:view')
  await exports.financeAccess!(req, club, true); assert.equal(capability, 'finance:manage')
  grants = false
  assert.equal((await exports.financeAccess!(req, club)).error?.status, 403)
  grants = true
  assert.equal((await exports.financeAccess!(req, '22222222-2222-4222-8222-222222222222')).error?.status, 403)
  assert.equal(clientCreations, 2)
})
test('operations keeps F1C available only when F1F RPC is not installed, not on business/permission errors', async () => {
  const exports: Record<string, (req: unknown) => Promise<Response>> = {}
  let errorCode = 'PGRST202'; let legacyCalls = 0
  const code = ts.transpileModule(read('../app/api/clubs/finance/operations/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  class Req {
    url: string; nextUrl: URL; headers: Headers
    constructor(url: string | URL, init: { headers?: Headers } = {}) {
      this.url = String(url); this.nextUrl = new URL(this.url); this.headers = init.headers ?? new Headers()
    }
  }
  runInNewContext(code, { exports, URL, URLSearchParams,
    require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json }, NextRequest: Req }
      if (name.endsWith('clubFinanceF1FServer')) return {
        financeAccess: async () => ({ error: null, canManage: true, client: { rpc: async (rpc: string) =>
          rpc.endsWith('_f1c') ? { data: report, error: null } : { data: null, error: { code: errorCode } } } }),
        financeUuid: /^[0-9a-f-]{36}$/i,
        financeFailure: () => Response.json({ error: 'Not hidden' }, { status: 400 }),
        logFinanceRpcFailure: () => {},
      }
      if (name.endsWith('clubFinanceF1C')) return { financePage: () => ({ items: [], nextCursor: null }) }
      if (name === '../core/route') return { GET: async (req: Req) => { legacyCalls++; assert.equal(req.nextUrl.searchParams.get('clubId'), 'club-A'); return Response.json({ overview: report, canManage: true }) } }
      throw new Error(name)
    },
  })
  const req = new Req('https://test.invalid/?clubId=club-A&view=dashboard')
  const result = await exports.GET(req)
  assert.equal(result.status, 200); assert.equal((await result.json()).f1fAvailable, false); assert.equal(legacyCalls, 1)
  errorCode = '42501'
  assert.equal((await exports.GET(req)).status, 400); assert.equal(legacyCalls, 1)
})
