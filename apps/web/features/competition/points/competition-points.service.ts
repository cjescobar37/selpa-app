import {
  createOpeningBalance,
  readCompetitionPointTotals,
  reverseCompetitionPointTransaction,
  runOpeningBalanceBackfill,
} from './competition-points.repository'
import type { CompetitionPointsSource } from './competition-points.types'

export function getCompetitionPointsSource(): CompetitionPointsSource {
  if (process.env.COMPETITION_POINTS_SOURCE === undefined) return 'legacy'
  const value = process.env.COMPETITION_POINTS_SOURCE.trim().toLowerCase()
  if (value !== 'legacy' && value !== 'ledger') {
    throw new Error(`COMPETITION_POINTS_SOURCE inválido: ${value || '<vacío>'}`)
  }
  return value
}

export async function getLedgerPointsByEntry(clubId: string, seasonId: string) {
  const rows = await readCompetitionPointTotals(clubId, seasonId)
  return new Map(rows.map((row) => [row.player_entry_id, row.total_points]))
}

export const competitionPointsAdministration = {
  createOpeningBalance,
  runOpeningBalanceBackfill,
  reverseTransaction: reverseCompetitionPointTransaction,
}
