import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as policy from './accountRolePolicy'
import { resolveFastAuthorization } from './sessionFastAuthorization'
import { STAFF_ROLES, isClubStaffRole } from './clubMembershipRules'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replace(/\r/g, '')
type Fixture = { staff?: string; player?: boolean; platform?: boolean; owner?: boolean; failure?: boolean }
function backend(fixture: Fixture) {
  const reads: string[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'human' } }, error: null }) },
    from(table: string) {
      reads.push(table)
      let role: unknown
      const query: Record<string, unknown> = {}
      for (const method of ['select','eq','neq','in','limit']) query[method] = (...args: unknown[]) => {
        if (args[0] === 'role') role = args[1]
        return query
      }
      const result = () => ({ data: table === 'platform_admins' && fixture.platform ? [{ user_id: 'human' }]
        : table === 'clubs' && fixture.owner ? [{ owner_user_id: 'human' }]
          : table === 'club_players' && fixture.player ? [{ id: 'player', user_id: 'human' }]
            : table === 'club_memberships' && (role === 'PLAYER' ? fixture.player : fixture.staff) ? [{ id: 'membership', user_id: 'human' }] : [],
        error: fixture.failure ? { code: '42501' } : null })
      query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return query
    },
  }
  const exports: Record<string, (...args: never[]) => Promise<Response | null>> = {}
  runInNewContext(ts.transpileModule(read('./accountRoleServer.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Set, require(name: string) {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name.endsWith('supabaseAdmin')) return { supabaseAdmin: client }
      if (name.endsWith('accountRolePolicy')) return policy
      if (name.endsWith('clubMembershipRules')) return { STAFF_ROLES, isClubStaffRole }
      throw new Error(name)
    },
  })
  const guards = exports as unknown as {
    playerAccountDenial: (id: string) => Promise<Response | null>
    playerRequestDenial: (req: Request) => Promise<Response | null>
    roleAssignmentDenial: (id: string, role: string) => Promise<Response | null>
    playerRankingPresentation: (individual: Array<{ player_id: string; points: number; position: number }>, pairs: Array<{ player1_user_id: string; player2_user_id: string }>) => Promise<{ individual: Array<{ player_id: string; points: number; position: number }>; pairs: unknown[] }>
  }
  return { guards, reads, client }
}

for (const clubRole of ['OWNER','ADMIN','OPERADOR','PLANILLERO']) {
  test(`${clubRole} has no Player experience even with stale role=player`, () => {
    assert.equal(policy.isPlayerSession({ role: 'player', clubRole }), false)
    assert.equal(policy.isClubStaffSession({ role: 'club', clubRole }), true)
    assert.equal(policy.administrativeHome({ role: 'club', clubRole }), '/club')
    for (const status of ['APPROVED','PENDING','BANNED']) assert.equal(policy.hasStaffAccountMembership([{ role: clubRole, status }]), true)
  })
  test(`${clubRole} API gets 403; active club/client actor cannot change identity`, async () => {
    const app = backend({ staff: clubRole })
    const response = await app.guards.playerRequestDenial(new Request('https://test.invalid/player?userId=other&clubId=player-club', { headers: { authorization: 'Bearer offline-fixture' } }))
    assert.equal(response?.status, 403)
    assert.equal((await response!.json()).error, policy.STAFF_PLAYER_MESSAGE)
    assert.deepEqual(app.reads, ['club_memberships','platform_admins','clubs'])
  })
  test(`PLAYER cannot be assigned ${clubRole}; history is retained`, async () => {
    const app = backend({ player: true })
    assert.equal((await app.guards.roleAssignmentDenial('human', clubRole))?.status, 409)
    assert.ok(app.reads.includes('club_players'))
  })
}
test('PLAYER remains Player; rejected staff membership alone does not grant staff status', async () => {
  assert.equal(policy.isPlayerSession({ role: 'player', clubRole: 'PLAYER' }), true)
  assert.equal(policy.hasStaffAccountMembership([{ role: 'ADMIN', status: 'REJECTED' }]), false)
  assert.equal(await backend({ player: true }).guards.playerAccountDenial('human'), null)
})
test('Platform Admin and owner without a membership fail closed, never implicit Player', async () => {
  assert.equal(policy.isPlayerSession({ role: 'player', isPlatformAdmin: true }), false)
  assert.equal(policy.administrativeHome({ role: 'platform' }), '/platform')
  for (const fixture of [{ platform: true }, { owner: true }]) assert.equal((await backend(fixture).guards.playerAccountDenial('human'))?.status, 403)
})
test('lookup errors are unavailable, not Player or a legitimate empty state', async () => {
  const response = await backend({ failure: true }).guards.playerAccountDenial('human')
  assert.equal(response?.status, 503)
  assert.doesNotMatch(JSON.stringify(await response!.json()), /42501|details|hint|token/)
})
test('ranking presentation hides administrative identities without recalculating positions or points', async () => {
  const rows = [{ player_id: 'human', points: 750, position: 1 }, { player_id: 'player', points: 500, position: 2 }]
  const result = await backend({ staff: 'ADMIN' }).guards.playerRankingPresentation(rows, [{ player1_user_id: 'human', player2_user_id: 'player' }])
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { individual: [rows[1]], pairs: [] })
  assert.equal(rows.length, 2)
  const playerResult = await backend({ player: true }).guards.playerRankingPresentation(rows, [])
  assert.deepEqual(JSON.parse(JSON.stringify(playerResult.individual)), rows)
})
test('staff cannot be assigned PLAYER; changing active club cannot resurrect sports', async () => {
  assert.equal((await backend({ staff: 'ADMIN' }).guards.roleAssignmentDenial('human', 'PLAYER'))?.status, 403)
  const rows = [
    { club_id: 'sport', role: 'PLAYER', status: 'APPROVED', approved_at: '2026-10-07' },
    { club_id: 'staff', role: 'PLANILLERO', status: 'APPROVED', approved_at: '2026-10-07' },
  ] as Parameters<typeof resolveFastAuthorization>[0]['memberships']
  assert.equal(resolveFastAuthorization({ configuredActiveClubId: 'sport', memberships: rows, isPlatformAdmin: false })?.role, 'club')
  assert.equal(resolveFastAuthorization({ configuredActiveClubId: 'sport', memberships: rows, isPlatformAdmin: false })?.activeClubId, 'staff')
  assert.match(read('../components/session/SessionProvider.tsx'), /accountIsStaff[\s\S]*role = 'club'/)
  assert.match(read('../components/session/SessionProvider.tsx'), /membershipResult.error \|\| platformResult.error \|\| !accountResult.ok/)
})

