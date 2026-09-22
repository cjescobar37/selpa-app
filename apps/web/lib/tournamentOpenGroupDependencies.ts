type GroupMatchRow = {
  id: string
  tournament_id: string
  club_id: string
  group_id: string | null
  team1_id: string | null
  team2_id: string | null
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
  const { buildOpenGroupDependentFixture } = await import('@/lib/tournamentOpen/groupFixtures')
  const select = 'id,tournament_id,club_id,group_id,team1_id,team2_id,round,phase,status,winner_team_id,match_order'
  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select(select)
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .eq('group_id', input.groupId)
    .eq('phase', 'GROUP')
    .order('round')
    .order('match_order')

  if (error) throw new Error(`No pude leer los cruces del grupo: ${error.message}`)
  const matches = (data ?? []) as GroupMatchRow[]
  const initial = matches.filter(match => Number(match.round) === 1).slice(0, 2)
  if (initial.length !== 2) return { status: 'NOT_APPLICABLE', matches: [] }
  if (initial.some(match => match.status !== 'PLAYED' || !match.team1_id || !match.team2_id || !match.winner_team_id)) {
    return { status: 'WAITING_FOR_INITIAL_RESULTS', matches: [] }
  }

  const fixture = buildOpenGroupDependentFixture({
    initialMatches: initial.map(match => ({
      team1Id: match.team1_id!,
      team2Id: match.team2_id!,
      winnerTeamId: match.winner_team_id,
    })),
  })
  if (!fixture) return { status: 'NOT_APPLICABLE', matches: [] }

  const dependent = matches.filter(match => Number(match.round) === 2)
  const pairKey = (team1Id: string | null, team2Id: string | null) => [team1Id, team2Id].sort().join(':')
  const missing = fixture.filter(expected => !dependent.some(match => pairKey(match.team1_id, match.team2_id) === pairKey(expected.team1Id, expected.team2Id)))
  if (!missing.length) return { status: 'ALREADY_GENERATED', matches: dependent }

  const nextOrder = Math.max(0, ...matches.map(match => Number(match.match_order ?? 0))) + 1
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tournament_matches')
    .insert(missing.map((match, index) => ({
      tournament_id: input.tournamentId,
      club_id: input.clubId,
      group_id: input.groupId,
      team1_id: match.team1Id,
      team2_id: match.team2Id,
      round: match.round,
      phase: 'GROUP',
      status: 'PENDING',
      score: {},
      match_order: nextOrder + index,
    })))
    .select(select)

  if (insertError) throw new Error(`No pude definir los cruces de segunda ronda: ${insertError.message}`)
  return { status: 'GENERATED', matches: [...dependent, ...((inserted ?? []) as GroupMatchRow[])] }
}
