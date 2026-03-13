import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Contact = {
  user_id: string
  name: string
  email: string | null
  avatar_url: string | null
  kind: 'club_admin' | 'player' | 'platform_admin'
}

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return { user: null }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { user: null }

  return { user: data.user }
}

function fullName(profile: any) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Usuario'
  )
}

async function getActiveClubId(userId: string) {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('active_club_id')
    .eq('user_id', userId)
    .maybeSingle()

  return data?.active_club_id ?? null
}

async function getRole(userId: string, activeClubId: string | null) {
  const { data: pa } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (pa?.user_id) return 'platform' as const

  if (activeClubId) {
    const { data: membership } = await supabaseAdmin
      .from('club_memberships')
      .select('role, status')
      .eq('user_id', userId)
      .eq('club_id', activeClubId)
      .maybeSingle()

    if (
      membership?.status === 'APPROVED' &&
      ['OWNER', 'ADMIN', 'PLANILLERO'].includes(membership.role)
    ) {
      return 'club' as const
    }
  }

  return 'player' as const
}

async function getProfilesMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, any>()

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('user_id, email, first_name, last_name, display_name, avatar_url')
    .in('user_id', userIds)

  return new Map((data ?? []).map((p: any) => [p.user_id, p]))
}

async function getContactsForPlayer(activeClubId: string | null) {
  const contacts: Contact[] = []

  if (activeClubId) {
    const { data: clubAdmins } = await supabaseAdmin
      .from('club_memberships')
      .select('user_id, role, status')
      .eq('club_id', activeClubId)
      .eq('status', 'APPROVED')

    const adminIds = (clubAdmins ?? [])
      .filter((m: any) => ['OWNER', 'ADMIN', 'PLANILLERO'].includes(m.role))
      .map((m: any) => m.user_id)

    const adminProfiles = await getProfilesMap(adminIds)

    adminIds.forEach((id) => {
      const p = adminProfiles.get(id)
      contacts.push({
        user_id: id,
        name: fullName(p),
        email: p?.email ?? null,
        avatar_url: p?.avatar_url ?? null,
        kind: 'club_admin',
      })
    })
  }

  const { data: platformAdmins } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')

  const platformIds = (platformAdmins ?? []).map((p: any) => p.user_id)
  const platformProfiles = await getProfilesMap(platformIds)

  platformIds.forEach((id) => {
    const p = platformProfiles.get(id)
    contacts.push({
      user_id: id,
      name: fullName(p),
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
      kind: 'platform_admin',
    })
  })

  return contacts
}

async function getContactsForClub(activeClubId: string | null) {
  const contacts: Contact[] = []

  if (activeClubId) {
    const { data: members } = await supabaseAdmin
      .from('club_memberships')
      .select('user_id, role, status')
      .eq('club_id', activeClubId)
      .eq('status', 'APPROVED')

    const playerIds = (members ?? [])
      .filter((m: any) => m.role === 'PLAYER')
      .map((m: any) => m.user_id)

    const playerProfiles = await getProfilesMap(playerIds)

    playerIds.forEach((id) => {
      const p = playerProfiles.get(id)
      contacts.push({
        user_id: id,
        name: fullName(p),
        email: p?.email ?? null,
        avatar_url: p?.avatar_url ?? null,
        kind: 'player',
      })
    })
  }

  const { data: platformAdmins } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')

  const platformIds = (platformAdmins ?? []).map((p: any) => p.user_id)
  const platformProfiles = await getProfilesMap(platformIds)

  platformIds.forEach((id) => {
    const p = platformProfiles.get(id)
    contacts.push({
      user_id: id,
      name: fullName(p),
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
      kind: 'platform_admin',
    })
  })

  return contacts
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const activeClubId = await getActiveClubId(user.id)
    const role = await getRole(user.id, activeClubId)

    const { data: inbox, error: inboxError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .or(`sender_user_id.eq.${user.id},recipient_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (inboxError) {
      return NextResponse.json({ error: inboxError.message }, { status: 500 })
    }

    const userIds = Array.from(
      new Set(
        (inbox ?? []).flatMap((m: any) => [m.sender_user_id, m.recipient_user_id]).filter(Boolean)
      )
    )

    const profilesMap = await getProfilesMap(userIds)

    const messages = (inbox ?? []).map((m: any) => ({
      ...m,
      sender_profile: profilesMap.get(m.sender_user_id) ?? null,
      recipient_profile: profilesMap.get(m.recipient_user_id) ?? null,
    }))

    let contacts: Contact[] = []
    if (role === 'player') contacts = await getContactsForPlayer(activeClubId)
    if (role === 'club') contacts = await getContactsForClub(activeClubId)

    return NextResponse.json({
      role,
      activeClubId,
      contacts,
      messages,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error cargando mensajes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const body = await req.json()
    const recipientUserId = String(body?.recipientUserId ?? '')
    const subject = String(body?.subject ?? '').trim()
    const message = String(body?.message ?? '').trim()
    const kind = String(body?.kind ?? 'direct')

    if (!recipientUserId || !subject || !message) {
      return NextResponse.json({ error: 'Completá destinatario, asunto y mensaje.' }, { status: 400 })
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        sender_user_id: user.id,
        recipient_user_id: recipientUserId,
        subject,
        body: message,
        kind,
      })
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await supabaseAdmin.from('notifications').insert({
      user_id: recipientUserId,
      sender_user_id: user.id,
      type: 'message',
      title: subject,
      message,
      link: '/mensajes',
      metadata: {
        message_id: inserted.id,
        kind,
      },
    })

    return NextResponse.json({ ok: true, id: inserted.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error enviando mensaje' }, { status: 500 })
  }
}