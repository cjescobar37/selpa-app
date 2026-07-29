import type { CompetitionRankingRow, LegacyIndividualRankingRow } from './competition-ranking.types'

export function mapCompetitionRankingToLegacyContract(row: CompetitionRankingRow): LegacyIndividualRankingRow {
  return {
    position: row.position, isTied: row.isTied, player_id: row.playerId, user_id: row.userId, full_name: row.fullName,
    avatar_url: row.avatarUrl, category: row.category, gender: row.gender, ranking_points: row.points,
    tournaments_played: row.tournamentsPlayed, matches_played: row.matchesPlayed, wins: row.wins,
    losses: row.losses, titles: row.titles, finals: row.finals, approved_at: row.approvedAt,
  }
}
