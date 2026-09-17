import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type * as RepositoryModule from '../features/competition/settlement/competition-settlement.repository'
import type * as ErrorModule from '../features/competition/settlement/competition-settlement.error'

const { settlementCommandArgs, settlementRpc, settlementRpcDiagnostic } = await import(new URL('../features/competition/settlement/competition-settlement.repository.ts', import.meta.url).href) as typeof RepositoryModule
const { classifySettlementInfrastructureError } = await import(new URL('../features/competition/settlement/competition-settlement.error.ts', import.meta.url).href) as typeof ErrorModule
const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260912160303_competition_settlement_rpc_named_arguments.sql'), 'utf8')
const qa = readFileSync(join(process.cwd(), 'supabase/qa/20260912160303_competition_settlement_rpc_named_arguments_validation.sql'), 'utf8')
const handler = readFileSync(join(process.cwd(), 'features/competition/settlement/competition-settlement.handlers.ts'), 'utf8')
const http = readFileSync(join(process.cwd(), 'features/competition/settlement/competition-settlement.http.ts'), 'utf8')

test('repository sends the exact named PostgREST arguments', async () => {
  const args = settlementCommandArgs('club-1', 'settlement-1', 2, 'idempotency-1')
  assert.deepEqual(args, {
    p_club_id: 'club-1',
    p_settlement_id: 'settlement-1',
    p_revision: 2,
    p_idempotency_key: 'idempotency-1',
  })
  const calls: Array<{name:string;args:Record<string,unknown>}> = []
  const logs: unknown[][] = []
  const client = { rpc: async (name:string, rpcArgs:Record<string,unknown>) => { calls.push({ name, args: rpcArgs }); return { data: { ok: true }, error: null } } } as unknown as SupabaseClient
  const originalConsoleError = console.error
  console.error = (...values: unknown[]) => { logs.push(values) }
  try {
    await settlementRpc(client, 'submit_competition_event_settlement', args)
  } finally {
    console.error = originalConsoleError
  }
  assert.deepEqual(calls, [{ name: 'submit_competition_event_settlement', args }])
  assert.deepEqual(logs, [
    ['[SETTLEMENT RPC REQUEST]', settlementRpcDiagnostic('submit_competition_event_settlement', args)],
    ['[SETTLEMENT RPC RESPONSE]', { rpcName: 'submit_competition_event_settlement', ok: true }],
  ])
  assert.match(handler, /const base=settlementCommandArgs\(p\.clubId,p\.settlementId,concurrency\.revision,concurrency\.key\)/)
  assert.match(handler, /settlementRpc<Record<string,unknown>>\(auth\.client,rpcName,args\)/)
  assert.match(handler, /details:division\.error\.details,hint:division\.error\.hint,supabaseMessage:division\.error\.message/)
})

