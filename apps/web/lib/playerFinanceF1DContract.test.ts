import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { financePage, formatFinanceMoney } from './clubFinanceF1C'
import {
  groupPlayerObligations, parsePlayerFinanceQuery, playerBalanceLabel,
  playerFinanceQuery, playerMovementLabel, type PlayerFinanceObligation,
} from './playerFinanceF1D'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const migration = source('../supabase/migrations/20261006165334_20261006152334_player_finance_f1d_read_model.sql')
const qa = source('../supabase/qa/20261006152334_player_finance_f1d_read_model_validation.sql')
const api = source('../app/api/player/finance/route.ts')
const page = source('../app/(app)/player/pagos/page.tsx')
const content = source('../app/(app)/player/pagos/PlayerFinanceContent.tsx')
const navbar = source('../components/navbar/AppNavbarClient.tsx')
const gate = source('../app/(app)/RoleGate.tsx')
const visibility = migration.slice(migration.indexOf('create function public.player_finance_visible_obligations_f1d'), migration.indexOf('create function public.get_player_finance_overview_f1d'))
const overview = migration.slice(migration.indexOf('create function public.get_player_finance_overview_f1d'), migration.indexOf('create function public.list_player_finance_obligations_f1d'))

test('A: empty summary yields zero amounts and a player-facing empty state', () => {
  assert.match(overview, /'total_pending', coalesce\(sum\(balance\), 0\)/)
  assert.match(overview, /'total_paid', coalesce\(sum\(allocated_net\), 0\)/)
  assert.match(content, /No tenés pagos pendientes\./)
  assert.match(content, /Las inscripciones con cargo aparecerán acá cuando el club las confirme\./)
  assert.match(qa, /QA_F1D_EMPTY_INVALID/)
})

test('B–E: pending, partial, paid and cancelled derive from canonical balances', () => {
  assert.match(migration, /when o\.status = 'CANCELLED' then 0/)
  assert.match(migration, /when b\.status = 'CANCELLED' then 'CANCELLED'/)
  assert.match(migration, /when b\.balance = 0 then 'PAID' when b\.allocated_net > 0 then 'PARTIAL' else 'PENDING'/)
  assert.match(migration, /v_filter = 'PENDING' and b\.status = 'OPEN' and b\.balance > 0/)
  for (const marker of ['PENDING_INVALID', 'PARTIAL_INVALID', 'PAID_INVALID', 'CANCELLED_INVALID']) {
    assert.match(qa, new RegExp(`QA_F1D_${marker}`))
  }
  assert.equal(playerBalanceLabel({ debtor_type: 'TEAM', financial_status: 'PENDING' }), 'Pendiente de la pareja')
  assert.equal(playerBalanceLabel({ debtor_type: 'TEAM', financial_status: 'PARTIAL' }), 'Pendiente de la pareja')
  assert.equal(playerBalanceLabel({ debtor_type: 'TEAM', financial_status: 'PAID' }), 'Pagado de la pareja')
  assert.equal(playerBalanceLabel({ debtor_type: 'USER', financial_status: 'CANCELLED' }), 'Cargo cancelado')
})

test('F: reversal remains in history but does not contribute to net paid', () => {
  assert.match(overview, /where p\.status = 'POSTED'/)
  const movements = migration.slice(migration.indexOf('create function public.list_player_finance_movements_f1d'), migration.indexOf('revoke all'))
  assert.doesNotMatch(movements, /where p\.status = 'POSTED'/)
  assert.equal(playerMovementLabel('REVERSED'), 'Cobro revertido')
  assert.equal(playerMovementLabel('POSTED'), 'Registrado por el club')
  assert.match(qa, /QA_F1D_REVERSAL_NET_INVALID/)
})

test('G–I: shared TEAM visibility derives auth.uid and matches either player in the same club', () => {
  assert.match(visibility, /v_user uuid := auth\.uid\(\)/)
  assert.match(visibility, /team\.id = o\.debtor_team_id and team\.club_id = o\.club_id/)
  assert.match(visibility, /o\.debtor_type = 'TEAM'[\s\S]*team\.player1_user_id = v_user or team\.player2_user_id = v_user/)
  assert.match(visibility, /p_club_id is null or o\.club_id = p_club_id/g)
  assert.doesNotMatch(migration, /p_user_id|finance:view|finance:manage/)
  assert.match(qa, /QA_F1D_PLAYER2_OR_USER_VISIBILITY_INVALID/)
  assert.match(qa, /QA_F1D_OUTSIDER_VISIBLE/)
  assert.match(qa, /QA_F1D_CROSS_TEAM_CLUB_VISIBLE/)
  assert.match(qa, /QA_F1D_RAW_TABLE_BYPASSED_RLS/)
})

test('J: USER is visible only to the debtor; URL identities/selectors cannot override it', () => {
  assert.match(visibility, /o\.debtor_type = 'USER'[\s\S]*o\.debtor_user_id = v_user/)
  assert.match(qa, /QA_F1D_USER_DEBTOR_INVISIBLE/)
  for (const key of ['userId', 'p_user_id', 'obligationId', 'obligation_id', 'paymentId']) {
    assert.equal(parsePlayerFinanceQuery(new URLSearchParams({ [key]: 'some-other-identity' })), null)
  }
  assert.match(api, /parsePlayerFinanceQuery\(req\.nextUrl\.searchParams\)/)
})

