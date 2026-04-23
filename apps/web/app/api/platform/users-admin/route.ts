import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  ensureClubPlayerForMembership,
  ensureValidActiveClubForUser,
} from '@/lib/clubMembershipServer'
import { isApprovedMembership } from '@/lib/clubMembershipRules'
import { logPlatformAction } from '@/lib/platformAudit'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function assertPlatformAdmin(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const { data: pa, error: paErr } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (paErr) return { error: NextResponse.json({ error: paErr.message }, { status: 500 }), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

function isMissingProfileStatus(error: any) {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('status') && (message.includes('profiles') || message.includes('schema cache') || message.includes('column'))
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const [membershipsRes, clubsRes] = await Promise.all([
    supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status,created_at,approved_at,rejection_reason')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('clubs')
      .select('id,name,is_active,city'),
  ])

  if (membershipsRes.error) return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 })

  let profileStatusAvailable = true
  let profilesRes = await supabaseAdmin
    .from('profiles')
    .select('user_id,display_name,first_name,last_name,email,avatar_url,status,suspended_at,suspended_by')

  if (profilesRes.error && isMissingProfileStatus(profilesRes.error)) {
    profileStatusAvailable = false
    profilesRes = await supabaseAdmin
      .from('profiles')
      .select('user_id,display_name,first_name,last_name,email,avatar_url')
  }

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })

  const clubsMap = new Map((clubsRes.data ?? []).map((club: any) => [club.id, club]))
  const profilesMap = new Map((profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]))

  const rows = (membershipsRes.data ?? []).map((membership: any) => {
    const club = clubsMap.get(membership.club_id)
    const profile = profilesMap.get(membership.user_id)
    const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.email || 'Usuario sin nombre'

    return {
      ...membership,
      club_name: club?.name ?? 'Club desconocido',
      club_city: club?.city ?? null,
      club_is_active: club?.is_active ?? null,
      user_name: displayName,
      user_email: profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
      user_status: profile?.status ?? 'ACTIVE',
      suspended_at: profile?.suspended_at ?? null,
      suspended_by: profile?.suspended_by ?? null,
    }
  })

  const suspendedUsers = new Set(rows.filter((row: any) => row.user_status === 'SUSPENDED').map((row: any) => row.user_id))

  const summary = {
    total: rows.length,
    approved: rows.filter((row: any) => isApprovedMembership(row)).length,
    pending: rows.filter((row: any) => row.status === 'PENDING').length,
    rejected: rows.filter((row: any) => row.status === 'REJECTED').length,
    suspended: suspendedUsers.size,
  }

  return NextResponse.json({ rows, summary, clubs: clubsRes.data ?? [], profileStatusAvailable })
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const membershipId = String(body?.membershipId ?? '')
    const action = String(body?.action ?? '')
    const rejectionReason = String(body?.rejectionReason ?? '').trim()

    if (action === 'suspend_user' || action === 'reactivate_user') {
      const userId = String(body?.userId ?? '')
      if (!userId) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 })

      const nextStatus = action === 'suspend_user' ? 'SUSPENDED' : 'ACTIVE'
      const now = new Date().toISOString()
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({
          status: nextStatus,
          suspended_at: nextStatus === 'SUSPENDED' ? now : null,
          suspended_by: nextStatus === 'SUSPENDED' ? auth.user!.id : null,
        })
        .eq('user_id', userId)
        .select('user_id,status,suspended_at')
        .maybeSingle()

      if (error && isMissingProfileStatus(error)) {
        return NextResponse.json(
          { error: 'Falta aplicar la migración de estado global de usuario en profiles.' },
          { status: 412 },
        )
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.user_id) return NextResponse.json({ error: 'Perfil de usuario no encontrado.' }, { status: 404 })

      await logPlatformAction({
        actorUserId: auth.user!.id,
        action: action === 'suspend_user' ? 'user.suspend' : 'user.reactivate',
        entityType: 'user',
        entityId: data.user_id,
        metadata: {
          next_status: data.status,
          suspended_at: data.suspended_at ?? null,
        },
        req,
      })

      return NextResponse.json({ ok: true, user_id: data.user_id, status: data.status, suspended_at: data.suspended_at })
    }

    if (!membershipId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status')
      .eq('id', membershipId)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
    if (!membership) return NextResponse.json({ error: 'Membresía no encontrada.' }, { status: 404 })

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id,name')
      .eq('id', membership.club_id)
      .maybeSingle()

    const clubName = club?.name ?? 'el club'

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json({ error: 'Indicá un motivo de rechazo.' }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from('club_memberships')
        .update({
          status: 'REJECTED',
          approved_by: auth.user!.id,
          approved_at: null,
          rejection_reason: rejectionReason,
        })
        .eq('id', membershipId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
        metadata: { club_id: membership.club_id, membership_id: membership.id, rejection_reason: rejectionReason },
      })

      await logPlatformAction({
        actorUserId: auth.user!.id,
        action: 'user.reject',
        entityType: 'club_membership',
        entityId: membership.id,
        entityLabel: clubName,
        metadata: {
          user_id: membership.user_id,
          club_id: membership.club_id,
          role: membership.role,
          previous_status: membership.status,
          next_status: 'REJECTED',
          rejection_reason: rejectionReason,
        },
        req,
      })

      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    const approvedAt = new Date().toISOString()

    const { error: approveError } = await supabaseAdmin
      .from('club_memberships')
      .update({
        status: 'APPROVED',
        approved_by: auth.user!.id,
        approved_at: approvedAt,
        rejection_reason: null,
      })
      .eq('id', membershipId)

    if (approveError) return NextResponse.json({ error: approveError.message }, { status: 500 })

    try {
      await ensureClubPlayerForMembership({
        clubId: membership.club_id,
        userId: membership.user_id,
        approvedBy: auth.user!.id,
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
      metadata: { club_id: membership.club_id, membership_id: membership.id },
    })

    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'user.approve',
      entityType: 'club_membership',
      entityId: membership.id,
      entityLabel: clubName,
      metadata: {
        user_id: membership.user_id,
        club_id: membership.club_id,
        role: membership.role,
        previous_status: membership.status,
        next_status: 'APPROVED',
        approved_at: approvedAt,
      },
      req,
    })

    return NextResponse.json({ ok: true, status: 'APPROVED' })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude gestionar el usuario.' }, { status: 500 })
  }
}
