import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClubPlayer = {
  id: string
  club_id: string
  user_id: string
  category: number | null
  gender: string | null
  ranking_points: number | null
  approved_at: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return error ? null : data.user
}

function publicName(profile: { display_name?: string | null; first_name?: string | null; last_name?: string | null } | null) {
  return profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Jugador'
}

export async function GET(req: NextRequest, context: { params: Promise<{ playerId: string }> }) {
  // El DTO es deliberadamente público y solo selecciona campos aprobados para exposición.
  // Si llega un token se valida, pero la lectura pública no depende de una sesión.
  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ') && !(await getTokenUser(req))) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const { playerId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId)) {
    return NextResponse.json({ error: 'Identificador de jugador inválido.' }, { status: 400 })
  }
  const { data: playerData, error: playerError } = await supabaseAdmin
    .from('club_players')
    .select('id,club_id,user_id,category,gender,ranking_points,approved_at,created_at')
    .or(`id.eq.${playerId},user_id.eq.${playerId}`)
    .not('approved_at', 'is', null)
    .limit(1)
    .maybeSingle()

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })
  if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 })
  const player = playerData as ClubPlayer & { created_at: string }

  const [{ data: profile }, { data: club }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('user_id,display_name,first_name,last_name,avatar_url,cover_url,city,province,height_cm,dominant_hand,preferred_position')
      .eq('user_id', player.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,province,logo_url')
      .eq('id', player.club_id)
      .maybeSingle(),
  ])

  const { data: teamsData } = await supabaseAdmin
    .from('tournament_teams')
    .select('id,tournament_id,player1_user_id,player2_user_id')
    .eq('club_id', player.club_id)
    .or(`player1_user_id.eq.${player.user_id},player2_user_id.eq.${player.user_id}`)

  const teams = teamsData ?? []
  const teamIds = teams.map((team) => String(team.id))
  const tournamentIds = Array.from(new Set(teams.map((team) => String(team.tournament_id))))
  const [{ data: registrations }, { data: matches }, { data: tournaments }] = await Promise.all([
    teamIds.length
      ? supabaseAdmin.from('tournament_registrations').select('tournament_id,team_id,status,created_at').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? supabaseAdmin.from('tournament_matches').select('id,tournament_id,team1_id,team2_id,winner_team_id,status,phase,scheduled_at,created_at').or(`team1_id.in.(${teamIds.join(',')}),team2_id.in.(${teamIds.join(',')})`)
      : Promise.resolve({ data: [] }),
    tournamentIds.length
      ? supabaseAdmin.from('tournaments').select('id,name,starts_on,start_date').in('id', tournamentIds)
      : Promise.resolve({ data: [] }),
  ])

  const playedMatches = (matches ?? []).filter((match) => String(match.status).toUpperCase() === 'PLAYED')
  let wins = 0
  let finals = 0
  let titles = 0
  for (const match of playedMatches) {
    const ownTeam = teamIds.includes(String(match.team1_id)) ? String(match.team1_id) : String(match.team2_id)
    const won = String(match.winner_team_id) === ownTeam
    if (won) wins += 1
    if (String(match.phase).toUpperCase() === 'FINAL') {
      finals += 1
      if (won) titles += 1
    }
  }

  const tournamentsById = new Map((tournaments ?? []).map((item) => [String(item.id), item]))
  const tournamentHistory = (registrations ?? []).slice(0, 10).map((registration) => {
    const tournament = tournamentsById.get(String(registration.tournament_id))
    return {
      tournament_id: String(registration.tournament_id),
      tournament_name: tournament?.name ?? 'Torneo',
      date: tournament?.starts_on ?? tournament?.start_date ?? registration.created_at ?? null,
      category: player.category,
      partner_name: 'Pareja registrada',
      result: String(registration.status ?? 'Registrado'),
      points: null,
    }
  })

  const { data: partnership } = await supabaseAdmin
    .from('player_active_partnerships')
    .select('id,club_id,player1_club_player_id,player2_club_player_id,status,accepted_at,created_at')
    .eq('club_id', player.club_id)
    .eq('status', 'ACTIVE')
    .or(`player1_club_player_id.eq.${player.id},player2_club_player_id.eq.${player.id}`)
    .maybeSingle()

  let publicPartnerships: unknown[] = []
  if (partnership) {
    const partnerPlayerId = partnership.player1_club_player_id === player.id
      ? partnership.player2_club_player_id
      : partnership.player1_club_player_id
    const { data: partnerPlayer } = await supabaseAdmin
      .from('club_players')
      .select('id,user_id')
      .eq('id', partnerPlayerId)
      .maybeSingle()
    const { data: partnerProfile } = partnerPlayer
      ? await supabaseAdmin.from('profiles').select('display_name,first_name,last_name,avatar_url').eq('user_id', partnerPlayer.user_id).maybeSingle()
      : { data: null }
    const safePartner = partnerPlayer ? {
      id: partnerPlayer.id,
      user_id: partnerPlayer.user_id,
      full_name: publicName(partnerProfile),
      avatar_url: partnerProfile?.avatar_url ?? null,
    } : null
    publicPartnerships = [{
      ...partnership,
      player1: partnership.player1_club_player_id === player.id ? { id: player.id, user_id: player.user_id, full_name: publicName(profile), avatar_url: profile?.avatar_url ?? null } : safePartner,
      player2: partnership.player2_club_player_id === player.id ? { id: player.id, user_id: player.user_id, full_name: publicName(profile), avatar_url: profile?.avatar_url ?? null } : safePartner,
    }]
  }

  return NextResponse.json({
    visibility: 'public',
    club,
    player: {
      id: player.id,
      user_id: player.user_id,
      full_name: publicName(profile),
      category: player.category,
      gender: player.gender,
      ranking_points: Number(player.ranking_points ?? 0),
      preferred_position: profile?.preferred_position ?? null,
    },
    profile: profile ? {
      user_id: profile.user_id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      cover_url: profile.cover_url,
      city: profile.city,
      province: profile.province,
      height_cm: profile.height_cm,
      dominant_hand: profile.dominant_hand,
      preferred_position: profile.preferred_position,
    } : null,
    stats: {
      tournaments_played: new Set((registrations ?? []).map((item) => String(item.tournament_id))).size,
      matches_played: playedMatches.length,
      wins,
      losses: Math.max(0, playedMatches.length - wins),
      effectiveness: playedMatches.length ? Math.round((wins / playedMatches.length) * 100) : null,
      finals,
      titles,
    },
    partnerships: publicPartnerships,
    frequent_partner: null,
    tournament_history: tournamentHistory,
    recent_matches: [],
    activity: [],
  })
}
