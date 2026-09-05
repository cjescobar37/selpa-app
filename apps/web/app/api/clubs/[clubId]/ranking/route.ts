import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { withRankingPositions } from '@/lib/ranking'
import { getCompetitionRanking, getRankingEngineSource } from '@/features/competition/ranking/competition-ranking.service'
import { mapCompetitionRankingToLegacyContract } from '@/features/competition/ranking/competition-ranking.mapper'

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

type ActivePartnershipRow = {
  id: string
  player1_club_player_id: string
  player2_club_player_id: string
}

type CompetitionPairProjectionRow = {
  club_id: string
  season_id: string
  division_id: string
  player1_user_id: string
  player2_user_id: string
  pair_key: string
  total_points: number
  settled_results: number
}

type ClubCategoryRow = {
  category_id: number
  is_enabled: boolean
}

type CategoryRow = {
  id: number
  name: string
}

type PlayerStats = {
  tournamentsPlayed: Set<string>
  matchesPlayed: number
  wins: number
  losses: number
  finals: number
  titles: number
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

function getIndividualPlayerName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.display_name ||
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
    const rankingEngineSource = getRankingEngineSource()

    const { data: playersData, error: playersError } = await supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at,created_at')
      .eq('club_id', clubId)
      .not('approved_at', 'is', null)

    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

    const players = (playersData ?? []) as PlayerRow[]
    const userIds = Array.from(new Set(players.map((player) => player.user_id).filter(Boolean)))
    const playersByClubPlayerId = new Map(players.map((player) => [player.id, player]))

    const activePartnerships: ActivePartnershipRow[] = []
    const { data: partnershipsData, error: partnershipsError } = await supabaseAdmin
      .from('player_active_partnerships')
      .select('id,player1_club_player_id,player2_club_player_id')
      .eq('club_id', clubId)
      .eq('status', 'ACTIVE')

    if (partnershipsError) {
      if (isMissingSchemaError(partnershipsError.message)) {
        warnings.push('Parejas confirmadas no disponibles: falta player_active_partnerships en el schema activo.')
      } else {
        return NextResponse.json({ error: partnershipsError.message }, { status: 500 })
      }
    } else {
      const partnerships = (partnershipsData ?? []) as ActivePartnershipRow[]
      for (const partnership of partnerships) {
        const player1 = playersByClubPlayerId.get(partnership.player1_club_player_id)
        const player2 = playersByClubPlayerId.get(partnership.player2_club_player_id)
        if (!player1?.user_id || !player2?.user_id) continue
        activePartnerships.push(partnership)
      }
    }

    const { data: clubCategoriesData, error: clubCategoriesError } = await supabaseAdmin
      .from('club_categories')
      .select('category_id,is_enabled')
      .eq('club_id', clubId)
      .eq('is_enabled', true)

    if (clubCategoriesError) return NextResponse.json({ error: clubCategoriesError.message }, { status: 500 })
    const configuredCategoryIds = ((clubCategoriesData ?? []) as ClubCategoryRow[]).map((row) => Number(row.category_id))
    let configuredCategories: CategoryRow[] = []
    if (configuredCategoryIds.length) {
      const { data: categoriesData, error: categoriesError } = await supabaseAdmin
        .from('categories')
        .select('id,name')
        .in('id', configuredCategoryIds)
        .order('id', { ascending: true })
      if (categoriesError) return NextResponse.json({ error: categoriesError.message }, { status: 500 })
      configuredCategories = (categoriesData ?? []) as CategoryRow[]
    }

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

      }
    }

    const legacyIndividual = players
      .map((player) => {
        const profile = profiles.get(player.user_id) ?? null
        const stats = playerStats.get(player.user_id)
        const rankingPoints = normalizePoints(player.ranking_points)
        return {
          player_id: player.id,
          user_id: player.user_id,
          full_name: getIndividualPlayerName(profile, player.display_name),
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
    const rankedLegacyIndividual = withRankingPositions(legacyIndividual, 'position')
    let rankedIndividual = rankedLegacyIndividual
    let competitionRows: Awaited<ReturnType<typeof getCompetitionRanking>>['rows'] = []
    if (rankingEngineSource === 'competition') {
      const competitionStats = new Map(Array.from(playerStats.entries()).map(([userId, stats]) => [userId, {
        tournamentsPlayed: stats.tournamentsPlayed.size,
        matchesPlayed: stats.matchesPlayed,
        wins: stats.wins,
        losses: stats.losses,
        titles: stats.titles,
        finals: stats.finals,
      }]))
      const competition = await getCompetitionRanking(clubId, competitionStats)
      competitionRows = competition.rows
      rankedIndividual = competition.rows.map(mapCompetitionRankingToLegacyContract)
    }

    const legacyPairs = activePartnerships
      .map((partnership) => {
        const player1 = playersByClubPlayerId.get(partnership.player1_club_player_id) ?? null
        const player2 = playersByClubPlayerId.get(partnership.player2_club_player_id) ?? null
        if (!player1 || !player2) return null
        const player1Profile = profiles.get(player1.user_id) ?? null
        const player2Profile = profiles.get(player2.user_id) ?? null
        const combinedPoints = normalizePoints(player1.ranking_points) + normalizePoints(player2.ranking_points)
        const sameCategory = player1.category === player2.category ? player1.category : null
        const sameGender = String(player1.gender ?? '').toUpperCase() === String(player2.gender ?? '').toUpperCase() ? player1.gender : null
        return {
          partnership_id: partnership.id,
          pair_key: getPairKey(player1.user_id, player2.user_id),
          player1_user_id: player1.user_id,
          player2_user_id: player2.user_id,
          player1_name: getFullName(player1Profile, player1.display_name),
          player2_name: getFullName(player2Profile, player2.display_name),
          player1_avatar_url: player1Profile?.avatar_url ?? null,
          player2_avatar_url: player2Profile?.avatar_url ?? null,
          player1_points: normalizePoints(player1.ranking_points),
          player2_points: normalizePoints(player2.ranking_points),
          category: sameCategory,
          gender: sameGender,
          combined_points: combinedPoints,
        }
      })
      .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
      .sort((a, b) => {
        const pointsDiff = b.combined_points - a.combined_points
        if (pointsDiff !== 0) return pointsDiff
        return a.pair_key.localeCompare(b.pair_key)
      })

    let previousPairPoints: number | null = null
    let previousPairPosition = 0
    let rankedPairs = legacyPairs.map((pair, index) => {
      const position = previousPairPoints === pair.combined_points ? previousPairPosition : index + 1
      previousPairPoints = pair.combined_points
      previousPairPosition = position
      return { ...pair, position }
    })

    if (rankingEngineSource === 'competition') {
      const { data: projectionData, error: projectionError } = await supabaseAdmin
        .from('competition_pair_ranking_projection')
        .select('club_id,season_id,division_id,player1_user_id,player2_user_id,pair_key,total_points,settled_results')
        .eq('club_id', clubId)

      if (projectionError) {
        if (isMissingSchemaError(projectionError.message)) {
          warnings.push('El ranking de parejas estará disponible cuando se aplique la proyección competitiva.')
          rankedPairs = []
        } else {
          return NextResponse.json({ error: projectionError.message }, { status: 500 })
        }
      } else {
        const competitorByUser = new Map(competitionRows.map((row) => [row.userId, row]))
        const projectedPairs = ((projectionData ?? []) as CompetitionPairProjectionRow[])
          .map((pair) => {
            const player1 = competitorByUser.get(pair.player1_user_id)
            const player2 = competitorByUser.get(pair.player2_user_id)
            if (!player1 || !player2 || player1.divisionId !== pair.division_id || player2.divisionId !== pair.division_id) return null
            return {
              partnership_id: pair.pair_key,
              pair_key: pair.pair_key,
              player1_user_id: pair.player1_user_id,
              player2_user_id: pair.player2_user_id,
              player1_name: player1.fullName,
              player2_name: player2.fullName,
              player1_avatar_url: player1.avatarUrl,
              player2_avatar_url: player2.avatarUrl,
              player1_points: pair.total_points,
              player2_points: pair.total_points,
              category: player1.category,
              gender: player1.gender,
              combined_points: Number(pair.total_points),
            }
          })
          .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
          .sort((a, b) => b.combined_points - a.combined_points || a.pair_key.localeCompare(b.pair_key))
        let previousPoints: number | null = null
        let previousPosition = 0
        rankedPairs = projectedPairs.map((pair, index) => {
          const position = previousPoints === pair.combined_points ? previousPosition : index + 1
          previousPoints = pair.combined_points
          previousPosition = position
          return { ...pair, position }
        })
      }
    }

    if (!warnings.some((warning) => warning.includes('supabase_full.sql'))) {
      warnings.push('Deuda detectada: supabase_full.sql/docs no reflejan completamente tournament_matches ni ranking_points, aunque el código actual los usa.')
    }

    const response = NextResponse.json({
      meta: {
        source: 'derived',
        individualSource: rankingEngineSource === 'competition' ? 'competition_point_transactions' : 'club_players.ranking_points',
        pairSource: rankingEngineSource === 'competition' ? 'competition_pair_ranking_projection' : 'player_active_partnerships ACTIVE + club_players.ranking_points',
        generatedAt: new Date().toISOString(),
        warnings,
      },
      individual: rankedIndividual,
      pairs: rankedPairs,
      categories: configuredCategories,
    })
    response.headers.set('X-Ranking-Engine-Source', rankingEngineSource)
    return response
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error derivando ranking del club.') }, { status: 500 })
  }
}
