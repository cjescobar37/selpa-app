import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { createOperationalNotification, getClubAdminUserIds, notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Context = {
  params: Promise<{ threadId: string }>
}

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

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('column') || message.includes('schema cache')
}

async function getThreadForUser(threadId: string, userId: string) {
  const { data: thread, error } = await supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject,status,metadata,created_at,updated_at')
    .eq('id', threadId)
    .maybeSingle()

  if (error) return { thread: null, error }
  if (!thread) return { thread: null, error: null }

  const canAccess = thread.player_user_id === userId || (await userHasClubCapability(userId, thread.club_id, 'messages:view')) || (await isPlatformAdmin(userId))
  if (!canAccess) return { thread: null, error: null }

  return { thread, error: null }
}

export async function GET(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { threadId } = await context.params
  const { thread, error } = await getThreadForUser(threadId, user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 })

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('messages')
    .select('id,thread_id,sender_user_id,recipient_user_id,subject,body,read,read_at,created_at,metadata')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })

  const now = new Date().toISOString()
  const { error: readUpdateError } = await supabaseAdmin
    .from('messages')
    .update({ read: true, read_at: now })
    .eq('thread_id', threadId)
    .eq('recipient_user_id', user.id)
    .eq('read', false)

  if (readUpdateError && isMissingColumnError(readUpdateError)) {
    await supabaseAdmin
      .from('messages')
      .update({ read: true })
      .eq('thread_id', threadId)
      .eq('recipient_user_id', user.id)
      .eq('read', false)
  }

  const profiles = await getProfilesMap((messages ?? []).flatMap((message: any) => [message.sender_user_id, message.recipient_user_id]).filter(Boolean).map(String))

  return NextResponse.json({
    thread,
    messages: (messages ?? []).map((message: any) => ({
      ...message,
      read: message.recipient_user_id === user.id ? true : message.read,
      read_at: message.recipient_user_id === user.id ? (message.read_at ?? now) : message.read_at,
      sender_profile: profiles.get(String(message.sender_user_id)) ?? null,
      sender_name: fullName(profiles.get(String(message.sender_user_id))),
    })),
  })
}

export async function POST(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { threadId } = await context.params
  const body = await req.json().catch(() => ({}))
  const message = String(body?.message ?? body?.body ?? '').trim()
  if (message.length < 4) return NextResponse.json({ error: 'Escribí un mensaje.' }, { status: 400 })

  const { thread, error } = await getThreadForUser(threadId, user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 })

  const userIsAdmin = (await userHasClubCapability(user.id, thread.club_id, 'messages:reply')) || (await isPlatformAdmin(user.id))
  const adminIds = userIsAdmin ? [] : await getClubAdminUserIds(thread.club_id)
  if (!userIsAdmin && !adminIds.length) {
    return NextResponse.json({ error: 'El club no tiene administradores disponibles para recibir mensajes.' }, { status: 409 })
  }
  const recipientUserId = userIsAdmin ? thread.player_user_id : adminIds[0]
  const now = new Date().toISOString()

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_user_id: user.id,
      recipient_user_id: recipientUserId,
      subject: thread.subject,
      body: message,
      kind: 'club_thread',
      metadata: {
        club_id: thread.club_id,
        tournament_id: thread.tournament_id,
      },
    })
    .select('id')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await supabaseAdmin.from('message_threads').update({ updated_at: now }).eq('id', threadId)

  if (userIsAdmin) {
    await createOperationalNotification({
      userId: thread.player_user_id,
      clubId: thread.club_id,
      tournamentId: thread.tournament_id,
      actorId: user.id,
      type: 'club_message_reply',
      title: 'El club respondió tu mensaje',
      body: thread.subject,
      href: thread.tournament_id ? `/torneos/${thread.tournament_id}` : '/player/mensajes',
      metadata: { thread_id: threadId, message_id: inserted.id },
    })
  } else {
    await notifyClubAdmins(thread.club_id, {
      tournamentId: thread.tournament_id,
      actorId: user.id,
      type: 'club_message',
      title: 'Nuevo mensaje de jugador',
      body: thread.subject,
      href: thread.tournament_id ? `/club/torneos/${thread.tournament_id}` : '/club/mensajes',
      metadata: { thread_id: threadId, message_id: inserted.id },
    })
  }

  return NextResponse.json({ ok: true, messageId: inserted.id })
}
