import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { humanizeUiError, publicRankingGender, clubRequestRequiredLabels } from './productPresentation'
import * as accountRolePolicy from './accountRolePolicy'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

test('auth errors are actionable Spanish; SQL/UUID/secrets never become UI copy', () => {
  assert.match(humanizeUiError('Invalid login credentials'), /email o la contraseña/)
  assert.match(humanizeUiError('Email not confirmed'), /Confirmá/)
  assert.match(humanizeUiError('JWT expired'), /sesión expiró/)
  for (const message of ['PGRST202 function missing', '42883', 'permission denied', 'access_token=secret', '11111111-1111-4111-8111-111111111111']) {
    assert.equal(humanizeUiError(message, 'Reintentá'), 'Reintentá')
  }
  assert.equal(humanizeUiError('Indicá el motivo del rechazo.'), 'Indicá el motivo del rechazo.')
})

test('canonical public ranking gender accepts existing names without recalculating points', () => {
  for (const gender of ['F', 'FEMALE', 'damas']) assert.equal(publicRankingGender(gender), 'F')
  for (const gender of ['M', 'MALE', 'caballeros']) assert.equal(publicRankingGender(gender), 'M')
  assert.equal(publicRankingGender(undefined), 'all')
  assert.equal(publicRankingGender('MIXED'), 'all')
  assert.equal(Object.keys(clubRequestRequiredLabels).length, 6)
})

test('missing routes are canonical aliases and old gender routes cannot end in placeholders', () => {
  const aliases = [
    ['../app/en-vivo/page.tsx','/envivo'], ['../app/(app)/club/contenido/page.tsx','/club/noticias'],
    ['../app/(app)/platform/config/page.tsx','/platform/configuracion'],
    ['../app/ranking/femenino/page.tsx','/ranking/damas'], ['../app/ranking/masculino/page.tsx','/ranking/caballeros'],
  ]
  for (const [file, route] of aliases) assert.ok(read(file).includes(`redirect('${route}')`))
  assert.match(read('../app/ranking/damas/page.tsx'), /gender: 'F'/)
  assert.match(read('../app/ranking/caballeros/page.tsx'), /gender: 'M'/)
})

test('Platform guard covers all admin routes before rendering, not just billing', () => {
  const source = read('../app/(app)/RoleGate.tsx')
  assert.ok(source.includes("pathname === '/platform' || pathname.startsWith('/platform/')"))
  assert.match(source, /\(!\(pathname === '\/platform'[\s\S]*session.isPlatformAdmin\)/)
  assert.match(source, /router.replace\(session.role === 'player' \? '\/player' : '\/club'\)/)
})

test('club onboarding sends the required existing theme and exposes public requests in Platform', () => {
  const page = read('../app/unir-mi-club/page.tsx')
  assert.match(page, /theme_key: 'cyan'/)
  assert.match(page, /JSON.stringify\(\{ \.\.\.values, requestId: requestId.current \}\)/)
  assert.match(page, /finally \{ setSubmitting\(false\) \}/)
  const review = read('../components/platform/PublicClubRequests.tsx')
  assert.match(review, /fetch\('\/api\/club-requests'/)
  assert.match(review, /fetch\(`\/api\/club-requests\/\$\{row.id\}`/)
  assert.match(review, /JSON.stringify\(\{ action, rejectionReason: reason.trim\(\) \}\)/)
  assert.match(review, /Confirmar aprobación/)
  assert.match(review, /rows.slice\(0, limit\)/)
  assert.match(read('../app/(app)/platform/solicitudes/page.tsx'), /<PublicClubRequests focusId=\{focusId\}/)
})

test('calendar/live reuse real published tournament source; failures have retry, never fake fixtures', () => {
  for (const file of ['../app/torneos/page.tsx','../app/torneos/calendario/page.tsx','../app/envivo/page.tsx']) {
    assert.match(read(file), /getPublicTournamentItems/)
    assert.match(read(file), /ReadFailure/)
    assert.doesNotMatch(read(file), /Open LA|Night Cup|Copa Primavera/)
  }
  assert.match(read('../components/public/PublicTournamentsExperience.tsx'), /pageSize\[section.key\]/)
  assert.match(read('../components/product/PublicAgenda.tsx'), /items.slice\(0, limit\)/)
})

type Query = { data: unknown[]; error: { code: string } | null; count?: number }
function api(path: string, result: (table: string) => Query, adminAllowed = true) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const exports: { GET?: (req: unknown) => Promise<Response> } = {}
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) }, from: (table: string) => {
    const query: Record<string, unknown> = {}
    for (const method of ['select','eq','not','ilike','or','limit','order','in']) query[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return query }
    query.then = (resolve: (value: Query) => unknown) => Promise.resolve(result(table)).then(resolve)
    return query
  } }
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { exports, URL, console: { error: () => {} }, require: (name: string) => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } }
    if (name.endsWith('supabaseAdmin')) return { supabaseAdmin: client }
    if (name.endsWith('platformApiAuth')) return { assertPlatformAdmin: async () => ({ error: adminAllowed ? null : Response.json({ error: 'No autorizado.' }, { status: 403 }) }) }
    if (name.endsWith('tournamentDisplayStatus')) return { getTournamentDisplayStatus: () => ({ label: 'En juego' }) }
    if (name.endsWith('accountRoleServer')) return { nonPlayerAccountIds: async () => new Set() }
    throw new Error(name)
  } })
  return { get: () => exports.GET!({ headers: new Headers({ authorization: 'Bearer fixture' }), nextUrl: new URL('https://test.invalid?q=Cristal&context=club') }), calls }
}

