import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApprovedMembership, userHasClubCapability } from '@/lib/clubMembershipServer'

type ProfileRow = {
  user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

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
  operational_status: 'ACTIVE' | 'BLOCKED' | 'LEFT'
}

type MembershipRow = {
  id: string
  club_id: string
  user_id: string
  role: string
  status: string
  created_at: string
  approved_at: string | null
  rejection_reason: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getFullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.display_name ||
    fallback ||
    profile?.email ||
    'Jugador'
  )
}

async function getProfilesMap(userIds: string[], includePrivateContact: boolean) {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return new Map<string, ProfileRow>()

  const query = supabaseAdmin.from('profiles')
  const { data, error } = includePrivateContact
    ? await query.select('user_id,email,first_name,last_name,display_name,avatar_url').in('user_id', ids)
    : await query.select('user_id,first_name,last_name,display_name,avatar_url').in('user_id', ids)

  if (error) throw error
  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const [membership, canViewPlayers] = await Promise.all([
      getApprovedMembership(user.id, clubId),
      userHasClubCapability(user.id, clubId, 'players:view'),
    ])
    if (!membership || !canViewPlayers) {
      return NextResponse.json({ error: 'No autorizado para ver jugadores del club.' }, { status: 403 })
    }

    const [playersRes, membershipsRes] = await Promise.all([
      supabaseAdmin
        .from('club_players')
        .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at,created_at,operational_status')
        .eq('club_id', clubId)
        .not('approved_at', 'is', null)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('club_memberships')
        .select('id,club_id,user_id,role,status,created_at,approved_at,rejection_reason')
        .eq('club_id', clubId)
        .eq('role', 'PLAYER')
        .order('created_at', { ascending: false }),
    ])

    if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })
    if (membershipsRes.error) return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })

    const players = (playersRes.data ?? []) as PlayerRow[]
    const memberships = (membershipsRes.data ?? []) as MembershipRow[]
    const isPlanillero = membership.role === 'PLANILLERO'
    const profiles = await getProfilesMap([
      ...players.map((player) => player.user_id).filter((userId): userId is string => Boolean(userId)),
      ...memberships.map((membership) => membership.user_id),
    ], !isPlanillero)

    return NextResponse.json({
      players: players.map((player) => {
        const profile = player.user_id ? profiles.get(player.user_id) ?? null : null
        return {
          ...player,
          profile,
          full_name: getFullName(profile, player.display_name),
        }
      }),
      requests: isPlanillero ? [] : memberships
        .filter((membership) => membership.status === 'PENDING')
        .map((membership) => {
          const profile = profiles.get(membership.user_id) ?? null
          return {
            ...membership,
            profile,
            full_name: getFullName(profile),
          }
        }),
      requestStats: {
        pending: isPlanillero ? 0 : memberships.filter((item) => item.status === 'PENDING').length,
        approved: isPlanillero ? 0 : memberships.filter((item) => item.status === 'APPROVED' && item.approved_at).length,
        rejected: isPlanillero ? 0 : memberships.filter((item) => item.status === 'REJECTED').length,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo jugadores del club.') }, { status: 500 })
  }
}
