import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type {
  CompetitionOpeningBalanceResult,
  CompetitionPointTotalRow,
  CompetitionPointsBackfillSummary,
} from './competition-points.types'

function rpcError(operation: string, error: { message?: string } | null) {
  return new Error(`${operation}: ${error?.message ?? 'error desconocido de Supabase'}`)
}

export async function readCompetitionPointTotals(clubId: string, seasonId: string) {
  const { data, error } = await supabaseAdmin.rpc('get_competition_points_totals', {
    p_club_id: clubId,
    p_season_id: seasonId,
    p_division_id: null,
  })
  if (error) throw rpcError('No pude leer los totales del ledger', error)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): CompetitionPointTotalRow => ({
    player_entry_id: String(row.player_entry_id),
    club_player_id: String(row.club_player_id),
    division_id: String(row.division_id),
    total_points: Number(row.total_points ?? 0),
  }))
}

export async function createOpeningBalance(playerEntryId: string) {
  const { data, error } = await supabaseAdmin.rpc('create_competition_opening_balance', {
    p_player_entry_id: playerEntryId,
  })
  if (error) throw rpcError('No pude crear el saldo inicial', error)
  return data as CompetitionOpeningBalanceResult
}

export async function runOpeningBalanceBackfill(clubId: string, seasonId: string, dryRun = true) {
  const { data, error } = await supabaseAdmin.rpc('backfill_competition_opening_balances', {
    p_club_id: clubId,
    p_season_id: seasonId,
    p_dry_run: dryRun,
  })
  if (error) throw rpcError('No pude ejecutar el backfill de saldos iniciales', error)
  return data as CompetitionPointsBackfillSummary
}

export async function reverseCompetitionPointTransaction(transactionId: string, reason: string, actorId: string) {
  const { data, error } = await supabaseAdmin.rpc('reverse_competition_point_transaction', {
    p_transaction_id: transactionId,
    p_reason: reason,
    p_actor_id: actorId,
  })
  if (error) throw rpcError('No pude revertir el movimiento de puntos', error)
  return data as { status: 'CREATED' | 'EXISTS'; transaction_id: string; reversed_transaction_id: string }
}