test('calculate and submit use the same client and runtime argument types', async () => {
  const calls: Array<{client:SupabaseClient;name:string;args:Record<string,unknown>}> = []
  const client = { rpc: async (name:string, args:Record<string,unknown>) => { calls.push({ client: client as unknown as SupabaseClient, name, args }); return { data: {}, error: null } } } as unknown as SupabaseClient
  const args = settlementCommandArgs('3c07d844-29e1-4c62-865c-4d20f35d6df4', '71ee4788-ff13-4c9f-9580-e477984237f6', 2, '550e8400-e29b-41d4-a716-446655440000')
  const originalConsoleError = console.error
  console.error = () => undefined
  try {
    await settlementRpc(client, 'calculate_competition_event_settlement', args)
    await settlementRpc(client, 'submit_competition_event_settlement', args)
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(calls[0].client, calls[1].client)
  assert.deepEqual(calls.map(call => call.args), [args, args])
  assert.deepEqual(calls.map(call => settlementRpcDiagnostic(call.name, call.args).types), [
    { p_club_id: 'string', p_settlement_id: 'string', p_revision: 'number', p_idempotency_key: 'string' },
    { p_club_id: 'string', p_settlement_id: 'string', p_revision: 'number', p_idempotency_key: 'string' },
  ])
  assert.deepEqual(calls.map(call => call.name), ['calculate_competition_event_settlement', 'submit_competition_event_settlement'])
})

test('a PostgREST cache miss preserves its diagnostic without claiming a missing migration', async () => {
  const missing = classifySettlementInfrastructureError(Object.assign(new Error('rpc: missing'), {
    code: 'PGRST202',
    supabaseMessage: 'Could not find the function public.submit_competition_event_settlement in the schema cache',
    hint: 'Reload the schema cache',
  }))
  assert.equal(missing.status, 503)
  assert.deepEqual(missing.body, {
    error: 'PostgREST no encuentra la firma de la función de settlement en su cache.',
    code: 'PGRST202',
    detail: 'Could not find the function public.submit_competition_event_settlement in the schema cache',
    hint: 'Reload the schema cache',
  })
  assert.equal('setupRequired' in missing.body, false)

  const ambiguous = classifySettlementInfrastructureError(Object.assign(new Error('rpc: ambiguous'), {
    code: 'PGRST203',
    supabaseMessage: 'Could not choose the best candidate function',
    details: 'Candidates have overlapping named arguments',
  }))
  assert.equal(ambiguous.status, 502)
  assert.deepEqual(ambiguous.body, {
    error: 'PostgREST rechazó la operación de settlement.',
    code: 'PGRST203',
    detail: 'Could not choose the best candidate function',
    details: 'Candidates have overlapping named arguments',
    hint: undefined,
  })

  const unrelated = classifySettlementInfrastructureError(Object.assign(new Error('rpc: relation does not exist in schema cache'), { code: '42P01' }))
  assert.equal(unrelated.status, 500)
  assert.equal('setupRequired' in unrelated.body, false)
  assert.match(http, /classifySettlementInfrastructureError\(value\)/)
  assert.doesNotMatch(http, /message\.includes\('does not exist'\)|message\.includes\('schema cache'\)/)
})

test('repository preserves the original Supabase diagnostic for the HTTP classifier', async () => {
  const client = { rpc: async () => ({ data: null, error: { code: 'PGRST203', message: 'original message', details: 'original details', hint: 'original hint' } }) } as unknown as SupabaseClient
  let caught: unknown
  try {
    await settlementRpc(client, 'submit_competition_event_settlement', settlementCommandArgs('club-1', 'settlement-1', 2, 'idempotency-1'))
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof Error)
  const response = classifySettlementInfrastructureError(caught)
  assert.equal(response.status, 502)
  assert.deepEqual(response.body, {
    error: 'PostgREST rechazó la operación de settlement.',
    code: 'PGRST203',
    detail: 'original message',
    details: 'original details',
    hint: 'original hint',
  })
})

test('migration redeclares only the three settlement wrappers with named arguments', () => {
  const functions = [...migration.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map(match => match[1])
  assert.deepEqual(functions, [
    'submit_competition_event_settlement',
    'approve_competition_event_settlement',
    'publish_competition_event_settlement',
  ])

  for (const operation of ['submit', 'approve', 'publish']) {
    const wrapper = migration.slice(
      migration.indexOf(`create or replace function public.${operation}_competition_event_settlement`),
      migration.indexOf('$$;', migration.indexOf(`create or replace function public.${operation}_competition_event_settlement`)) + 3,
    )
    assert.match(wrapper, /p_club_id uuid,\s*p_settlement_id uuid,\s*p_revision integer,\s*p_idempotency_key text/)
    assert.match(wrapper, /returns jsonb\s*language sql\s*security definer\s*set search_path = pg_catalog, public/)
    assert.match(wrapper, new RegExp(`p_revision,\\s*'${operation.toUpperCase()}',\\s*p_idempotency_key,\\s*'\\{\\}'::jsonb`))
  }

  assert.doesNotMatch(migration, /drop function/i)
  assert.match(migration, /notify pgrst, 'reload schema';\s*commit;/)
})

test('migration preserves the explicit PostgREST grants', () => {
  for (const operation of ['submit', 'approve', 'publish']) {
    const signature = `public.${operation}_competition_event_settlement\\(uuid, uuid, integer, text\\)`
    assert.match(migration, new RegExp(`revoke all on function ${signature} from public, anon;`))
    assert.match(migration, new RegExp(`grant execute on function ${signature} to authenticated, service_role;`))
  }
})

test('read-only QA verifies pg_proc argument names and effective grants', () => {
  assert.match(qa, /procedure\.proargnames::text\[\]/)
  assert.match(qa, /'p_club_id',\s*'p_settlement_id',\s*'p_revision',\s*'p_idempotency_key'/)
  assert.match(qa, /has_function_privilege\('anon'/)
  assert.match(qa, /has_function_privilege\('authenticated'/)
  assert.match(qa, /has_function_privilege\('service_role'/)
  assert.doesNotMatch(qa, /\b(insert|update|delete|truncate|alter|create|drop)\b/i)
})
