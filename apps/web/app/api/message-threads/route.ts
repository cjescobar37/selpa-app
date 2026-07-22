import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability, ensureValidActiveClubForUser, getApprovedMembership } from '@/lib/clubMembershipServer'
import { createOperationalNotification, getClubAdminUserIds, notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ThreadScope = 'player' | 'club' | 'platform'

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function isPlatformAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.user_id)
}

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

function fullName(profile: any) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Usuario'
  )
}

async function getProfilesMap(userIds: string[]) {
  if (!userIds.length) return new Map<string, any>()
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('user_id,email,first_name,last_name,display_name,avatar_url')
    .in('user_id', Array.from(new Set(userIds)))
  return new Map((data ?? []).map((profile: any) => [String(profile.user_id), profile]))
}

async function getClubsMap(clubIds: string[]) {
  if (!clubIds.length) return new Map<string, any>()
  const { data } = await supabaseAdmin
    .from('clubs')
    .select('id,name,logo_url,city,province,theme_key')
    .in('id', Array.from(new Set(clubIds)))
  return new Map((data ?? []).map((club: any) => [String(club.id), club]))
}

async function resolveClubScope(userId: string) {
  const activeClubId = await ensureValidActiveClubForUser(userId, null)
  if (!activeClubId) return { clubId: null, error: 'No hay club activo.' }
  if (!(await userHasClubCapability(userId, activeClubId, 'messages:view'))) return { clubId: null, error: 'No autorizado para ver mensajes del club.' }
  return { clubId: activeClubId, error: null }
}

async function getApprovedPlayerUserIds(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('club_players')
    .select('user_id')
    .eq('club_id', clubId)
    .not('approved_at', 'is', null)

  if (error) throw error
  return new Set((data ?? []).map((row: any) => String(row.user_id)).filter(Boolean))
}

async function getOrCreateOpenThread(input: {
  clubId: string
  tournamentId: string | null
  playerUserId: string
  subject: string
}) {
  let query = supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject,status')
    .eq('club_id', input.clubId)
    .eq('player_user_id', input.playerUserId)
    .eq('status', 'OPEN')
    .limit(1)

  query = input.tournamentId ? query.eq('tournament_id', input.tournamentId) : query.is('tournament_id', null)

  const { data: existing, error: existingError } = await query.maybeSingle()
  if (existingError) throw existingError
  if (existing?.id) return existing

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('message_threads')
    .insert({
      club_id: input.clubId,
      tournament_id: input.tournamentId,
      player_user_id: input.playerUserId,
      subject: input.subject,
      status: 'OPEN',
      metadata: { created_from: 'manual_inbox' },
    })
    .select('id,club_id,tournament_id,player_user_id,subject,status')
    .single()

  if (!insertError) return inserted

  if (String(insertError.code) !== '23505') throw insertError

  let retry = supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject,status')
    .eq('club_id', input.clubId)
    .eq('player_user_id', input.playerUserId)
    .eq('status', 'OPEN')
    .limit(1)

  retry = input.tournamentId ? retry.eq('tournament_id', input.tournamentId) : retry.is('tournament_id', null)
  const { data: found, error: retryError } = await retry.maybeSingle()
  if (retryError) throw retryError
  if (!found) throw insertError
  return found
}

