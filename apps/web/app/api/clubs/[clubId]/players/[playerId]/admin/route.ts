import { NextRequest, NextResponse } from 'next/server'
import { getTokenUser } from '@/lib/platformApiAuth'
import { getApprovedMembership, userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlayerRow = { id: string; user_id: string; display_name: string | null; category: number | null; gender: string | null; ranking_points: number | null; approved_at: string | null; created_at: string }
type MembershipRow = { role: string; status: string; created_at: string; approved_at: string | null }
type ProfileRow = { display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null; city: string | null; email?: string | null }
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const fullName = (profile: ProfileRow | null, fallback: string | null) => fallback || profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Jugador'

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string; playerId: string }> }) {
  const { clubId, playerId } = await context.params
  if (!isUuid(clubId) || !isUuid(playerId)) return NextResponse.json({ error: 'Jugador o club inválido.' }, { status: 400 })
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const [membership, canView, canViewPrivate, canManage] = await Promise.all([
    getApprovedMembership(user.id, clubId),
    userHasClubCapability(user.id, clubId, 'players:view'),
    userHasClubCapability(user.id, clubId, 'players:private_view'),
    userHasClubCapability(user.id, clubId, 'players:manage'),
  ])
  if (!membership || !canView) return NextResponse.json({ error: 'No tenés permisos para administrar este jugador.' }, { status: 403 })

  const { data: playerData, error: playerError } = await supabaseAdmin.from('club_players').select('id,user_id,display_name,category,gender,ranking_points,approved_at,created_at').eq('club_id', clubId).or('id.eq.' + playerId + ',user_id.eq.' + playerId).maybeSingle()
  if (playerError) return NextResponse.json({ error: 'No pude leer la ficha del jugador.' }, { status: 500 })
  if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado en este club.' }, { status: 404 })
  const player = playerData as PlayerRow
  const profileColumns = canViewPrivate ? 'display_name,first_name,last_name,avatar_url,city,email' : 'display_name,first_name,last_name,avatar_url,city'
  const [profileResult, membershipResult, teamsResult] = await Promise.all([
    supabaseAdmin.from('profiles').select(profileColumns).eq('user_id', player.user_id).maybeSingle(),
    supabaseAdmin.from('club_memberships').select('role,status,created_at,approved_at').eq('club_id', clubId).eq('user_id', player.user_id).maybeSingle(),
    supabaseAdmin.from('tournament_teams').select('id,tournament_id').eq('club_id', clubId).or('player1_user_id.eq.' + player.user_id + ',player2_user_id.eq.' + player.user_id),
  ])
  if (profileResult.error || membershipResult.error || teamsResult.error) return NextResponse.json({ error: 'No pude completar la ficha administrativa.' }, { status: 500 })
  const teams = (teamsResult.data ?? []) as Array<{ id: string; tournament_id: string }>
  const teamIds = teams.map((team) => team.id)
  const registrationsResult = teamIds.length ? await supabaseAdmin.from('tournament_registrations').select('tournament_id,status').eq('club_id', clubId).in('team_id', teamIds) : { data: [], error: null }
  if (registrationsResult.error) return NextResponse.json({ error: 'No pude leer la actividad deportiva.' }, { status: 500 })
  const registrations = (registrationsResult.data ?? []).filter((row) => String(row.status).toUpperCase() !== 'CANCELLED')
  const profile = (profileResult.data ?? null) as ProfileRow | null
  const playerMembership = (membershipResult.data ?? null) as MembershipRow | null
  return NextResponse.json({
    player: { id: player.id, user_id: player.user_id, full_name: fullName(profile, player.display_name), avatar_url: profile?.avatar_url ?? null, category: player.category, gender: player.gender, ranking_points: Number(player.ranking_points ?? 0), approved_at: player.approved_at, created_at: player.created_at, city: profile?.city ?? null, email: canViewPrivate ? profile?.email ?? null : null },
    membership: playerMembership,
    stats: { tournaments_played: new Set(registrations.map((row) => row.tournament_id)).size, registrations: registrations.length },
    permissions: { can_manage: canManage, can_view_private: canViewPrivate },
  })
}
