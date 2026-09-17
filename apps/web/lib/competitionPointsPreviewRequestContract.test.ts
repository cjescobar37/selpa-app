import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const panel = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventSettlementPanel.tsx'), 'utf8')
const homologation = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventHomologationAdmin.tsx'), 'utf8')
const seriesRoute = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/[seriesId]/route.ts'), 'utf8')

test('preview requests use the same authenticated session pattern as homologation', () => {
  for (const source of [panel, homologation]) {
    assert.match(source, /supabase\.auth\.getSession\(\)/)
    assert.match(source, /Authorization: `Bearer \$\{await token\(\)\}`/)
  }
  assert.match(panel, /if \(!response\.ok\) throw Object\.assign\(new Error\(body\.error/)
})

test('preview loading is independent of the full series detail endpoint', () => {
  const load = panel.slice(panel.indexOf('const load = useCallback'), panel.indexOf('useEffect(() => { const timer'))
  assert.doesNotMatch(load, /request<\{ series\??:/)
  assert.doesNotMatch(load, /\/competition\/series\/\$\{seriesId\}`/)
  assert.match(load, /request<\{ settlements: Settlement\[\] \}>\(collection\)/)
  assert.match(load, /getDetail\(settlements\[0\]\.id\)/)
  assert.match(load, /prepareCompetitionPointsPreview\(/)
  assert.match(load, /previewBaseline\.current = latestDetail \? settlementState\(latestDetail\) : null/)
})

test('preview preparation never invokes settlement submission or publication', () => {
  const load = panel.slice(panel.indexOf('const load = useCallback'), panel.indexOf('useEffect(() => { const timer'))
  assert.doesNotMatch(load, /transition\('submit'|transition\('approve'|transition\('publish'/)
  assert.match(load, /calculate: async current/)
})

test('temporary series GET diagnostics are removed', () => {
  assert.doesNotMatch(seriesRoute, /\[COMPETITION SERIES GET ERROR\]/)
})
