import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTournamentRegistrationEligibilityGate } from '@/lib/tournamentRegistrationEligibility'

type SeedingErrorCode =
  | 'TOURNAMENT_NOT_FOUND'
  | 'SEED_SNAPSHOT_ALREADY_EXISTS'
  | 'NO_ELIGIBLE_TEAMS'
  | 'INSUFFICIENT_ELIGIBLE_TEAMS_FOR_SEED'
  | 'TEAM_DATA_INCOMPLETE'

type RegistrationRow = {
  id: string
  tournament_id: string
  club_id: string
  team_id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  created_at: string
}

type TeamRow = {
  id: string
  tournament_id: string
  club_id: string
  player1_user_id: string
  player2_user_id: string
}

type ClubPlayerRankingRow = {
  user_id: string
  ranking_points: number | null
}

type SeedCandidate = {
  tournament_id: string
  club_id: string
  team_id: string
  registration_id: string
  player1_user_id: string
  player2_user_id: string
  player1_points: number
  player2_points: number
  team_score: number
  best_individual_points: number
  worst_individual_points: number
  registration_created_at: string
}

type SeedSnapshotInsert = Omit<SeedCandidate, 'registration_created_at'> & {
  seed: number
  seed_source: 'NO_RANKING'
  snapshot_at: string
  generated_by: string
}

export class TournamentSeedingError extends Error {
  code: SeedingErrorCode
  status: number

  constructor(code: SeedingErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'TournamentSeedingError'
    this.code = code
    this.status = status
  }
}

function compareSeedCandidates(a: SeedCandidate, b: SeedCandidate) {
  const teamScoreDiff = b.team_score - a.team_score
  if (teamScoreDiff !== 0) return teamScoreDiff

  const bestDiff = b.best_individual_points - a.best_individual_points
  if (bestDiff !== 0) return bestDiff

  const worstDiff = b.worst_individual_points - a.worst_individual_points
  if (worstDiff !== 0) return worstDiff

  const createdDiff = new Date(a.registration_created_at).getTime() - new Date(b.registration_created_at).getTime()
  if (createdDiff !== 0) return createdDiff

  return a.team_id.localeCompare(b.team_id)
}

