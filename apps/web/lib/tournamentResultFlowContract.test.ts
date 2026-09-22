import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('../app/(app)/club/torneos/[id]/page.tsx', import.meta.url), 'utf8')
const submitResultSource = pageSource.slice(pageSource.indexOf('async function submitResult'), pageSource.indexOf('function renderTournamentGroupStandings'))

test('guardar resultado actualiza estado local sin refresh completo', () => {
  assert.match(submitResultSource, /setGroupMatches/)
  assert.match(submitResultSource, /groupDependency\?\.matches/)
  assert.doesNotMatch(submitResultSource, /refreshTournamentExperience\s*\(/)
})

test('modal mobile conserva Cancelar y acciones sticky con safe-area', () => {
  assert.match(pageSource, />\s*Cancelar\s*<\/button>/)
  assert.match(pageSource, /\.club-resultActions \{[^}]*position: sticky/)
  assert.match(pageSource, /\.club-resultActions \{[^}]*safe-area-inset-bottom/)
  assert.match(pageSource, /\.club-resultModal \{[^}]*100dvh/)
})
