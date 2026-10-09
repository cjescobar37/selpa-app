import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as accountPolicy from './accountRolePolicy'
import * as permissions from './clubPermissions'
import * as playerFinance from './playerFinanceF1D'
import * as finance from './clubFinanceF1C'
import * as billing from './platformBillingF2'
import { humanizeUiError } from './productPresentation'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
type Handler = (req: { headers: Headers; nextUrl: URL }) => Promise<Response>
function execute(path: string, dependencies: (name: string) => unknown, extra: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {}
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, URL, URLSearchParams, Set, Map, ...extra, require: dependencies })
  return exports
}

const clubId = '11111111-1111-4111-8111-111111111111'
const overview = { currency_code: 'ARS', total_pending: 0, total_received: 0, open_obligations: 0 }
const page = { items: [], nextCursor: null }
const request = (path: string, authenticated = true) => ({
  headers: new Headers(authenticated ? { authorization: 'Bearer offline-fixture-only' } : {}),
  nextUrl: new URL(`https://fixture.invalid${path}`),
})

type RpcError = { code: string; message?: string; details?: string; hint?: string }
function playerApi({ denied = false, fail = '', code = 'PGRST202' } = {}) {
  const calls: string[] = [], logs: unknown[][] = []
  const loaded = execute('../app/api/player/finance/route.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } }
    if (name === '@supabase/supabase-js') return { createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
      rpc: async (operation: string) => {
        calls.push(operation)
        return { data: operation.startsWith('get_') ? { ...overview, total_paid: 0 } : [], error: operation === fail
          ? { code, message: 'private DB text', details: 'private row', hint: 'private hint' } : null }
      },
    }) }
    if (name.endsWith('accountRoleServer')) return { playerAccountDenial: async () => denied ? Response.json({ error: accountPolicy.STAFF_PLAYER_MESSAGE }, { status: 403 }) : null }
    if (name.endsWith('playerFinanceF1D')) return playerFinance
    if (name.endsWith('clubFinanceF1C')) return finance
    if (name.endsWith('paymentProviderReadsF1E')) return { playerPaymentOptions: async (_client: unknown, rows: unknown[]) => rows, paymentMovementLabels: async (_client: unknown, _club: unknown, rows: unknown[]) => rows }
    throw new Error(name)
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-fixture' } }, console: { error: (...args: unknown[]) => logs.push(args) } })
  return { get: loaded.GET as Handler, calls, logs }
}