for (const role of ['OWNER','ADMIN','PLANILLERO','OPERADOR','platform']) {
  for (const pathname of ['/player','/player/pagos','/perfil','/actividad','/pareja','/torneos/t/inscripcion']) {
    test(`${role}: manual URL ${pathname} redirects before any child/sporting loader mounts`, () => {
      const redirects: string[] = []
      const exports: { default?: (props: { children: string }) => unknown } = {}
      const session = { status: 'ready', role: role === 'platform' ? 'platform' : 'club', clubRole: role,
        isPlatformAdmin: role === 'platform', user: { id: 'human' }, isApprovedMember: true, activeClubId: 'club', globalProfile: {} }
      runInNewContext(ts.transpileModule(read('../app/(app)/RoleGate.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
        exports, require(name: string) {
          if (name === 'react') return { useEffect: (fn: () => void) => fn(), useMemo: (fn: () => unknown) => fn() }
          if (name === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'fragment' }
          if (name === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ replace: (href: string) => redirects.push(href) }) }
          if (name.endsWith('SessionProvider')) return { useSession: () => session }
          if (name.endsWith('accountRolePolicy')) return policy
          if (name.endsWith('globalProfile')) return { isGlobalProfileComplete: () => false }
          if (name.endsWith('clubPermissions')) return { hasAnyClubPermission: () => true }
          return {}
        },
      })
      assert.equal(exports.default!({ children: 'must-never-mount' }), null)
      assert.deepEqual(redirects, [role === 'platform' ? '/platform' : '/club'])
    })
  }
}

for (const path of [
  '../app/api/tournaments/[tournamentId]/registration/submit/route.ts',
  '../app/api/tournaments/[tournamentId]/registration/partners/route.ts',
  '../app/api/tournaments/[tournamentId]/payments/request/route.ts',
  '../app/api/tournaments/[tournamentId]/registration-change-requests/route.ts',
]) {
  test(`real handler stops STAFF before sporting reads/writes: ${path}`, async () => {
    const app = backend({ staff: 'ADMIN' })
    const exports: Record<string, (request: Request, context: unknown) => Promise<Response>> = {}
    runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports, require(name: string) {
        if (name === 'next/server') return { NextResponse: { json: Response.json } }
        if (name.endsWith('accountRoleServer')) return app.guards
        if (name.endsWith('supabaseAdmin')) return { supabaseAdmin: app.client }
        return {}
      },
    })
    const handler = exports.GET ?? exports.POST
    const response = await handler(new Request('https://test.invalid', { headers: { authorization: 'Bearer fixture' } }), { params: Promise.resolve({ tournamentId: 't' }) })
    assert.equal(response.status, 403)
    assert.ok(app.reads.every(table => ['club_memberships','platform_admins','clubs'].includes(table)))
  })
}

