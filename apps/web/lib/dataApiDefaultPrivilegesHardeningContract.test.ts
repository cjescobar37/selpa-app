import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260928113241_data_api_default_privileges_hardening.sql'),
  'utf8',
)
const publicExecuteMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260928113507_data_api_default_function_public_execute_hardening.sql',
  ),
  'utf8',
)
const qa = readFileSync(
  join(process.cwd(), 'supabase/qa/data_api_default_privileges_hardening.sql'),
  'utf8',
)

test('hardening changes only postgres/public defaults for future objects', () => {
  assert.equal(
    migration.match(/alter default privileges for role postgres in schema public/gi)?.length,
    3,
  )
  assert.match(migration, /revoke all privileges on tables\s+from public, anon, authenticated, service_role/i)
  assert.match(migration, /revoke all privileges on functions\s+from public, anon, authenticated, service_role/i)
  assert.match(migration, /revoke all privileges on sequences\s+from public, anon, authenticated, service_role/i)
  assert.doesNotMatch(migration, /supabase_admin/i)
  assert.doesNotMatch(migration, /\bon\s+(?:all\s+)?(?:table|function|sequence)\s+public\./i)
})

test('global function defaults revoke the PostgreSQL built-in PUBLIC execute', () => {
  assert.match(
    publicExecuteMigration,
    /alter default privileges for role postgres\s+revoke execute on functions\s+from public/i,
  )
  assert.doesNotMatch(publicExecuteMigration, /in schema/i)
  assert.doesNotMatch(publicExecuteMigration, /anon|authenticated|service_role/i)
})

test('QA covers catalog defaults, preserved contracts and rollback-safe new objects', () => {
  assert.match(qa, /pg_catalog\.pg_default_acl/i)
  assert.match(qa, /pg_catalog\.acldefault/i)
  assert.match(qa, /pg_catalog\.aclexplode/i)
  assert.match(qa, /postgres global default ACL/i)
  assert.match(qa, /functions:PUBLIC EXECUTE/i)
  assert.match(qa, /existing object ACL fingerprint/i)
  assert.match(qa, /get_public_club_profile\(uuid\):anon EXECUTE/i)
  assert.match(qa, /categories:authenticated SELECT/i)
  assert.match(qa, /create table public\.__selpa_default_acl_qa_table/i)
  assert.match(qa, /create sequence public\.__selpa_default_acl_qa_sequence/i)
  assert.match(qa, /create function public\.__selpa_default_acl_qa_function/i)
  assert.match(qa, /values \('anon'\), \('authenticated'\), \('service_role'\)/i)
  assert.match(qa, /rollback;/i)
})
