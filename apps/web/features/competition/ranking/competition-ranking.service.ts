import { readCompetitionRanking } from './competition-ranking.repository'
import type { CompetitionRankingRow, CompetitionRankingStats, RankingEngineSource } from './competition-ranking.types'

export function getRankingEngineSource(): RankingEngineSource {
  const value = String(process.env.RANKING_ENGINE_SOURCE ?? 'competition').trim().toLowerCase()
  if (value !== 'legacy' && value !== 'competition') throw new Error(`RANKING_ENGINE_SOURCE inválido: ${value}`)
  return value
}

export async function getCompetitionRanking(clubId: string, statsByUserId: Map<string, CompetitionRankingStats>) {
  const source = await readCompetitionRanking(clubId)
  const rows = source.players.map((player) => ({
    ...player,
    ...(statsByUserId.get(player.userId) ?? { tournamentsPlayed: 0, matchesPlayed: 0, wins: 0, losses: 0, titles: 0, finals: 0 }),
  })).sort((a, b) => b.points - a.points || b.titles - a.titles || b.wins - a.wins || a.fullName.localeCompare(b.fullName) || a.playerId.localeCompare(b.playerId))

  const pointCounts = new Map<number, number>()
  rows.forEach((row) => pointCounts.set(row.points, (pointCounts.get(row.points) ?? 0) + 1))
  let previousPoints: number | null = null
  let previousPosition = 0
  const positioned: CompetitionRankingRow[] = rows.map((row, index) => {
    const position = previousPoints === row.points ? previousPosition : index + 1
    previousPoints = row.points
    previousPosition = position
    return { ...row, position, isTied: (pointCounts.get(row.points) ?? 0) > 1 }
  })
  return { ...source, rows: positioned }
}