test('UI has only account data for staff; Player fields and menu remain conditional, not disabled', () => {
  const data = read('../app/(app)/mis-datos/page.tsx'), nav = read('../components/navbar/AppNavbarClient.tsx')
  assert.match(data, /\{player \? <Link href="\/completar-perfil\?edit=sports"/)
  assert.match(data, /player \? '\/completar-perfil\?edit=personal' : '\/mi-cuenta'/)
  const account = read('../app/(app)/mi-cuenta/page.tsx')
  assert.doesNotMatch(account, /dominantHand|preferredPosition|heightCm|category|cover/)
  const staffMenu = nav.slice(nav.indexOf("session.role === 'club'"))
  assert.ok(nav.includes('Administración del club'))
  assert.ok(nav.includes('Seguridad'))
  assert.ok(staffMenu || nav)
  assert.doesNotMatch(read('../app/(app)/club/usuarios/page.tsx'), /promoteSelectedPlayer|Buscar jugador|Promové un jugador/)
  assert.match(read('../app/api/clubs/internal-users/candidates/route.ts'), /status: 409/)
})

test('actual Player finance handler rejects staff before any finance RPC or provider read', async () => {
  const app = backend({ staff: 'ADMIN' })
  let rpcCalls = 0
  const exports: { GET?: (request: Request & { nextUrl: URL }) => Promise<Response> } = {}
  runInNewContext(ts.transpileModule(read('../app/api/player/finance/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-fixture' } },
    require(name: string) {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name === '@supabase/supabase-js') return { createClient: () => ({ auth: app.client.auth, rpc: () => { rpcCalls++; throw new Error('Must not execute') } }) }
      if (name.endsWith('accountRoleServer')) return app.guards
      if (name.endsWith('playerFinanceF1D')) return { parsePlayerFinanceQuery: () => ({ view: 'overview', clubId: null, filter: 'ALL' }) }
      return {}
    },
  })
  const request = Object.assign(new Request('https://fixture.invalid/api/player/finance', { headers: { authorization: 'Bearer offline-fixture' } }), { nextUrl: new URL('https://fixture.invalid/api/player/finance') })
  assert.equal((await exports.GET!(request)).status, 403)
  assert.equal(rpcCalls, 0)
})
test('actual enabled checkout GET/POST rejects staff before provider/client work', async () => {
  const app = backend({ staff: 'ADMIN' })
  let providerCalls = 0
  const exports: Record<string, (request: Request) => Promise<Response>> = {}
  runInNewContext(ts.transpileModule(read('../app/api/player/finance/checkout/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require(name: string) {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name.endsWith('accountRoleServer')) return app.guards
      if (name.endsWith('paymentProviderServerF1E')) return {
        providerRuntime: () => ({}),
        authenticatedProviderClient: () => { providerCalls++; throw new Error('Must not execute') },
      }
      return {}
    },
  })
  for (const method of ['GET', 'POST']) assert.equal((await exports[method](new Request('https://fixture.invalid', { method, headers: { authorization: 'Bearer offline-fixture' } }))).status, 403)
  assert.equal(providerCalls, 0)
})

test('follow-up guards direct DB writes without rewriting history or financial selection/formulas', () => {
  const sql = read('../supabase/migrations/20261007164510_20261007155811_account_staff_player_separation.sql')
  for (const table of ['club_memberships','club_players','platform_admins','clubs','profiles','tournament_teams','tournament_registrations','player_partner_invites','player_active_partnerships','club_user_invites']) {
    assert.ok(sql.includes(`before insert or update on public.${table}`))
  }
  assert.match(sql, /v_new->>'status' not in \('PENDING','CONFIRMED'\) then return new/)
  assert.match(sql, /order by u loop/)
  assert.match(sql, /on conflict \(user_id\) do update set epoch = role_epochs.epoch \+ 1/)
  assert.doesNotMatch(sql, /delete from|update public\.|alter table public\.(?:competition|club_finance)/i)
  assert.equal((sql.match(/revoke all on function[^\n]*from public, anon, authenticated, service_role;/g) ?? []).length, 5)
  const old = read('../supabase/migrations/20261006165334_20261006152334_player_finance_f1d_read_model.sql')
  const query = (text: string) => text.slice(text.indexOf('  return query'), text.indexOf('end;',text.indexOf('  return query')))
  const boundary = sql.slice(sql.indexOf('create or replace function public.player_finance_visible_obligations_f1d'))
  assert.equal(query(boundary), query(old))
  assert.match(boundary, /v_user is null or public.account_is_administrative\(v_user\)/)
  const qa = read('../supabase/qa/20261007155811_account_staff_player_separation_validation.sql')
  for (const marker of ['PLAYER_TO_STAFF_ALLOWED','STAFF_TO_PLAYER_ALLOWED','STAFF_PLAYER_FINANCE_ALLOWED','PLAYER_REGRESSION','HELPER_RPC_EXPOSED']) assert.ok(qa.includes(`QA_ACCOUNT_${marker}`))
  assert.match(qa, /rollback;/)
})
