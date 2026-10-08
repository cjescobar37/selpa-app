import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = source('../supabase/migrations/20261002155601_20261002130523_club_finance_tournament_registration_f1b.sql')
const core = source('../supabase/migrations/20261002111356_20261001153611_club_finance_core_transactional.sql')
const qa = source('../supabase/qa/20261002130523_club_finance_tournament_registration_f1b_validation.sql')
const concurrencyQa = source('../supabase/qa/20261002130523_club_finance_tournament_registration_f1b_two_session.md')
const listRoute = source('../app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/route.ts')
const legacyApprovalRoute = source('../app/api/clubs/[clubId]/payments/[paymentId]/route.ts')
const registrationRoute = source('../app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/[id]/route.ts')
const manualRoute = source('../app/api/clubs/[clubId]/tournaments/[tournamentId]/registrations/manual/route.ts')
const cancellationRoute = source('../app/api/clubs/[clubId]/registration-change-requests/[requestId]/route.ts')
const detail = source('../app/(app)/club/torneos/[id]/page.tsx')
const readme = source('../features/finance/README.md')

test('A–G: confirmation creates exactly one ARS team obligation for two players', () => {
  assert.match(migration, /after insert or update of status on public\.tournament_registrations/)
  assert.match(migration, /new\.status = 'CONFIRMED'/)
  assert.match(migration, /v_team\.player1_user_id is null or v_team\.player2_user_id is null/)
  assert.match(migration, /v_amount := v_tournament\.price_per_player \* 2/)
  assert.match(migration, /'TOURNAMENT_REGISTRATION', new\.id/)
  assert.match(migration, /new\.tournament_id, new\.id, new\.team_id/)
  assert.match(migration, /new\.club_id, 'TEAM', new\.team_id/)
  assert.match(migration, /'ARS'/)
  assert.match(migration, /if v_amount = 0 and v_obligation\.id is null then/)
  assert.match(core, /create unique index club_finance_obligation_source_uidx[\s\S]*where source_id is not null/)
  assert.match(migration, /on conflict \(club_id, source_type, source_id\) where source_id is not null/)
  assert.match(migration, /club_finance_obligation_projection_internal/)
  assert.doesNotMatch(migration, /\b(update|insert into)\s+public\.tournament_payments\b/i)
})

