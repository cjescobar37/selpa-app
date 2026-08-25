import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTokenUser } from '@/lib/platformApiAuth'
import { getApprovedMembership, userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlayerRow = { id: string; user_id: string | null; display_name: string | null; category: number | null; gender: string | null; ranking_points: number | null; approved_at: string | null; created_at: string; operational_status: 'ACTIVE' | 'BLOCKED' | 'LEFT' }
type MembershipRow = { id: string; role: string; status: string; created_at: string; approved_at: string | null; rejection_reason: string | null }
type ProfileRow = { display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null; city: string | null; email?: string | null; birth_date?: string | null; dominant_hand?: string | null; preferred_position?: string | null }
type RegistrationRow = { id: string; tournament_id: string; status: string; created_at: string }

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const fullName = (profile: ProfileRow | null, fallback: string | null) => fallback || profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Jugador'
const isManualEmail = (email?: string | null) => /^manual-[a-z0-9-]+@manual\.[a-z0-9.-]+$/i.test(String(email ?? '').trim())
const lifecycleError = (raw: string) => {
  if (raw.includes('CLUB_PLAYER_FORBIDDEN') || raw.includes('42501')) return { status: 403, error: 'No tenés permisos para administrar este jugador.' }
  if (raw.includes('OWNER_TRANSFER_REQUIRED')) return { status: 409, error: 'No podés bloquear al propietario del club.' }
  if (raw.includes('ACTIVE_STAFF_ROLE')) return { status: 409, error: 'No podés bloquear a un integrante activo del equipo.' }
  if (raw.includes('SELF_ACTION_FORBIDDEN')) return { status: 409, error: 'No podés realizar esta acción sobre tu propia cuenta.' }
  if (raw.includes('BLOCK_REASON_REQUIRED')) return { status: 400, error: 'Indicá el motivo del bloqueo.' }
  if (raw.includes('LEAVE_REASON_REQUIRED')) return { status: 400, error: 'Indicá el motivo de la baja.' }
  if (raw.includes('PLAYER_LEFT')) return { status: 409, error: 'Este jugador ya no está activo en el club.' }
  if (raw.includes('PLAYER_MEMBERSHIP_RECONCILIATION_REQUIRED')) return { status: 409, error: 'La membresía de este jugador necesita revisión antes de reincorporarlo.' }
  if (raw.includes('complete sus datos personales')) return { status: 409, error: 'El jugador debe completar sus datos personales antes de reincorporarse.' }
  return { status: 409, error: 'No pudimos actualizar el acceso del jugador. Intentá nuevamente.' }
}

function userClient(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return token && url && key ? createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }) : null
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string; playerId: string }> }) {
  const { clubId, playerId } = await context.params
  if (!isUuid(clubId) || !isUuid(playerId)) return NextResponse.json({ error: 'Jugador o club inválido.' }, { status: 400 })
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const [membership, canView, canViewPrivate, canManagePlayer, canViewMembership, canManageMembership, canViewMessages, canReplyMessages, canViewCompetition, canViewRanking, canManageRoles] = await Promise.all([
    getApprovedMembership(user.id, clubId),
    userHasClubCapability(user.id, clubId, 'players:view'),
    userHasClubCapability(user.id, clubId, 'players:private_view'),
    userHasClubCapability(user.id, clubId, 'players:manage'),
    userHasClubCapability(user.id, clubId, 'memberships:view'),
    userHasClubCapability(user.id, clubId, 'memberships:manage'),
    userHasClubCapability(user.id, clubId, 'messages:view'),
    userHasClubCapability(user.id, clubId, 'messages:reply'),
    userHasClubCapability(user.id, clubId, 'competition:view'),
    userHasClubCapability(user.id, clubId, 'ranking:view'),
    userHasClubCapability(user.id, clubId, 'roles:manage'),
  ])
  if (!membership || !canView) return NextResponse.json({ error: 'No tenés permisos para administrar este jugador.' }, { status: 403 })

  const { data: playerData, error: playerError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,display_name,category,gender,ranking_points,approved_at,created_at,operational_status')
    .eq('club_id', clubId)
    .or('id.eq.' + playerId + ',user_id.eq.' + playerId)
    .maybeSingle()
  if (playerError) return NextResponse.json({ error: 'No pude leer la ficha del jugador.' }, { status: 500 })
  if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado en este club.' }, { status: 404 })
  const player = playerData as PlayerRow
  const profileColumns = canViewPrivate
    ? 'display_name,first_name,last_name,avatar_url,city,email,birth_date,dominant_hand,preferred_position'
    : 'display_name,first_name,last_name,avatar_url,email'
  const profilePromise = player.user_id ? supabaseAdmin.from('profiles').select(profileColumns).eq('user_id', player.user_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  const membershipPromise = player.user_id ? supabaseAdmin.from('club_memberships').select('id,role,status,created_at,approved_at,rejection_reason').eq('club_id', clubId).eq('user_id', player.user_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  const teamsPromise = player.user_id ? supabaseAdmin.from('tournament_teams').select('id,tournament_id').eq('club_id', clubId).or('player1_user_id.eq.' + player.user_id + ',player2_user_id.eq.' + player.user_id) : Promise.resolve({ data: [], error: null })
  const [profileResult, membershipResult, teamsResult] = await Promise.all([profilePromise, membershipPromise, teamsPromise])
  if (profileResult.error || membershipResult.error || teamsResult.error) return NextResponse.json({ error: 'No pude completar la ficha administrativa.' }, { status: 500 })

  const teams = (teamsResult.data ?? []) as Array<{ id: string; tournament_id: string }>
  const teamIds = teams.map((team) => team.id)
  const registrationsResult = teamIds.length ? await supabaseAdmin.from('tournament_registrations').select('id,tournament_id,status,created_at').eq('club_id', clubId).in('team_id', teamIds).order('created_at', { ascending: false }).limit(12) : { data: [], error: null }
  if (registrationsResult.error) return NextResponse.json({ error: 'No pude leer la actividad deportiva.' }, { status: 500 })
  const registrations = (registrationsResult.data ?? []) as RegistrationRow[]
  const activeRegistrations = registrations.filter((row) => String(row.status).toUpperCase() !== 'CANCELLED')
  const tournamentIds = Array.from(new Set(activeRegistrations.map((row) => row.tournament_id)))
  const tournamentsResult = tournamentIds.length ? await supabaseAdmin.from('tournaments').select('id,name,category,starts_on,start_date,status').eq('club_id', clubId).in('id', tournamentIds) : { data: [], error: null }
  if (tournamentsResult.error) return NextResponse.json({ error: 'No pude completar la actividad deportiva.' }, { status: 500 })
  const tournaments = new Map((tournamentsResult.data ?? []).map((row: { id: string; name: string; category: number | null; starts_on: string | null; start_date: string | null; status: string }) => [String(row.id), row]))
  const profile = (profileResult.data ?? null) as ProfileRow | null
  const playerMembership = (membershipResult.data ?? null) as MembershipRow | null
  const manualAccount = !player.user_id || !profile?.email || isManualEmail(profile.email)
  const lifecycleTargetAllowed = manualAccount || playerMembership?.role === 'PLAYER'
  const canManageLifecycle = Boolean(
    canManageMembership
    && canManagePlayer
    && (membership.role === 'OWNER' || membership.role === 'ADMIN')
    && player.user_id !== user.id
    && lifecycleTargetAllowed,
  )
  const canReincorporate = Boolean(canManageLifecycle && player.operational_status === 'LEFT' && (manualAccount || playerMembership?.id))

  return NextResponse.json({
    player: {
      id: player.id, user_id: player.user_id, full_name: fullName(profile, player.display_name), avatar_url: profile?.avatar_url ?? null, operational_status: player.operational_status,
      category: player.category, gender: player.gender, ranking_points: Number(player.ranking_points ?? 0), approved_at: player.approved_at, created_at: player.created_at,
      account_kind: manualAccount ? 'MANUAL' : 'REGISTERED',
      personal: canViewPrivate ? { email: manualAccount ? null : profile?.email ?? null, city: profile?.city ?? null, birth_date: profile?.birth_date ?? null, dominant_hand: profile?.dominant_hand ?? null, preferred_position: profile?.preferred_position ?? null } : null,
    },
    membership: playerMembership,
    stats: { tournaments_played: new Set(activeRegistrations.map((row) => row.tournament_id)).size, registrations: activeRegistrations.length },
    registrations: activeRegistrations.map((registration) => {
      const tournament = tournaments.get(String(registration.tournament_id))
      return { id: registration.id, status: registration.status, created_at: registration.created_at, tournament: tournament ? { id: tournament.id, name: tournament.name, category: tournament.category ?? null, starts_on: tournament.starts_on ?? tournament.start_date ?? null, status: tournament.status } : null }
    }),
    permissions: { can_manage: canManagePlayer, can_view_private: canViewPrivate, can_view_membership: canViewMembership, can_manage_membership: canManageMembership, can_manage_lifecycle: canManageLifecycle, can_reincorporate: canReincorporate, can_manage_roles: canManageRoles, lifecycle_staff_protected: Boolean(playerMembership && playerMembership.role !== 'PLAYER'), can_view_messages: canViewMessages, can_reply_messages: canReplyMessages, can_view_competition: canViewCompetition, can_view_ranking: canViewRanking },
  })
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string; playerId: string }> }) {
  const { clubId, playerId } = await context.params
  if (!isUuid(clubId) || !isUuid(playerId)) return NextResponse.json({ error: 'Jugador o club inválido.' }, { status: 400 })
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const [membership, canManageMembership, canManagePlayer] = await Promise.all([
    getApprovedMembership(user.id, clubId),
    userHasClubCapability(user.id, clubId, 'memberships:manage'),
    userHasClubCapability(user.id, clubId, 'players:manage'),
  ])
  if (!membership || !canManageMembership || !canManagePlayer) return NextResponse.json({ error: 'No tenés permisos para administrar este jugador.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? '')
  const reason = String(body?.reason ?? '').trim()
  if (!['block', 'reactivate', 'leave', 'reincorporate'].includes(action)) return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
  if ((action === 'block' || action === 'leave') && !reason) return NextResponse.json({ error: action === 'block' ? 'Indicá el motivo del bloqueo.' : 'Indicá el motivo de la baja.' }, { status: 400 })
  const { data: player, error: playerError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,operational_status')
    .eq('club_id', clubId)
    .or('id.eq.' + playerId + ',user_id.eq.' + playerId)
    .maybeSingle()
  if (playerError) return NextResponse.json({ error: 'No pude encontrar al jugador.' }, { status: 500 })
  if (!player) return NextResponse.json({ error: 'Jugador no encontrado en este club.' }, { status: 404 })
  const db = userClient(req)
  if (!db) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  let data: unknown = null
  let error: { code?: string; message?: string } | null = null
  if (action === 'reincorporate') {
    if (player.operational_status !== 'LEFT') return NextResponse.json({ error: 'Este jugador no está disponible para reincorporación.' }, { status: 409 })
    const result = await db.rpc('reincorporate_club_player_atomic', { p_club_id: clubId, p_club_player_id: player.id })
    data = result.data
    error = result.error
  } else {
    const rpc = action === 'block' ? 'block_club_player_atomic' : action === 'leave' ? 'leave_club_player_safely_atomic' : 'reactivate_club_player_atomic'
    const result = await db.rpc(rpc, action === 'block' || action === 'leave'
      ? { p_club_id: clubId, p_club_player_id: player.id, p_reason: reason }
      : { p_club_id: clubId, p_club_player_id: player.id })
    data = result.data
    error = result.error
  }
  if (error) {
    const mapped = lifecycleError(`${error.code ?? ''} ${error.message ?? ''}`)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json({ ok: true, result: data })
}
