import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

type PlayerRow = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  approved_at: string | null
  created_at: string
}

type ProfileRow = {
  user_id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type TeamRow = {
  id: string
  tournament_id: string
  club_id: string
  player1_user_id: string
  player2_user_id: string
  created_at: string
}

type RegistrationRow = {
  id: string
  tournament_id: string
  club_id: string
  team_id: string
  status: string
  created_at: string
}

type MatchRow = {
  id: string
  tournament_id: string
  club_id: string
  team1_id: string
  team2_id: string
  phase: string | null
  status: string
  winner_team_id: string | null
  score: unknown
}

type TournamentRow = {
  id: string
  name: string
  starts_on: string | null
  start_date: string | null
  status: string | null
}

type PlayerStats = {
  tournamentsPlayed: Set<string>
  matchesPlayed: number
  wins: number
  losses: number
  finals: number
  titles: number
}

type PairStats = {
  pairKey: string
  player1_user_id: string
  player2_user_id: string
  teamIds: Set<string>
  tournamentsPlayed: Set<string>
  matchesPlayed: number
  wins: number
  losses: number
  bestResult: string | null
  latestTournamentAt: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getFullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    fallback ||
    'Jugador'
  )
}

function normalizePoints(value: number | null | undefined) {
  return Number.isFinite(value ?? NaN) ? Number(value ?? 0) : 0
}

function getPairKey(player1UserId: string, player2UserId: string) {
  return [player1UserId, player2UserId].sort().join(':')
}

function normalizePhase(value?: string | null) {
  return String(value ?? '').toUpperCase()
}

function getResultRank(result: string | null) {
  const ranks: Record<string, number> = {
    Campeón: 6,
    Finalista: 5,
    Semifinalista: 4,
    'Cuartos de final': 3,
    Octavos: 2,
    'Fase de grupos': 1,
  }
  return result ? ranks[result] ?? 0 : 0
}

function getMatchResultForTeam(match: MatchRow, teamId: string) {
  const phase = normalizePhase(match.phase)
  const winnerTeamId = match.winner_team_id
  const isParticipant = match.team1_id === teamId || match.team2_id === teamId
  if (!isParticipant || String(match.status).toUpperCase() !== 'PLAYED') return null

  if (phase === 'FINAL') {
    return winnerTeamId === teamId ? 'Campeón' : 'Finalista'
  }
  if (phase === 'SEMI') return winnerTeamId === teamId ? null : 'Semifinalista'
  if (phase === 'QUARTER') return winnerTeamId === teamId ? null : 'Cuartos de final'
  if (phase === 'ROUND_OF_16' || phase === 'EIGHTHS') return winnerTeamId === teamId ? null : 'Octavos'
  if (phase === 'GROUP') return 'Fase de grupos'
  return null
}

function isMissingSchemaError(message: string) {
  return /does not exist|schema cache|column .* does not exist|Could not find/i.test(message)
}

async function isPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return false
  return Boolean(data?.user_id)
}