test('H–L: legacy payment state stays separate, cancellation cannot erase posted money', () => {
  assert.doesNotMatch(migration, /\b(insert into|update|delete from)\s+public\.tournament_payments\b/i)
  assert.match(migration, /p\.status = 'POSTED'/)
  assert.match(migration, /CLUB_FINANCE_REGISTRATION_REQUIRES_PAYMENT_RESOLUTION/)
  assert.match(migration, /set status = 'CANCELLED', revision = revision \+ 1/)
  assert.match(migration, /'OBLIGATION_CANCELLED'/)
  assert.match(migration, /CLUB_FINANCE_REGISTRATION_SCOPE_INVALID/)
  assert.match(migration, /v_obligation\.currency_code <> 'ARS'/)
  assert.match(migration, /from public, anon, authenticated, service_role/)
  assert.match(readme, /tournament_payments\.APPROVED/)
  assert.match(readme, /club_finance_payments\.POSTED/)
  assert.match(readme, /no reinterpretará obligaciones históricas/)
  assert.match(legacyApprovalRoute, /rpc\('resolve_tournament_payment_request_pass3'/)
  assert.match(legacyApprovalRoute, /p_actor_id:auth.user.id/)
  const integration = source('../supabase/migrations/20261008101837_product_write_flows_pass3.sql')
  assert.match(integration, /perform public.transition_tournament_registration_finance_f1b\([\s\S]*'CONFIRMED',p_actor_id,p_payment_id/)
  assert.ok(
    integration.indexOf('perform public.transition_tournament_registration_finance_f1b(') <
      integration.indexOf('update public.tournament_payments set status='),
    'registration confirmation must precede legacy request approval'
  )
  assert.doesNotMatch(legacyApprovalRoute, /\.update\(/, 'HTTP must not leave a partial legacy approval')
})

test('F1B actor is the authorized human who confirmed, never registration creator', () => {
  assert.match(migration, /create function public\.transition_tournament_registration_finance_f1b/)
  assert.match(migration, /p_actor_id uuid, p_legacy_payment_id uuid default null/)
  assert.match(migration, /p_legacy_payment_id is not null[\s\S]*p\.status = 'PENDING'/)
  assert.match(migration, /v_role in \('OWNER', 'ADMIN'\)/)
  assert.match(migration, /v_role = 'OPERADOR' and v_capability = 'registrations:manage'/)
  assert.match(migration, /grant execute on function public\.transition_tournament_registration_finance_f1b\([\s\S]*to service_role/)
  assert.match(migration, /v_amount, v_actor/)
  assert.match(migration, /'OBLIGATION_CREATED', v_obligation\.id, v_actor/)
  assert.match(migration, /cancelled_by = v_actor/)
  assert.doesNotMatch(migration, /coalesce\(auth\.uid\(\), new\.admission_by, new\.created_by\)/)
  assert.match(registrationRoute, /rpc\(\s*'transition_tournament_registration_finance_f1b'/)
  assert.match(manualRoute, /status: 'PENDING'/)
  assert.match(manualRoute, /p_actor_id: user\.id/)
  assert.match(cancellationRoute, /rpc\(\s*'resolve_registration_change_request_pass3'/)
  assert.match(source('../supabase/migrations/20261008101837_product_write_flows_pass3.sql'), /perform public\.transition_tournament_registration_finance_f1b\(\s*p_club_id,v_request\.tournament_id,v_request\.registration_id,'CANCELLED',p_actor_id/)
  for (const marker of [
    'QA_F1B_ADMIN_A_ACTOR_NOT_RECORDED',
    'QA_F1B_CREATOR_NOT_DISTINCT_FROM_APPROVER',
    'QA_F1B_ADMIN_B_LEGACY_ACTOR_NOT_RECORDED',
    'QA_F1B_UNAUTHORIZED_ACTOR_ACCEPTED',
    'QA_F1B_UNAUTHORIZED_ACTOR_BROKE_ATOMICITY',
    'QA_F1B_SERVICE_ROLE_DIRECT_WRITE_ACCEPTED',
  ]) assert.match(qa, new RegExp(marker))
  assert.match(readme, /due_date`\s+queda `NULL`/)
  assert.match(readme, /no\s+`OVERDUE` automático/)
})

test('M: the Club Admin list obtains one authorized batch projection, not one RPC per registration', () => {
  assert.match(migration, /create function public\.get_tournament_registration_finance_f1b/)
  assert.match(migration, /has_club_capability\(p_club_id, 'finance:view'\)/)
  assert.match(listRoute, /rpc\('get_tournament_registration_finance_f1b'/)
  assert.match(listRoute, /financeByRegistration\.get\(registration\.id\)/)
  assert.match(listRoute, /financial_status: 'NO_CHARGE'/)
  assert.match(detail, /financeLabel\(registration\.finance\)/)
  assert.match(detail, /Solicitud de pago \(operativa\)/)
})

test('reversible SQL QA covers source, retry, legacy separation, cancellation and cross-club guards', () => {
  for (const marker of [
    'QA_F1B_PENDING_CREATED_CHARGE',
    'QA_F1B_SOURCE_AMOUNT_CURRENCY_INVALID',
    'QA_F1B_INITIAL_STATUS_INVALID',
    'QA_F1B_BATCH_PROJECTION_INVALID',
    'QA_F1B_RETRY_DUPLICATED_OBLIGATION',
    'QA_F1B_ADMIN_B_LEGACY_ACTOR_NOT_RECORDED',
    'QA_F1B_UNPAID_CANCEL_FAILED',
    'QA_F1B_LEGACY_APPROVED_CREATED_PAYMENT',
    'QA_F1B_CROSS_CLUB_NOT_BLOCKED',
    'QA_F1B_PAID_CANCEL_NOT_BLOCKED',
    'QA_F1B_CANCEL_AFTER_RESOLUTION_FAILED',
  ]) assert.match(qa, new RegExp(marker))
  assert.match(qa, /set constraints all immediate;\s*rollback;/)
  assert.match(concurrencyQa, /begin isolation level repeatable read/)
  assert.match(concurrencyQa, /SQLSTATE 40001/)
  assert.match(concurrencyQa, /Exactamente 1/)
})
