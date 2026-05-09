import {
  buildGeneralOpenBracketPlan,
  calculateBracketSize,
  calculateByes,
  defaultOpenQualificationConfig,
  type OpenGeneralBracketPlan,
  type OpenGeneralGroupStandings,
} from './generalEngine'
import { OpenTournamentEngineError } from './types'

function assertFixture(condition: boolean, message: string) {
  if (!condition) {
    throw new OpenTournamentEngineError('OPEN_GENERAL_FIXTURE_FAILED', message)
  }
}

function makeTeam(input: {
  teamId: string
  groupId: string
  groupName: string
  groupOrder: number
  groupPosition: number
  seed: number
  played: number
  points: number
}) {
  return {
    teamId: input.teamId,
    groupId: input.groupId,
    groupName: input.groupName,
    groupOrder: input.groupOrder,
    groupPosition: input.groupPosition,
    seed: input.seed,
    played: input.played,
    wins: Math.max(0, Math.floor(input.points / 2)),
    points: input.points,
    setDiff: 40 - input.seed,
    gameDiff: 120 - input.seed,
    gamesFor: 80 - input.seed,
  }
}

export function buildOpenGeneral35TeamsFixtureGroups(): OpenGeneralGroupStandings[] {
  const groupSizes = [4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3]
  let seed = 1

  return groupSizes.map((groupSize, groupIndex) => {
    const groupOrder = groupIndex + 1
    const groupId = `fixture-group-${groupOrder}`
    const groupName = `Grupo ${String.fromCharCode(64 + groupOrder)}`

    return {
      groupId,
      groupName,
      groupOrder,
      standings: Array.from({ length: groupSize }, (_, rowIndex) => {
        const groupPosition = rowIndex + 1
        const rowSeed = seed
        seed += 1

        return makeTeam({
          teamId: `fixture-team-${String(rowSeed).padStart(2, '0')}`,
          groupId,
          groupName,
          groupOrder,
          groupPosition,
          seed: rowSeed,
          played: groupSize === 4 ? 2 : 2,
          points: groupPosition === 1 ? 6 : groupPosition === 2 ? 4 : groupPosition === 3 ? 2 : 0,
        })
      }),
    }
  })
}

export function buildOpenGeneral35TeamsFixturePlan(): OpenGeneralBracketPlan {
  return buildGeneralOpenBracketPlan(buildOpenGeneral35TeamsFixtureGroups(), defaultOpenQualificationConfig)
}

export function validateOpenGeneralEngineFixtures() {
  assertFixture(calculateBracketSize(22) === 32, '22 clasificados debe generar bracket de 32.')
  assertFixture(calculateByes(22) === 10, '22 clasificados debe generar 10 BYEs.')
  assertFixture(calculateBracketSize(28) === 32, '28 clasificados debe generar bracket de 32.')
  assertFixture(calculateByes(28) === 4, '28 clasificados debe generar 4 BYEs.')
  assertFixture(calculateBracketSize(16) === 16, '16 clasificados debe generar bracket de 16.')
  assertFixture(calculateByes(16) === 0, '16 clasificados no debe generar BYEs.')

  const plan35 = buildOpenGeneral35TeamsFixturePlan()
  assertFixture(plan35.totalQualified === 24, '35 parejas debe clasificar 24 equipos con config base.')
  assertFixture(plan35.bracketSize === 32, '35 parejas debe generar cuadro de 32.')
  assertFixture(plan35.byes === 8, '35 parejas con 24 clasificados debe generar 8 BYEs.')
  assertFixture(plan35.byeTeams.length === 8, 'Debe asignar 8 equipos con BYE.')
  assertFixture(plan35.byeTeams.every((team, index) => team.globalSeed === index + 1), 'Los BYEs deben ser seeds globales 1..8.')
  assertFixture(plan35.firstRoundMatches.length === 8, '24 clasificados en cuadro de 32 debe crear 8 partidos reales.')
  assertFixture(plan35.bracketSlots.length === 32, 'El cuadro de 32 debe exponer 32 slots visuales/auditables.')

  const globalTeamIds = new Set(plan35.globalSeeds.map((team) => team.teamId))
  const slottedTeamIds = new Set(plan35.bracketSlots.flatMap((slot) => slot.team?.teamId ? [slot.team.teamId] : []))
  assertFixture(globalTeamIds.size === 24, 'No debe duplicar clasificados.')
  assertFixture(slottedTeamIds.size === 24, 'Debe ubicar todos los clasificados una sola vez.')
  assertFixture([...globalTeamIds].every((teamId) => slottedTeamIds.has(teamId)), 'Todos los clasificados deben estar en el cuadro.')

  return {
    plan35,
  }
}
