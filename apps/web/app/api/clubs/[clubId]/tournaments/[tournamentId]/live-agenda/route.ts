import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildTournamentLiveAgenda } from '@/lib/tournamentLiveAgenda'
import { listMatchesByTournament } from '@/lib/tournamentMatches'
import { normalizeScheduleConfig, readMatchScheduleAssignments } from '@/lib/tournamentSchedule'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  status: string | null
  start_date: string | null
  starts_on: string | null
  end_date: string | null
  ends_on: string | null
  rules_json: Record<string, unknown> | null
}

type MatchRow = {
  id: string
  team1_id: string | null
  team2_id: string | null
  phase: string | null
  round: number | null
  match_order: number | null
  status: string | null
  scheduled_at: string | null
}

type TeamRow = {
  id: string
  player1_user_id: string
  player2_user_id: string
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
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

function getFullName(profile?: ProfileRow | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Jugador'
  )
}

function getTeamName(team: TeamRow | null, profiles: Map<string, ProfileRow>) {
  if (!team) return 'Equipo'
  const player1 = getFullName(profiles.get(team.player1_user_id) ?? null)
  const player2 = getFullName(profiles.get(team.player2_user_id) ?? null)
  return `${player1} / ${player2}`
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
      return NextResponse.json({ error: 'No autorizado para ver la agenda del torneo.' }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,start_date,starts_on,end_date,ends_on,rules_json')
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
    const rules = tournamentRow.rules_json && typeof tournamentRow.rules_json === 'object'
      ? tournamentRow.rules_json
      : {}
    const scheduleConfig = normalizeScheduleConfig(rules.schedule_config, {
      startDate: tournamentRow.starts_on ?? tournamentRow.start_date,
      endDate: tournamentRow.ends_on ?? tournamentRow.end_date ?? tournamentRow.starts_on ?? tournamentRow.start_date,
    })
    const matchScheduleAssignments = readMatchScheduleAssignments(rules.match_schedule_assignments)
    const { matches } = await listMatchesByTournament({ clubId, tournamentId })
    const matchRows = (matches ?? []) as MatchRow[]

    const { data: teamRows, error: teamsError } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,player1_user_id,player2_user_id')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true })

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 })
    }

    const teamList = (teamRows ?? []) as TeamRow[]
    const teams = new Map(teamList.map((team) => [team.id, team]))
    const userIds = Array.from(
      new Set(
        teamList
          .flatMap((team) => [team.player1_user_id, team.player2_user_id])
          .filter(Boolean)
      )
    )

    let profiles = new Map<string, ProfileRow>()
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('user_id,email,first_name,last_name,display_name')
        .in('user_id', userIds)

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 })
      }

      profiles = new Map(((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
    }

    const agendaMatches = matchRows.map((match) => {
      const team1 = match.team1_id ? teams.get(match.team1_id) ?? null : null
      const team2 = match.team2_id ? teams.get(match.team2_id) ?? null : null
      const assignment = matchScheduleAssignments[match.id]

      return {
        id: match.id,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        team1_name: getTeamName(team1, profiles),
        team2_name: getTeamName(team2, profiles),
        phase: match.phase,
        round: match.round,
        match_order: match.match_order,
        status: match.status,
        scheduled_at: match.scheduled_at,
        court_name: assignment?.court_name ?? null,
        court_id: assignment?.court_id ?? null,
        court_source: assignment?.court_source ?? null,
      }
    })

    const agenda = buildTournamentLiveAgenda(agendaMatches, scheduleConfig)

    return NextResponse.json({
      tournament: {
        id: tournamentRow.id,
        club_id: tournamentRow.club_id,
        name: tournamentRow.name,
        status: tournamentRow.status,
      },
      scheduleConfig,
      courts: agenda.courts,
      timeline: agenda.timeline,
      teams: agenda.teams,
      metrics: agenda.metrics,
      meta: {
        source: 'derived',
        persisted: false,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo agenda viva del torneo.') }, { status: 500 })
  }
}
