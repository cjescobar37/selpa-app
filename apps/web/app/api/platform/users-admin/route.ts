import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { roleAssignmentDenial } from '@/lib/accountRoleServer'
import {
  ensureClubPlayerForMembership,
  ensureValidActiveClubForUser,
} from '@/lib/clubMembershipServer'
import { isApprovedMembership } from '@/lib/clubMembershipRules'
import { logPlatformAction } from '@/lib/platformAudit'
import { createClient } from '@supabase/supabase-js'
import { serverReadErrorResponse, writeErrorResponse } from '@/lib/writeFlowServer'

type ErrorLike = { message?: string | null }
type PlatformClubRow = { id: string; name: string; is_active: boolean | null; city: string | null }
type PlatformProfileRow = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  status?: string | null
  suspended_at?: string | null
  suspended_by?: string | null
}
type PlatformMembershipRow = {
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

async function assertPlatformAdmin(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const { data: pa, error: paErr } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (paErr) return { error: serverReadErrorResponse('platform-users.authorize', paErr, 'No pudimos verificar los permisos. Reintentá.'), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

function isMissingProfileStatus(error: ErrorLike | null | undefined) {
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

  if (membershipsRes.error) return serverReadErrorResponse('platform-users.memberships', membershipsRes.error)
  if (clubsRes.error) return serverReadErrorResponse('platform-users.clubs', clubsRes.error)

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

  if (profilesRes.error) return serverReadErrorResponse('platform-users.profiles', profilesRes.error)

  const clubRows = (clubsRes.data ?? []) as PlatformClubRow[]
  const profileRows = (profilesRes.data ?? []) as PlatformProfileRow[]
  const membershipRows = (membershipsRes.data ?? []) as PlatformMembershipRow[]
  const clubsMap = new Map(clubRows.map((club) => [club.id, club]))
  const profilesMap = new Map(profileRows.map((profile) => [profile.user_id, profile]))

  const rows = membershipRows.map((membership) => {
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

  const suspendedUsers = new Set(rows.filter((row) => row.user_status === 'SUSPENDED').map((row) => row.user_id))

  const summary = {
    total: rows.length,
    approved: rows.filter((row) => isApprovedMembership(row)).length,
    pending: rows.filter((row) => row.status === 'PENDING').length,
    rejected: rows.filter((row) => row.status === 'REJECTED').length,
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
      if (error) return writeErrorResponse('platform-users.status', error, 'No pudimos actualizar el estado del usuario.')
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

    if (membershipError) return serverReadErrorResponse('platform-users.membership', membershipError)
    if (!membership) return NextResponse.json({ error: 'Membresía no encontrada.' }, { status: 404 })

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id,name')
      .eq('id', membership.club_id)
      .maybeSingle()

    const clubName = club?.name ?? 'el club'

    if (membership.role === 'PLAYER') {
      if (action === 'approve') {
        const denial = await roleAssignmentDenial(membership.user_id, 'PLAYER')
        if (denial) return denial
      }
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if(!url||!key)return NextResponse.json({error:'La gestión de solicitudes no está disponible.',kind:'SERVER'},{status:503})
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.get('authorization')??''}}})
      const {data,error}=await client.rpc('resolve_player_membership_pass3',{
        p_membership_id:membershipId,p_action:action,p_reason:rejectionReason||null,
      })
      if(error)return writeErrorResponse('platform_player_membership',error)
      if(!data?.replayed)await logPlatformAction({actorUserId:auth.user!.id,action:`user.${action}`,entityType:'club_membership',entityId:membershipId,entityLabel:clubName,metadata:{previous_status:membership.status,next_status:data.status},req})
        .catch(()=>console.error('[platform-audit]',{code:'DELIVERY_PENDING'}))
      return NextResponse.json(data)
    }

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

      if (error) return writeErrorResponse('platform-users.reject', error, 'No pudimos rechazar la membresía.')

      try {
        await ensureValidActiveClubForUser(membership.user_id, null)
      } catch {
        return writeErrorResponse('platform-users.active-club', { code: 'CONSISTENCY_FAILURE' }, 'No pudimos actualizar el club activo.')
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
    const denial = await roleAssignmentDenial(membership.user_id, membership.role)
    if (denial) return denial

    const { error: approveError } = await supabaseAdmin
      .from('club_memberships')
      .update({
        status: 'APPROVED',
        approved_by: auth.user!.id,
        approved_at: approvedAt,
        rejection_reason: null,
      })
      .eq('id', membershipId)

    if (approveError) return writeErrorResponse('platform-users.approve', approveError, 'No pudimos aprobar la membresía.')

    try {
      if (membership.role === 'PLAYER') await ensureClubPlayerForMembership({
        clubId: membership.club_id,
        userId: membership.user_id,
        approvedBy: auth.user!.id,
        approvedAt,
      })
      await ensureValidActiveClubForUser(membership.user_id, membership.club_id)
    } catch {
      return writeErrorResponse('platform-users.consistency', { code: 'CONSISTENCY_FAILURE' }, 'No pudimos completar la membresía de forma consistente.')
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
  } catch {
    return writeErrorResponse('platform-users.manage', { code: 'UNEXPECTED' }, 'No pudimos gestionar el usuario.')
  }
}
