import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { serverReadErrorResponse, writeErrorResponse } from '@/lib/writeFlowServer'
import { roleAssignmentDenial } from '@/lib/accountRoleServer'
import {
  userHasClubCapability,
} from '@/lib/clubMembershipServer'

type MembershipListRow = {
  id: string
  club_id: string
  user_id: string
  role: string
  status: string
  created_at: string
  approved_at: string | null
  rejection_reason: string | null
}

type MembershipProfile = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return { user: null, token: null }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null, token }

  return { user: data.user, token }
}

export async function GET(req: NextRequest) {
  try {
    const clubId = req.nextUrl.searchParams.get('clubId') || ''
    if (!clubId) {
      return NextResponse.json({ error: 'Falta clubId.' }, { status: 400 })
    }

    const { user } = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const allowed = await userHasClubCapability(user.id, clubId, 'memberships:view')
    if (!allowed) {
      return NextResponse.json({ error: 'No tenés permisos para ver estas solicitudes.' }, { status: 403 })
    }

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('club_memberships')
      .select('id, club_id, user_id, role, status, created_at, approved_at, rejection_reason')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })

    if (membershipsError) return serverReadErrorResponse('membership.list', membershipsError)

    const rows = (memberships ?? []) as MembershipListRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)))

    let profilesMap = new Map<string, MembershipProfile>()

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('user_id, email, first_name, last_name, display_name, avatar_url')
        .in('user_id', userIds)

      if (profilesError) return serverReadErrorResponse('membership.list_profiles', profilesError)

      profilesMap = new Map(((profiles ?? []) as MembershipProfile[]).map((profile) => [profile.user_id, profile]))
    }

    const merged = rows.map((membership) => ({
      ...membership,
      profiles: profilesMap.get(membership.user_id) ?? null,
    }))

    return NextResponse.json({ memberships: merged })
  } catch {
    return serverReadErrorResponse('membership.list', { code: 'UNEXPECTED' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, token } = await getUserFromRequest(req)
    if (!user || !token) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const body = await req.json()
    const membershipId = String(body?.membershipId ?? '')
    const action = String(body?.action ?? '')
    const rejectionReason = String(body?.rejectionReason ?? '').trim()

    if (!membershipId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('club_memberships')
      .select('id, club_id, user_id, role, status')
      .eq('id', membershipId)
      .maybeSingle()

    if (membershipError) {
      return writeErrorResponse('membership.read_for_resolution',membershipError)
    }

    if (!membership) {
      return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 })
    }

    const allowed = await userHasClubCapability(user.id, membership.club_id, 'memberships:manage')
    if (!allowed) {
      return NextResponse.json({ error: 'No tenés permisos para gestionar esta solicitud.' }, { status: 403 })
    }

    if (membership.role !== 'PLAYER') return NextResponse.json({ error: 'Esta acción sólo resuelve solicitudes de jugadores.' }, { status: 400 })
    if (action === 'reject' && !rejectionReason) return NextResponse.json({ error: 'Indicá el motivo del rechazo.' }, { status: 400 })
    if (action === 'approve') {
      const denial = await roleAssignmentDenial(membership.user_id, membership.role)
      if (denial) return denial
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return NextResponse.json({ error: 'No pudimos procesar la solicitud. Reintentá.' }, { status: 503 })
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: result, error: resolveError } = await userClient.rpc('resolve_player_membership_pass3', {
      p_membership_id: membershipId, p_action: action, p_reason: rejectionReason || null,
    })
    if (resolveError) return writeErrorResponse('membership.resolve', resolveError)
    return NextResponse.json(result)
  } catch {
    return writeErrorResponse('membership.resolve', { code: 'UNEXPECTED' })
  }
}
