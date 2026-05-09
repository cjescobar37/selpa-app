import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { createMatch, listMatchesByTournament, type MatchPhase } from '@/lib/tournamentMatches'
import { readMatchScheduleAssignments } from '@/lib/tournamentSchedule'

type MatchRow = {
  id: string
  tournament_id: string
  club_id: string
  team1_id: string
  team2_id: string
  round: number
  phase: string
  status: string
  score: Record<string, unknown> | null
  winner_team_id: string | null
  match_order: number
  scheduled_at: string | null
  created_at: string
  updated_at: string
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

function normalizePositiveInt(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizePhase(value: unknown): MatchPhase | null {
  const phase = String(value ?? 'GROUP').trim().toUpperCase()
  const phases: MatchPhase[] = [
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
  return phases.includes(phase as MatchPhase) ? phase as MatchPhase : null
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
      return NextResponse.json({ error: 'No autorizado para ver partidos.' }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,start_date,starts_on,rules_json')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
    }
    const matchScheduleAssignments = readMatchScheduleAssignments(
      tournament && typeof tournament === 'object' && 'rules_json' in tournament
        ? (tournament.rules_json as Record<string, unknown> | null)?.match_schedule_assignments
        : null
    )

    const { matches } = await listMatchesByTournament({ clubId, tournamentId })
    const rows = (matches ?? []) as MatchRow[]

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

    return NextResponse.json({
      tournament,
      teams: teamList.map((team) => ({
        id: team.id,
        name: getTeamName(team, profiles),
        player1_user_id: team.player1_user_id,
        player2_user_id: team.player2_user_id,
      })),
      matches: rows.map((match) => {
        const team1 = teams.get(match.team1_id) ?? null
        const team2 = teams.get(match.team2_id) ?? null

        return {
          ...match,
          court_name: matchScheduleAssignments[match.id]?.court_name ?? null,
          court_id: matchScheduleAssignments[match.id]?.court_id ?? null,
          court_source: matchScheduleAssignments[match.id]?.court_source ?? null,
          team1_name: getTeamName(team1, profiles),
          team2_name: getTeamName(team2, profiles),
          team1: team1
            ? {
                id: team1.id,
                name: getTeamName(team1, profiles),
                player1_user_id: team1.player1_user_id,
                player2_user_id: team1.player2_user_id,
              }
            : null,
          team2: team2
            ? {
                id: team2.id,
                name: getTeamName(team2, profiles),
                player1_user_id: team2.player1_user_id,
                player2_user_id: team2.player2_user_id,
              }
            : null,
        }
      }),
      meta: {
        matches_available: true,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo partidos del torneo.') }, { status: 500 })
  }
}

export async function POST(
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
      return NextResponse.json({ error: 'No autorizado para crear partidos.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const team1Id = String(body?.team1_id ?? '').trim()
    const team2Id = String(body?.team2_id ?? '').trim()
    const round = normalizePositiveInt(body?.round, 1)
    const phase = normalizePhase(body?.phase)

    if (!team1Id || !team2Id) {
      return NextResponse.json({ error: 'Seleccioná ambos equipos.' }, { status: 400 })
    }

    if (team1Id === team2Id) {
      return NextResponse.json({ error: 'Los equipos deben ser distintos.' }, { status: 400 })
    }

    if (!round) {
      return NextResponse.json({ error: 'La ronda debe ser un entero positivo.' }, { status: 400 })
    }

    if (!phase) {
      return NextResponse.json({ error: 'Fase inválida.' }, { status: 400 })
    }

    const result = await createMatch({
      clubId,
      tournamentId,
      team1Id,
      team2Id,
      round,
      phase,
    })

    return NextResponse.json({ ok: true, match: result.match }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error creando partido.') }, { status: 500 })
  }
}
