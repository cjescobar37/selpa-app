import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type OperationalStage =
  | 'BORRADOR'
  | 'INSCRIPCIONES'
  | 'LISTO_PARA_INICIAR'
  | 'GRUPOS'
  | 'PLAYOFF'
  | 'FINALIZADO'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  status: string | null
  type: string | null
  tournament_type: string | null
  format: string | null
  gender: string | null
  segment: string | null
  category_id: number | null
  category: number | null
  fixed_category_id: number | null
  start_date: string | null
  starts_on: string | null
  end_date: string | null
  ends_on: string | null
  registration_deadline: string | null
  signup_deadline: string | null
  min_pairs: number | null
  max_pairs: number | null
  price_per_player: number | null
  points_total: number | null
  created_at: string
  updated_at: string
}

type RegistrationRow = {
  status: string | null
}

type TeamRow = {
  id: string
  player1_user_id: string | null
  player2_user_id: string | null
}

type MatchRow = {
  id: string
  phase: string | null
  status: string | null
  team1_id: string | null
  team2_id: string | null
  winner_team_id: string | null
  score: Record<string, unknown> | null
  round: number | null
  match_order: number | null
  created_at: string | null
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
}

const playoffPhaseOrder = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL'] as const

function getPlayoffPhaseIndex(phase?: string | null) {
  const cleanPhase = String(phase ?? '').trim().toUpperCase()
  const foundIndex = playoffPhaseOrder.indexOf(cleanPhase as (typeof playoffPhaseOrder)[number])
  return foundIndex >= 0 ? foundIndex : Number.MAX_SAFE_INTEGER
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

function getDate(primary: string | null, legacy: string | null) {
  return primary ?? legacy ?? null
}

function getCategoryId(row: TournamentRow) {
  return row.fixed_category_id ?? row.category_id ?? row.category ?? null
}

function getTournamentType(row: TournamentRow) {
  return row.tournament_type ?? row.type ?? null
}

function isFinishedStatus(status: string) {
  return status === 'FINISHED' || status === 'COMPLETED'
}

function isOpenStatus(status: string) {
  return status === 'OPEN' || status === 'PUBLISHED' || status === 'REGISTRATION_OPEN'
}

function getFullName(profile?: ProfileRow | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Jugador'
  )
}

function getTeamUserIds(team?: TeamRow | null) {
  return [team?.player1_user_id, team?.player2_user_id].filter(Boolean) as string[]
}

function getTeamName(team: TeamRow | null | undefined, profilesByUserId: Map<string, ProfileRow>) {
  const userIds = getTeamUserIds(team)
  if (userIds.length === 0) return null
  return userIds.map((userId) => getFullName(profilesByUserId.get(userId))).join(' / ')
}

function deriveOperationalStage(input: {
  status: string
  groupCount: number
  groupMatchesTotal: number
  playoffMatchesCount: number
  hasChampion: boolean
}): OperationalStage {
  if (input.hasChampion || isFinishedStatus(input.status)) return 'FINALIZADO'
  if (input.status === 'DRAFT') return 'BORRADOR'
  if (input.playoffMatchesCount > 0) return 'PLAYOFF'
  if (input.groupCount > 0 || input.groupMatchesTotal > 0) return 'GRUPOS'
  if (isOpenStatus(input.status)) return 'INSCRIPCIONES'
  return 'INSCRIPCIONES'
}

function deriveNextStep(input: {
  stage: OperationalStage
  confirmedRegistrations: number
  minPairs: number
  groupMatchesPlayed: number
  groupMatchesTotal: number
  playoffMatchesCount: number
}) {
  if (input.stage === 'BORRADOR') return 'Publicá el torneo para abrir inscripciones.'
  if (input.stage === 'INSCRIPCIONES') {
    if (input.confirmedRegistrations < input.minPairs) return 'Esperando llegar al mínimo de parejas.'
    return 'Ya podés preparar grupos.'
  }
  if (input.stage === 'LISTO_PARA_INICIAR') return 'Ya podés preparar grupos.'
  if (input.stage === 'GRUPOS') {
    if (input.groupMatchesTotal === 0) return 'Prepará los grupos y partidos iniciales.'
    if (input.groupMatchesPlayed < input.groupMatchesTotal) return 'Cargá resultados de grupos para avanzar.'
    return 'Ya podés generar playoff.'
  }
  if (input.stage === 'PLAYOFF') {
    if (input.playoffMatchesCount > 0) return 'Cargá resultados de playoff para definir el campeón.'
    return 'Ya podés generar playoff.'
  }
  return 'Torneo finalizado.'
}

