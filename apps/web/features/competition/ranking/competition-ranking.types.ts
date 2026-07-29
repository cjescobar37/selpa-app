export type RankingEngineSource = 'legacy' | 'competition'

export type CompetitionRankingBasePlayer = {
  playerEntryId: string
  playerId: string
  userId: string
  fullName: string
  avatarUrl: string | null
  category: number
  categoryName: string
  gender: 'M' | 'F'
  points: number
  approvedAt: string | null
  divisionId: string
}

export type CompetitionRankingStats = {
  tournamentsPlayed: number
  matchesPlayed: number
  wins: number
  losses: number
  titles: number
  finals: number
}

export type CompetitionRankingRow = CompetitionRankingBasePlayer & CompetitionRankingStats & {
  position: number
  isTied: boolean
}

export type LegacyIndividualRankingRow = {
  position: number
  isTied: boolean
  player_id: string
  user_id: string
  full_name: string
  avatar_url: string | null
  category: number
  gender: 'M' | 'F'
  ranking_points: number
  tournaments_played: number
  matches_played: number
  wins: number
  losses: number
  titles: number
  finals: number
  approved_at: string | null
}

export type CompetitionRankingCategory = { id: number; name: string }

export type CompetitionRankingResult = {
  seasonId: string
  players: CompetitionRankingBasePlayer[]
  categories: CompetitionRankingCategory[]
}
