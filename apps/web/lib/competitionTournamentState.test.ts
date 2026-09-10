import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveCompetitionPipelineState, deriveTournamentOperationalStage } from './competitionTournamentState'

test('champion plus RUNNING remains PLAYOFF and requests formal finalization', () => {
  assert.equal(deriveTournamentOperationalStage({ status: 'RUNNING', groupCount: 4, groupMatchesTotal: 12, playoffMatchesCount: 7 }), 'PLAYOFF')
  assert.deepEqual(deriveCompetitionPipelineState({ tournamentStatus: 'RUNNING', sportsComplete: true }), {
    key: 'SPORTS_COMPLETE', title: 'Resultados deportivos completos', message: 'Falta finalizar formalmente el torneo.',
  })
})

test('persisted FINISHED unlocks the Competition follow-up states', () => {
  assert.equal(deriveTournamentOperationalStage({ status: 'FINISHED', groupCount: 0, groupMatchesTotal: 0, playoffMatchesCount: 0 }), 'FINALIZADO')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true })?.key, 'TOURNAMENT_FINISHED')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true, homologationStatus: 'APPROVED' })?.key, 'RESULTS_HOMOLOGATED')
  assert.equal(deriveCompetitionPipelineState({ tournamentStatus: 'FINISHED', sportsComplete: true, homologationStatus: 'APPROVED', settlementStatus: 'PUBLISHED' })?.key, 'SETTLED')
})
