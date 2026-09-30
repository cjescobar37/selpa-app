import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { POINT_RESULT_CODES } from '../features/competition/points-schemes/points-schemes.types'
import { buildHomologationTeamResults } from '../features/competition/homologation/competition-homologation-review'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const migration = source('../supabase/migrations/20260929113440_competition_canonical_playoff_placements.sql')
const eighthsAliasMigration = source('../supabase/migrations/20260929152702_competition_eighths_phase_alias.sql')
const settlementSql = source('../supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql')
const individualRankingSql = source('../supabase/migrations/20260912190000_competition_series_reversal_aware_ranking.sql')
const pairRankingSql = source('../supabase/migrations/20260912225433_competition_series_pair_rankings.sql')
const qaSql = source('../supabase/qa/20260929113440_competition_canonical_playoff_placements_validation.sql')
const eighthsAliasQaSql = source('../supabase/qa/20260929152702_competition_eighths_phase_alias_validation.sql')
const schemesUi = source('../app/(app)/club/competition/PointsSchemesAdmin.tsx')
const settlementUi = source('../app/(app)/club/competition/EventSettlementPanel.tsx')
const settlementRepository = source('../features/competition/settlement/competition-settlement.repository.ts')

type Phase = 'FINAL' | 'SEMI' | 'QUARTER' | 'ROUND_OF_16' | 'EIGHTHS' | 'ROUND_OF_32'
type Placement = typeof POINT_RESULT_CODES[number]
type DecidedMatch = { phase: Phase; winner: string | null; loser: string | null; status: 'PLAYED' | 'PENDING' }

const masterPoints: Record<Placement, number> = {
  CHAMPION: 750,
  RUNNER_UP: 500,
  SEMIFINALIST: 400,
  QUARTERFINALIST: 250,
  EIGHTH_FINALIST: 150,
  SIXTEENTH_FINALIST: 100,
  PARTICIPANT: 50,
}

function loserPlacement(phase: Phase): Exclude<Placement, 'CHAMPION' | 'PARTICIPANT'> {
  return ({
    FINAL: 'RUNNER_UP',
    SEMI: 'SEMIFINALIST',
    QUARTER: 'QUARTERFINALIST',
    ROUND_OF_16: 'EIGHTH_FINALIST',
    EIGHTHS: 'EIGHTH_FINALIST',
    ROUND_OF_32: 'SIXTEENTH_FINALIST',
  } as const)[phase]
}

function extractFixture(matches: DecidedMatch[], entrants: string[]) {
  const placements = new Map(entrants.map(team => [team, 'PARTICIPANT' as Placement]))
  for (const match of matches) {
    if (match.status !== 'PLAYED' || !match.winner || !match.loser || match.winner === match.loser) continue
    placements.set(match.loser, loserPlacement(match.phase))
    if (match.phase === 'FINAL') placements.set(match.winner, 'CHAMPION')
  }
  return placements
}

test('the editor and review expose the seven canonical result tiers', () => {
  assert.deepEqual(POINT_RESULT_CODES, [
    'CHAMPION', 'RUNNER_UP', 'SEMIFINALIST', 'QUARTERFINALIST',
    'EIGHTH_FINALIST', 'SIXTEENTH_FINALIST', 'PARTICIPANT',
  ])
  assert.match(schemesUi, /POINT_RESULT_CODES\.map/)
  assert.match(schemesUi, /Finalista/)
  assert.match(schemesUi, /Sin configurar/)

  const roles = [...POINT_RESULT_CODES].reverse()
  const rows = buildHomologationTeamResults([], roles.map((result_role, index) => ({
    tournament_team_id: String(index), result_role, final_position: null,
  })))
  assert.deepEqual(rows.map(row => row.resultRole), POINT_RESULT_CODES)
  assert.equal(rows.find(row => row.resultRole === 'EIGHTH_FINALIST')?.resultLabel, 'Octavos')
  assert.equal(rows.find(row => row.resultRole === 'SIXTEENTH_FINALIST')?.resultLabel, 'Dieciseisavos')
})

