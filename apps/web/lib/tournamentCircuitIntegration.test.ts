import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import test from 'node:test'
import { join } from 'node:path'

type ResolveHook = (specifier: string, context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown) => unknown
const registerHooks = (nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { buildCircuitDirectPlayoffPlan } = await import(new URL('./tournamentCircuitDraw.ts', import.meta.url).href) as typeof import('./tournamentCircuitDraw')
const { buildGeneralOpenBracketPlan, buildBracketSlots } = await import(new URL('./tournamentOpen/generalEngine.ts', import.meta.url).href) as typeof import('./tournamentOpen/generalEngine')

test('direct draw persists only playable matches and preserves structural BYE propagation', () => {
  for (const count of [7, 13, 14, 15, 25]) {
    const teams = Array.from({ length: count }, (_, index) => ({ teamId: `team-${index + 1}`, seed: index + 1 }))
    const plan = buildCircuitDirectPlayoffPlan(teams)
    assert.deepEqual(buildCircuitDirectPlayoffPlan(teams), plan)
    assert.equal(plan.persistedPlan.source, 'general_engine')
    assert.equal(plan.phase, count <= 8 ? 'QUARTER' : count <= 16 ? 'EIGHTHS' : 'ROUND_OF_16')
    assert.equal(plan.persistedPlan.bracket_slots.length, plan.draw.bracketSize)
    assert.equal(plan.persistedPlan.first_round_matches.length, count - plan.draw.bracketSize / 2)
    assert.deepEqual(plan.draw.byeAdvances.map((item) => item.seed).sort((a, b) => a - b),
      Array.from({ length: plan.draw.bracketSize - count }, (_, index) => index + 1))
    for (const match of plan.persistedPlan.first_round_matches) {
      assert.equal(match.bracket_pair_order > 0, true)
      assert.ok(!plan.draw.byeAdvances.some((bye) => [match.team1_id, match.team2_id].includes(bye.teamId)))
    }
    assert.ok(plan.persistedPlan.bracket_slots.every((slot) =>
      slot.advances_to_match_order === Math.ceil(slot.pair_order / 2)))
  }
  const plan = buildCircuitDirectPlayoffPlan(Array.from({ length: 16 }, (_, index) => ({ teamId: `team-${index + 1}`, seed: index + 1 })))
  const positions = new Map(plan.draw.slots.map((slot) => [slot.seed, slot.position]))
  assert.deepEqual([1, 2, 3, 4].map((seed) => positions.get(seed)), [1, 16, 8, 9])
  assert.deepEqual(new Set([5, 6, 7, 8].map((seed) => positions.get(seed))), new Set([4, 5, 12, 13]))
  const generator = readFileSync(join(process.cwd(), 'lib/tournamentOpenPlayoff.ts'), 'utf8')
  assert.match(generator, /generateOpenFirstRoundPlayoff[\s\S]*?isDirectKnockoutTournament\(tournamentRow\)[\s\S]*?generateDirectFirstRound/)
  assert.match(generator, /buildCircuitDirectPlayoffPlan\(seedRows\.map/)
  assert.match(generator, /if \(circuitLink && !generalSelection\.useGeneralPlan\)/)
})

test('group fixture SQL uses frozen seeds in a four-group serpentine assignment', () => {
  const fixture = readFileSync(join(process.cwd(), 'supabase/migrations/20260904161000_open_padel_group_fixture.sql'), 'utf8')
  assert.match(fixture, /from public\.tournament_team_seed_snapshots/)
  assert.match(fixture, /v_forward := not v_forward/)
  const bands = Array.from({ length: 16 }, (_, index) => index + 1)
    .map((seed) => ({ seed, group: Math.floor((seed - 1) / 4) % 2 === 0
      ? (seed - 1) % 4 : 3 - ((seed - 1) % 4) }))
  assert.deepEqual(bands.filter((row) => row.seed <= 4).map((row) => row.group), [0, 1, 2, 3])
  assert.deepEqual(bands.filter((row) => row.seed >= 5 && row.seed <= 8).map((row) => row.group), [3, 2, 1, 0])
})

test('post-group playoff ranks sporting positions before entry seed, avoids rematches, and is deterministic', () => {
  const groups = Array.from({ length: 4 }, (_, groupIndex) => ({
    groupId: `group-${groupIndex}`,
    groupName: `Grupo ${groupIndex + 1}`,
    groupOrder: groupIndex + 1,
    standings: Array.from({ length: 4 }, (_, positionIndex) => {
      const groupPosition = positionIndex + 1
      const seed = groupIndex === 0 && groupPosition === 2 ? 1
        : groupIndex === 1 && groupPosition === 1 ? 8
          : 9 + groupIndex * 4 + positionIndex
      return {
        teamId: `team-${groupIndex}-${groupPosition}`,
        groupId: `group-${groupIndex}`,
        groupName: `Grupo ${groupIndex + 1}`,
        groupOrder: groupIndex + 1,
        groupPosition,
        seed,
        played: 3,
        wins: 4 - groupPosition,
        points: 8 - groupPosition,
        setDiff: 4 - groupPosition,
        gameDiff: 8 - groupPosition,
        gamesFor: 12 - groupPosition,
      }
    }),
  }))
  const plan = buildGeneralOpenBracketPlan(groups)
  assert.deepEqual(buildGeneralOpenBracketPlan(groups), plan)
  const winnerB = plan.globalSeeds.find((team) => team.teamId === 'team-1-1')
  const runnerA = plan.globalSeeds.find((team) => team.teamId === 'team-0-2')
  assert.ok(winnerB && runnerA)
  assert.equal(winnerB.groupPosition, 1)
  assert.equal(runnerA.groupPosition, 2)
  assert.ok(winnerB.globalSeed < runnerA.globalSeed)
  const winners = plan.globalSeeds.filter((team) => team.groupPosition === 1)
  assert.equal(winners.length, 4)
  assert.ok(winners.every((team) => plan.byeTeams.some((bye) => bye.teamId === team.teamId)))
  const winnerQuarters = winners.map((team) => {
    const slot = plan.bracketSlots.find((item) => item.team?.teamId === team.teamId)
    assert.ok(slot)
    return Math.ceil(slot.position / 4)
  })
  assert.equal(new Set(winnerQuarters).size, 4)
  assert.ok(plan.byeTeams.every((team) => team.groupPosition === 1 ||
    plan.globalSeeds.filter((other) => other.groupPosition === 1).length < plan.byeTeams.length))
  assert.ok(plan.firstRoundMatches.every((match) => match.team1.groupId !== match.team2.groupId))
  assert.equal(new Set(plan.bracketSlots.flatMap((slot) => slot.team ? [slot.team.teamId] : [])).size, plan.totalQualified)

  const groupIds = ['A', 'B', 'C', 'D', 'D', 'D', 'C', 'B']
  const eightSeeds = plan.globalSeeds.slice(0, 8).map((team, index) => ({
    ...team, globalSeed: index + 1, groupId: groupIds[index],
  }))
  const rematchCandidate = buildBracketSlots({ globalSeeds: eightSeeds, byes: 0, bracketSize: 8,
    config: { avoidSameGroupFirstRound: false } })
  assert.equal(rematchCandidate.firstRoundMatches.filter((match) => match.sameGroupConflict).length, 1)
  const rematchAvoided = buildBracketSlots({ globalSeeds: eightSeeds, byes: 0, bracketSize: 8,
    config: { avoidSameGroupFirstRound: true } })
  assert.equal(rematchAvoided.firstRoundMatches.filter((match) => match.sameGroupConflict).length, 0)
})
