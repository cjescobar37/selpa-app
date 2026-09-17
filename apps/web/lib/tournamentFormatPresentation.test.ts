import assert from 'node:assert/strict'
import test from 'node:test'

const { resolveTournamentCompetitionSystem, formatTournamentSystemLabel, formatTournamentTypeLabel } =
  await import(new URL('./tournamentLabels.ts', import.meta.url).href) as typeof import('./tournamentLabels')

test('saved direct choice takes precedence over canonical creation legacy format for Master', () => {
  const system = resolveTournamentCompetitionSystem({ competition_system: 'SINGLE_ELIMINATION' }, 'GROUPS_ELIMINATION')
  assert.equal(system, 'SINGLE_ELIMINATION')
  assert.equal(`${formatTournamentTypeLabel('MASTER')} · ${formatTournamentSystemLabel(system)}`, 'Master · Eliminación directa')
})

test('Master does not force a format: all explicit choices remain intact', () => {
  for (const system of ['GROUPS_PLAYOFF', 'ROUND_ROBIN', 'SINGLE_ELIMINATION'] as const) {
    assert.equal(resolveTournamentCompetitionSystem({ competition_system: system }, 'DIRECT_ELIM'), system)
  }
  assert.equal(formatTournamentSystemLabel(resolveTournamentCompetitionSystem({ competition_system: 'GROUPS_PLAYOFF' }, 'GROUPS_ELIMINATION')), 'Zona + Playoff')
})

test('older tournaments without configured rules use their persisted format', () => {
  assert.equal(resolveTournamentCompetitionSystem(null, 'DIRECT_ELIM'), 'SINGLE_ELIMINATION')
  assert.equal(resolveTournamentCompetitionSystem({}, 'ZONE_PLAYOFF'), 'GROUPS_PLAYOFF')
  assert.equal(resolveTournamentCompetitionSystem({}, 'ROUND_ROBIN'), 'ROUND_ROBIN')
  assert.equal(resolveTournamentCompetitionSystem({}, null), null)
})

test('event metadata labels supported systems without inferring from tier or scheme', () => {
  assert.equal(formatTournamentSystemLabel('GROUPS_PLAYOFF'), 'Zona + Playoff')
  assert.equal(formatTournamentSystemLabel('DIRECT_ELIMINATION'), 'Eliminación directa')
  assert.equal(resolveTournamentCompetitionSystem({ competition_system: 'DIRECT_ELIMINATION' }), 'SINGLE_ELIMINATION')
  assert.equal(resolveTournamentCompetitionSystem({ type: 'MASTER', points_scheme: 'OPEN' }), null)
  assert.equal(formatTournamentSystemLabel(null), 'Sin formato')
})
