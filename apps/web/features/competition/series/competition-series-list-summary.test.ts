import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

type ResolveHook = (specifier: string, context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown) => unknown
const registerHooks = (nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return nextResolve(pathToFileURL(join(process.cwd(), `${specifier.slice(2)}.ts`)).href, context)
    }
    if (specifier.startsWith('./') && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { buildCompetitionSeriesListSummaries } = await import(
  new URL('./competition-series-list-summary.ts', import.meta.url).href
) as typeof import('./competition-series-list-summary')

const component = readFileSync(join(process.cwd(), 'app/(app)/club/competition/CompetitionAdmin.tsx'), 'utf8')
const repository = readFileSync(join(process.cwd(), 'features/competition/series/competition-series.repository.ts'), 'utf8')
const seriesRoute = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/route.ts'), 'utf8')
const eventsRoute = readFileSync(join(process.cwd(), 'app/api/clubs/[clubId]/competition/series/[seriesId]/events/route.ts'), 'utf8')
const eventsRepository = readFileSync(join(process.cwd(), 'features/competition/events/competition-events.repository.ts'), 'utf8')

const series = [
  { id: 'empty', status: 'DRAFT', planned_events_count: null },
  { id: 'draft-event', status: 'ACTIVE', planned_events_count: 2 },
  { id: 'finished-tournament', status: 'ACTIVE', planned_events_count: 2 },
  { id: 'homologated', status: 'ACTIVE', planned_events_count: 1 },
  { id: 'settled', status: 'ACTIVE', planned_events_count: 1 },
]

const summaries = buildCompetitionSeriesListSummaries(series, [
  { id: 'event-draft', series_id: 'draft-event', status: 'DRAFT' },
  { id: 'event-finished', series_id: 'finished-tournament', status: 'COMPLETED', tournament_status: 'FINISHED' },
  { id: 'event-homologated', series_id: 'homologated', status: 'COMPLETED', circuit_context: { homologation_status: 'APPROVED' } },
  { id: 'event-settled', series_id: 'settled', status: 'COMPLETED', circuit_context: { settlement_status: 'PUBLISHED' } },
  { id: 'foreign-event', series_id: 'another-club-series', status: 'SCHEDULED' },
])

test('builds only the count and progress label currently visible on each circuit card', () => {
  assert.deepEqual(summaries.empty, {
    events_count: 0,
    progress_label: 'Próximo paso: agregá la primera fecha.',
  })
  assert.deepEqual(summaries['draft-event'], { events_count: 1, progress_label: '2 fechas planificadas.' })
  assert.deepEqual(summaries['finished-tournament'], { events_count: 1, progress_label: 'Pendiente homologación' })
  assert.deepEqual(summaries.homologated, { events_count: 1, progress_label: 'Pendiente publicar puntos' })
  assert.deepEqual(summaries.settled, { events_count: 1, progress_label: 'Ranking actualizado' })
  assert.deepEqual(Object.keys(summaries.empty).sort(), ['events_count', 'progress_label'])
  assert.equal(summaries['another-club-series'], undefined)
})

test('list load has a constant browser request count and no per-series events fetch', () => {
  const listLoad = component.slice(
    component.indexOf("if (screen.kind === 'list')"),
    component.indexOf("} else if (screen.kind === 'detail')")
  )
  assert.match(listLoad, /\/competition\/series`/)
  assert.match(listLoad, /competition_seasons/)
  assert.doesNotMatch(listLoad, /\/events/)
  assert.doesNotMatch(listLoad, /items\.map\(async/)
  assert.doesNotMatch(component, /seriesEvents|seriesProgressLine/)
  assert.match(component, /entry\.summary\.events_count/)
  assert.match(component, /entry\.summary\.progress_label/)
})

test('series repository uses club-scoped batch queries rather than one query per series', () => {
  const listSource = repository.slice(
    repository.indexOf('export async function listSeries'),
    repository.indexOf('export async function getSeriesDetail')
  )
  assert.match(listSource, /\.from\('competition_series'\)[\s\S]*?\.eq\('club_id',clubId\)/)
  assert.match(listSource, /\.from\('competition_series_events'\)[\s\S]*?\.eq\('club_id',clubId\)[\s\S]*?\.in\('series_id',seriesIds\)/)
  assert.match(listSource, /\.from\('competition_series_event_divisions'\)[\s\S]*?\.eq\('club_id',clubId\)[\s\S]*?\.in\('event_id',eventIds\)/)
  assert.match(listSource, /\.from\('competition_series_event_tournament_links'\)[\s\S]*?\.eq\('club_id',clubId\)[\s\S]*?\.in\('event_division_id',divisionIds\)/)
  assert.match(listSource, /Promise\.all\(\[/)
  assert.doesNotMatch(listSource, /series\.map\(async/)
  assert.doesNotMatch(listSource, /select\('\*'\)/)
})

test('full events endpoint remains connected to the existing detailed event loader', () => {
  assert.match(eventsRoute, /eventsCollection/)
  assert.match(eventsRepository, /export async function listEvents/)
  assert.match(eventsRepository, /\.select\('\*'\)\.eq\('club_id',clubId\)\.eq\('series_id',seriesId\)/)
})

test('series mutations remain separate from the read-only list summary', () => {
  const postSource = seriesRoute.split('export async function POST')[1]
  assert.ok(postSource)
  assert.match(postSource, /create_competition_series/)
  assert.doesNotMatch(postSource, /buildCompetitionSeriesListSummaries|competition_series_events/)
})
