import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildBracketSlots,
  buildCanonicalSeedLine,
  buildGeneralOpenBracketPlan,
  buildOpenPlayoffPreview,
  calculateBracketSize,
  calculateByes,
  type OpenGeneralGroupStandings,
  type OpenGlobalSeed,
} from './generalEngine'
import { buildOpenQualificationPlan } from './qualification'
import type { GroupStandingRow, GroupStandings } from '../tournamentStandings'

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

    const canonicalPairs = buildCanonicalSeedLine(bracketSize).reduce<Array<[number, number]>>((pairs, seed, index, line) => {
      if (index % 2 === 0) pairs.push([seed, line[index + 1]!])
      return pairs
    }, [])
    for (const match of first.firstRoundMatches) {
      assert.deepEqual(
        [match.team1.globalSeed, match.team2.globalSeed].sort((left, right) => left - right),
        [...canonicalPairs[match.bracketPairOrder - 1]!].sort((left, right) => left - right),
        'cada cruce sin conflicto debe ocupar su par de la seed-line canónica'
      )
    }
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

test('cupos resueltos 3+2+2+2+2+2 producen 13 clasificados y 3 BYEs sin mejores terceros', () => {
  const groupNames = ['A', 'B', 'C', 'D', 'E', 'F']
  const legacyGroups: GroupStandings[] = groupNames.map((name, groupIndex) => {
    const size = name === 'A' ? 4 : 3
    const rows: GroupStandingRow[] = Array.from({ length: size }, (_, index) => ({
      group_id: `group-${name}`,
      team_id: `${index + 1}${name}`,
      seed: index === 0 ? 100 + groupIndex : index,
      played: 2,
      wins: index === 0 ? 2 : index === 1 ? 1 : 0,
      losses: index === 0 ? 0 : index === 1 ? 1 : 2,
      match_points: index === 0 ? 6 - groupIndex * 0.1 : index === 1 ? 3 : 1,
      sets_for: 4 - index,
      sets_against: index,
      set_difference: 4 - index * 2,
      games_for: 24 - index,
      games_against: 12 + index,
      game_difference: 12 - index * 2,
    }))
    return {
      group: { id: `group-${name}`, tournament_id: 'tournament', name, order: groupIndex + 1, size },
      standings: rows,
      qualifiers: rows.slice(0, name === 'A' ? 3 : 2),
    }
  })
  const generalGroups: OpenGeneralGroupStandings[] = legacyGroups.map((group) => ({
    groupId: group.group.id,
    groupName: group.group.name,
    groupOrder: group.group.order,
    qualifierCount: group.qualifiers.length,
    standings: group.standings.map((row, index) => ({
      teamId: row.team_id,
      groupId: row.group_id,
      groupName: group.group.name,
      groupOrder: group.group.order,
      groupPosition: index + 1,
      seed: row.seed,
      played: row.played,
      wins: row.wins,
      points: row.match_points,
      setDiff: row.set_difference,
      gameDiff: row.game_difference,
      gamesFor: row.games_for,
    })),
  }))

  const general = buildGeneralOpenBracketPlan(generalGroups, { bestThirdsToQualify: 2, avoidSameGroupFirstRound: true })
  const fallback = buildOpenQualificationPlan(legacyGroups)
  const expected = ['1A','2A','3A','1B','2B','1C','2C','1D','2D','1E','2E','1F','2F']

  assert.deepEqual(new Set(general.qualifiedTeams.map((team) => team.teamId)), new Set(expected))
  assert.deepEqual(new Set(fallback.playoffTeams.map((team) => team.teamId)), new Set(expected))
  assert.equal(general.totalQualified, 13)
  assert.equal(new Set(general.qualifiedTeams.map((team) => team.teamId)).size, 13)
  assert.ok(general.qualifiedTeams.some((team) => team.teamId === '3A'))
  assert.ok(groupNames.slice(1).every((name) => !general.qualifiedTeams.some((team) => team.teamId === `3${name}`)))
  assert.equal(general.bracketSize, 16)
  assert.equal(general.byes, 3)
  assert.deepEqual(general.byeTeams.map((team) => team.globalSeed), [1, 2, 3])
  assert.ok(general.globalSeeds.slice(0, 6).every((team) => team.groupPosition === 1), 'los ganadores preceden a segundos aunque tengan peor seed previo')
  assert.ok(general.globalSeeds.slice(6, 12).every((team) => team.groupPosition === 2))
  assert.equal(general.globalSeeds[12]?.teamId, '3A')
  assert.equal(general.firstRoundMatches.filter((match) => match.sameGroupConflict).length, 0)
  assert.deepEqual(buildGeneralOpenBracketPlan(generalGroups, { bestThirdsToQualify: 2, avoidSameGroupFirstRound: true }), general)
  assert.equal(fallback.bracketSize, 16)
  assert.equal(fallback.byes, 3)
  assert.deepEqual(fallback.selectedByes.map((team) => team.teamId), general.byeTeams.map((team) => team.teamId))

  const preview = buildOpenPlayoffPreview(generalGroups, { bestThirdsToQualify: 2, avoidSameGroupFirstRound: true })
  const repeatedPreview = buildOpenPlayoffPreview(generalGroups, { bestThirdsToQualify: 2, avoidSameGroupFirstRound: true })
  const previewTeams = preview.pairs.flatMap((pair) => [pair.left, pair.right]).filter((slot) => !slot.isBye)
  const previewByes = preview.pairs.flatMap((pair) => [pair.left, pair.right]).filter((slot) => slot.isBye)
  assert.equal(preview.pairs.length, 8)
  assert.equal(previewTeams.length, 13)
  assert.equal(new Set(previewTeams.map((slot) => slot.teamId)).size, 13)
  assert.equal(previewByes.length, 3)
  assert.deepEqual(
    preview.pairs.filter((pair) => pair.left.isBye || pair.right.isBye).map((pair) => pair.left.globalSeed ?? pair.right.globalSeed),
    [1, 2, 3]
  )
  assert.deepEqual(preview, repeatedPreview)
  assert.ok(previewTeams.some((slot) => slot.teamId === '3A'))
  assert.ok(groupNames.slice(1).every((name) => !previewTeams.some((slot) => slot.teamId === `3${name}`)))
  assert.equal(preview.pairs.filter((pair) => pair.sameGroupWarning).length, 0)
  assert.deepEqual(
    preview.pairs.map((pair) => [pair.left.globalSeed, pair.right.globalSeed]),
    [[1,null],[8,9],[4,13],[5,12],[2,null],[7,10],[3,null],[6,11]]
  )
})

test('la UI de torneo consume la preview pura y mantiene la sección sin escrituras ni overflow horizontal', () => {
  const source = readFileSync(join(process.cwd(), 'app/(app)/club/torneos/[id]/page.tsx'), 'utf8')
  const previewRenderer = source.slice(source.indexOf('function renderOpenPlayoffPreview()'), source.indexOf('function renderFourTeamGroupDraw'))

  assert.match(source, /buildOpenPlayoffPreview\(groups\)/)
  assert.match(source, /Grupo .* todavía no tiene posiciones finales\. Completá A-03 y A-04\./)
  assert.match(source, /Playoff pendiente · Completá la fase de grupos\./)
  assert.match(source, /canGenerateDefinitiveOpenPlayoff/)
  assert.doesNotMatch(previewRenderer, /fetch\(|supabase\.|\.insert\(|\.update\(/)
  assert.match(source, /\.club-playoffPreviewPairs \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(source, /@media \(max-width: 560px\)[\s\S]*\.club-playoffPreviewPairs \{ grid-template-columns:minmax\(0,1fr\); \}/)
})
