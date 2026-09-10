import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBracketSlots,
  buildCanonicalSeedLine,
  calculateBracketSize,
  calculateByes,
  type OpenGlobalSeed,
} from './generalEngine'

function makeSeed(globalSeed: number): OpenGlobalSeed {
  return {
    teamId: `team-${globalSeed}`,
    groupId: `group-${globalSeed}`,
    groupName: `Grupo ${globalSeed}`,
    groupOrder: globalSeed,
    groupPosition: 1,
    seed: globalSeed,
    played: 2,
    wins: 2,
    points: 4,
    setDiff: 2,
    gameDiff: 6,
    gamesFor: 12,
    qualificationReason: 'FIXED_GROUP_POSITION',
    globalSeed,
    ranking: {
      useNormalizedStats: false,
      pointsValue: 4,
      winsValue: 2,
      setDiffValue: 2,
      gameDiffValue: 6,
      gamesForValue: 12,
    },
  }
}

const canonicalByePairOrderBySeed: Record<number, number[]> = {
  8: [1, 3, 4, 2],
  16: [1, 5, 7, 3, 4, 8, 6, 2],
  32: [1, 9, 13, 5, 7, 15, 11, 3, 4, 12, 16, 8, 6, 14, 10, 2],
}

const cases = [
  ...[5, 6, 7, 8],
  ...Array.from({ length: 8 }, (_, index) => 9 + index),
  17, 18, 20, 24, 28, 30, 31, 32,
]

for (const participants of cases) {
  test(`BYEs canónicos para ${participants} participantes`, () => {
    const bracketSize = calculateBracketSize(participants)
    const byes = calculateByes(participants)
    const globalSeeds = Array.from({ length: participants }, (_, index) => makeSeed(index + 1))
    const input = {
      globalSeeds,
      byes,
      bracketSize,
      config: { avoidSameGroupFirstRound: false },
    }

    const first = buildBracketSlots(input)
    const second = buildBracketSlots(input)

    assert.deepEqual(second, first, 'la generación debe ser determinista')
    assert.equal(first.byeTeams.length, byes)
    assert.deepEqual(first.byeTeams.map((team) => team.globalSeed), Array.from({ length: byes }, (_, index) => index + 1))

    const slottedTeams = first.bracketSlots.flatMap((slot) => slot.team ? [slot.team] : [])
    assert.equal(slottedTeams.length, participants)
    assert.equal(new Set(slottedTeams.map((team) => team.teamId)).size, participants, 'no debe haber equipos duplicados')

    const byePairsBySeed = new Map<number, number>()
    for (let pairOrder = 1; pairOrder <= bracketSize / 2; pairOrder += 1) {
      const pairSlots = first.bracketSlots.filter((slot) => slot.pairOrder === pairOrder)
      if (!pairSlots.some((slot) => slot.isByeSlot)) continue
      const team = pairSlots.find((slot) => slot.team)?.team
      assert.ok(team, `el BYE del cruce ${pairOrder} debe tener beneficiario`)
      byePairsBySeed.set(team.globalSeed, pairOrder)
    }

    const expectedPairOrders = canonicalByePairOrderBySeed[bracketSize]?.slice(0, byes) ?? []
    assert.deepEqual(
      Array.from({ length: byes }, (_, index) => byePairsBySeed.get(index + 1)),
      expectedPairOrders,
      'cada mejor seed debe ocupar su región canónica de BYE'
    )

    for (const slot of first.bracketSlots) {
      assert.equal(slot.advancesToMatchOrder, Math.ceil(slot.pairOrder / 2), 'la propagación estructural debe mantenerse')
    }
    first.firstRoundMatches.forEach((match, index) => {
      assert.equal(match.matchOrder, index + 1, 'match_order jugable debe seguir contiguo')
      assert.equal(match.slot1.pairOrder, match.bracketPairOrder)
      assert.equal(match.slot2.pairOrder, match.bracketPairOrder)
      assert.equal(match.slot1.advancesToMatchOrder, Math.ceil(match.bracketPairOrder / 2))
      assert.equal(match.slot2.advancesToMatchOrder, Math.ceil(match.bracketPairOrder / 2))
    })

    const remainingSeeds = Array.from({ length: participants - byes }, (_, index) => byes + index + 1)
    const midpoint = remainingSeeds.length / 2
    const expectedPlayablePairs = remainingSeeds
      .slice(0, midpoint)
      .map((seed, index) => [seed, remainingSeeds.slice(midpoint).reverse()[index]] as const)
    assert.deepEqual(
      first.firstRoundMatches.map((match) => [match.team1.globalSeed, match.team2.globalSeed]),
      expectedPlayablePairs,
      'pairHighLowSeeds debe conservar los cruces jugables'
    )
  })
}

test('seed-line canónica es recursiva y estable', () => {
  assert.deepEqual(buildCanonicalSeedLine(8), [1, 8, 4, 5, 2, 7, 3, 6])
  assert.deepEqual(buildCanonicalSeedLine(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11])
  assert.equal(new Set(buildCanonicalSeedLine(32)).size, 32)
})

test('minimizeSameGroupConflicts sigue activo después del cambio de BYEs', () => {
  const globalSeeds = Array.from({ length: 8 }, (_, index) => makeSeed(index + 1))
  const bySeed = new Map(globalSeeds.map((team) => [team.globalSeed, team]))
  bySeed.get(1)!.groupId = 'group-a'
  bySeed.get(8)!.groupId = 'group-a'
  bySeed.get(2)!.groupId = 'group-b'
  bySeed.get(7)!.groupId = 'group-c'

  const withoutOptimization = buildBracketSlots({
    globalSeeds,
    byes: 0,
    bracketSize: 8,
    config: { avoidSameGroupFirstRound: false },
  })
  const withOptimization = buildBracketSlots({
    globalSeeds,
    byes: 0,
    bracketSize: 8,
    config: { avoidSameGroupFirstRound: true },
  })

  assert.equal(withoutOptimization.firstRoundMatches.filter((match) => match.sameGroupConflict).length, 1)
  assert.equal(withOptimization.firstRoundMatches.filter((match) => match.sameGroupConflict).length, 0)
  assert.deepEqual(
    new Set(withOptimization.firstRoundMatches.flatMap((match) => [match.team1.teamId, match.team2.teamId])),
    new Set(globalSeeds.map((team) => team.teamId)),
    'la optimización no debe perder ni duplicar equipos'
  )
})
