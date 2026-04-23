import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership } from '@/lib/clubMembershipRules'
import { withNotificationScope } from '@/lib/notificationScope'
import { logPlatformAction } from '@/lib/platformAudit'

type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
type ClubAction = 'approve' | 'reject' | 'request_changes' | 'suspend'
type ClubRow = {
  id: string
  name: string
  brand_name: string | null
  legal_name: string | null
  cuit: string | null
  city: string | null
  province: string | null
  country: string | null
  address: string | null
  phone: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  opening_hours: string | null
  courts_count: number | null
  courts_surface: string | null
  notes: string | null
  rules_pdf_url: string | null
  owner_phone: string | null
  is_active: boolean | null
  status: ClubStatus
  created_at: string
  logo_url: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  correction_requested_at: string | null
  correction_reason: string | null
  suspended_at: string | null
  suspension_reason: string | null
}
type MembershipRow = {
  club_id: string
  role: string
  status: string
  user_id: string
  approved_at: string | null
}
type ProfileRow = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}
type TournamentRow = {
  id: string
  club_id: string
}
type ClubStateRow = {
  id: string
  status: ClubStatus
  is_active: boolean | null
  owner_user_id: string | null
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

  if (paErr) return { error: NextResponse.json({ error: paErr.message }, { status: 500 }), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const requestedStatus = req.nextUrl.searchParams.get('status')
  const statusFilter = requestedStatus && ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUSPENDED'].includes(requestedStatus)
    ? (requestedStatus as ClubStatus)
    : null

  let clubsQuery = supabaseAdmin
    .from('clubs')
    .select('id,name,brand_name,legal_name,cuit,city,province,country,address,phone,contact_email,website,instagram,opening_hours,courts_count,courts_surface,logo_url,notes,rules_pdf_url,owner_phone,is_active,status,created_at,approved_at,rejected_at,rejection_reason,correction_requested_at,correction_reason,suspended_at,suspension_reason')
    .order('created_at', { ascending: false })

  if (statusFilter) {
    clubsQuery = clubsQuery.eq('status', statusFilter)
  }

  const { data: clubs, error: clubsError } = await clubsQuery

  if (clubsError) {
    return NextResponse.json({ error: clubsError.message }, { status: 500 })
  }

  const clubRows = (clubs ?? []) as ClubRow[]
  const clubIds = clubRows.map((club) => club.id)

  const [membershipsRes, tournamentsRes] = await Promise.all([
    clubIds.length
      ? supabaseAdmin
          .from('club_memberships')
          .select('club_id,role,status,user_id,approved_at')
          .in('club_id', clubIds)
      : Promise.resolve({ data: [], error: null }),
    clubIds.length
      ? supabaseAdmin
          .from('tournaments')
          .select('id,club_id')
          .in('club_id', clubIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (membershipsRes.error) {
    return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })
  }
  if (tournamentsRes.error) {
    return NextResponse.json({ error: tournamentsRes.error.message }, { status: 500 })
  }

  const memberships = (membershipsRes.data ?? []) as MembershipRow[]
  const ownerIds = Array.from(
    new Set(
      memberships
        .filter((row) => row.role === 'OWNER' && row.status === 'APPROVED')
        .filter((row) => isApprovedMembership(row))
        .map((row) => row.user_id)
        .filter(Boolean)
    )
  )

  let profilesMap = new Map<string, ProfileRow>()
  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,display_name,first_name,last_name,email')
      .in('user_id', ownerIds)

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    profilesMap = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
  }

  const tournamentRows = (tournamentsRes.data ?? []) as TournamentRow[]

  const rows = clubRows.map((club) => {
    const relatedMemberships = memberships.filter((row) => row.club_id === club.id)
    const approvedMemberships = relatedMemberships.filter((row) => isApprovedMembership(row))
    const pendingMemberships = relatedMemberships.filter((row) => row.status === 'PENDING')
    const ownerMembership = relatedMemberships.find((row) => row.role === 'OWNER' && isApprovedMembership(row))
    const ownerProfile = ownerMembership ? profilesMap.get(ownerMembership.user_id) : null
    const ownerName = ownerProfile?.display_name || [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(' ').trim() || ownerProfile?.email || 'Sin owner asignado'
    const tournamentsCount = tournamentRows.filter((row) => row.club_id === club.id).length

    return {
      ...club,
      owner_name: ownerName,
      owner_email: ownerProfile?.email || null,
      approved_members_count: approvedMemberships.length,
      pending_members_count: pendingMemberships.length,
      tournaments_count: tournamentsCount,
    }
  })

  return NextResponse.json({ rows })
}

export async function PATCH(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const clubId = String(body?.clubId ?? '')
    const action = String(body?.action ?? '') as ClubAction
    const reason = String(body?.reason ?? '').trim()

    if (!clubId || !['approve', 'reject', 'request_changes', 'suspend'].includes(action)) {
      return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
    }

    if (['reject', 'request_changes', 'suspend'].includes(action) && !reason) {
      return NextResponse.json({ error: 'Tenés que indicar un motivo.' }, { status: 400 })
    }

    const { data: currentClub, error: currentClubError } = await supabaseAdmin
      .from('clubs')
      .select('id,status,is_active,owner_user_id')
      .eq('id', clubId)
      .maybeSingle()

    if (currentClubError) {
      return NextResponse.json({ error: currentClubError.message }, { status: 500 })
    }

    if (!currentClub) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    const clubState = currentClub as ClubStateRow

    const { data: ownerMembership } = await supabaseAdmin
      .from('club_memberships')
      .select('club_id,role,status,user_id,approved_at')
      .eq('club_id', clubId)
      .eq('role', 'OWNER')
      .eq('user_id', clubState.owner_user_id ?? '')
      .maybeSingle()

    const hasConsistentOwner = Boolean(clubState.owner_user_id && ownerMembership && isApprovedMembership(ownerMembership as MembershipRow))

    if (action === 'approve' && !hasConsistentOwner) {
      return NextResponse.json({ error: 'No podés aprobar un club sin owner aprobado y consistente.' }, { status: 409 })
    }

    if (action === 'approve' && clubState.status === 'ACTIVE') {
      return NextResponse.json({ error: 'El club ya está activo.' }, { status: 409 })
    }

    if (action === 'request_changes' && clubState.status !== 'PENDING_APPROVAL') {
      return NextResponse.json({ error: 'Solo podés pedir correcciones a clubes pendientes.' }, { status: 409 })
    }

    if (action === 'reject' && clubState.status !== 'PENDING_APPROVAL') {
      return NextResponse.json({ error: 'Solo podés rechazar clubes pendientes.' }, { status: 409 })
    }

    if (action === 'suspend' && clubState.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Solo podés suspender clubes activos.' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const reviewerId = auth.user!.id
    let patch: Record<string, string | boolean | null> = {}

    if (action === 'approve') {
      patch = {
        status: 'ACTIVE' satisfies ClubStatus,
        is_active: true,
        approved_at: now,
        approved_by: reviewerId,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        correction_requested_at: null,
        correction_requested_by: null,
        correction_reason: null,
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
      }
    }

    if (action === 'reject') {
      patch = {
        status: 'REJECTED' satisfies ClubStatus,
        is_active: false,
        rejected_at: now,
        rejected_by: reviewerId,
        rejection_reason: reason,
        correction_requested_at: null,
        correction_requested_by: null,
        correction_reason: null,
      }
    }

    if (action === 'request_changes') {
      patch = {
        status: 'PENDING_APPROVAL' satisfies ClubStatus,
        is_active: false,
        correction_requested_at: now,
        correction_requested_by: reviewerId,
        correction_reason: reason,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      }
    }

    if (action === 'suspend') {
      patch = {
        status: 'SUSPENDED' satisfies ClubStatus,
        is_active: false,
        suspended_at: now,
        suspended_by: reviewerId,
        suspension_reason: reason,
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('clubs')
      .update(patch)
      .eq('id', clubId)
      .select('id,name,is_active,status,rejection_reason,correction_reason,suspension_reason')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    const { data: platformAdmins } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')

    const adminIds = Array.from(new Set((platformAdmins ?? []).map((row: any) => row.user_id).filter(Boolean)))
    if (adminIds.length > 0) {
      const notificationByAction: Record<ClubAction, { type: string; title: string; message: string }> = {
        approve: {
          type: 'club_approved',
          title: 'Club aprobado',
          message: `${updated.name} fue aprobado y quedó activo en la plataforma.`,
        },
        reject: {
          type: 'club_rejected',
          title: 'Club rechazado',
          message: `${updated.name} fue rechazado. Motivo: ${reason}`,
        },
        request_changes: {
          type: 'club_corrections_requested',
          title: 'Correcciones pedidas a un club',
          message: `Se solicitaron correcciones para ${updated.name}. Motivo: ${reason}`,
        },
        suspend: {
          type: 'club_suspended',
          title: 'Club suspendido',
          message: `${updated.name} fue suspendido. Motivo: ${reason}`,
        },
      }

      const notification = notificationByAction[action]
      await supabaseAdmin.from('notifications').insert(
        adminIds.map((userId: string) => ({
          user_id: userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          link: `/platform/clubs?focus=${updated.id}`,
          metadata: withNotificationScope(
            {
              club_id: updated.id,
              club_name: updated.name,
              status: updated.status,
              reason: reason || null,
              actor_user_id: reviewerId,
            },
            'platform'
          ),
        }))
      )
    }

    await logPlatformAction({
      actorUserId: reviewerId,
      action: `club.${action}`,
      entityType: 'club',
      entityId: updated.id,
      entityLabel: updated.name,
      metadata: {
        previous_status: clubState.status,
        next_status: updated.status,
        reason: reason || null,
      },
      req,
    })

    return NextResponse.json({ ok: true, club: updated })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude actualizar el club.' }, { status: 500 })
  }
}