export async function GET(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const scope = (req.nextUrl.searchParams.get('scope') || 'player') as ThreadScope
  let query = supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject,status,created_at,updated_at,metadata')
    .order('updated_at', { ascending: false })
    .limit(80)

  if (scope === 'player') {
    query = query.eq('player_user_id', user.id)
  } else if (scope === 'club') {
    const { clubId, error } = await resolveClubScope(user.id)
    if (error || !clubId) return NextResponse.json({ error }, { status: 403 })
    query = query.eq('club_id', clubId)
  } else if (scope === 'platform') {
    if (!(await isPlatformAdmin(user.id))) return NextResponse.json({ error: 'No autorizado para ver mensajes platform.' }, { status: 403 })
  } else {
    return NextResponse.json({ error: 'Scope inválido.' }, { status: 400 })
  }

  const { data: threadRows, error: threadsError } = await query
  if (threadsError && isMissingSchemaObjectError(threadsError)) {
    return NextResponse.json({ error: 'Falta aplicar la migración de message_threads.' }, { status: 503 })
  }
  if (threadsError) return NextResponse.json({ error: threadsError.message }, { status: 500 })

  const threads = threadRows ?? []
  const threadIds = threads.map((thread: any) => String(thread.id))
  const userIds = threads.map((thread: any) => String(thread.player_user_id)).filter(Boolean)
  const clubIds = threads.map((thread: any) => String(thread.club_id)).filter(Boolean)

  let messages: any[] = []
  if (threadIds.length) {
    const { data: messageRows, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('id,thread_id,sender_user_id,recipient_user_id,subject,body,read,read_at,created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })

    if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })
    messages = messageRows ?? []
    userIds.push(...messages.flatMap((message) => [message.sender_user_id, message.recipient_user_id]).filter(Boolean).map(String))
  }

  const [profiles, clubs] = await Promise.all([getProfilesMap(userIds), getClubsMap(clubIds)])

  const latestByThread = new Map<string, any>()
  const unreadByThread = new Map<string, number>()
  for (const message of messages) {
    const threadId = String(message.thread_id)
    if (!latestByThread.has(threadId)) latestByThread.set(threadId, message)
    if (message.recipient_user_id === user.id && !message.read) {
      unreadByThread.set(threadId, (unreadByThread.get(threadId) ?? 0) + 1)
    }
  }

  return NextResponse.json({
    scope,
    threads: threads.map((thread: any) => {
      const latest = latestByThread.get(String(thread.id)) ?? null
      const playerProfile = profiles.get(String(thread.player_user_id)) ?? null
      const club = clubs.get(String(thread.club_id)) ?? null
      return {
        id: thread.id,
        club_id: thread.club_id,
        tournament_id: thread.tournament_id,
        player_user_id: thread.player_user_id,
        subject: thread.subject,
        status: thread.status,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        metadata: thread.metadata ?? {},
        player: playerProfile ? {
          user_id: playerProfile.user_id,
          name: fullName(playerProfile),
          email: playerProfile.email ?? null,
          avatar_url: playerProfile.avatar_url ?? null,
        } : null,
        club: club ? {
          id: club.id,
          name: club.name,
          logo_url: club.logo_url ?? null,
          city: club.city ?? null,
          province: club.province ?? null,
          theme_key: club.theme_key ?? null,
        } : null,
        latest_message: latest ? {
          id: latest.id,
          body: latest.body,
          created_at: latest.created_at,
          sender_user_id: latest.sender_user_id,
          sender_name: fullName(profiles.get(String(latest.sender_user_id))),
        } : null,
        unread_count: unreadByThread.get(String(thread.id)) ?? 0,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const scope = (String(body?.scope ?? 'player') || 'player') as ThreadScope
  const subject = String(body?.subject ?? '').replace(/\s+/g, ' ').trim()
  const message = String(body?.message ?? body?.body ?? '').trim()
  const requestedClubId = String(body?.clubId ?? '').trim() || null
  const requestedPlayerUserId = String(body?.playerUserId ?? '').trim() || null
  const tournamentId = String(body?.tournamentId ?? '').trim() || null

  if (subject.length < 3) return NextResponse.json({ error: 'Escribí un asunto.' }, { status: 400 })
  if (message.length < 4) return NextResponse.json({ error: 'Escribí un mensaje.' }, { status: 400 })

  let clubId = requestedClubId
  let playerUserId = requestedPlayerUserId
  let senderIsClubSide = false

  if (scope === 'player') {
    clubId = clubId || await ensureValidActiveClubForUser(user.id, null)
    if (!clubId) return NextResponse.json({ error: 'Seleccioná un club activo.' }, { status: 400 })
    const membership = await getApprovedMembership(user.id, clubId)
    if (!membership) return NextResponse.json({ error: 'No pertenecés a ese club.' }, { status: 403 })
    playerUserId = user.id
  } else if (scope === 'club') {
    clubId = clubId || (await resolveClubScope(user.id)).clubId
    if (!clubId) return NextResponse.json({ error: 'No hay club activo.' }, { status: 400 })
    if (!(await userHasClubCapability(user.id, clubId, 'messages:reply'))) {
      return NextResponse.json({ error: 'No autorizado para crear mensajes del club.' }, { status: 403 })
    }
    if (!playerUserId) return NextResponse.json({ error: 'Seleccioná un jugador.' }, { status: 400 })
    const approvedPlayers = await getApprovedPlayerUserIds(clubId)
    if (!approvedPlayers.has(playerUserId)) {
      return NextResponse.json({ error: 'El jugador no pertenece al club o no está aprobado.' }, { status: 403 })
    }
    senderIsClubSide = true
  } else if (scope === 'platform') {
    if (!(await isPlatformAdmin(user.id))) {
      return NextResponse.json({ error: 'No autorizado para crear mensajes platform.' }, { status: 403 })
    }
    if (!clubId || !playerUserId) {
      return NextResponse.json({ error: 'Seleccioná club y destinatario.' }, { status: 400 })
    }
    senderIsClubSide = true
  } else {
    return NextResponse.json({ error: 'Scope inválido.' }, { status: 400 })
  }

  if (!clubId || !playerUserId) {
    return NextResponse.json({ error: 'Faltan datos del destinatario.' }, { status: 400 })
  }

  try {
    const thread = await getOrCreateOpenThread({ clubId, tournamentId, playerUserId, subject })
    const adminIds = senderIsClubSide ? [] : await getClubAdminUserIds(clubId)
    if (!senderIsClubSide && !adminIds.length) {
      return NextResponse.json({ error: 'El club no tiene administradores disponibles para recibir mensajes.' }, { status: 409 })
    }

    const recipientUserId = senderIsClubSide ? playerUserId : adminIds[0]
    const now = new Date().toISOString()
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        thread_id: thread.id,
        sender_user_id: user.id,
        recipient_user_id: recipientUserId,
        subject: thread.subject || subject,
        body: message,
        kind: 'club_thread',
        metadata: {
          club_id: clubId,
          tournament_id: tournamentId,
          source: 'manual_inbox',
        },
      })
      .select('id')
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    await supabaseAdmin.from('message_threads').update({ updated_at: now }).eq('id', thread.id)

    if (senderIsClubSide) {
      await createOperationalNotification({
        userId: playerUserId,
        clubId,
        tournamentId,
        actorId: user.id,
        type: scope === 'platform' ? 'platform_message' : 'club_message_reply',
        title: scope === 'platform' ? 'Nuevo mensaje administrativo' : 'El club te envió un mensaje',
        body: thread.subject || subject,
        href: '/player/mensajes',
        metadata: { thread_id: thread.id, message_id: inserted.id },
      })
    } else {
      await notifyClubAdmins(clubId, {
        tournamentId,
        actorId: user.id,
        type: 'club_message',
        title: 'Nuevo mensaje de jugador',
        body: thread.subject || subject,
        href: '/club/mensajes',
        metadata: { thread_id: thread.id, message_id: inserted.id },
      })
    }

    return NextResponse.json({ ok: true, threadId: thread.id, messageId: inserted.id })
  } catch (error: any) {
    if (isMissingSchemaObjectError(error)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de message_threads/messages.' }, { status: 503 })
    }
    return NextResponse.json({ error: error?.message ?? 'No pude crear el mensaje.' }, { status: 500 })
  }
}
