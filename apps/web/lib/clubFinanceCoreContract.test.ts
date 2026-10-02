import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = source('../supabase/migrations/20261002111356_20261001153611_club_finance_core_transactional.sql')
const qa = source('../supabase/qa/20261001153611_club_finance_core_transactional_validation.sql')
const concurrencyQa = source('../supabase/qa/20261001153611_club_finance_core_two_session.md')

test('F1A creates isolated canonical tables and leaves legacy financial models untouched', () => {
  for (const name of ['obligations', 'payments', 'allocations', 'journals', 'postings', 'commands']) {
    assert.match(migration, new RegExp(`create table public\\.club_finance_${name} \\(`))
  }
  assert.doesNotMatch(migration, /(?:alter|drop|update|delete\s+from)\s+(?:table\s+)?public\.(?:club_receivables|club_receivable_payments|club_financial_transactions|tournament_payments|payments|commissions|settlements|settlement_items)\b/i)
  assert.match(migration, /No existing financial row is copied or reinterpreted as collected money/)
})

test('payment means confirmed money; financial status and totals are derived', () => {
  assert.match(migration, /club_finance_payments[\s\S]*status text not null default 'POSTED'/)
  assert.match(migration, /p\.status = 'POSTED'/)
  assert.match(migration, /when v_row\.status = 'CANCELLED' then 'CANCELLED'/)
  assert.match(migration, /when v_balance = 0 then 'PAID'/)
  assert.match(migration, /when v_row\.due_date is not null and v_row\.due_date < current_date then 'OVERDUE'/)
  assert.match(migration, /when v_allocated > 0 then 'PARTIAL'/)
  assert.match(migration, /REFUNDED is reserved for the later real-refund lifecycle/)
})

test('all economic commands are idempotent and the payment path locks the obligation', () => {
  assert.match(migration, /unique \(club_id, operation, idempotency_key\)/)
  assert.match(migration, /extensions\.digest\(coalesce\(p_payload/)
  assert.match(migration, /CLUB_FINANCE_IDEMPOTENCY_CONFLICT/)
  for (const operation of ['CREATE_OBLIGATION', 'REGISTER_PAYMENT', 'REVERSE_PAYMENT', 'CANCEL_OBLIGATION']) {
    assert.match(migration, new RegExp(`begin_club_finance_command\\(p_club_id, '${operation}'`))
    assert.match(migration, new RegExp(`finish_club_finance_command\\(p_club_id, '${operation}'`))
  }
  assert.match(migration, /select \* into v_obligation from public\.club_finance_obligations[\s\S]*for update/)
  assert.match(migration, /revision integer not null default 1 check \(revision > 0\)/)
  assert.match(migration, /update public\.club_finance_obligations set revision = revision \+ 1[\s\S]*v_balance :=/)
  assert.match(migration, /create function public\.validate_club_finance_allocation\([\s\S]*set revision = revision \+ 1/)
  assert.match(migration, /create function public\.guard_club_finance_payment_lifecycle\([\s\S]*set revision = revision \+ 1/)
  assert.match(migration, /set status = 'CANCELLED', revision = revision \+ 1/)
  assert.match(migration, /if p_amount > v_balance then raise exception 'CLUB_FINANCE_OVER_ALLOCATION'/)
})

test('journal and allocations are immutable, balanced and club/currency scoped', () => {
  assert.match(migration, /foreign key \(club_id, journal_id, currency_code\)/)
  assert.match(migration, /club_finance_journal_balance[\s\S]*deferrable initially deferred/)
  assert.match(migration, /v_count <> 2 or v_debit <> v_credit/)
  assert.match(migration, /club_finance_journal_obligation_event_uidx/)
  assert.match(migration, /club_finance_journal_payment_event_uidx/)
  assert.match(migration, /club_finance_obligation_journal_coverage[\s\S]*deferrable initially deferred/)
  assert.match(migration, /club_finance_payment_journal_coverage[\s\S]*deferrable initially deferred/)
  assert.match(migration, /v_pattern is distinct from true/)
  assert.match(migration, /v_allocation\.amount <> v_payment\.amount/)
  for (const table of ['allocation', 'journal', 'posting']) {
    assert.match(migration, new RegExp(`club_finance_${table}_immutable before update or delete`))
  }
  assert.match(migration, /'PAYMENT_REVERSED'[\s\S]*'ACCOUNTS_RECEIVABLE'/)
  assert.match(migration, /CLUB_FINANCE_CANCEL_REQUIRES_PAYMENT_RESOLUTION/)
})

test('RLS, direct-write denial and minimal RPC grants are present', () => {
  for (const table of ['obligations', 'payments', 'allocations', 'journals', 'postings', 'commands']) {
    assert.match(migration, new RegExp(`alter table public\\.club_finance_${table} enable row level security`))
  }
  assert.match(migration, /revoke all on table public\.club_finance_obligations[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /grant select on table public\.club_finance_obligations[\s\S]*to authenticated/)
  assert.match(migration, /revoke all on function public\.guard_club_finance_immutable[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(migration, /public\.validate_club_finance_obligation_journals\(\)/)
  assert.match(migration, /public\.validate_club_finance_payment_journals\(\)/)
  assert.match(migration, /grant execute on function public\.get_club_finance_obligation[\s\S]*to authenticated/)
})

test('reversible QA covers all F1A invariants and documents the two-session race', () => {
  for (const marker of [
    'QA_A_PENDING_FAILED', 'QA_B_PARTIAL_FAILED', 'QA_C_PAID_FAILED',
    'QA_D_OVER_ALLOCATION_NOT_BLOCKED', 'QA_E_PAYMENT_REPLAY_FAILED',
    'QA_G_REVERSE_FAILED', 'QA_H_DOUBLE_REVERSE_NOT_BLOCKED',
    'QA_I_CURRENCY_NOT_BLOCKED', 'QA_J_CANCEL_FAILED',
    'QA_K_PAID_CANCEL_NOT_BLOCKED', 'QA_K_PRIVILEGED_CANCEL_NOT_BLOCKED',
    'QA_L_JOURNAL_UNBALANCED', 'QA_B_REVISION_NOT_BUMPED',
    'QA_G_REVISION_NOT_BUMPED', 'QA_M_DIRECT_WRITE_GRANTED',
    'QA_M_FINANCE_ACL_EXPOSURE', 'QA_N_CROSS_CLUB_CAPABILITY',
  ]) assert.match(qa, new RegExp(marker))
  assert.match(qa, /F1A SEQUENTIAL QA only/)
  assert.match(qa, /TWO-SESSION QA is separate/)
  for (const marker of [
    'QA_L_UNBALANCED_COMMIT_NOT_BLOCKED',
    'QA_L_PAYMENT_WITHOUT_JOURNAL_NOT_BLOCKED',
    'QA_L_REVERSAL_WITHOUT_JOURNAL_NOT_BLOCKED',
    'QA_L_OBLIGATION_WITHOUT_JOURNAL_NOT_BLOCKED',
  ]) assert.match(qa, new RegExp(marker))
  assert.match(qa, /set constraints club_finance_journal_balance immediate/)
  assert.match(qa, /set constraints club_finance_payment_journal_coverage immediate/)
  for (const scenario of ['R1', 'R2', 'R3', 'R4']) {
    assert.match(concurrencyQa, new RegExp(`## ${scenario} —`))
  }
  assert.match(concurrencyQa, /40001/)
  assert.match(concurrencyQa, /begin isolation level repeatable read/)
  assert.match(concurrencyQa, /begin isolation level read committed/)
  assert.match(qa, /rollback;/)
})