test('one canonical SQL helper maps playoff phases and the extractor reuses it', () => {
  for (const token of [
    "'FINAL' and p_is_winner then 'CHAMPION'",
    "'FINAL' then 'RUNNER_UP'",
    "'SEMI' then 'SEMIFINALIST'",
    "'QUARTER' then 'QUARTERFINALIST'",
    "'ROUND_OF_16' then 'EIGHTH_FINALIST'",
    "'ROUND_OF_32' then 'SIXTEENTH_FINALIST'",
  ]) assert.ok(migration.includes(token), `missing canonical mapping: ${token}`)
  assert.match(migration, /competition_result_role_for_playoff_phase\(match\.phase::text, false\)/)
  assert.doesNotMatch(migration, /set result_role = 'EIGHTH_FINALIST'/)
  assert.doesNotMatch(migration, /set result_role = 'SIXTEENTH_FINALIST'/)
})

test('EIGHTHS is a secured alias of ROUND_OF_16 for Competition placements', () => {
  assert.match(eighthsAliasMigration, /in \('ROUND_OF_16', 'EIGHTHS'\) then 'EIGHTH_FINALIST'/)
  assert.match(eighthsAliasMigration, /revoke all on function public\.competition_result_role_for_playoff_phase\(text, boolean\)[\s\S]*from public, anon, authenticated, service_role/)
  assert.match(eighthsAliasQaSql, /competition_result_role_for_playoff_phase\('EIGHTHS', false\) <> 'EIGHTH_FINALIST'/)
  assert.match(eighthsAliasQaSql, /competition_result_role_for_playoff_phase\('ROUND_OF_16', false\) <> 'EIGHTH_FINALIST'/)
  assert.match(eighthsAliasQaSql, /competition_result_role_for_playoff_phase\('EIGHTHS', true\) is not null/)
  assert.match(eighthsAliasQaSql, /has_function_privilege\('service_role'/)

  const placements = extractFixture([
    { phase: 'EIGHTHS', winner: 'A', loser: 'B', status: 'PLAYED' },
  ], ['A', 'B'])
  assert.equal(placements.get('A'), 'PARTICIPANT')
  assert.equal(placements.get('B'), 'EIGHTH_FINALIST')
})

test('representative 32-team playoff produces one final tier per team', () => {
  const entrants = Array.from({ length: 33 }, (_, index) => `T${index + 1}`)
  const matches: DecidedMatch[] = []
  const phases: Array<[Phase, number, number]> = [
    ['ROUND_OF_32', 16, 1],
    ['ROUND_OF_16', 8, 17],
    ['QUARTER', 4, 25],
    ['SEMI', 2, 29],
    ['FINAL', 1, 31],
  ]
  for (const [phase, count, loserStart] of phases) {
    for (let index = 0; index < count; index += 1) {
      matches.push({ phase, winner: `W-${phase}-${index}`, loser: `T${loserStart + index}`, status: 'PLAYED' })
    }
  }
  matches[matches.length - 1].winner = 'T32'
  const placements = extractFixture(matches, entrants)
  const counts = [...placements.values()].reduce<Record<string, number>>((result, placement) => {
    result[placement] = (result[placement] ?? 0) + 1
    return result
  }, {})
  assert.deepEqual(counts, {
    SIXTEENTH_FINALIST: 16,
    EIGHTH_FINALIST: 8,
    QUARTERFINALIST: 4,
    SEMIFINALIST: 2,
    RUNNER_UP: 1,
    CHAMPION: 1,
    PARTICIPANT: 1,
  })
  assert.equal([...placements.values()].reduce((sum, placement) => sum + masterPoints[placement], 0), 5900)
})

test('BYE and undecided walkover invent no placement; a decided walkover is valid', () => {
  const placements = extractFixture([
    { phase: 'ROUND_OF_16', winner: 'A', loser: null, status: 'PLAYED' },
    { phase: 'ROUND_OF_16', winner: null, loser: 'B', status: 'PLAYED' },
    { phase: 'ROUND_OF_16', winner: 'C', loser: 'D', status: 'PLAYED' },
    { phase: 'ROUND_OF_16', winner: 'E', loser: 'F', status: 'PENDING' },
  ], ['A', 'B', 'C', 'D', 'E', 'F'])
  assert.equal(placements.get('A'), 'PARTICIPANT')
  assert.equal(placements.get('B'), 'PARTICIPANT')
  assert.equal(placements.get('D'), 'EIGHTH_FINALIST')
  assert.equal(placements.get('F'), 'PARTICIPANT')
  assert.match(migration, /match\.status = 'PLAYED'/)
  assert.match(migration, /match\.team1_id is not null/)
  assert.match(migration, /match\.team2_id is not null/)
  assert.match(migration, /match\.winner_team_id in \(match\.team1_id, match\.team2_id\)/)
})

test('both pair members receive the tier while pair ranking counts the team result once', () => {
  const teamPlacements = ['EIGHTH_FINALIST', 'QUARTERFINALIST'] as const
  const individualAwards = teamPlacements.flatMap(placement => [masterPoints[placement], masterPoints[placement]])
  assert.equal(individualAwards.reduce((sum, points) => sum + points, 0), 800)
  assert.equal(teamPlacements.reduce((sum, placement) => sum + masterPoints[placement], 0), 400)
  assert.match(pairRankingSql, /max\(effective\.effective_points\)::bigint event_points/)
  assert.match(pairRankingSql, /count\(distinct award\.player_id\)=2/)
})

test('missing optional historical rules award zero, block publication and stay visible', () => {
  const historicalRules = new Map<Placement, number>([
    ['CHAMPION', 750], ['RUNNER_UP', 500], ['SEMIFINALIST', 400],
    ['QUARTERFINALIST', 250], ['PARTICIPANT', 50],
  ])
  assert.equal(historicalRules.get('EIGHTH_FINALIST'), undefined)
  assert.match(settlementSql, /coalesce\(\(r\.value->>'points'\)::integer,0\)/)
  assert.match(settlementSql, /'RESULT_RULE_MISSING','BLOCKER'/)
  assert.match(settlementUi, /Sin puntaje configurado/)
  assert.match(settlementUi, /calculationDetail\.rule_found !== false/)
})

test('settlement, ledger and rankings remain deterministic and reversal-aware', () => {
  assert.match(settlementSql, /begin_competition_settlement_command/)
  assert.match(settlementSql, /'settlement:'\|\|s\.id\|\|':award:'\|\|a\.id/)
  assert.match(individualRankingSql, /coalesce\(tx\.reversed_transaction_id, tx\.id\)/)
  assert.match(pairRankingSql, /coalesce\(tx\.reversed_transaction_id,tx\.id\)/)
  assert.match(settlementRepository, /competition_event_homologation_participants/)
  assert.match(settlementRepository, /participant_snapshot/)
  assert.match(settlementRepository, /player_name/)
})

test('migration ordering, default-deny grants and prepared QA are explicit', () => {
  assert.match(migration, /revoke all on function public\.competition_result_role_for_playoff_phase/)
  assert.match(migration, /revoke all on function public\.extract_competition_event_homologation_results/)
  assert.match(migration, /grant execute on function public\.extract_competition_event_homologation_results[\s\S]*to authenticated, service_role/)
  assert.match(qaSql, /has_function_privilege\('anon'/)
  assert.match(qaSql, /Seven-tier scheme must be valid/)
  assert.match(qaSql, /Historical five-tier scheme must remain valid/)
  assert.match(qaSql, /rollback;/)
})
