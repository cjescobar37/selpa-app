import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveWinnerTeamId, validateStructuredMatchScore } from './tournamentScore.ts'

function groupScore(set1, set2, superTiebreak) {
  return {
    sets: [
      { team1: set1[0], team2: set1[1] },
      { team1: set2[0], team2: set2[1] },
    ],
    super_tiebreak: { team1: superTiebreak[0], team2: superTiebreak[1] },
  }
}

test('6-2 / 4-6 / 22-24 es válido y gana team2', () => {
  const result = validateStructuredMatchScore(groupScore([6, 2], [4, 6], [22, 24]), 'GROUP')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.winnerSide, 'team2')
    assert.equal(deriveWinnerTeamId(result.winnerSide, 'team-1', 'team-2'), 'team-2')
  }
})

test('6-2 / 5-7 / 14-16 es válido y gana team2', () => {
  const result = validateStructuredMatchScore(groupScore([6, 2], [5, 7], [14, 16]), 'GROUP')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.winnerSide, 'team2')
    assert.equal(deriveWinnerTeamId(result.winnerSide, 'team-1', 'team-2'), 'team-2')
  }
})

test('team1 puede ganar un super tie-break', () => {
  const result = validateStructuredMatchScore(groupScore([2, 6], [6, 4], [24, 22]), 'GROUP')
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(deriveWinnerTeamId(result.winnerSide, 'team-1', 'team-2'), 'team-1')
})

test('un super tie-break sin diferencia de dos sigue rechazado', () => {
  const result = validateStructuredMatchScore(groupScore([6, 2], [4, 6], [22, 23]), 'GROUP')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'INVALID_SUPER_TIEBREAK')
})
