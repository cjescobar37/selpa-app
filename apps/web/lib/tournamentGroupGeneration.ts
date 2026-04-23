import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateOpenGroupStructure } from '@/lib/tournamentOpen/groups'
import { OpenTournamentEngineError } from '@/lib/tournamentOpen/types'

type GroupGenerationErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'SEED_SNAPSHOT_REQUIRED'
  | 'GROUPS_ALREADY_EXIST'
  | 'NO_ELIGIBLE_TEAMS'
  | 'INVALID_GROUP_CONFIGURATION'

type SeedSnapshotRow = {
  team_id: string
  seed: number
}

type GroupInsert = {
  tournament_id: string
  name: string
  size: number
  order: number
}

type CreatedGroupRow = GroupInsert & {
  id: string
}

export class TournamentGroupGenerationError extends Error {
  code: GroupGenerationErrorCode
  status: number

  constructor(code: GroupGenerationErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'TournamentGroupGenerationError'
    this.code = code
    this.status = status
  }
}

function getGroupName(index: number) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let value = index + 1
  let name = ''

  while (value > 0) {
    const remainder = (value - 1) % letters.length
    name = letters[remainder] + name
    value = Math.floor((value - 1) / letters.length)
  }

  return name
}

function assignTeamsSnake(snapshots: SeedSnapshotRow[], groupSizes: number[]) {
  const groups = groupSizes.map((size, index) => ({
    name: getGroupName(index),
    size,
    order: index + 1,
    teams: [] as SeedSnapshotRow[],
  }))

  let cursor = 0
  let forward = true

  while (cursor < snapshots.length) {
    const indexes = groups.map((_, index) => index)
    if (!forward) indexes.reverse()

    for (const index of indexes) {
      const group = groups[index]
      const snapshot = snapshots[cursor]
      if (!group || !snapshot) continue
      if (group.teams.length >= group.size) continue

      group.teams.push(snapshot)
      cursor += 1
      if (cursor >= snapshots.length) break
    }

    forward = !forward
  }

  return groups
}

export async function generateTournamentGroupsFromSeedSnapshot(input: {
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
    throw new TournamentGroupGenerationError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  const { count: existingGroupsCount, error: existingGroupsError } = await supabaseAdmin
    .from('tournament_groups')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', input.tournamentId)

  if (existingGroupsError) throw new Error(`No pude validar grupos existentes: ${existingGroupsError.message}`)
  if ((existingGroupsCount ?? 0) > 0) {
    throw new TournamentGroupGenerationError('GROUPS_ALREADY_EXIST', 'Este torneo ya tiene grupos generados.', 409)
  }

  const { data: snapshotRows, error: snapshotsError } = await supabaseAdmin
    .from('tournament_team_seed_snapshots')
    .select('team_id,seed')
    .eq('club_id', input.clubId)
    .eq('tournament_id', input.tournamentId)
    .order('seed', { ascending: true })

  if (snapshotsError) throw new Error(`No pude leer seed snapshot: ${snapshotsError.message}`)

  const snapshots = (snapshotRows ?? []) as SeedSnapshotRow[]
  if (snapshots.length === 0) {
    throw new TournamentGroupGenerationError(
      'SEED_SNAPSHOT_REQUIRED',
      'Primero generá el seed del torneo.',
      409
    )
  }

  let groupStructure: ReturnType<typeof calculateOpenGroupStructure>
  try {
    groupStructure = calculateOpenGroupStructure(snapshots.length)
  } catch (error: unknown) {
    if (error instanceof OpenTournamentEngineError) {
      throw new TournamentGroupGenerationError('INVALID_GROUP_CONFIGURATION', error.message, 409)
    }
    throw error
  }

  if (groupStructure.totalGroups === 0) {
    throw new TournamentGroupGenerationError('NO_ELIGIBLE_TEAMS', 'No hay equipos elegibles para generar grupos.', 409)
  }

  const plannedGroups = assignTeamsSnake(snapshots, groupStructure.groupSizes)
  if (plannedGroups.some((group) => group.teams.length !== group.size)) {
    throw new TournamentGroupGenerationError(
      'INVALID_GROUP_CONFIGURATION',
      'No se pudo asignar la cantidad exacta de equipos a cada grupo.',
      409
    )
  }

  const groupInserts: GroupInsert[] = plannedGroups.map((group) => ({
    tournament_id: input.tournamentId,
    name: group.name,
    size: group.size,
    order: group.order,
  }))

  const { data: createdGroups, error: groupsError } = await supabaseAdmin
    .from('tournament_groups')
    .insert(groupInserts)
    .select('id,tournament_id,name,size,order')

  if (groupsError) throw new Error(`No pude crear grupos: ${groupsError.message}`)

  const createdByOrder = new Map(((createdGroups ?? []) as CreatedGroupRow[]).map((group) => [group.order, group]))
  const groupTeamInserts = plannedGroups.flatMap((group) => {
    const createdGroup = createdByOrder.get(group.order)
    if (!createdGroup) return []

    return group.teams.map((snapshot) => ({
      tournament_id: input.tournamentId,
      group_id: createdGroup.id,
      team_id: snapshot.team_id,
      seed: snapshot.seed,
      position: null,
    }))
  })

  if (groupTeamInserts.length !== snapshots.length) {
    await supabaseAdmin.from('tournament_groups').delete().eq('tournament_id', input.tournamentId)
    throw new TournamentGroupGenerationError(
      'INVALID_GROUP_CONFIGURATION',
      'No se pudo preparar la asignación completa de equipos.',
      409
    )
  }

  const { error: groupTeamsError } = await supabaseAdmin
    .from('tournament_group_teams')
    .insert(groupTeamInserts)

  if (groupTeamsError) {
    await supabaseAdmin.from('tournament_groups').delete().eq('tournament_id', input.tournamentId)
    throw new Error(`No pude asignar equipos a grupos: ${groupTeamsError.message}`)
  }

  return {
    tournament,
    groupCount: plannedGroups.length,
    sizes: plannedGroups.map((group) => group.size),
    teamsAssigned: groupTeamInserts.length,
    groups: plannedGroups.map((group) => ({
      name: group.name,
      size: group.size,
      order: group.order,
      teamSeeds: group.teams.map((team) => team.seed),
    })),
  }
}
