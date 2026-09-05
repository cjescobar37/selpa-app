type GroupMatchRow = {
  id: string
  tournament_id: string
  club_id: string
  group_id: string | null
  team1_id: string
  team2_id: string
  round: number | null
  phase: string | null
  status: string | null
  winner_team_id: string | null
  match_order: number | null
}

export type OpenGroupDependencyResult =
  | { status: 'NOT_APPLICABLE' | 'WAITING_FOR_INITIAL_RESULTS' | 'ALREADY_GENERATED'; matches: GroupMatchRow[] }
  | { status: 'GENERATED'; matches: GroupMatchRow[] }

export async function materializeOpenGroupDependentMatches(input: {
  tournamentId: string
  clubId: string
  groupId: string | null | undefined
}): Promise<OpenGroupDependencyResult> {
  if (!input.groupId) return { status: 'NOT_APPLICABLE', matches: [] }
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
  const { data, error } = await supabaseAdmin.rpc('materialize_open_group_dependent_matches', {
    p_club_id: input.clubId,
    p_tournament_id: input.tournamentId,
    p_group_id: input.groupId,
  })
  if (error) throw new Error(`No pude definir los cruces de segunda ronda: ${error.message}`)
  const payload = (data ?? {}) as { status?: string; matches?: GroupMatchRow[] }
  const status = String(payload.status ?? 'NOT_APPLICABLE')
  if (status === 'GENERATED' || status === 'ALREADY_GENERATED' || status === 'WAITING_FOR_INITIAL_RESULTS') {
    return { status, matches: Array.isArray(payload.matches) ? payload.matches : [] }
  }
  return { status: 'NOT_APPLICABLE', matches: [] }
}