export async function generateTournamentSeedSnapshot(input: {
  tournamentId: string
  clubId: string
  userId: string
}) {
  assertServiceRole()

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,min_pairs')
    .eq('id', input.tournamentId)
    .eq('club_id', input.clubId)
    .maybeSingle()

  if (tournamentError) throw new Error(`No pude validar el torneo: ${tournamentError.message}`)
  if (!tournament) {
    throw new TournamentSeedingError('TOURNAMENT_NOT_FOUND', 'Torneo no encontrado para este club.', 404)
  }

  const { count: existingCount, error: existingError } = await supabaseAdmin
    .from('tournament_team_seed_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', input.tournamentId)

  if (existingError) throw new Error(`No pude validar snapshots existentes: ${existingError.message}`)
  if ((existingCount ?? 0) > 0) {
    throw new TournamentSeedingError(
      'SEED_SNAPSHOT_ALREADY_EXISTS',
      'Este torneo ya tiene snapshot de seed generado.',
      409
    )
  }

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id,tournament_id,club_id,team_id,status,created_at')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .eq('status', 'CONFIRMED')

  if (registrationsError) throw new Error(`No pude leer inscripciones confirmadas: ${registrationsError.message}`)

  const registrationRows = (registrations ?? []) as RegistrationRow[]
  if (registrationRows.length === 0) {
    throw new TournamentSeedingError('NO_ELIGIBLE_TEAMS', 'No hay equipos confirmados para generar seed.', 409)
  }

  const eligibilityGate = await getTournamentRegistrationEligibilityGate({
    tournamentId: input.tournamentId,
    clubId: input.clubId,
  })
  const blockedRegistrationIds = new Set(eligibilityGate.blockedRegistrationIds)
  const eligibleRegistrations = registrationRows.filter((registration) => !blockedRegistrationIds.has(registration.id))

  if (eligibleRegistrations.length === 0) {
    throw new TournamentSeedingError('NO_ELIGIBLE_TEAMS', 'No hay equipos elegibles para generar seed.', 409)
  }

  const requiredEligibleTeams = Math.max(2, Number(tournament.min_pairs ?? 2))
  if (eligibleRegistrations.length < requiredEligibleTeams) {
    throw new TournamentSeedingError(
      'INSUFFICIENT_ELIGIBLE_TEAMS_FOR_SEED',
      `Se necesitan al menos ${requiredEligibleTeams} parejas elegibles para generar seed.`,
      409
    )
  }

  const teamIds = eligibleRegistrations.map((registration) => registration.team_id)
  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,tournament_id,club_id,player1_user_id,player2_user_id')
    .eq('tournament_id', input.tournamentId)
    .eq('club_id', input.clubId)
    .in('id', teamIds)

  if (teamsError) throw new Error(`No pude leer equipos del torneo: ${teamsError.message}`)

  const teamsById = new Map(((teams ?? []) as TeamRow[]).map((team) => [team.id, team]))
  const playerIds = Array.from(
    new Set(
      ((teams ?? []) as TeamRow[]).flatMap((team) => [team.player1_user_id, team.player2_user_id]).filter(Boolean)
    )
  )

  const { data: clubPlayers, error: clubPlayersError } = await supabaseAdmin
    .from('club_players')
    .select('user_id,ranking_points')
    .eq('club_id', input.clubId)
    .in('user_id', playerIds)

  if (clubPlayersError) throw new Error(`No pude leer ranking de jugadores del club: ${clubPlayersError.message}`)

  const rankingPointsByUserId = new Map(
    ((clubPlayers ?? []) as ClubPlayerRankingRow[]).map((clubPlayer) => [
      clubPlayer.user_id,
      Number.isFinite(clubPlayer.ranking_points ?? NaN) ? Number(clubPlayer.ranking_points ?? 0) : 0,
    ])
  )

  const candidates = eligibleRegistrations.map((registration) => {
    const team = teamsById.get(registration.team_id)
    if (!team) {
      throw new TournamentSeedingError(
        'TEAM_DATA_INCOMPLETE',
        `No encontré datos del equipo ${registration.team_id}.`,
        409
      )
    }

    const player1Points = rankingPointsByUserId.get(team.player1_user_id) ?? 0
    const player2Points = rankingPointsByUserId.get(team.player2_user_id) ?? 0

    return {
      tournament_id: input.tournamentId,
      club_id: input.clubId,
      team_id: team.id,
      registration_id: registration.id,
      player1_user_id: team.player1_user_id,
      player2_user_id: team.player2_user_id,
      player1_points: player1Points,
      player2_points: player2Points,
      team_score: player1Points + player2Points,
      best_individual_points: Math.max(player1Points, player2Points),
      worst_individual_points: Math.min(player1Points, player2Points),
      registration_created_at: registration.created_at,
    } satisfies SeedCandidate
  })

  const snapshotAt = new Date().toISOString()
  const inserts: SeedSnapshotInsert[] = [...candidates]
    .sort(compareSeedCandidates)
    .map((candidate, index) => ({
      tournament_id: candidate.tournament_id,
      club_id: candidate.club_id,
      team_id: candidate.team_id,
      registration_id: candidate.registration_id,
      player1_user_id: candidate.player1_user_id,
      player2_user_id: candidate.player2_user_id,
      player1_points: candidate.player1_points,
      player2_points: candidate.player2_points,
      team_score: candidate.team_score,
      best_individual_points: candidate.best_individual_points,
      worst_individual_points: candidate.worst_individual_points,
      seed: index + 1,
      seed_source: 'NO_RANKING',
      snapshot_at: snapshotAt,
      generated_by: input.userId,
    }))

  const { data: snapshots, error: insertError } = await supabaseAdmin
    .from('tournament_team_seed_snapshots')
    .insert(inserts)
    .select('*')

  if (insertError) throw new Error(`No pude guardar snapshot de seed: ${insertError.message}`)

  return {
    tournament,
    snapshotAt,
    seedSource: 'NO_RANKING' as const,
    generatedCount: inserts.length,
    excludedNotEligibleCount: blockedRegistrationIds.size,
    snapshots: snapshots ?? [],
  }
}