test('Player: verified empty dashboard is $0, no open charges, no false error or log', async () => {
  const app = playerApi(), response = await app.get(request('/api/player/finance'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { overview: { ...overview, total_paid: 0 }, obligations: page, movements: page })
  assert.equal(app.calls.length, 3)
  assert.deepEqual(app.logs, [])
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
test('Player: Guest 401 and administrative identity 403 stop before finance RPCs', async () => {
  const guest = playerApi(), staff = playerApi({ denied: true })
  assert.equal((await guest.get(request('/api/player/finance', false))).status, 401)
  assert.equal((await staff.get(request('/api/player/finance'))).status, 403)
  assert.equal(guest.calls.length + staff.calls.length, 0)
})
for (const operation of ['get_player_finance_overview_f1d', 'list_player_finance_obligations_f1d', 'list_player_finance_movements_f1d']) {
  test(`Player: ${operation} failure is not zero; diagnostic only contains operation/code`, async () => {
    const app = playerApi({ fail: operation }), response = await app.get(request('/api/player/finance'))
    assert.equal(response.status, 503)
    const body = await response.json()
    assert.equal(body.overview, undefined)
    assert.doesNotMatch(JSON.stringify(body), /PGRST|private|fixture-user|Bearer/)
    assert.equal(JSON.stringify(app.logs), JSON.stringify([['[player-finance]', { operation, code: 'PGRST202' }]]))
  })
}
test('Player: permissions error remains forbidden, not a retryable empty dashboard', async () => {
  assert.equal((await playerApi({ fail: 'get_player_finance_overview_f1d', code: '42501' }).get(request('/api/player/finance'))).status, 403)
})
test('Player: unsafe diagnostic code cannot smuggle identity/credentials into logs', async () => {
  const app = playerApi({ fail: 'get_player_finance_overview_f1d', code: 'Bearer private-token' })
  await app.get(request('/api/player/finance'))
  assert.match(JSON.stringify(app.logs), /UNKNOWN/)
  assert.doesNotMatch(JSON.stringify(app.logs), /private-token/)
})

function clubApi(role: string, authenticated = true, failure: RpcError | null = null) {
  const calls: string[] = []
  const loaded = execute('../app/api/clubs/finance/operations/route.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } }
    if (name.endsWith('clubFinanceF1C')) return finance
    if (name.endsWith('paymentProviderReadsF1E')) return { paymentMovementLabels: async (_client: unknown, _club: unknown, rows: unknown[]) => rows }
    if (name.endsWith('clubFinanceF1FServer')) return {
      financeUuid: /^[a-f\d-]{36}$/,
      financeAccess: async () => ({ error: !authenticated ? Response.json({ error: 'Ingresá.' }, { status: 401 })
        : !permissions.hasClubCapability(role, 'finance:view') ? Response.json({ error: 'Sin permiso.' }, { status: 403 }) : null,
      canManage: permissions.hasClubCapability(role, 'finance:manage'), client: { rpc: async (operation: string) => {
        calls.push(operation); return { data: operation.startsWith('get_') ? overview : [], error: failure }
      } } }),
      financeFailure: () => Response.json({ error: 'No pudimos cargar las finanzas. Reintentá.' }, { status: 503 }),
      logFinanceRpcFailure: () => {},
    }
    if (name.includes('core/route')) return { GET: () => { throw new Error('Unexpected legacy fallback') } }
    throw new Error(name)
  })
  return { get: loaded.GET as Handler, calls }
}
for (const role of ['OWNER', 'ADMIN']) {
  test(`${role}: canonical Club Finance empty state is successful and four bounded reads`, async () => {
    const app = clubApi(role), response = await app.get(request(`/api/clubs/finance/operations?clubId=${clubId}`))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.overview, overview)
    assert.deepEqual(body.obligations, page)
    assert.deepEqual(body.movements, page)
    assert.equal(body.requiresReview, false)
    assert.equal(body.f1fAvailable, true)
    assert.equal(app.calls.length, 4)
  })
}
for (const role of ['PLAYER', 'PLANILLERO']) {
  test(`${role}: Club Finance API is forbidden before RPC work`, async () => {
    const app = clubApi(role)
    assert.equal((await app.get(request(`/api/clubs/finance/operations?clubId=${clubId}`))).status, 403)
    assert.equal(app.calls.length, 0)
  })
}
test('Club Finance: Guest is 401; failed installed RPCs cannot fabricate empty finance', async () => {
  const guest = clubApi('ADMIN', false), failed = clubApi('ADMIN', true, { code: '42883' })
  assert.equal((await guest.get(request(`/api/clubs/finance/operations?clubId=${clubId}`, false))).status, 401)
  assert.equal(guest.calls.length, 0)
  const response = await failed.get(request(`/api/clubs/finance/operations?clubId=${clubId}`))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).overview, undefined)
})

