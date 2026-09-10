import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getPlayoffScheduleReservation,
  promotePlayoffScheduleReservationInRules,
  removePlayoffScheduleReservationFromRules,
  resolveTournamentPlayoffScheduleCategory,
  type PlayoffSchedulePhase,
} from '@/lib/tournamentPlayoffScheduleReservations'

type TournamentPlayoffSchedulingRow = {
  id: string
  club_id: string
  category_id: number | null
  category: string | null
  rules_json: Record<string, unknown> | null
  rules: Record<string, unknown> | null
  updated_at: string
}

function normalizeRules(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function readTournamentPlayoffSchedulingContext(input: {
  tournamentId: string
  clubId: string
}) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,category_id,category,rules_json,rules,updated_at')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (error) throw new Error(`No pude leer la programación del playoff: ${error.message}`)
  if (!data?.id) throw new Error('Torneo no encontrado para este club.')

  const row = data as TournamentPlayoffSchedulingRow
  return {
    category: resolveTournamentPlayoffScheduleCategory(row),
    rules: normalizeRules(row.rules_json ?? row.rules ?? {}),
    updatedAt: row.updated_at,
  }
}

export async function persistTournamentPlayoffSchedulingRulesIfCurrent(input: {
  tournamentId: string
  clubId: string
  expectedUpdatedAt: string
  rules: Record<string, unknown>
}) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .update({ rules_json: input.rules })
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .eq('updated_at', input.expectedUpdatedAt)
    .select('id,updated_at')
    .maybeSingle()

  if (error) throw new Error(`No pude guardar rules_json del playoff: ${error.message}`)
  return Boolean(data?.id)
}

export async function readFuturePlayoffScheduleForMaterialization(input: {
  tournamentId: string
  clubId: string
  phase: PlayoffSchedulePhase
  matchOrder: number
}) {
  const context = await readTournamentPlayoffSchedulingContext(input)
  const reservation = context.category
    ? getPlayoffScheduleReservation(context.rules, {
        category: context.category,
        phase: input.phase,
        matchOrder: input.matchOrder,
      })
    : null

  return {
    category: context.category,
    reservation,
  }
}

export async function promoteFuturePlayoffScheduleToMatch(input: {
  tournamentId: string
  clubId: string
  phase: PlayoffSchedulePhase
  matchOrder: number
  matchId: string
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const context = await readTournamentPlayoffSchedulingContext(input)
    if (!context.category) {
      const { error } = await supabaseAdmin
        .from('tournament_matches')
        .update({ scheduled_at: null })
        .eq('id', input.matchId)
        .eq('tournament_id', input.tournamentId)
        .eq('club_id', input.clubId)
      if (error) throw new Error(`No pude limpiar scheduled_at del partido materializado: ${error.message}`)
      return { mode: 'none' as const, assignment: null, removedReservation: false }
    }

    const promoted = promotePlayoffScheduleReservationInRules({
      rules: context.rules,
      category: context.category,
      phase: input.phase,
      matchOrder: input.matchOrder,
      matchId: input.matchId,
    })

    // El assignment real es la única fuente de verdad activa después de materializar.
    const { error: scheduleError } = await supabaseAdmin
      .from('tournament_matches')
      .update({ scheduled_at: promoted.assignment?.scheduled_at ?? null })
      .eq('id', input.matchId)
      .eq('tournament_id', input.tournamentId)
      .eq('club_id', input.clubId)

    if (scheduleError) {
      throw new Error(`No pude sincronizar scheduled_at del partido materializado: ${scheduleError.message}`)
    }

    if (promoted.mode !== 'promoted' && !promoted.removedReservation) {
      return {
        mode: promoted.mode,
        assignment: promoted.assignment,
        removedReservation: promoted.removedReservation,
      }
    }

    const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
      tournamentId: input.tournamentId,
      clubId: input.clubId,
      expectedUpdatedAt: context.updatedAt,
      rules: promoted.rules,
    })
    if (persisted) {
      return {
        mode: promoted.mode,
        assignment: promoted.assignment,
        removedReservation: promoted.removedReservation,
      }
    }
  }

  throw new Error('La programación del playoff cambió en paralelo; reintentá la operación.')
}

export async function cleanupFuturePlayoffReservationForRealMatch(input: {
  tournamentId: string
  clubId: string
  phase: PlayoffSchedulePhase
  matchOrder: number
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const context = await readTournamentPlayoffSchedulingContext(input)
    if (!context.category) return { removed: false }

    const removal = removePlayoffScheduleReservationFromRules(context.rules, {
      category: context.category,
      phase: input.phase,
      matchOrder: input.matchOrder,
    })
    if (!removal.removed) return { removed: false }

    const persisted = await persistTournamentPlayoffSchedulingRulesIfCurrent({
      tournamentId: input.tournamentId,
      clubId: input.clubId,
      expectedUpdatedAt: context.updatedAt,
      rules: removal.rules,
    })
    if (persisted) return { removed: true }
  }

  throw new Error('La programación del playoff cambió en paralelo; no pude limpiar la reserva stale.')
}
