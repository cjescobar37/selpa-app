import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  ensureClubPlayerForMembership,
  ensureValidActiveClubForUser,
  isClubAdmin,
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

    const allowed = await isClubAdmin(user.id, clubId)
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
    const { user } = await getUserFromRequest(req)
    if (!user) {
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
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 })
    }

    const allowed = await isClubAdmin(user.id, membership.club_id)
    if (!allowed) {
      return NextResponse.json({ error: 'No tenés permisos para gestionar esta solicitud.' }, { status: 403 })
    }

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id, name')
      .eq('id', membership.club_id)
      .maybeSingle()

    const clubName = club?.name ?? 'el club'

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json({ error: 'Tenés que indicar el motivo del rechazo.' }, { status: 400 })
      }

      const { error: rejectError } = await supabaseAdmin
        .from('club_memberships')
        .update({
          status: 'REJECTED',
          approved_by: user.id,
          approved_at: null,
          rejection_reason: rejectionReason,
        })
        .eq('id', membershipId)

      if (rejectError) {
        return NextResponse.json({ error: rejectError.message }, { status: 500 })
      }

      try {
        await ensureValidActiveClubForUser(membership.user_id, null)
      } catch (settingsError: any) {
        return NextResponse.json({ error: settingsError?.message ?? 'No pude actualizar club activo.' }, { status: 500 })
      }

      await supabaseAdmin.from('notifications').insert({
        user_id: membership.user_id,
        type: 'club_membership_rejected',
        title: 'Solicitud rechazada',
        message: `Tu solicitud para unirte a ${clubName} fue rechazada. Motivo: ${rejectionReason}`,
        metadata: {
          club_id: membership.club_id,
          membership_id: membership.id,
          rejection_reason: rejectionReason,
        },
      })

      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    const approvedAt = new Date().toISOString()

    const { error: approveError } = await supabaseAdmin
      .from('club_memberships')
      .update({
        status: 'APPROVED',
        approved_by: user.id,
        approved_at: approvedAt,
        rejection_reason: null,
      })
      .eq('id', membershipId)

    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 500 })
    }

    try {
      await ensureClubPlayerForMembership({
        clubId: membership.club_id,
        userId: membership.user_id,
        approvedBy: user.id,
        approvedAt,
      })
      await ensureValidActiveClubForUser(membership.user_id, membership.club_id)
    } catch (consistencyError: any) {
      return NextResponse.json({ error: consistencyError?.message ?? 'No pude dejar consistente la membresía.' }, { status: 500 })
    }

    await supabaseAdmin.from('notifications').insert({
      user_id: membership.user_id,
      type: 'club_membership_approved',
      title: 'Solicitud aprobada',
      message: `Tu solicitud para unirte a ${clubName} fue aprobada.`,
      metadata: {
        club_id: membership.club_id,
        membership_id: membership.id,
      },
    })

    return NextResponse.json({ ok: true, status: 'APPROVED' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error gestionando solicitud' }, { status: 500 })
  }
}