function billingApi(role: string, fail = false, code = 'PGRST202', throws = false) {
  const calls: string[] = [], logs: unknown[][] = []
  const loaded = execute('./platformBillingF2Server.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } }
    if (name.endsWith('platformBillingF2')) return billing
    const denied = (allowed: boolean) => ({ error: role === 'GUEST' ? Response.json({ error: 'Ingresá.' }, { status: 401 }) : allowed ? null : Response.json({ error: 'Sin acceso.' }, { status: 403 }) })
    if (name.endsWith('platformApiAuth')) return { assertPlatformAdmin: async () => denied(role === 'PLATFORM') }
    if (name.endsWith('clubMembershipServer')) return { requireClubCapability: async () => denied(permissions.hasClubCapability(role, 'club:update')) }
    if (name === '@supabase/supabase-js') return { createClient: () => ({ rpc: async (operation: string) => {
      calls.push(operation)
      if (throws) throw new TypeError('private transport diagnostic')
      return { data: operation.startsWith('get_') ? { currency_code: 'ARS', received: 0, pending: 0, overdue: 0, active_clubs: 0, clubs_with_debt: 0, subscription: null } : page,
        error: fail ? { code, message: 'private DB detail' } : null }
    } }) }
    throw new Error(name)
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-fixture' } }, console: { error: (...args: unknown[]) => logs.push(args) } })
  return { get: loaded.billingGet as (req: ReturnType<typeof request>, platform: boolean) => Promise<Response>, calls, logs }
}
for (const role of ['OWNER', 'ADMIN', 'PLATFORM']) {
  test(`${role}: Billing no subscription/plans/invoices/payments is normal, never legacy Finance`, async () => {
    const app = billingApi(role), platform = role === 'PLATFORM'
    for (const kind of ['overview', ...(platform ? ['plans'] : []), 'invoices', 'payments']) {
      const response = await app.get(request(`/api/billing?clubId=${clubId}&kind=${kind}`), platform)
      assert.equal(response.status, 200)
      const body = await response.json()
      if (kind === 'overview') { assert.equal(body.subscription, null); assert.equal(body.pending, 0); assert.equal(body.received, 0) }
      else assert.deepEqual(body, page)
    }
    assert.ok(app.calls.every(operation => operation.endsWith('_f2')))
    assert.deepEqual(app.logs, [])
  })
}
for (const role of ['GUEST', 'PLAYER', 'OPERADOR', 'PLANILLERO']) {
  test(`${role}: Club/Platform Billing API stops unauthorized identity before reads`, async () => {
    const app = billingApi(role)
    for (const platform of [true, false]) assert.equal((await app.get(request(`/api/billing?clubId=${clubId}`, role !== 'GUEST'), platform)).status, role === 'GUEST' ? 401 : 403)
    assert.equal(app.calls.length, 0)
  })
}
test('Billing failed read RPC is 503: human error and technical operation/code log; no fake empty overview', async () => {
  const app = billingApi('PLATFORM', true), response = await app.get(request('/api/billing?kind=overview'), true)
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.equal(body.subscription, undefined)
  assert.doesNotMatch(JSON.stringify(body), /PGRST|private/)
  assert.equal(JSON.stringify(app.logs), JSON.stringify([['[selpa-billing]', { operation: 'get_platform_billing_overview_f2', code: 'PGRST202' }]]))
})

for (const [code, status] of [['42501', 403], ['22023', 400], ['22P02', 400], ['XX000', 503]] as const) {
  test(`Billing read ${code} is ${status}, not an empty or successful balance`, async () => {
    const response = await billingApi('OWNER', true, code).get(request(`/api/billing?clubId=${clubId}`), false)
    assert.equal(response.status, status)
    const body = await response.json()
    assert.equal(body.pending, undefined)
    assert.doesNotMatch(JSON.stringify(body), /private|PGRST|XX000|42501|22023|22P02/)
  })
}
test('Billing transport exception becomes safe retryable 503, never a route crash or empty view', async () => {
  const app = billingApi('ADMIN', false, '', true)
  const response = await app.get(request(`/api/billing?clubId=${clubId}`), false)
  assert.equal(response.status, 503)
  assert.doesNotMatch(JSON.stringify(await response.json()), /private|transport|pending|subscription/)
  assert.match(JSON.stringify(app.logs), /UNEXPECTED/)
  assert.doesNotMatch(JSON.stringify(app.logs), /private/)
})

const privatePlayer = ['/player', '/player/pagos', '/perfil', '/actividad', '/torneos/t/inscripcion']
const clubRoutes = ['/club', '/club/admin', '/club/torneos', '/club/jugadores', '/club/contabilidad', '/club/facturacion', '/club/estadisticas', '/club/reportes', '/club/mensajes', '/club/configuracion', '/club/perfil']
const platformRoutes = ['/platform', '/platform/solicitudes', '/platform/clubs', '/platform/usuarios', '/platform/facturacion', '/platform/analytics', '/platform/config', '/platform/logs']
for (const role of ['GUEST', 'PLAYER', 'OWNER', 'ADMIN', 'PLANILLERO', 'PLATFORM']) {
  for (const pathname of [...privatePlayer, ...clubRoutes, ...platformRoutes, '/mis-datos', '/ajustes']) {
    test(`role journey matrix ${role} ${pathname}: render/redirect`, () => {
      const redirects: string[] = [], session = { status: 'ready', user: role === 'GUEST' ? null : { id: 'fixture' }, role: role === 'PLATFORM' ? 'platform' : role === 'GUEST' ? 'guest' : role === 'PLAYER' ? 'player' : 'club',
        clubRole: role, isPlatformAdmin: role === 'PLATFORM', activeClubId: clubId, isApprovedMember: true, globalProfile: {} }
      const loaded = execute('../app/(app)/RoleGate.tsx', name => {
        if (name === 'react') return { useEffect: (fn: () => void) => fn(), useMemo: (fn: () => unknown) => fn() }
        if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'fragment' }
        if (name === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ replace: (href: string) => redirects.push(href) }) }
        if (name.endsWith('SessionProvider')) return { useSession: () => session }
        if (name.endsWith('globalProfile')) return { isGlobalProfileComplete: () => true }
        if (name.endsWith('clubPermissions')) return permissions
        if (name.endsWith('accountRolePolicy')) return accountPolicy
        return {}
      })
      const rendered = (loaded.default as (props: { children: string }) => { props?: { children?: string } } | null)({ children: 'protected' })
      const publicRegistration = pathname === '/torneos/t/inscripcion'
      const planilleroBlocked = ['/club/jugadores', '/club/contabilidad', '/club/facturacion', '/club/reportes', '/club/mensajes', '/club/configuracion']
      const allowed = role === 'GUEST' ? publicRegistration : privatePlayer.includes(pathname) ? role === 'PLAYER'
        : platformRoutes.includes(pathname) ? role === 'PLATFORM'
          : clubRoutes.includes(pathname) ? !['PLAYER', 'GUEST'].includes(role) && !(role === 'PLANILLERO' && planilleroBlocked.includes(pathname)) : true
      assert.equal(rendered?.props?.children === 'protected', allowed)
      assert.equal(redirects.length, allowed ? 0 : 1)
      if (role === 'GUEST' && !allowed) assert.equal(redirects[0], `/login?next=${encodeURIComponent(pathname)}`)
      if (role === 'PLAYER' && !allowed) assert.equal(redirects[0], '/player')
      if (['OWNER', 'ADMIN', 'PLANILLERO'].includes(role) && !allowed) assert.equal(redirects[0], '/club')
      if (role === 'PLATFORM' && !allowed) assert.equal(redirects[0], '/platform')
    })
  }
}

