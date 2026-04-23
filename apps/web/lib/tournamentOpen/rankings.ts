import type { GroupStandingRow, GroupStandings } from '@/lib/tournamentStandings'
import type { OpenNormalizedMetrics, OpenRankedTeam } from './types'

function normalizeGroupOrder(value: number | undefined) {
  return Number.isInteger(value) ? value : 0
}

function normalizePlayedCount(row: GroupStandingRow, playedCount = row.played) {
  return Number.isInteger(playedCount) && playedCount > 0 ? playedCount : 0
}

function compareOpenRankedTeams(a: OpenRankedTeam, b: OpenRankedTeam) {
  const pointsDiff = b.metrics.pointsPerMatch - a.metrics.pointsPerMatch
  if (pointsDiff !== 0) return pointsDiff

  const setDiff = b.metrics.setDiffPerMatch - a.metrics.setDiffPerMatch
  if (setDiff !== 0) return setDiff

  const gameDiff = b.metrics.gameDiffPerMatch - a.metrics.gameDiffPerMatch
  if (gameDiff !== 0) return gameDiff

  const gamesForDiff = b.metrics.gamesForPerMatch - a.metrics.gamesForPerMatch
  if (gamesForDiff !== 0) return gamesForDiff

  return a.seed - b.seed
}

function hasEqualRankingCriteria(a: OpenRankedTeam, b: OpenRankedTeam) {
  return (
    a.metrics.pointsPerMatch === b.metrics.pointsPerMatch &&
    a.metrics.setDiffPerMatch === b.metrics.setDiffPerMatch &&
    a.metrics.gameDiffPerMatch === b.metrics.gameDiffPerMatch &&
    a.metrics.gamesForPerMatch === b.metrics.gamesForPerMatch &&
    a.seed === b.seed
  )
}

function markManualResolutionTies(rows: OpenRankedTeam[]) {
  return rows.map((row, index) => {
    const previous = rows[index - 1]
    const next = rows[index + 1]
    const tiedWithPrevious = previous ? hasEqualRankingCriteria(row, previous) : false
    const tiedWithNext = next ? hasEqualRankingCriteria(row, next) : false

    return {
      ...row,
      requiresManualResolution: tiedWithPrevious || tiedWithNext,
    }
  })
}

export function getOpenNormalizedMetrics(
  row: GroupStandingRow,
  playedCount = row.played
): OpenNormalizedMetrics {
  const played = normalizePlayedCount(row, playedCount)

  if (played === 0) {
    return {
      pointsPerMatch: 0,
      setDiffPerMatch: 0,
      gameDiffPerMatch: 0,
      gamesForPerMatch: 0,
    }
  }

  return {
    pointsPerMatch: row.match_points / played,
    setDiffPerMatch: row.set_difference / played,
    gameDiffPerMatch: row.game_difference / played,
    gamesForPerMatch: row.games_for / played,
  }
}

export function toOpenRankedTeam(
  groupStandings: GroupStandings,
  row: GroupStandingRow,
  groupPosition: number
): OpenRankedTeam {
  return {
    groupId: groupStandings.group.id,
    groupName: groupStandings.group.name,
    groupOrder: normalizeGroupOrder(groupStandings.group.order),
    teamId: row.team_id,
    seed: row.seed,
    groupPosition,
    played: row.played,
    metrics: getOpenNormalizedMetrics(row),
    requiresManualResolution: false,
  }
}

export function rankOpenBestThirds(groupStandings: GroupStandings[]): OpenRankedTeam[] {
  const thirds = groupStandings
    .filter((group) => group.standings.length >= 3)
    .map((group) => toOpenRankedTeam(group, group.standings[2], 3))
    .sort(compareOpenRankedTeams)

  return markManualResolutionTies(thirds)
}

export function rankOpenByeCandidates(groupStandings: GroupStandings[]): OpenRankedTeam[] {
  const winners = groupStandings
    .filter((group) => group.standings.length >= 1)
    .map((group) => toOpenRankedTeam(group, group.standings[0], 1))
    .sort(compareOpenRankedTeams)

  const seconds = groupStandings
    .filter((group) => group.standings.length >= 2)
    .map((group) => toOpenRankedTeam(group, group.standings[1], 2))
    .sort(compareOpenRankedTeams)

  const thirds = rankOpenBestThirds(groupStandings)

  return markManualResolutionTies([...winners, ...seconds, ...thirds])
}
