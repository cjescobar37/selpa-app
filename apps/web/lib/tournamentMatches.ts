import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'

export type MatchStatus = 'PENDING' | 'PLAYED' | 'CANCELLED'
export type MatchPhase =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'EIGHTHS'
  | 'QUARTER'
  | 'SEMI'
  | 'FINAL'
  | 'THIRD_PLACE'
  | 'OTHER'
export type MatchScore = Record<string, unknown>

export type CreateMatchInput = {
  tournamentId: string
  clubId: string
  groupId?: string | null
  team1Id: string
  team2Id: string
  round?: number
  phase?: MatchPhase
  matchOrder?: number
  scheduledAt?: string | null
}

export type UpdateMatchResultInput = {
  matchId: string
  status: MatchStatus
  score?: MatchScore | null
  winnerTeamId?: string | null
}

export type ListMatchesByTournamentInput = {
  tournamentId: string
  clubId: string
}

const matchStatuses: MatchStatus[] = ['PENDING', 'PLAYED', 'CANCELLED']
const matchPhases: MatchPhase[] = [
  'GROUP',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'EIGHTHS',
  'QUARTER',
  'SEMI',
  'FINAL',
  'THIRD_PLACE',
  'OTHER',
]

function assertUuid(value: string | null | undefined, label: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} inválido.`)
  }
}

function normalizePositiveInt(value: number | undefined, fallback: number, label: string) {
  const next = value ?? fallback
  if (!Number.isInteger(next) || next < 1) throw new Error(`${label} debe ser un entero positivo.`)
  return next
}

function normalizeOrder(value: number | undefined) {
  const next = value ?? 0
  if (!Number.isInteger(next) || next < 0) throw new Error('matchOrder debe ser un entero mayor o igual a 0.')
  return next
}

function normalizeIsoOrNull(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('scheduledAt inválido.')
  return parsed.toISOString()
}

async function ensureTournament(input: { tournamentId: string; clubId: string }) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name')
    .eq('id', input.tournamentId)
    .maybeSingle()

  if (error) throw new Error(`No pude validar el torneo: ${error.message}`)
  if (!data?.id) throw new Error('Torneo no encontrado.')
  if (data.club_id !== input.clubId) throw new Error('El torneo no pertenece al club indicado.')
  return data
}

async function ensureTeams(input: { tournamentId: string; clubId: string; team1Id: string; team2Id: string; winnerTeamId?: string | null }) {
  if (input.team1Id === input.team2Id) throw new Error('team1Id y team2Id deben ser distintos.')
  if (input.winnerTeamId && input.winnerTeamId !== input.team1Id && input.winnerTeamId !== input.team2Id) {
    throw new Error('winnerTeamId debe ser uno de los equipos del partido.')
  }

  const teamIds = [input.team1Id, input.team2Id, input.winnerTeamId].filter(Boolean) as string[]
  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,tournament_id,club_id')
    .in('id', Array.from(new Set(teamIds)))

  if (error) throw new Error(`No pude validar equipos: ${error.message}`)

  const teams = new Map((data ?? []).map((team: { id: string; tournament_id: string; club_id: string }) => [team.id, team]))
  for (const teamId of teamIds) {
    const team = teams.get(teamId)
    if (!team) throw new Error('Equipo no encontrado.')
    if (team.tournament_id !== input.tournamentId) throw new Error('Todos los equipos deben pertenecer al torneo indicado.')
    if (team.club_id !== input.clubId) throw new Error('Todos los equipos deben pertenecer al club indicado.')
  }
}

export async function createMatch(input: CreateMatchInput) {
  assertServiceRole()
  assertUuid(input.tournamentId, 'tournamentId')
  assertUuid(input.clubId, 'clubId')
  if (input.groupId) assertUuid(input.groupId, 'groupId')
  assertUuid(input.team1Id, 'team1Id')
  assertUuid(input.team2Id, 'team2Id')

  const phase = input.phase ?? 'GROUP'
  if (!matchPhases.includes(phase)) throw new Error('phase inválida.')

  const round = normalizePositiveInt(input.round, 1, 'round')
  const matchOrder = normalizeOrder(input.matchOrder)
  const scheduledAt = normalizeIsoOrNull(input.scheduledAt)

  await ensureTournament({ tournamentId: input.tournamentId, clubId: input.clubId })
  await ensureTeams({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
    team1Id: input.team1Id,
    team2Id: input.team2Id,
  })

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .insert({
      tournament_id: input.tournamentId,
      club_id: input.clubId,
      group_id: input.groupId ?? null,
      team1_id: input.team1Id,
      team2_id: input.team2Id,
      round,
      phase,
      status: 'PENDING' satisfies MatchStatus,
      score: {},
      match_order: matchOrder,
      scheduled_at: scheduledAt,
    })
    .select('*')
    .single()

  if (error) throw new Error(`No pude crear el partido: ${error.message}`)
  return { match: data }
}

export async function updateMatchResult(input: UpdateMatchResultInput) {
  assertServiceRole()
  assertUuid(input.matchId, 'matchId')
  if (input.winnerTeamId) assertUuid(input.winnerTeamId, 'winnerTeamId')
  if (!matchStatuses.includes(input.status)) throw new Error('status inválido.')

  const { data: match, error: matchError } = await supabaseAdmin
    .from('tournament_matches')
    .select('id,tournament_id,club_id,team1_id,team2_id')
    .eq('id', input.matchId)
    .maybeSingle()

  if (matchError) throw new Error(`No pude buscar el partido: ${matchError.message}`)
  if (!match?.id) throw new Error('Partido no encontrado.')

  await ensureTeams({
    tournamentId: match.tournament_id,
    clubId: match.club_id,
    team1Id: match.team1_id,
    team2Id: match.team2_id,
    winnerTeamId: input.winnerTeamId,
  })

  const payload = {
    status: input.status,
    score: input.score ?? {},
    winner_team_id: input.winnerTeamId ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .update(payload)
    .eq('id', input.matchId)
    .select('*')
    .single()

  if (error) throw new Error(`No pude actualizar el resultado: ${error.message}`)
  return { match: data }
}

export async function listMatchesByTournament(input: ListMatchesByTournamentInput) {
  assertServiceRole()
  assertUuid(input.tournamentId, 'tournamentId')
  assertUuid(input.clubId, 'clubId')

  await ensureTournament({ tournamentId: input.tournamentId, clubId: input.clubId })

  const { data, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .order('round', { ascending: true })
    .order('match_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`No pude listar partidos: ${error.message}`)
  return { matches: data ?? [] }
}
