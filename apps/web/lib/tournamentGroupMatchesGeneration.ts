import { createMatch } from '@/lib/tournamentMatches'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type GroupMatchesGenerationErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'GROUPS_NOT_FOUND'
  | 'GROUP_MATCHES_ALREADY_EXIST'
  | 'GROUP_NOT_COMPLETE'
  | 'INVALID_GROUP_SIZE'

type TournamentGroupRow = {
  id: string
  tournament_id: string
  name: string
  size: number
  order: number
}

type TournamentGroupTeamRow = {
  id: string
  group_id: string
  team_id: string
  seed: number
}

export class TournamentGroupMatchesGenerationError extends Error {
  code: GroupMatchesGenerationErrorCode
  status: number

  constructor(code: GroupMatchesGenerationErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'TournamentGroupMatchesGenerationError'
    this.code = code
    this.status = status
  }
}

function buildRoundRobinPairs(teamRows: TournamentGroupTeamRow[]) {
  const teams = [...teamRows].sort((a, b) => a.seed - b.seed)
  const pairs: Array<{ team1Id: string; team2Id: string; round: number }> = []

  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const team1 = teams[i]
      const team2 = teams[j]
      if (!team1 || !team2) continue
      pairs.push({
        team1Id: team1.team_id,
        team2Id: team2.team_id,
        round: pairs.length + 1,
      })
    }
  }

  return pairs
}

export async function generateGroupMatchesForTournament(input: {
  tournamentId: string
  clubId: string
}) {
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new TournamentGroupMatchesGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  const { count: existingMatchesCount, error: existingMatchesError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .eq('phase', 'GROUP')

  if (existingMatchesError) throw new Error(`No pude validar partidos existentes: ${existingMatchesError.message}`)
  if ((existingMatchesCount ?? 0) > 0) {
    throw new TournamentGroupMatchesGenerationError(
      'GROUP_MATCHES_ALREADY_EXIST',
      'Este torneo ya tiene partidos de grupos generados.',
      409
    )
  }

  const { data: groupRows, error: groupsError } = await supabaseAdmin
    .from('tournament_groups')
    .select('id,tournament_id,name,size,order')
    .eq('tournament_id', input.tournamentId)
    .order('order', { ascending: true })

  if (groupsError) throw new Error(`No pude leer grupos: ${groupsError.message}`)

  const groups = (groupRows ?? []) as TournamentGroupRow[]
  if (groups.length === 0) {
    throw new TournamentGroupMatchesGenerationError('GROUPS_NOT_FOUND', 'Primero generá los grupos del torneo.', 409)
  }

  const invalidGroup = groups.find((group) => group.size !== 3 && group.size !== 4)
  if (invalidGroup) {
    throw new TournamentGroupMatchesGenerationError(
      'INVALID_GROUP_SIZE',
      `El grupo ${invalidGroup.name} tiene un tamaño inválido.`,
      409
    )
  }

  const groupIds = groups.map((group) => group.id)
  const { data: groupTeamRows, error: groupTeamsError } = await supabaseAdmin
    .from('tournament_group_teams')
    .select('id,group_id,team_id,seed')
    .eq('tournament_id', input.tournamentId)
    .in('group_id', groupIds)
    .order('seed', { ascending: true })

  if (groupTeamsError) throw new Error(`No pude leer equipos de grupos: ${groupTeamsError.message}`)

  const groupTeamsByGroup = ((groupTeamRows ?? []) as TournamentGroupTeamRow[]).reduce((map, row) => {
    const current = map.get(row.group_id) ?? []
    current.push(row)
    map.set(row.group_id, current)
    return map
  }, new Map<string, TournamentGroupTeamRow[]>())

  for (const group of groups) {
    const teams = groupTeamsByGroup.get(group.id) ?? []
    if (teams.length !== group.size) {
      throw new TournamentGroupMatchesGenerationError(
        'GROUP_NOT_COMPLETE',
        `El grupo ${group.name} no tiene sus ${group.size} equipos completos.`,
        409
      )
    }
  }

  const createdMatchIds: string[] = []
  const perGroupCounts: Array<{ groupId: string; groupName: string; matchesCreated: number }> = []
  let matchOrder = 1

  try {
    for (const group of groups) {
      const pairs = buildRoundRobinPairs(groupTeamsByGroup.get(group.id) ?? [])
      perGroupCounts.push({ groupId: group.id, groupName: group.name, matchesCreated: pairs.length })

      for (const pair of pairs) {
        const { match } = await createMatch({
          tournamentId: input.tournamentId,
          clubId: input.clubId,
          groupId: group.id,
          team1Id: pair.team1Id,
          team2Id: pair.team2Id,
          phase: 'GROUP',
          round: pair.round,
          matchOrder,
        })
        if (match?.id) createdMatchIds.push(match.id)
        matchOrder += 1
      }
    }
  } catch (error) {
    if (createdMatchIds.length > 0) {
      await supabaseAdmin
        .from('tournament_matches')
        .delete()
        .eq('tournament_id', input.tournamentId)
        .eq('club_id', input.clubId)
        .eq('phase', 'GROUP')
        .in('id', createdMatchIds)
    }
    throw error
  }

  return {
    tournament,
    groupsCount: groups.length,
    matchesCreated: createdMatchIds.length,
    perGroupCounts,
  }
}
