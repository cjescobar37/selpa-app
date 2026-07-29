export type CompetitionPointsSource = 'legacy' | 'ledger'

export type CompetitionPointTotalRow = {
  player_entry_id: string
  club_player_id: string
  division_id: string
  total_points: number
}

export type CompetitionOpeningBalanceResult = {
  status: 'CREATED' | 'EXISTS' | 'SKIPPED_ZERO'
  transaction_id: string | null
  legacy_points: number
}

export type CompetitionPointsBackfillSummary = {
  dry_run: boolean
  eligible_entries: number
  opening_balances_to_create: number
  already_existing: number
  zero_points_skipped: number
  missing_club_players: number
  invalid_entries: number
  excluded_without_entry: number
  legacy_total_to_migrate: number
  created: number
}
