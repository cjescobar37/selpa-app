import type { SupabaseClient } from '@supabase/supabase-js'
import { getSeriesRevision, rpc } from '@/features/competition/series/competition-series.repository'
import type { BootstrapAction, CompetitionBootstrapResult } from './competition-bootstrap.types'

type Row = Record<string, unknown> & { id: string }
const YEAR = new Date().getFullYear()
const SERIES_NAME = `Competition QA ${YEAR}`
const EVENT_NAME = 'QA Open'

function failure(message: string, code = 'P0001') { return Object.assign(new Error(message), { code }) }
async function one(client: SupabaseClient, table: string, filters: Record<string, unknown>, columns = '*') {
  let query = client.from(table).select(columns)
  for (const [key, value] of Object.entries(filters)) query = value === null ? query.is(key, null) : query.eq(key, value)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw failure(error.message, error.code)
  return data as Row | null
}
function track(actions: BootstrapAction[], resource: string, name: string, created: boolean) { actions.push({ resource, name, outcome: created ? 'CREATED' : 'REUSED' }) }

export async function bootstrapCompetitionEnvironment(client: SupabaseClient, clubId: string, schemeId?: string): Promise<CompetitionBootstrapResult> {
  const actions: BootstrapAction[] = []
  const catalogs = await rpc<{ age_categories_created: number; event_tiers_created: number }>(client, 'initialize_competition_catalogs_stage5a1', { p_club_id: clubId })
  track(actions, 'Categorías de edad', 'Libre, juveniles y veteranos', catalogs.age_categories_created > 0)
  track(actions, 'Niveles de evento', 'Challenger, Open y Master', catalogs.event_tiers_created > 0)

  let season = await one(client, 'competition_seasons', { club_id: clubId, status: 'ACTIVE' }, 'id,name,status,starts_on,ends_on')
  if (!season) {
    const initialized = await rpc<{ season_id: string; season_created: boolean }>(client, 'create_default_competition_structure', { p_club_id: clubId, p_template_key: 'PADEL_TRADITIONAL' })
    season = await one(client, 'competition_seasons', { club_id: clubId, id: initialized.season_id }, 'id,name,status,starts_on,ends_on')
    if (!season) throw failure('No se pudo inicializar la temporada competitiva.')
    if (season.status === 'DRAFT') {
      const { data, error } = await client.from('competition_seasons').update({ status: 'ACTIVE' }).eq('club_id', clubId).eq('id', season.id).eq('status', 'DRAFT').select('id,name,status,starts_on,ends_on').single()
      if (error) throw failure(`No se pudo activar la temporada: ${error.message}`, error.code)
      season = data as Row
    }
    track(actions, 'Temporada', String(season.name), initialized.season_created)
  } else track(actions, 'Temporada', String(season.name), false)

  await rpc(client, 'create_default_competition_structure', { p_club_id: clubId, p_template_key: 'PADEL_TRADITIONAL' })
  const [men, women, segment, category] = await Promise.all([
    one(client, 'competition_branches', { club_id: clubId, slug: 'caballeros' }, 'id,name'),
    one(client, 'competition_branches', { club_id: clubId, slug: 'damas' }, 'id,name'),
    one(client, 'competition_segments', { club_id: clubId, slug: 'libres' }, 'id,name'),
    one(client, 'competition_categories', { club_id: clubId, slug: '6a' }, 'id,name'),
  ])
  if (!men || !women || !segment || !category) throw failure('Los catálogos base están incompletos.', 'PGRST116')

  let schemeQuery = client.from('points_schemes').select('id,name').eq('is_active', true).or(`club_id.eq.${clubId},is_global.eq.true`)
  if (schemeId) schemeQuery = schemeQuery.eq('id', schemeId)
  const selectedScheme = await schemeQuery.order('is_global', { ascending: true }).limit(schemeId ? 1 : 2)
  if (selectedScheme.error) throw failure(`No se pudo leer el esquema de puntos: ${selectedScheme.error.message}`, selectedScheme.error.code)
  if (!selectedScheme.data?.length) throw failure('POINTS_SCHEME_REQUIRED', 'PGRST116')
  if (!schemeId && selectedScheme.data.length > 1) throw failure('POINTS_SCHEME_SELECTION_REQUIRED', '23514')
  const scheme = selectedScheme.data[0] as Row
  track(actions, 'Esquema', String(scheme.name), false)

  const divisionSpecs = [{ branch: men, name: 'QA Caballeros' }, { branch: women, name: 'QA Damas' }]
  const divisions: Row[] = []
  for (const spec of divisionSpecs) {
    const existing = await one(client, 'competition_divisions', { club_id: clubId, season_id: season.id, modality: 'PAIRS', branch_id: spec.branch.id, segment_id: segment.id, category_id: category.id }, 'id,name_override,is_active')
    let division = existing ?? await rpc<Row>(client, 'ensure_competition_division', { p_club_id: clubId, p_season_id: season.id, p_modality: 'PAIRS', p_branch_id: spec.branch.id, p_segment_id: segment.id, p_category_id: category.id, p_name: spec.name })
    if (!division.is_active) {
      const restored = await client.from('competition_divisions').update({ is_active: true }).eq('club_id', clubId).eq('id', division.id).select('id,name_override,is_active').single()
      if (restored.error) throw failure(`No se pudo reactivar la división: ${restored.error.message}`, restored.error.code)
      division = restored.data as Row
    }
    divisions.push(division); track(actions, 'División', spec.name, !existing)
  }

  let series = await one(client, 'competition_series', { club_id: clubId, season_id: season.id, name: SERIES_NAME }, 'id,name,code,description,starts_on,ends_on,planned_events_count,minimum_events_count,is_public,revision,status')
  const seriesExisted = Boolean(series)
  if (!series) series = await rpc<Row>(client, 'create_competition_series', { p_club_id: clubId, p_season_id: season.id, p_name: SERIES_NAME })
  if (!['DRAFT', 'SCHEDULED', 'ACTIVE'].includes(String(series.status))) throw failure('El circuito QA está cerrado, cancelado o archivado.', '23514')
  track(actions, 'Circuito', SERIES_NAME, !seriesExisted)

  if (series.status === 'DRAFT' && (!series.code || !series.starts_on || !series.ends_on)) {
    if (!season.starts_on || !season.ends_on) throw failure('La temporada activa no tiene fechas válidas.', '23514')
    series = await rpc<Row>(client, 'update_competition_series_draft', {
      p_club_id: clubId, p_series_id: series.id, p_revision: series.revision,
      p_name: SERIES_NAME, p_code: `QA-${YEAR}-${series.id.slice(0, 8)}`, p_description: 'Circuito permanente para validación del Competition Engine.',
      p_starts_on: season.starts_on, p_ends_on: season.ends_on, p_planned_events_count: 1,
      p_minimum_events_count: 1, p_is_public: false,
    })
    track(actions, 'Identidad del circuito', `QA-${YEAR}-${series.id.slice(0, 8)}`, true)
  } else track(actions, 'Identidad del circuito', String(series.code ?? 'Sin código'), false)

  for (let index = 0; index < divisions.length; index += 1) {
    const division = divisions[index]
    let link = await one(client, 'competition_series_divisions', { club_id: clubId, series_id: series.id, division_id: division.id }, 'id,is_active')
    if (!link || !link.is_active) {
      const revision = await getSeriesRevision(client, clubId, series.id)
      link = await rpc<Row>(client, 'add_competition_series_division', { p_club_id: clubId, p_series_id: series.id, p_division_id: division.id, p_sort_order: index, p_series_revision: revision })
      track(actions, 'División del circuito', divisionSpecs[index].name, true)
    } else track(actions, 'División del circuito', divisionSpecs[index].name, false)

    let rule = await one(client, 'competition_series_rules', { club_id: clubId, series_division_id: link.id, status: 'ACTIVE' }, 'id,status,revision')
    if (!rule) {
      rule = await one(client, 'competition_series_rules', { club_id: clubId, series_division_id: link.id, status: 'DRAFT' }, 'id,status,revision')
      if (!rule) {
        const revision = await getSeriesRevision(client, clubId, series.id)
        rule = await rpc<Row>(client, 'create_competition_series_rule_version', { p_club_id: clubId, p_series_id: series.id, p_series_revision: revision, p_series_division_id: link.id, p_points_scheme_id: scheme.id, p_clone_rule_id: null })
      }
      let revision = await getSeriesRevision(client, clubId, series.id)
      rule = await rpc<Row>(client, 'update_competition_series_rule_draft', { p_club_id: clubId, p_series_id: series.id, p_series_revision: revision, p_rule_id: rule.id, p_rule_revision: rule.revision, p_config: { points_scheme_id: scheme.id, accumulation_mode: 'ALL_RESULTS', best_results_count: null, discard_worst_count: null, minimum_participations: 1, master_final_qualification_count: 8, master_final_multiplier: 1, tie_breakers: [{ criterion: 'TOURNAMENT_WINS', params: {} }, { criterion: 'FINALS', params: {} }] } })
      revision = await getSeriesRevision(client, clubId, series.id)
      const eligibility = await one(client, 'competition_series_eligibility', { club_id: clubId, series_rule_id: rule.id }, 'id,revision')
      await rpc(client, 'set_competition_series_eligibility', { p_club_id: clubId, p_series_id: series.id, p_series_revision: revision, p_rule_id: rule.id, p_eligibility_revision: eligibility?.revision ?? null, p_config: { requires_active_entry: true, allow_invited_players: false, invited_points_policy: 'REQUIRE_ENTRY', require_same_division_pair: true, age_category_id: null, additional_rules: {} } })
      revision = await getSeriesRevision(client, clubId, series.id)
      await rpc(client, 'activate_competition_series_rule_version', { p_club_id: clubId, p_series_id: series.id, p_series_revision: revision, p_rule_id: rule.id, p_rule_revision: rule.revision })
      track(actions, 'Regla y elegibilidad', divisionSpecs[index].name, true)
    } else track(actions, 'Regla y elegibilidad', divisionSpecs[index].name, false)
  }

  if (series.status === 'DRAFT') {
    const revision = await getSeriesRevision(client, clubId, series.id)
    series = await rpc<Row>(client, 'schedule_competition_series', { p_club_id: clubId, p_series_id: series.id, p_revision: revision })
    track(actions, 'Programación del circuito', SERIES_NAME, true)
  } else track(actions, 'Programación del circuito', SERIES_NAME, false)

  const event = await one(client, 'competition_series_events', { club_id: clubId, series_id: series.id, name: EVENT_NAME }, 'id,name')
  if (!event) await rpc(client, 'create_competition_series_event', { p_club_id: clubId, p_series_id: series.id, p_name: EVENT_NAME })
  track(actions, 'Fecha', EVENT_NAME, !event)
  return { seriesId: series.id, actions }
}
