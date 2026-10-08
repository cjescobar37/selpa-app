import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeErrorResponse } from '@/lib/writeFlowServer'
import { roleAssignmentDenial } from '@/lib/accountRoleServer'
import {
  userHasClubCapability,
} from '@/lib/clubMembershipServer'

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

    if (membershipsError) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 })
    }

    const rows = memberships ?? []
    const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)))

    let profilesMap = new Map<string, any>()

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('user_id, email, first_name, last_name, display_name, avatar_url')
        .in('user_id', userIds)

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 })
      }

      profilesMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]))
    }

    const merged = rows.map((m: any) => ({
      ...m,
      profiles: profilesMap.get(m.user_id) ?? null,
    }))

    return NextResponse.json({ memberships: merged })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo membresías' }, { status: 500 })
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