test('onboarding destination uses canonical role: complete Player, pending staff, approved staff, Platform', () => {
  const exports: { destination?: (ctx: Record<string, unknown>) => string } = {}
  const source = read('../components/session/SessionProvider.tsx')
  const fn = source.slice(source.indexOf('function getPostLoginDestination('), source.indexOf('\ntype AuthorizationReadyContext'))
  runInNewContext(ts.transpileModule(`${fn}\nexports.destination = getPostLoginDestination`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, isGlobalProfileComplete: (profile: { complete?: boolean }) => profile?.complete })
  const ctx = { user: { id: 'fixture' }, role: 'player', globalProfile: { complete: false }, activeClubId: null, isApprovedMember: false }
  assert.equal(exports.destination!({ ...ctx, user: null }), '/login')
  assert.equal(exports.destination!(ctx), '/completar-perfil')
  assert.equal(exports.destination!({ ...ctx, globalProfile: { complete: true } }), '/player')
  assert.equal(exports.destination!({ ...ctx, role: 'club' }), '/seleccionar-club')
  assert.equal(exports.destination!({ ...ctx, role: 'club', activeClubId: clubId, isApprovedMember: true }), '/club')
  assert.equal(exports.destination!({ ...ctx, role: 'platform' }), '/platform')
})

test('presentation failures are human and retries remain available across finance journeys', () => {
  for (const value of ['PGRST203 schema cache', 'SQLSTATE 42883', clubId, 'TypeError: failed', 'Error\n    at loader (file.js:2:3)', '22P02', 'invalid input syntax for type uuid', 'violates foreign key constraint']) assert.equal(humanizeUiError(value, 'Reintentá.'), 'Reintentá.')
  assert.match(humanizeUiError('Failed to fetch'), /conexión.*reintentá/)
  for (const path of ['../app/(app)/player/pagos/page.tsx', '../app/(app)/club/contabilidad/page.tsx', '../features/billing/BillingExperience.tsx']) {
    assert.match(read(path), /humanizeUiError/)
    assert.match(read(path), /Reintent/)
  }
})
test('runtime duplicate reads cannot return via loaded state or presentation-only tabs', () => {
  const player = read('../app/(app)/player/page.tsx'), club = read('../app/(app)/club/contabilidad/page.tsx')
  assert.match(player, /\}, \[session.status, session.user\?\.id, session.clubs, loadAttempt\]\)/)
  assert.match(player, /onRetry=\{\(\) => setLoadAttempt/)
  assert.doesNotMatch(player, /\}, \[hasLoadedData/)
  assert.match(club, /\}, \[clubId, readFilter, readSearch, readMethod, request\]\)/)
  assert.match(club, /if \(data.f1fAvailable === false\) setTab\(current/)
})

test('Club read failures retain a retry and cannot claim zero players/tournaments as a valid result', () => {
  for (const path of ['../app/(app)/club/torneos/page.tsx', '../app/(app)/club/jugadores/page.tsx']) {
    const source = read(path)
    assert.match(source, /if \(!res.ok\) \{\s+setReadFailed\(true\)/)
    assert.match(source, /if \(readFailed\) return[\s\S]*?PlayerStatePanel kind="error"/)
    assert.match(source, /setReadFailed\(false\)/)
    assert.match(source, /catch \{[\s\S]*?setReadFailed\(true\)/)
    assert.match(source, /onRetry=\{\(\) => void load/)
  }
  for (const path of ['../app/(app)/club/page.tsx', '../app/(app)/club/perfil/page.tsx', '../components/messages/PampraxInbox.tsx']) {
    assert.match(read(path), /PlayerStatePanel kind="error"/)
    assert.match(read(path), /onRetry=\{/)
    assert.match(read(path), /catch\(/)
  }
  assert.match(read('../components/player/PlayerStatePanel.tsx'), /kind === 'error' \? humanizeUiError\(message\) : message/)
  assert.match(read('../app/(app)/club/estadisticas/page.tsx'), /humanizeUiError\(loadError/)
})
