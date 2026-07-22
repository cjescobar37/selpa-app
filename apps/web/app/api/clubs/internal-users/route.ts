import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { clubInviteErrorResponse } from '@/lib/clubTeamInviteErrors'
import {
  isApprovedMembership,
  isInternalClubRole,
  isManageableInternalRole,
  type ClubRole,
} from '@/lib/clubMembershipRules'

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type MembershipRow = {
  id: string
  club_id: string
  user_id: string
  role: ClubRole
  status: string
  approved_at: string | null
  created_at: string
  updated_at: string
}

type InviteRow = {
  id: string
  club_id: string
  email: string
  role: ClubRole
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'
  invited_by: string
  resolved_by: string | null
  resolved_at: string | null
  target_user_id: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

type AuditRow = {
  id: string
  actor_user_id: string
  target_user_id: string | null
  action: string
  old_role: ClubRole | null
  new_role: ClubRole | null
  metadata: Record<string, unknown>
  created_at: string
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function getFullName(profile?: ProfileRow | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Usuario'
  )
}

async function getProfilesMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, ProfileRow>()

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email,first_name,last_name,display_name,avatar_url')
    .in('user_id', userIds)

  if (error) throw error

  return new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
}

function isMissingInternalUsersSchema(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ''
  return (
    message.includes('club_user_invites') ||
    message.includes('club_invite_status') ||
    message.includes('OPERATIVO') ||
    message.includes('invalid input value for enum')
  )
}

function schemaErrorResponse() {
  return NextResponse.json(
    {
      error: 'La gestión interna del club todavía no está inicializada en la base conectada. Aplicá la migración 20260414_club_internal_users.sql.',
      code: 'CLUB_INTERNAL_USERS_SCHEMA_MISSING',
    },
    { status: 409 }
  )
}

export async function GET(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const clubId = String(req.nextUrl.searchParams.get('clubId') ?? '').trim()
  if (!clubId) {
    return NextResponse.json({ error: 'Falta clubId.' }, { status: 400 })
  }

  const canViewRoles = await userHasClubCapability(user.id, clubId, 'roles:view')
  if (!canViewRoles) {
    return NextResponse.json({ error: 'No tenés permisos para ver usuarios internos.' }, { status: 403 })
  }

  const [membershipsRes, invitesRes, auditRes] = await Promise.all([
    supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status,approved_at,created_at,updated_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('club_user_invites')
      .select('id,club_id,email,role,status,invited_by,resolved_by,resolved_at,target_user_id,created_at,updated_at,expires_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('club_team_audit')
      .select('id,actor_user_id,target_user_id,action,old_role,new_role,metadata,created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (membershipsRes.error) {
    return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })
  }

  if (invitesRes.error) {
    if (isMissingInternalUsersSchema(invitesRes.error)) return schemaErrorResponse()
    return NextResponse.json({ error: invitesRes.error.message }, { status: 500 })
  }

  const staffMemberships = ((membershipsRes.data ?? []) as MembershipRow[])
    .filter((membership) => isApprovedMembership(membership))
    .filter((membership) => isInternalClubRole(membership.role))

  const invites = (invitesRes.data ?? []) as InviteRow[]
  const audit = (auditRes.data ?? []) as AuditRow[]
  const profileIds = Array.from(
    new Set([
      ...staffMemberships.map((membership) => membership.user_id),
      ...invites.map((invite) => invite.invited_by),
      ...invites.map((invite) => invite.resolved_by).filter(Boolean) as string[],
      ...invites.map((invite) => invite.target_user_id).filter(Boolean) as string[],
      ...audit.map((event) => event.actor_user_id),
      ...audit.map((event) => event.target_user_id).filter(Boolean) as string[],
    ])
  )

  const profilesMap = await getProfilesMap(profileIds)

  return NextResponse.json({
    staff: staffMemberships.map((membership) => {
      const profile = profilesMap.get(membership.user_id) ?? null
      return {
        ...membership,
        profile,
        full_name: getFullName(profile),
      }
    }),
    invites: invites.map((invite) => ({
      ...invite,
      invited_by_profile: profilesMap.get(invite.invited_by) ?? null,
      resolved_by_profile: invite.resolved_by ? (profilesMap.get(invite.resolved_by) ?? null) : null,
      target_user_profile: invite.target_user_id ? (profilesMap.get(invite.target_user_id) ?? null) : null,
    })),
    audit: audit.map((event) => ({
      ...event,
      actor_profile: profilesMap.get(event.actor_user_id) ?? null,
      target_profile: event.target_user_id ? (profilesMap.get(event.target_user_id) ?? null) : null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const email = normalizeEmail(body?.email)
  const role = String(body?.role ?? '').trim() as ClubRole

  if (!clubId || !email || !role) {
    return NextResponse.json({ error: 'Faltan clubId, email o role.' }, { status: 400 })
  }

  if (!isManageableInternalRole(role)) {
    return NextResponse.json({ error: 'Rol interno inválido para esta fase.' }, { status: 400 })
  }

  const canManageRoles = await userHasClubCapability(user.id, clubId, 'roles:manage')
  if (!canManageRoles) {
    return NextResponse.json({ error: 'No tenés permisos para invitar usuarios internos.' }, { status: 403 })
  }

  const { data: invite, error } = await supabaseAdmin.rpc('create_club_team_invite_atomic', {
    p_club_id: clubId,
    p_email: email,
    p_role: role,
    p_actor_user_id: user.id,
  })
  if (error) return clubInviteErrorResponse(error)
  return NextResponse.json({ ok: true, invite })
}

export async function PATCH(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const membershipId = String(body?.membershipId ?? '').trim()
  const role = String(body?.role ?? '').trim() as ClubRole
  if (!clubId || !membershipId || !isManageableInternalRole(role)) {
    return NextResponse.json({ error: 'Datos de rol inválidos.' }, { status: 400 })
  }
  if (!(await userHasClubCapability(user.id, clubId, 'roles:manage'))) {
    return NextResponse.json({ error: 'No tenés permisos para modificar roles.' }, { status: 403 })
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('club_memberships')
    .select('id,club_id,user_id,role,status,approved_at')
    .eq('id', membershipId)
    .eq('club_id', clubId)
    .maybeSingle()
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Membresía no encontrada.' }, { status: 404 })
  if (target.role === 'OWNER') {
    return NextResponse.json({ error: 'La propiedad requiere el flujo de transferencia.' }, { status: 409 })
  }

  const { data: membership, error } = await supabaseAdmin.rpc('change_club_staff_role_atomic', {
    p_club_id: clubId,
    p_membership_id: membershipId,
    p_new_role: role,
    p_actor_user_id: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, membership })
}

export async function DELETE(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clubId = String(body?.clubId ?? '').trim()
  const membershipId = String(body?.membershipId ?? '').trim()
  if (!clubId || !membershipId) return NextResponse.json({ error: 'Faltan clubId o membershipId.' }, { status: 400 })
  if (!(await userHasClubCapability(user.id, clubId, 'roles:manage'))) {
    return NextResponse.json({ error: 'No tenés permisos para remover usuarios internos.' }, { status: 403 })
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('club_memberships')
    .select('id,club_id,user_id,role')
    .eq('id', membershipId)
    .eq('club_id', clubId)
    .maybeSingle()
  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Membresía no encontrada.' }, { status: 404 })
  if (target.role === 'OWNER') {
    return NextResponse.json({ error: 'No se puede remover un OWNER sin transferencia de propiedad.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.rpc('remove_club_staff_atomic', {
    p_club_id: clubId,
    p_membership_id: membershipId,
    p_actor_user_id: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
