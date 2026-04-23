import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isClubOwner } from '@/lib/clubMembershipServer'
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

  const isOwner = await isClubOwner(user.id, clubId)
  if (!isOwner) {
    return NextResponse.json({ error: 'Solo el OWNER puede gestionar usuarios internos.' }, { status: 403 })
  }

  const [membershipsRes, invitesRes] = await Promise.all([
    supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status,approved_at,created_at,updated_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('club_user_invites')
      .select('id,club_id,email,role,status,invited_by,resolved_by,resolved_at,target_user_id,created_at,updated_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
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
  const profileIds = Array.from(
    new Set([
      ...staffMemberships.map((membership) => membership.user_id),
      ...invites.map((invite) => invite.invited_by),
      ...invites.map((invite) => invite.resolved_by).filter(Boolean) as string[],
      ...invites.map((invite) => invite.target_user_id).filter(Boolean) as string[],
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

  const isOwner = await isClubOwner(user.id, clubId)
  if (!isOwner) {
    return NextResponse.json({ error: 'Solo el OWNER puede invitar usuarios internos.' }, { status: 403 })
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email')
    .eq('email', email)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (existingProfile?.user_id) {
    const { data: existingMembership, error: membershipError } = await supabaseAdmin
      .from('club_memberships')
      .select('id,status,approved_at')
      .eq('club_id', clubId)
      .eq('user_id', existingProfile.user_id)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (existingMembership && isApprovedMembership(existingMembership)) {
      return NextResponse.json({ error: 'Ese usuario ya tiene una membership aprobada en el club.' }, { status: 409 })
    }
  }

  const { data: existingInvite, error: inviteCheckError } = await supabaseAdmin
    .from('club_user_invites')
    .select('id')
    .eq('club_id', clubId)
    .eq('email', email)
    .eq('status', 'PENDING')
    .maybeSingle()

  if (inviteCheckError) {
    return NextResponse.json({ error: inviteCheckError.message }, { status: 500 })
  }

  if (existingInvite?.id) {
    return NextResponse.json({ error: 'Ya existe una invitación pendiente para ese email en este club.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data: invite, error: insertError } = await supabaseAdmin
    .from('club_user_invites')
    .insert({
      club_id: clubId,
      email,
      role,
      status: 'PENDING',
      invited_by: user.id,
      target_user_id: existingProfile?.user_id ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id,club_id,email,role,status,invited_by,resolved_by,resolved_at,target_user_id,created_at,updated_at')
    .maybeSingle()

  if (insertError) {
    if (isMissingInternalUsersSchema(insertError)) return schemaErrorResponse()
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invite })
}
