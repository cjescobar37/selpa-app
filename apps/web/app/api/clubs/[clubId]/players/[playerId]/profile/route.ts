import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlayerRow = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  preferred_position: string | null
  approved_at: string | null
  created_at: string
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
  cover_url: string | null
  city: string | null
  birth_date: string | null
  height_cm: number | null
  dominant_hand: string | null
  preferred_position: string | null
}

type EditableProfilePayload = {
  display_name?: unknown
  city?: unknown
  birth_date?: unknown
  height_cm?: unknown
  dominant_hand?: unknown
  preferred_position?: unknown
  avatar_url?: unknown
  cover_url?: unknown
}

type TeamRow = {
  id: string
  tournament_id: string
  player1_user_id: string
  player2_user_id: string
  created_at: string
}

type RegistrationRow = {
  id: string
  tournament_id: string
  team_id: string
  status: string
  created_at: string
}

type MatchRow = {
  id: string
  tournament_id: string
  team1_id: string
  team2_id: string
  phase: string | null
  status: string
  winner_team_id: string | null
  score: unknown
  created_at: string
  scheduled_at: string | null
}

type TournamentRow = {
  id: string
  name: string
  category: number | null
  starts_on: string | null
  start_date: string | null
  status: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function fullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    fallback ||
    profile?.email ||
    'Jugador'
  )
}

function phaseResult(phase?: string | null, won?: boolean) {
  const normalized = String(phase ?? '').toUpperCase()
  if (normalized === 'FINAL') return won ? 'Campeón' : 'Finalista'
  if (normalized === 'SEMI') return won ? 'Semifinal' : 'Semifinalista'
  if (normalized === 'QUARTER') return won ? 'Cuartos' : 'Cuartos de final'
  if (normalized === 'ROUND_OF_16' || normalized === 'EIGHTHS') return 'Octavos'
  if (normalized === 'GROUP') return 'Grupos'
  return 'Sin datos suficientes'
}

function scoreLabel(score: unknown) {
  if (!score || typeof score !== 'object') return 'Sin score'
  const value = score as Record<string, unknown>
  if (typeof value.text === 'string' && value.text.trim()) return value.text
  const sets = Array.isArray(value.sets) ? value.sets : []
  if (sets.length) {
    return sets
      .map((set) => {
        if (!set || typeof set !== 'object') return null
        const row = set as Record<string, unknown>
        const a = row.team1 ?? row.team1_games ?? row.a
        const b = row.team2 ?? row.team2_games ?? row.b
        return a !== undefined && b !== undefined ? `${a}-${b}` : null
      })
      .filter(Boolean)
      .join(' ')
  }
  return 'Sin score'
}

function getTournamentDate(tournament?: TournamentRow | null) {
  return tournament?.starts_on ?? tournament?.start_date ?? null
}

function optionalText(value: unknown, max = 120) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function optionalDate(value: unknown) {
  const text = optionalText(value, 16)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function optionalHeight(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < 80 || rounded > 230) throw new Error('La altura debe estar entre 80 y 230 cm.')
  return rounded
}

function optionalHand(value: unknown) {
  const text = optionalText(value, 24)
  if (!text) return null
  const normalized = text.toUpperCase()
  if (['RIGHT', 'LEFT', 'AMBIDEXTROUS'].includes(normalized)) return normalized
  if (normalized === 'DERECHO') return 'RIGHT'
  if (normalized === 'IZQUIERDO') return 'LEFT'
  throw new Error('La mano hábil no es válida.')
}

function optionalPreferredPosition(value: unknown) {
  const text = optionalText(value, 16)
  if (!text) return null
  const normalized = text.toUpperCase()
  if (['DRIVE', 'REVES', 'BOTH'].includes(normalized)) return normalized
  throw new Error('La posición preferida no es válida.')
}

