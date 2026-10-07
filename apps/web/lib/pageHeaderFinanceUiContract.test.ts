import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const club = '11111111-1111-4111-8111-111111111111'
type RpcResult = { data: unknown; error: { code: string; message?: string; details?: string; hint?: string } | null }
function operations(rpc: (name: string, params: Record<string, unknown>) => Promise<RpcResult>, allowed = true,
  fallback: () => Promise<Response> = async () => Response.json({})) {
  const exports: { GET?: (request: unknown) => Promise<Response> } = {}
  const failures: Array<{ code?: string; operation: string }> = []
  const diagnostics: Array<{ code?: string; operation: string }> = []
  let legacyCalls = 0
  const code = ts.transpileModule(read('../app/api/clubs/finance/operations/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { exports, URL,
    require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json }, NextRequest: class {
        url: string
        constructor(url: string) { this.url = url }
      } }
      if (name.endsWith('clubFinanceF1FServer')) return {
        financeUuid: /^[0-9a-f-]{36}$/i,
        financeAccess: async () => allowed ? { error: null, canManage: true, client: { rpc } }
          : { error: Response.json({ error: 'No autorizado' }, { status: 403 }), client: null },
        financeFailure: (error: { code?: string }, operation: string) => {
          failures.push({ code: error.code, operation })
          return Response.json({ error: 'Fallo real, no empty state', code: error.code }, { status: 500 })
        },
        logFinanceRpcFailure: (error: { code?: string }, operation: string) => diagnostics.push({ code: error.code, operation }),
      }
      if (name.endsWith('clubFinanceF1C')) return {
        financePage: (rows: unknown[]) => ({ items: rows, nextCursor: null }),
      }
      if (name === '../core/route') return { GET: async () => { legacyCalls++; return fallback() } }
      throw new Error(name)
    },
  })
  const url = `https://test.invalid/?clubId=${club}&view=dashboard&filter=PENDING`
  return { get: () => exports.GET!({ url, headers: new Headers(), nextUrl: new URL(url) }),
    failures, diagnostics, legacyCalls: () => legacyCalls }
}

test('operations with zero obligations/payments/cases returns actual zero overview and valid empty pages', async () => {
  const calls: string[] = []
  const app = operations(async (name, params) => {
    assert.equal(params.p_club_id, club)
    calls.push(name + ':' + (params.p_kind ?? ''))
    return { data: name.endsWith('_f1c') ? { currency_code: 'ARS', total_pending: 0, total_received: 0, open_obligations: 0 } : [], error: null }
  })
  const result = await app.get(), body = await result.json()
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(body.overview, { currency_code: 'ARS', total_pending: 0, total_received: 0, open_obligations: 0 })
  assert.deepEqual(body.obligations, { items: [], nextCursor: null })
  assert.deepEqual(body.movements, { items: [], nextCursor: null })
  assert.equal(body.requiresReview, false)
  assert.deepEqual(calls, ['get_club_finance_overview_f1c:', 'list_club_finance_f1f:OBLIGATIONS', 'list_club_finance_f1f:PAYMENTS', 'list_club_finance_f1f:CASES'])
  assert.equal(app.legacyCalls(), 0)
})

for (const target of ['get_club_finance_overview_f1c', 'OBLIGATIONS', 'PAYMENTS', 'CASES']) {
  test(`operations identifies ${target} failure; never converts SQL/ACL failure to empty success`, async () => {
    const app = operations(async (name, params) => ({ data: [], error: name === target || params.p_kind === target ? { code: '42501' } : null }))
    assert.equal((await app.get()).status, 500)
    assert.equal(app.failures.length, 1)
    assert.equal(app.failures[0].operation, target === 'get_club_finance_overview_f1c' ? target : `list_club_finance_f1f:${target}`)
    assert.equal(app.legacyCalls(), 0)
  })
}

test('operations rejects unauthorized callers before invoking financial RPCs', async () => {
  let calls = 0
  const app = operations(async () => { calls++; return { data: [], error: null } }, false)
  assert.equal((await app.get()).status, 403)
  assert.equal(calls, 0)
})

test('financial logging is technical only; frontend never receives SQL details, hint or secret payloads', async () => {
  const exports: { financeFailure?: (error: RpcResult['error'], operation: string) => Response } = {}
  const logs: unknown[][] = []
  const code = ts.transpileModule(read('./clubFinanceF1FServer.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { exports, URL, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://nenupmpjrzdxfrnwsmkx.supabase.co' } }, console: { error: (...args: unknown[]) => logs.push(args) }, require: (name: string) =>
    name === 'next/server' ? { NextResponse: { json: Response.json } } : {} })
  const response = exports.financeFailure!({ code: '42501', message: 'private message', details: 'private detail', hint: 'private hint' }, 'list_club_finance_f1f:CASES')
  assert.equal(response.status, 403)
  const json = JSON.stringify(await response.json()), log = JSON.stringify(logs)
  assert.match(json, /42501/)
  assert.match(json, /permiso/)
  assert.match(log, /list_club_finance_f1f:CASES/)
  assert.doesNotMatch(json + log, /private|Authorization|cookies|token|message"|details|hint/)
})

