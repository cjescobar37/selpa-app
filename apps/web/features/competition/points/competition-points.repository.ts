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
  const { data, error } = await supabaseAdmin
    .from('competition_point_transactions')
    .select('player_entry_id,club_player_id,division_id,points')
    .eq('club_id', clubId)
    .eq('season_id', seasonId)
  if (error) throw rpcError('No pude leer los totales del ledger', error)
  const totals = new Map<string, CompetitionPointTotalRow>()
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const playerEntryId = String(row.player_entry_id ?? '')
    if (!playerEntryId) continue
    const current = totals.get(playerEntryId)
    totals.set(playerEntryId, {
      player_entry_id: playerEntryId,
      club_player_id: String(row.club_player_id ?? current?.club_player_id ?? ''),
      division_id: String(row.division_id ?? current?.division_id ?? ''),
      total_points: (current?.total_points ?? 0) + Number(row.points ?? 0),
    })
  }
  return [...totals.values()]
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