async function isApprovedClubPlayer(userId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('club_players')
    .select('id,approved_at')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .not('approved_at', 'is', null)
    .maybeSingle()

  if (error) return false
  return Boolean(data?.id)
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const [canManage, canReadAsPlatform, canReadAsPlayer] = await Promise.all([
      userHasClubCapability(user.id, clubId, 'ranking:view'),
      isPlatformAdmin(user.id),
      isApprovedClubPlayer(user.id, clubId),
    ])

    if (!canManage && !canReadAsPlatform && !canReadAsPlayer) {
      return NextResponse.json({ error: 'No autorizado para ver el ranking del club.' }, { status: 403 })
    }

    const warnings: string[] = []

    const { data: playersData, error: playersError } = await supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at,created_at')
      .eq('club_id', clubId)
      .not('approved_at', 'is', null)

    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

    const players = (playersData ?? []) as PlayerRow[]
    const userIds = Array.from(new Set(players.map((player) => player.user_id).filter(Boolean)))

    let profiles = new Map<string, ProfileRow>()
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('user_id,first_name,last_name,display_name,avatar_url')
        .in('user_id', userIds)

      if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
      profiles = new Map(((profilesData ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
    }

    const { data: teamsData, error: teamsError } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,tournament_id,club_id,player1_user_id,player2_user_id,created_at')
      .eq('club_id', clubId)

    if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
    const teams = (teamsData ?? []) as TeamRow[]
    const teamsById = new Map(teams.map((team) => [team.id, team]))
    const teamIds = teams.map((team) => team.id)

    let registrations: RegistrationRow[] = []
    if (teamIds.length > 0) {
      const { data: registrationsData, error: registrationsError } = await supabaseAdmin
        .from('tournament_registrations')
        .select('id,tournament_id,club_id,team_id,status,created_at')
        .eq('club_id', clubId)
        .in('team_id', teamIds)

      if (registrationsError) return NextResponse.json({ error: registrationsError.message }, { status: 500 })
      registrations = (registrationsData ?? []) as RegistrationRow[]
    }

    let matches: MatchRow[] = []
    if (teamIds.length > 0) {
      const { data: team1Matches, error: team1MatchesError } = await supabaseAdmin
        .from('tournament_matches')
        .select('id,tournament_id,club_id,team1_id,team2_id,phase,status,winner_team_id,score')
        .eq('club_id', clubId)
        .in('team1_id', teamIds)

      if (team1MatchesError) {
        if (isMissingSchemaError(team1MatchesError.message)) {
          warnings.push('No pude derivar estadísticas de partidos porque tournament_matches no está documentada/disponible en el schema actual.')
        } else {
          return NextResponse.json({ error: team1MatchesError.message }, { status: 500 })
        }
      } else {
        const { data: team2Matches, error: team2MatchesError } = await supabaseAdmin
          .from('tournament_matches')
          .select('id,tournament_id,club_id,team1_id,team2_id,phase,status,winner_team_id,score')
          .eq('club_id', clubId)
          .in('team2_id', teamIds)

        if (team2MatchesError) {
          if (isMissingSchemaError(team2MatchesError.message)) {
            warnings.push('No pude derivar estadísticas de partidos porque tournament_matches no está documentada/disponible en el schema actual.')
          } else {
            return NextResponse.json({ error: team2MatchesError.message }, { status: 500 })
          }
        }

        const byId = new Map<string, MatchRow>()
        for (const match of [...((team1Matches ?? []) as MatchRow[]), ...((team2Matches ?? []) as MatchRow[])]) {
          byId.set(match.id, match)
        }
        matches = Array.from(byId.values())
      }
    }

    const tournamentIds = Array.from(
      new Set([
        ...teams.map((team) => team.tournament_id),
        ...registrations.map((registration) => registration.tournament_id),
        ...matches.map((match) => match.tournament_id),
      ].filter(Boolean))
    )

    let tournaments = new Map<string, TournamentRow>()
    if (tournamentIds.length > 0) {
      const { data: tournamentRows, error: tournamentsError } = await supabaseAdmin
        .from('tournaments')
        .select('id,name,starts_on,start_date,status')
        .eq('club_id', clubId)
        .in('id', tournamentIds)

      if (tournamentsError) return NextResponse.json({ error: tournamentsError.message }, { status: 500 })
      tournaments = new Map(((tournamentRows ?? []) as TournamentRow[]).map((tournament) => [tournament.id, tournament]))
    }

    const playerStats = new Map<string, PlayerStats>()
    for (const player of players) {
      playerStats.set(player.user_id, {
        tournamentsPlayed: new Set(),
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        finals: 0,
        titles: 0,
      })
    }

    for (const registration of registrations) {
      if (String(registration.status).toUpperCase() === 'CANCELLED') continue
      const team = teamsById.get(registration.team_id)
      if (!team) continue
      for (const playerId of [team.player1_user_id, team.player2_user_id]) {
        playerStats.get(playerId)?.tournamentsPlayed.add(registration.tournament_id)
      }
    }

    const pairStats = new Map<string, PairStats>()
    for (const team of teams) {
      const pairKey = getPairKey(team.player1_user_id, team.player2_user_id)
      const pair = pairStats.get(pairKey) ?? {
        pairKey,
        player1_user_id: [team.player1_user_id, team.player2_user_id].sort()[0],
        player2_user_id: [team.player1_user_id, team.player2_user_id].sort()[1],
        teamIds: new Set<string>(),
        tournamentsPlayed: new Set<string>(),
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        bestResult: null,
        latestTournamentAt: null,
      }
      pair.teamIds.add(team.id)
      pairStats.set(pairKey, pair)
    }

    for (const registration of registrations) {
      if (String(registration.status).toUpperCase() === 'CANCELLED') continue
      const team = teamsById.get(registration.team_id)
      if (!team) continue
      const pair = pairStats.get(getPairKey(team.player1_user_id, team.player2_user_id))
      if (!pair) continue
      pair.tournamentsPlayed.add(registration.tournament_id)
      const tournament = tournaments.get(registration.tournament_id)
      const tournamentDate = tournament?.starts_on ?? tournament?.start_date ?? registration.created_at ?? null
      if (tournamentDate && (!pair.latestTournamentAt || tournamentDate > pair.latestTournamentAt)) {
        pair.latestTournamentAt = tournamentDate
      }
    }

    for (const match of matches) {
      if (String(match.status).toUpperCase() !== 'PLAYED') continue
      const matchTeams = [match.team1_id, match.team2_id]
      for (const teamId of matchTeams) {
        const team = teamsById.get(teamId)
        if (!team) continue

        const isWinner = match.winner_team_id === teamId
        for (const playerId of [team.player1_user_id, team.player2_user_id]) {
          const stats = playerStats.get(playerId)
          if (!stats) continue
          stats.matchesPlayed += 1
          if (isWinner) stats.wins += 1
          else stats.losses += 1
          if (normalizePhase(match.phase) === 'FINAL') {
            stats.finals += 1
            if (isWinner) stats.titles += 1
          }
        }

        const pair = pairStats.get(getPairKey(team.player1_user_id, team.player2_user_id))
        if (!pair) continue
        pair.matchesPlayed += 1
        if (isWinner) pair.wins += 1
        else pair.losses += 1

        const result = getMatchResultForTeam(match, teamId)
        if (getResultRank(result) > getResultRank(pair.bestResult)) {
          pair.bestResult = result
        }
      }
    }

    const pointsByUserId = new Map(players.map((player) => [player.user_id, normalizePoints(player.ranking_points)]))

    const individual = players
      .map((player) => {
        const profile = profiles.get(player.user_id) ?? null
        const stats = playerStats.get(player.user_id)
        const rankingPoints = normalizePoints(player.ranking_points)
        return {
          player_id: player.id,
          user_id: player.user_id,
          full_name: getFullName(profile, player.display_name),
          avatar_url: profile?.avatar_url ?? null,
          category: player.category,
          gender: player.gender,
          ranking_points: rankingPoints,
          tournaments_played: stats?.tournamentsPlayed.size ?? 0,
          matches_played: stats?.matchesPlayed ?? 0,
          wins: stats?.wins ?? 0,
          losses: stats?.losses ?? 0,
          titles: stats?.titles ?? 0,
          finals: stats?.finals ?? 0,
          approved_at: player.approved_at,
        }
      })
      .sort((a, b) => {
        const pointsDiff = b.ranking_points - a.ranking_points
        if (pointsDiff !== 0) return pointsDiff
        const titlesDiff = b.titles - a.titles
        if (titlesDiff !== 0) return titlesDiff
        const winsDiff = b.wins - a.wins
        if (winsDiff !== 0) return winsDiff
        return a.full_name.localeCompare(b.full_name)
      })
      .map((player, index) => ({ ...player, position: index + 1 }))

    const pairs = Array.from(pairStats.values())
      .filter((pair) => pair.tournamentsPlayed.size > 0 || pair.matchesPlayed > 0)
      .map((pair) => {
        const player1Profile = profiles.get(pair.player1_user_id) ?? null
        const player2Profile = profiles.get(pair.player2_user_id) ?? null
        const player1 = players.find((player) => player.user_id === pair.player1_user_id) ?? null
        const player2 = players.find((player) => player.user_id === pair.player2_user_id) ?? null
        const combinedPoints = (pointsByUserId.get(pair.player1_user_id) ?? 0) + (pointsByUserId.get(pair.player2_user_id) ?? 0)
        return {
          pair_key: pair.pairKey,
          player1_user_id: pair.player1_user_id,
          player2_user_id: pair.player2_user_id,
          player1_name: getFullName(player1Profile, player1?.display_name ?? null),
          player2_name: getFullName(player2Profile, player2?.display_name ?? null),
          player1_avatar_url: player1Profile?.avatar_url ?? null,
          player2_avatar_url: player2Profile?.avatar_url ?? null,
          category: player1?.category ?? player2?.category ?? null,
          gender: player1?.gender ?? player2?.gender ?? null,
          combined_points: combinedPoints,
          tournaments_together: pair.tournamentsPlayed.size,
          matches_played: pair.matchesPlayed,
          wins: pair.wins,
          losses: pair.losses,
          best_result: pair.bestResult ?? 'Sin datos suficientes',
          latest_tournament_at: pair.latestTournamentAt,
        }
      })
      .sort((a, b) => {
        const pointsDiff = b.combined_points - a.combined_points
        if (pointsDiff !== 0) return pointsDiff
        const winsDiff = b.wins - a.wins
        if (winsDiff !== 0) return winsDiff
        return `${a.player1_name} ${a.player2_name}`.localeCompare(`${b.player1_name} ${b.player2_name}`)
      })
      .map((pair, index) => ({ ...pair, position: index + 1 }))

    if (!warnings.some((warning) => warning.includes('supabase_full.sql'))) {
      warnings.push('Deuda detectada: supabase_full.sql/docs no reflejan completamente tournament_matches ni ranking_points, aunque el código actual los usa.')
    }

    return NextResponse.json({
      meta: {
        source: 'derived',
        individualSource: 'club_players.ranking_points',
        pairSource: 'tournament_teams grouped by ordered players',
        generatedAt: new Date().toISOString(),
        warnings,
      },
      individual,
      pairs,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error derivando ranking del club.') }, { status: 500 })
  }
}