test('reusable header integrates back with title; finance uses one equal-width underline row without extra gutter', () => {
  const header = read('../components/navigation/PageHeader.tsx')
  assert.match(header, /<header[\s\S]*<PageBackAction[\s\S]*<h1>/)
  const back = read('../components/navigation/PageBackAction.tsx')
  assert.match(back, /aria-label=\{label\}/)
  assert.match(back, /<ArrowLeft size=\{18\} aria-hidden/)
  const css = read('../components/navigation/PageHeader.module.css')
  assert.match(css, /width:44px/)
  assert.match(css, /focus-visible/)
  const tabs = read('../app/(app)/club/contabilidad/FinancePage.module.css').split('.tabs{')[1].split('.sections{')[0]
  assert.match(tabs, /display:grid/)
  assert.match(tabs, /repeat\(5,minmax\(0,1fr\)\)/)
  assert.match(tabs, /background:transparent/)
  assert.match(tabs, /border-bottom-color:#66a509/)
  assert.match(tabs, /min-height:44px/)
  assert.doesNotMatch(tabs, /overflow-x|text-overflow|grid-column:span|nth-child/)
  assert.match(read('../app/(app)/club/contabilidad/FinancePage.module.css'), /padding:6px 0 64px/)
  assert.doesNotMatch(read('../app/(app)/club/contabilidad/page.tsx'), /\$\{json\.code\}/)
  for (const page of ['admin','estadisticas','contabilidad','configuracion','usuarios','reportes','perfil']) {
    assert.match(read(`../app/(app)/club/${page}/page.tsx`), /<PageHeader/)
    assert.doesNotMatch(read(`../app/(app)/club/${page}/page.tsx`), /<ClubBackLink/)
  }
  const playerAdmin = read('../app/(app)/club/jugadores/[id]/administracion/page.tsx')
  assert.match(playerAdmin, /refinement.headerBadge/)
  assert.match(read('../app/(app)/club/jugadores/[id]/administracion/playerAdministration.refinement.module.css'), /\.headerBadge\s*\{\s*position: static;/)
})

test('missing F1F logs the original RPC and only succeeds when F1C fallback really succeeds', async () => {
  const app = operations(async (name) => ({ data: [], error: name === 'list_club_finance_f1f' ? {
    code: 'PGRST202', message: 'Could not find public.list_club_finance_f1f',
  } : null }), true, async () => Response.json({ overview: { total_pending: 0, total_received: 0, open_obligations: 0 } }))
  const response = await app.get()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).f1fAvailable, false)
  assert.deepEqual(app.diagnostics.map(item => item.operation).sort(), [
    'list_club_finance_f1f:CASES', 'list_club_finance_f1f:OBLIGATIONS', 'list_club_finance_f1f:PAYMENTS',
  ])
  assert.equal(app.legacyCalls(), 1)
})

for (const missingRpc of ['get_club_finance_overview_f1c', 'list_club_finance_obligations_f1c', 'list_club_finance_movements_f1c']) {
  test(`PGRST202 fallback identifies ${missingRpc}; never invents successful zero balances`, async () => {
    const exports: { GET?: (req: unknown) => Promise<Response> } = {}
    const logs: string[] = []
    const code = ts.transpileModule(read('../app/api/clubs/finance/core/route.ts'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    runInNewContext(code, { exports, Response, require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name === '@supabase/supabase-js') return { createClient: () => ({ rpc: async (rpc: string) => ({ data: [],
        error: rpc === missingRpc ? { code: 'PGRST202' } : null }) }) }
      if (name.endsWith('clubMembershipServer')) return { requireClubCapability: async () => ({ error: null, membership: { role: 'ADMIN' } }) }
      if (name.endsWith('clubFinanceF1FServer')) return { financeFailure: (error: { code: string }, operation: string) => {
        assert.equal(error.code, 'PGRST202'); logs.push(operation)
        return Response.json({ error: 'No pudimos cargar las finanzas. Reintentá en unos segundos.' }, { status: 503 })
      } }
      return {}
    }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' } } })
    const fallback = () => exports.GET!({ nextUrl: new URL(`https://test.invalid/?clubId=${club}`), headers: new Headers({ authorization: 'Bearer offline-fixture' }) })
    const app = operations(async (name) => ({ data: [], error: name === 'list_club_finance_f1f' ? { code: 'PGRST202' } : null }), true, fallback)
    const response = await app.get(), body = await response.json()
    assert.equal(response.status, 503)
    assert.deepEqual(logs, [`core:${missingRpc}`])
    assert.equal(body.overview, undefined)
    assert.doesNotMatch(JSON.stringify(body), /PGRST202|details|hint/)
  })
}

test('PGRST202 schema diagnostics include RPC/signature and project host only on server; secret text is redacted', async () => {
  const exports: { financeFailure?: (error: RpcResult['error'], operation: string) => Response } = {}
  const logs: unknown[][] = []
  const code = ts.transpileModule(read('./clubFinanceF1FServer.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { exports, URL,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://user:private@nenupmpjrzdxfrnwsmkx.supabase.co?secret=private' } },
    console: { error: (...args: unknown[]) => logs.push(args) },
    require: (name: string) => name === 'next/server' ? { NextResponse: { json: Response.json } } : {} })
  const response = exports.financeFailure!({ code: 'PGRST202',
    message: 'Could not find public.list_club_finance_f1f(p_club_id, p_kind)',
    details: 'Searched schema cache. "token":"private"', hint: 'Perhaps list_club_finance_f1f. Bearer private' }, 'list_club_finance_f1f:CASES')
  assert.equal(response.status, 503)
  const body = JSON.stringify(await response.json()), logged = JSON.stringify(logs)
  assert.match(logged, /nenupmpjrzdxfrnwsmkx\.supabase\.co/)
  assert.match(logged, /p_club_id, p_kind/)
  assert.match(logged, /Searched schema cache/)
  assert.doesNotMatch(logged, /private/)
  assert.doesNotMatch(body, /PGRST202|list_club|details|hint|supabase/)
  assert.match(body, /Reintentá en unos segundos/)
})
