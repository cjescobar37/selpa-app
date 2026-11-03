import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import { clubTournamentIsActive } from './clubTournamentCatalog.ts'

async function readDashboard(countAvailable = true) {
  const rows = [
    ...Array.from({ length: 100 }, (_, i) => ({ id: `old${i}`, club_id: 'club', status: 'FINISHED', start_date: '2020-01-01' })),
    ...Array.from({ length: 40 }, (_, i) => ({ id: `active${i}`, club_id: 'club', name: `Event ${i}`, status: i === 0 ? 'RUNNING' : 'OPEN', start_date: i === 0 ? '2026-01-01' : '2027-01-01' })),
  ]
  const client = createClient('http://127.0.0.1:45433', 'qa-local-only', { auth: { persistSession: false }, global: { fetch: async input => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)
    let data = table === 'tournaments' ? [...rows] : table === 'clubs' ? [{ id: 'club', name: 'Club QA', status: 'ACTIVE' }] : []
    const excluded = url.searchParams.get('status')
    if (excluded?.startsWith('not.in.')) {
      const values = excluded.slice(8, -1).replaceAll('"', '').split(',')
      data = data.filter(row => !values.includes(row.status))
    }
    const count = data.length
    data = data.slice(0, Number(url.searchParams.get('limit') ?? 1000))
    const singular = table === 'clubs'
    return new Response(JSON.stringify(singular ? data[0] : data), { headers: { 'content-type': 'application/json', ...(countAvailable ? { 'content-range': `0-${Math.max(0, data.length - 1)}/${count}` } : {}) } })
  } } })
  const db = { from: client.from.bind(client), auth: { getUser: async () => ({ data: { user: { id: 'admin' } }, error: null }) } }
  const output = { exports: {} }
  const imports = {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/lib/supabaseAdmin': { supabaseAdmin: db },
    '@/lib/clubMembershipServer': { userHasClubCapability: async (_user, club, capability) => club === 'club' && capability === 'dashboard:view' },
    '@/lib/clubTournamentCatalog': { clubTournamentIsActive },
  }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/clubs/[clubId]/summary/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: output, exports: output.exports, require: key => { assert.ok(imports[key], key); return imports[key] } })
  const response = await output.exports.GET(new Request('http://localhost/api/clubs/club/summary', { headers: { Authorization: 'Bearer qa-only' } }), { params: Promise.resolve({ clubId: 'club' }) })
  return response
}

test('dashboard counts all active events before limiting agenda and keeps RUNNING ahead of old history', async () => {
  const response = await readDashboard()
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.counts.active_or_upcoming_tournaments, 40)
  assert.equal(result.tournaments.length, 5)
  assert.equal(result.tournaments[0].status, 'RUNNING')
  assert.ok(result.tournaments.every(row => row.status !== 'FINISHED'))
})


test('unavailable exact count is a retryable failure instead of a made-up sample total', async () => {
  const response = await readDashboard(false)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).counts, undefined)
})
