import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const editor = readFileSync(join(process.cwd(), 'app/(app)/club/competition/SeriesEventsAdmin.tsx'), 'utf8')
const editorStyles = readFileSync(join(process.cwd(), 'app/(app)/club/competition/SeriesEventsAdmin.module.css'), 'utf8')
const operations = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.tsx'), 'utf8')
const admin = readFileSync(join(process.cwd(), 'app/(app)/club/competition/CompetitionAdmin.tsx'), 'utf8')

test('mobile editor is viewport-contained with internal vertical scrolling', () => {
  assert.match(editorStyles, /\.backdrop\{[^}]*width:100vw;[^}]*height:100dvh;[^}]*overflow:hidden/)
  assert.match(editorStyles, /\.sheet\{[^}]*width:100vw;[^}]*max-width:100vw;[^}]*height:100dvh;[^}]*max-height:100dvh;[^}]*overflow:hidden/)
  assert.match(editorStyles, /\.sheetBody\{[^}]*min-width:0;[^}]*min-height:0;[^}]*overflow-x:hidden;[^}]*overflow-y:auto/)
})

test('mobile fields use one column and desktop restores two columns', () => {
  assert.match(editorStyles, /\.form details>div,\.disclosure>div\{[^}]*grid-template-columns:minmax\(0,1fr\)/)
  assert.match(editorStyles, /@media\(min-width:768px\)[^{]*\{[\s\S]*\.form details>div,\.divisionGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
})

test('close clears both local state and the event URL without submitting', () => {
  assert.match(editor, /url\.searchParams\.delete\('event'\)/)
  assert.match(editor, /<button type="button" onClick=\{closeEditor\} aria-label="Cerrar editor">/)
  assert.match(editor, /event\.key === 'Escape'\) closeEditor\(\)/)
})

test('save is controlled, guarded and refreshes without a page skeleton', () => {
  assert.match(editor, /event\.preventDefault\(\); saveEvent\(event\.currentTarget\)/)
  assert.match(editor, /if \(busy\) return/)
  assert.match(editor, /closeOnSuccess: true, errorPrefix: 'No pude guardar la configuración: '/)
  assert.match(admin, /reload=\{\(\) => load\(\{ silent: true \}\)\}/)
})

test('operation warnings are globally deduplicated and the primary setup CTA is explicit', () => {
  assert.match(operations, /const issues = uniqueCompetitionEventIssues\(\[/)
  assert.match(operations, /dateConfigurationCta\(blockerIssues\)/)
  assert.doesNotMatch(operations, /Revisá una advertencia antes de continuar/)
})