function deriveCurrentPlayoffPhase(matches: MatchRow[]) {
  const playoffMatches = matches
    .filter((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
    .filter((match) => getPlayoffPhaseIndex(match.phase) !== Number.MAX_SAFE_INTEGER)
    .sort((left, right) => {
      const phaseDiff = getPlayoffPhaseIndex(left.phase) - getPlayoffPhaseIndex(right.phase)
      if (phaseDiff !== 0) return phaseDiff
      const roundDiff = (left.round ?? 0) - (right.round ?? 0)
      if (roundDiff !== 0) return roundDiff
      const orderDiff = (left.match_order ?? 0) - (right.match_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''))
    })

  if (playoffMatches.length === 0) return null
  const pendingMatch = playoffMatches.find((match) => String(match.status ?? '').toUpperCase() !== 'PLAYED')
  return String((pendingMatch ?? playoffMatches.at(-1))?.phase ?? '').toUpperCase() || null
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para ver el torneo.' }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,type,tournament_type,format,gender,segment,category_id,category,fixed_category_id,start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,min_pairs,max_pairs,price_per_player,points_total,created_at,updated_at')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
    }

    const tournamentRow = tournament as TournamentRow
    const categoryId = getCategoryId(tournamentRow)

    let categoryName: string | null = categoryId ? `Categoría ${categoryId}` : null
    if (categoryId) {
      const { data: category } = await supabaseAdmin
        .from('categories')
        .select('id,name')
        .eq('id', categoryId)
        .maybeSingle()

      if (category?.name) categoryName = category.name
    }

    const { data: registrations, error: registrationsError } = await supabaseAdmin
      .from('tournament_registrations')
      .select('status')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)

    if (registrationsError) {
      return NextResponse.json({ error: registrationsError.message }, { status: 500 })
    }

    const registrationRows = (registrations ?? []) as RegistrationRow[]
    const registrationCounts = {
      total: registrationRows.length,
      pending: registrationRows.filter((row) => row.status === 'PENDING').length,
      confirmed: registrationRows.filter((row) => row.status === 'CONFIRMED').length,
      cancelled: registrationRows.filter((row) => row.status === 'CANCELLED').length,
    }

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,player1_user_id,player2_user_id')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 })
    }

    const teamRows = (teams ?? []) as TeamRow[]
    const teamsById = new Map(teamRows.map((team) => [team.id, team]))

    const { count: groupCount, error: groupsError } = await supabaseAdmin
      .from('tournament_groups')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 })
    }

    const { data: matches, error: matchesError } = await supabaseAdmin
      .from('tournament_matches')
      .select('id,phase,status,team1_id,team2_id,winner_team_id,score,round,match_order,created_at')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)

    if (matchesError) {
      return NextResponse.json({ error: matchesError.message }, { status: 500 })
    }

    const matchRows = (matches ?? []) as MatchRow[]
    const groupMatches = matchRows.filter((match) => String(match.phase ?? '').toUpperCase() === 'GROUP')
    const playoffMatches = matchRows.filter((match) => String(match.phase ?? '').toUpperCase() !== 'GROUP')
    const currentPlayoffPhase = deriveCurrentPlayoffPhase(matchRows)
    const finalMatch = playoffMatches
      .filter((match) => String(match.phase ?? '').toUpperCase() === 'FINAL')
      .sort((a, b) => {
        const roundDiff = (a.round ?? 0) - (b.round ?? 0)
        if (roundDiff !== 0) return roundDiff
        const orderDiff = (a.match_order ?? 0) - (b.match_order ?? 0)
        if (orderDiff !== 0) return orderDiff
        return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      })
      .at(-1) ?? null

    const championTeamId =
      finalMatch?.status === 'PLAYED' && finalMatch.winner_team_id ? finalMatch.winner_team_id : null
    const runnerUpTeamId =
      championTeamId && finalMatch?.team1_id && finalMatch.team2_id
        ? finalMatch.team1_id === championTeamId
          ? finalMatch.team2_id
          : finalMatch.team1_id
        : null
    const championTeam = championTeamId ? teamsById.get(championTeamId) ?? null : null
    const runnerUpTeam = runnerUpTeamId ? teamsById.get(runnerUpTeamId) ?? null : null

    let championName: string | null = null
    let runnerUpName: string | null = null
    if (championTeam || runnerUpTeam) {
      const userIds = Array.from(new Set([
        ...getTeamUserIds(championTeam),
        ...getTeamUserIds(runnerUpTeam),
      ]))
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('user_id,email,first_name,last_name,display_name')
        .in('user_id', userIds)

      const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
      championName = getTeamName(championTeam, profileMap)
      runnerUpName = getTeamName(runnerUpTeam, profileMap)
    }

    const status = String(tournamentRow.status ?? 'DRAFT').toUpperCase()
    const minPairs = Number(tournamentRow.min_pairs ?? 6)
    const groupMatchesPlayed = groupMatches.filter((match) => match.status === 'PLAYED').length
    const operationalStage = deriveOperationalStage({
      status,
      groupCount: groupCount ?? 0,
      groupMatchesTotal: groupMatches.length,
      playoffMatchesCount: playoffMatches.length,
      hasChampion: Boolean(championTeamId),
    })
    const nextStep = deriveNextStep({
      stage: operationalStage,
      confirmedRegistrations: registrationCounts.confirmed,
      minPairs,
      groupMatchesPlayed,
      groupMatchesTotal: groupMatches.length,
      playoffMatchesCount: playoffMatches.length,
    })

    return NextResponse.json({
      tournament: {
        id: tournamentRow.id,
        club_id: tournamentRow.club_id,
        name: tournamentRow.name,
        status,
        type: getTournamentType(tournamentRow),
        format: tournamentRow.format,
        gender: tournamentRow.gender,
        segment: tournamentRow.segment ?? 'LIBRES',
        category_id: categoryId,
        category_name: categoryName,
        start_date: getDate(tournamentRow.starts_on, tournamentRow.start_date),
        end_date: getDate(tournamentRow.ends_on, tournamentRow.end_date),
        registration_deadline: getDate(tournamentRow.registration_deadline, tournamentRow.signup_deadline),
        min_pairs: tournamentRow.min_pairs,
        max_pairs: tournamentRow.max_pairs,
        price_per_player: tournamentRow.price_per_player,
        points_total: tournamentRow.points_total,
        created_at: tournamentRow.created_at,
        updated_at: tournamentRow.updated_at,
      },
      counts: {
        registrations: registrationCounts,
        teams: teamRows.length,
        groups: groupCount ?? 0,
        groupMatches: {
          played: groupMatchesPlayed,
          total: groupMatches.length,
        },
        playoffMatches: playoffMatches.length,
      },
      final: finalMatch
        ? {
            id: finalMatch.id,
            status: finalMatch.status,
            team1_id: finalMatch.team1_id,
            team2_id: finalMatch.team2_id,
            winner_team_id: finalMatch.winner_team_id,
            score: finalMatch.score,
          }
        : null,
      champion: championTeamId
        ? {
            team_id: championTeamId,
            name: championName ?? 'Equipo campeón',
          }
        : null,
      runnerUp: runnerUpTeamId
        ? {
            team_id: runnerUpTeamId,
            name: runnerUpName ?? 'Equipo subcampeón',
          }
        : null,
      operationalStage,
      currentPlayoffPhase,
      nextStep,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo resumen del torneo.') }, { status: 500 })
  }
}