function optionalImageUrl(value: unknown) {
  const text = optionalText(value, 1000)
  if (!text) return null
  try {
    const parsed = new URL(text)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return text
  } catch {
    // ignore
  }
  throw new Error('La URL de imagen no es válida.')
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; playerId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

    const { clubId, playerId } = await context.params
    const { data: playerData, error: playerError } = await supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender,ranking_points,preferred_position,approved_at,created_at')
      .eq('club_id', clubId)
      .or(`id.eq.${playerId},user_id.eq.${playerId}`)
      .maybeSingle()

    if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })
    if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 })

    const player = playerData as PlayerRow
    const isOwnProfile = player.user_id === user.id
    if (!isOwnProfile) return NextResponse.json({ error: 'Este endpoint contiene datos privados del propietario.' }, { status: 403 })
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('user_id,email,first_name,last_name,display_name,avatar_url,cover_url,city,birth_date,height_cm,dominant_hand,preferred_position')
      .eq('user_id', player.user_id)
      .maybeSingle()

    const profile = (profileData ?? null) as ProfileRow | null

    const { data: teamsData, error: teamsError } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,tournament_id,player1_user_id,player2_user_id,created_at')
      .eq('club_id', clubId)
      .or(`player1_user_id.eq.${player.user_id},player2_user_id.eq.${player.user_id}`)

    if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
    const teams = (teamsData ?? []) as TeamRow[]
    const teamIds = teams.map((team) => team.id)
    const teamsById = new Map(teams.map((team) => [team.id, team]))

    let registrations: RegistrationRow[] = []
    let matches: MatchRow[] = []
    if (teamIds.length) {
      const [registrationsRes, matches1Res, matches2Res] = await Promise.all([
        supabaseAdmin
          .from('tournament_registrations')
          .select('id,tournament_id,team_id,status,created_at')
          .eq('club_id', clubId)
          .in('team_id', teamIds),
        supabaseAdmin
          .from('tournament_matches')
          .select('id,tournament_id,team1_id,team2_id,phase,status,winner_team_id,score,created_at,scheduled_at')
          .eq('club_id', clubId)
          .in('team1_id', teamIds),
        supabaseAdmin
          .from('tournament_matches')
          .select('id,tournament_id,team1_id,team2_id,phase,status,winner_team_id,score,created_at,scheduled_at')
          .eq('club_id', clubId)
          .in('team2_id', teamIds),
      ])

      if (registrationsRes.error) return NextResponse.json({ error: registrationsRes.error.message }, { status: 500 })
      if (matches1Res.error) return NextResponse.json({ error: matches1Res.error.message }, { status: 500 })
      if (matches2Res.error) return NextResponse.json({ error: matches2Res.error.message }, { status: 500 })
      registrations = (registrationsRes.data ?? []) as RegistrationRow[]
      const byId = new Map<string, MatchRow>()
      for (const match of [...((matches1Res.data ?? []) as MatchRow[]), ...((matches2Res.data ?? []) as MatchRow[])]) byId.set(match.id, match)
      matches = Array.from(byId.values())
    }

    const tournamentIds = Array.from(new Set([...teams.map((team) => team.tournament_id), ...matches.map((match) => match.tournament_id)]))
    const relatedTeamIds = Array.from(new Set(matches.flatMap((match) => [match.team1_id, match.team2_id]).filter(Boolean)))
    const missingTeamIds = relatedTeamIds.filter((id) => !teamsById.has(id))
    if (missingTeamIds.length) {
      const { data: relatedTeamsData, error: relatedTeamsError } = await supabaseAdmin
        .from('tournament_teams')
        .select('id,tournament_id,player1_user_id,player2_user_id,created_at')
        .eq('club_id', clubId)
        .in('id', missingTeamIds)

      if (relatedTeamsError) return NextResponse.json({ error: relatedTeamsError.message }, { status: 500 })
      for (const team of (relatedTeamsData ?? []) as TeamRow[]) teamsById.set(team.id, team)
    }

    let tournaments = new Map<string, TournamentRow>()
    if (tournamentIds.length) {
      const { data: tournamentData, error: tournamentError } = await supabaseAdmin
        .from('tournaments')
        .select('id,name,category,starts_on,start_date,status')
        .eq('club_id', clubId)
        .in('id', tournamentIds)

      if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
      tournaments = new Map(((tournamentData ?? []) as TournamentRow[]).map((tournament) => [tournament.id, tournament]))
    }

    const otherUserIds = Array.from(new Set(Array.from(teamsById.values()).flatMap((team) => [team.player1_user_id, team.player2_user_id]).filter((id) => id !== player.user_id)))
    let partnerProfiles = new Map<string, ProfileRow>()
    if (otherUserIds.length) {
      const { data: partnerData } = await supabaseAdmin
        .from('profiles')
        .select('user_id,email,first_name,last_name,display_name,avatar_url,cover_url,city,birth_date,height_cm,dominant_hand')
        .in('user_id', otherUserIds)
      partnerProfiles = new Map(((partnerData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]))
    }

    const playedMatches = matches.filter((match) => String(match.status).toUpperCase() === 'PLAYED')
    const wins = playedMatches.filter((match) => match.winner_team_id && teamIds.includes(match.winner_team_id)).length
    const losses = playedMatches.length - wins
    const finals = playedMatches.filter((match) => String(match.phase ?? '').toUpperCase() === 'FINAL').length
    const titles = playedMatches.filter((match) => String(match.phase ?? '').toUpperCase() === 'FINAL' && match.winner_team_id && teamIds.includes(match.winner_team_id)).length

    const partnerCounts = new Map<string, { userId: string; tournaments: Set<string>; matches: number }>()
    for (const team of teams) {
      const partnerId = team.player1_user_id === player.user_id ? team.player2_user_id : team.player1_user_id
      const current = partnerCounts.get(partnerId) ?? { userId: partnerId, tournaments: new Set<string>(), matches: 0 }
      current.tournaments.add(team.tournament_id)
      current.matches += matches.filter((match) => match.team1_id === team.id || match.team2_id === team.id).length
      partnerCounts.set(partnerId, current)
    }
    const frequentPartner = Array.from(partnerCounts.values()).sort((a, b) => b.tournaments.size - a.tournaments.size || b.matches - a.matches)[0] ?? null

    const tournamentsPlayed = registrations.filter((registration) => String(registration.status).toUpperCase() !== 'CANCELLED')
    const tournamentHistory = tournamentsPlayed.map((registration) => {
      const team = teamsById.get(registration.team_id)
      const tournament = tournaments.get(registration.tournament_id) ?? null
      const teamMatches = matches.filter((match) => match.team1_id === registration.team_id || match.team2_id === registration.team_id)
      const best = teamMatches
        .map((match) => phaseResult(match.phase, match.winner_team_id === registration.team_id))
        .sort((a, b) => ['Campeón', 'Finalista', 'Semifinalista', 'Cuartos de final', 'Octavos', 'Grupos', 'Sin datos suficientes'].indexOf(a) - ['Campeón', 'Finalista', 'Semifinalista', 'Cuartos de final', 'Octavos', 'Grupos', 'Sin datos suficientes'].indexOf(b))[0] ?? 'Sin datos suficientes'
      const partnerId = team ? (team.player1_user_id === player.user_id ? team.player2_user_id : team.player1_user_id) : null
      return {
        tournament_id: registration.tournament_id,
        tournament_name: tournament?.name ?? 'Torneo',
        date: getTournamentDate(tournament),
        category: tournament?.category ?? null,
        partner_name: partnerId ? fullName(partnerProfiles.get(partnerId), null) : 'Sin pareja',
        result: best,
        points: null,
      }
    })

    const recentMatches = playedMatches
      .sort((a, b) => String(b.scheduled_at ?? b.created_at).localeCompare(String(a.scheduled_at ?? a.created_at)))
      .slice(0, 8)
      .map((match) => {
        const ownTeamId = teamIds.includes(match.team1_id) ? match.team1_id : match.team2_id
        const rivalTeamId = ownTeamId === match.team1_id ? match.team2_id : match.team1_id
        const ownTeam = teamsById.get(ownTeamId)
        const rivalTeam = teamsById.get(rivalTeamId)
        const ownPartnerId = ownTeam ? (ownTeam.player1_user_id === player.user_id ? ownTeam.player2_user_id : ownTeam.player1_user_id) : null
        const rivalNames = rivalTeam
          ? [rivalTeam.player1_user_id, rivalTeam.player2_user_id].map((id) => fullName(partnerProfiles.get(id), null)).join(' / ')
          : 'Rival'
        return {
          id: match.id,
          date: match.scheduled_at ?? match.created_at,
          tournament_name: tournaments.get(match.tournament_id)?.name ?? 'Torneo',
          partner_name: ownPartnerId ? fullName(partnerProfiles.get(ownPartnerId), null) : 'Sin pareja',
          rival_name: rivalNames,
          result: match.winner_team_id === ownTeamId ? 'Ganado' : 'Perdido',
          score: scoreLabel(match.score),
        }
      })

    return NextResponse.json({
      player: {
        id: player.id,
        user_id: player.user_id,
        full_name: fullName(profile, player.display_name),
        display_name: player.display_name,
        category: player.category,
        gender: player.gender,
        ranking_points: Number(player.ranking_points ?? 0),
        preferred_position: profile?.preferred_position ?? player.preferred_position,
        approved_at: player.approved_at,
        created_at: player.created_at,
        is_manual: !profile?.email,
      },
      profile,
      stats: {
        tournaments_played: new Set(tournamentsPlayed.map((registration) => registration.tournament_id)).size,
        matches_played: playedMatches.length,
        wins,
        losses,
        effectiveness: playedMatches.length ? Math.round((wins / playedMatches.length) * 100) : null,
        finals,
        titles,
      },
      frequent_partner: frequentPartner
        ? {
            user_id: frequentPartner.userId,
            full_name: fullName(partnerProfiles.get(frequentPartner.userId), null),
            tournaments_together: frequentPartner.tournaments.size,
            matches_together: frequentPartner.matches,
          }
        : null,
      tournament_history: tournamentHistory.slice(0, 10),
      recent_matches: recentMatches,
      activity: [
        { id: 'joined', date: player.approved_at ?? player.created_at, title: 'Alta en el club', description: 'Jugador registrado en la comunidad deportiva.' },
        ...tournamentHistory.slice(0, 5).map((row) => ({
          id: `tournament-${row.tournament_id}`,
          date: row.date,
          title: row.tournament_name,
          description: `Participación con ${row.partner_name}. Resultado: ${row.result}.`,
        })),
      ],
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error leyendo perfil.' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; playerId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

    const { clubId, playerId } = await context.params
    const { data: playerData, error: playerError } = await supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender,ranking_points,preferred_position,approved_at,created_at')
      .eq('club_id', clubId)
      .or(`id.eq.${playerId},user_id.eq.${playerId}`)
      .maybeSingle()

    if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })
    if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 })

    const player = playerData as PlayerRow
    if (player.user_id !== user.id) {
      return NextResponse.json({ error: 'Solo podés editar tu propio perfil jugador.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as EditableProfilePayload
    const displayName = optionalText(body.display_name, 90)
    const city = optionalText(body.city, 90)
    const birthDate = optionalDate(body.birth_date)
    const heightCm = optionalHeight(body.height_cm)
    const dominantHand = optionalHand(body.dominant_hand)
    const preferredPosition = optionalPreferredPosition(body.preferred_position)
    const avatarUrl = optionalImageUrl(body.avatar_url)
    const coverUrl = optionalImageUrl(body.cover_url)

    const now = new Date().toISOString()
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: player.user_id,
        id: player.user_id,
        display_name: displayName,
        city,
        birth_date: birthDate,
        height_cm: heightCm,
        dominant_hand: dominantHand,
        preferred_position: preferredPosition,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        updated_at: now,
      }, { onConflict: 'user_id' })
      .select('user_id,email,first_name,last_name,display_name,avatar_url,cover_url,city,birth_date,height_cm,dominant_hand,preferred_position')
      .single()

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    return NextResponse.json({
      player: {
        ...player,
        display_name: player.display_name,
        preferred_position: preferredPosition,
        full_name: fullName(profileData as ProfileRow, displayName),
      },
      profile: profileData as ProfileRow,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error guardando perfil.' }, { status: 500 })
  }
}