test('K: legacy and accounting internals never enter the player read model', () => {
  assert.doesNotMatch(migration, /tournament_payments|club_receivables|club_financial_transactions|club_finance_journals|club_finance_postings/)
  assert.doesNotMatch(api + page, /tournament_payments|supabaseAdmin|service_role|register_club_finance_payment|reverse_club_finance_payment/)
  assert.doesNotMatch(api, /export async function (?:POST|PATCH|DELETE|PUT)/)
  assert.doesNotMatch(migration, /insert into|update public\.|delete from|alter table/i)
})

test('L–M: totals use visible allocations, preserve the full pair amount, exclude paid from open count', () => {
  assert.match(overview, /from visible o[\s\S]*a\.club_id = o\.club_id and a\.obligation_id = o\.id/)
  assert.match(overview, /sum\(a\.amount\) amount/)
  assert.match(overview, /greatest\(o\.original_amount - coalesce\(paid\.amount, 0\), 0\)/)
  assert.match(overview, /count\(\*\) filter \(where status = 'OPEN' and balance > 0\)/)
  assert.doesNotMatch(overview, /sum\(p\.amount\)|\/\s*2|0\.5/)
  assert.match(qa, /QA_F1D_NET_SUMMARY_INVALID/)
  assert.match(content, /row\.financial_status === 'PAID' \? row\.allocated_net : row\.balance/)
  assert.match(content, /Los importes de pareja se muestran completos, sin dividirlos\./)
  assert.match(formatFinanceMoney(50000), /50\.000/)
})

test('N: stable cursors include tie-breaking IDs and validate both cursor parts', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const cursor = { at: '2026-10-06T15:00:00.000Z', id }
  const params = new URLSearchParams(playerFinanceQuery('obligations', 'PENDING', cursor))
  assert.deepEqual(parsePlayerFinanceQuery(params), { clubId: null, view: 'obligations', filter: 'PENDING', cursor })
  assert.equal(parsePlayerFinanceQuery(new URLSearchParams({ beforeAt: cursor.at })), null)
  assert.equal(parsePlayerFinanceQuery(new URLSearchParams({ view: 'obligations', beforeAt: 'bad', beforeId: id })), null)
  assert.equal(parsePlayerFinanceQuery(new URLSearchParams('view=obligations&view=movements')), null)
  const result = financePage([{ id, paid_at: cursor.at }, { id: 'other', paid_at: cursor.at }], 1, 'paid_at')
  assert.deepEqual(result.nextCursor, cursor)
  assert.match(migration, /\(b\.created_at, b\.id\) < \(p_before_created_at, p_before_id\)/)
  assert.match(migration, /\(p\.paid_at, a\.id\) < \(p_before_paid_at, p_before_id\)/)
  assert.match(qa, /QA_F1D_CURSOR_SKIPPED/)
  assert.match(qa, /QA_F1D_MOVEMENT_CURSOR_SKIPPED/)
})

test('O: server-side batch reads, restricted page sizes and club grouping avoid N+1', () => {
  assert.match(api, /Promise\.all\(\[/)
  assert.match(api, /p_limit: pageSize \+ 1/)
  assert.match(migration, /p_limit not between 1 and 51/)
  assert.match(migration, /left join public\.profiles p1/)
  assert.match(migration, /left join public\.profiles p2/)
  assert.doesNotMatch(page, /\.rpc\(|\.from\(|items\.map[\s\S]*fetch\(/)
  const rows = [
    { id: 'a', club_id: 'one', club_name: 'Club Uno' },
    { id: 'b', club_id: 'two', club_name: 'Club Dos' },
    { id: 'c', club_id: 'one', club_name: 'Club Uno' },
  ] as PlayerFinanceObligation[]
  assert.deepEqual(groupPlayerObligations(rows).map(group => [group.name, group.rows.map(row => row.id)]), [
    ['Club Uno', ['a', 'c']], ['Club Dos', ['b']],
  ])
})

test('P: player navigation and copy have no technical IDs or payment actions', () => {
  assert.equal((navbar.match(/href="\/player\/pagos"/g) ?? []).length, 2)
  assert.match(gate, /'\/player\/pagos'/)
  assert.match(page, /Mis pagos/)
  // F1E adds a server-gated provider CTA; F1D still has no legacy money-reporting actions.
  assert.doesNotMatch(content, />\{row\.(?:id|obligation_id|debtor_type|status|financial_status)\}|journals|postings|allocation|UUID|source_type|50\/50|Subir comprobante|Informar transferencia|>Pagar</)
  assert.match(page, /result\?\.userId === userId/)
  assert.match(page, /controller\.signal\.aborted/)
})

test('only authenticated JWT reads are exposed; helper stays INTERNAL and anonymous calls fail closed', () => {
  assert.match(api, /client\.auth\.getUser\(token\)/)
  assert.match(api, /'Cache-Control': 'private, no-store'/)
  assert.match(visibility, /if v_user is null[\s\S]*errcode = '42501'/)
  assert.match(migration, /revoke all on function public\.player_finance_visible_obligations_f1d\(uuid\)\s+from public, anon, authenticated, service_role/)
  assert.doesNotMatch(migration, /grant execute on function public\.player_finance_visible_obligations_f1d/)
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 3)
  assert.equal((migration.match(/set search_path = pg_catalog, public/g) ?? []).length, 4)
  assert.match(qa, /QA_F1D_ANON_VISIBLE/)
  assert.match(qa, /QA_F1D_UNEXPECTED_EXECUTE/)
})