test('Platform summary uses exact HEAD counts and bounded recent clubs; zero is a legitimate success', async () => {
  const app = api('../app/api/platform/summary/route.ts', () => ({ data: [], error: null, count: 0 }))
  const response = await app.get(), body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.clubs.active, 0)
  assert.equal(body.finance, undefined)
  assert.equal(app.calls.filter(call => call.method === 'select' && JSON.stringify(call.args).includes('"head":true')).length, 13)
  assert.ok(app.calls.some(call => call.method === 'limit' && call.args[0] === 6))
})

test('summary failure is not a fabricated zero dashboard; unauthorized stops before reads', async () => {
  const failed = api('../app/api/platform/summary/route.ts', () => ({ data: [], error: { code: '42501' } }))
  const response = await failed.get()
  assert.equal(response.status, 500)
  assert.equal((await response.json()).clubs, undefined)
  const denied = api('../app/api/platform/summary/route.ts', () => ({ data: [], error: null }), false)
  assert.equal((await denied.get()).status, 403)
  assert.equal(denied.calls.length, 0)
})

test('search skips unpublished tournaments/inactive clubs and returns public destinations even in club context', async () => {
  const app = api('../app/api/search/route.ts', table => ({ error: null, data: table === 'tournaments' ? [{ id: 'tournament', name: 'Cristal', status: 'LIVE' }] : [] }))
  const response = await app.get(), rows = await response.json()
  assert.equal(response.status, 200)
  assert.equal(rows[0].href, '/torneos/tournament')
  assert.equal(rows[0].subtitle, 'En juego')
  assert.ok(app.calls.some(call => call.table === 'tournaments' && call.method === 'not' && String(call.args).includes('DRAFT')))
  assert.ok(app.calls.some(call => call.table === 'clubs' && call.method === 'eq' && call.args[0] === 'is_active' && call.args[1] === true))
})

test('search read failure never reports a valid empty result', async () => {
  const app = api('../app/api/search/route.ts', table => ({ data: [], error: table === 'tournaments' ? { code: '42P01' } : null }))
  const response = await app.get()
  assert.equal(response.status, 500)
  assert.doesNotMatch(JSON.stringify(await response.json()), /42P01|token|details/)
})

test('primary Platform navigation uses canonical Billing and exposes configuration/audit', () => {
  const nav = read('./navConfig.ts')
  const platform = nav.split('platform:')[1]?.split('player:')[0] ?? nav
  assert.match(platform, /\/platform\/facturacion/)
  assert.match(platform, /\/platform\/configuracion/)
  assert.match(platform, /\/platform\/logs/)
  assert.doesNotMatch(platform, /href: '\/platform\/pagos'|href: '\/platform\/liquidaciones'/)
})

test('operational club report does not query or total legacy payments; finance link is capability gated', () => {
  const report = read('../app/(app)/club/reportes/page.tsx')
  assert.doesNotMatch(report, /tournament_payments|approvedTotal|Total aprobado/)
  assert.match(report, /hasAnyClubPermission\(clubRole, \['finance:view'\]\)/)
  assert.match(report, /actions=\{canReadFinance \?/)
  assert.match(report, /Reintentar/)
})

test('profile/club selection fail distinctly from legitimate no-membership state and offer retry', () => {
  const profile = read('../app/(app)/perfil/page.tsx')
  assert.match(profile, /if \(!response.ok\) throw new Error\('READ'\)/)
  assert.match(profile, /if \(loadError\) return <PlayerStatePanel kind="error"/)
  assert.match(profile, /onRetry=\{/)
  assert.match(profile, /finally \{ if \(alive\) setLoadingMemberships\(false\) \}/)
  const select = read('../app/(app)/seleccionar-club/page.tsx')
  assert.match(select, /readFailed \? <button[\s\S]*Reintentar/)
  assert.match(select, /finally \{ if \(!cancelled\) setLoading\(false\) \}/)
  assert.match(select, /<PageHeader backHref="\/player"/)
})

test('login does not double-decode URL errors and network failures unlock the form', () => {
  const login = read('../app/login/LoginPageClient.tsx')
  assert.doesNotMatch(login, /decodeURIComponent\(error\)/)
  assert.match(login, /No pudimos conectar con Google/)
  assert.match(login, /No pudimos iniciar sesión/)
  assert.match(login, /catch \{[\s\S]*setLoading\(false\)/)
  assert.doesNotMatch(read('../components/Footer.tsx'), /href="#"/)
})

for (const pathname of ['/platform','/platform/clubs','/platform/usuarios','/platform/config','/platform/facturacion']) {
  test(`actual RoleGate prevents non-Platform user rendering ${pathname}`, () => {
    const redirects: string[] = []
    const exports: { default?: (props: { children: string }) => { props: { children?: unknown } } } = {}
    const session = { status: 'ready', user: { id: 'fixture' }, role: 'player', clubRole: 'PLAYER', activeClubId: 'club', isApprovedMember: true, isPlatformAdmin: false, globalProfile: {} }
    const code = ts.transpileModule(read('../app/(app)/RoleGate.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    runInNewContext(code, { exports, require: (name: string) => {
      if (name === 'react') return { useEffect: (fn: () => void) => fn(), useMemo: (fn: () => unknown) => fn() }
      if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'fragment' }
      if (name === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ replace: (href: string) => redirects.push(href) }) }
      if (name.endsWith('SessionProvider')) return { useSession: () => session }
      if (name.endsWith('globalProfile')) return { isGlobalProfileComplete: () => true }
      if (name.endsWith('clubPermissions')) return { hasAnyClubPermission: () => false }
      if (name.endsWith('accountRolePolicy')) return accountRolePolicy
      return {}
    } })
    assert.notEqual(exports.default!({ children: 'protected' }).props.children, 'protected')
    assert.deepEqual(redirects, ['/player'])
  })
}
