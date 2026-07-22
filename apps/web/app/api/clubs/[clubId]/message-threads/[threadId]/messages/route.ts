import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { createOperationalNotification, getClubAdminUserIds, notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Context = {
  params: Promise<{ clubId: string; threadId: string }>
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

export async function GET(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId, threadId } = await context.params
  const { data: thread, error: threadError } = await supabaseAdmin
    .from('message_threads')
    .select('id,club_id,player_user_id,subject')
    .eq('id', threadId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 })

  const canRead = thread.player_user_id === user.id || (await userHasClubCapability(user.id, clubId, 'messages:view')) || (await isPlatformAdmin(user.id))
  if (!canRead) return NextResponse.json({ error: 'No autorizado para ver esta conversación.' }, { status: 403 })

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('messages')
    .select('id,thread_id,sender_user_id,recipient_user_id,subject,body,read,read_at,created_at,metadata')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })
  return NextResponse.json({ thread, messages: messages ?? [] })
}

export async function POST(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId, threadId } = await context.params
  const body = await req.json().catch(() => ({}))
  const message = String(body?.message ?? body?.body ?? '').trim()
  if (message.length < 4) return NextResponse.json({ error: 'Escribí un mensaje.' }, { status: 400 })

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject')
    .eq('id', threadId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 })

  const userIsAdmin = (await userHasClubCapability(user.id, clubId, 'messages:reply')) || (await isPlatformAdmin(user.id))
  const userIsPlayer = thread.player_user_id === user.id
  if (!userIsAdmin && !userIsPlayer) {
    return NextResponse.json({ error: 'No autorizado para responder esta conversación.' }, { status: 403 })
  }

  const adminIds = await getClubAdminUserIds(clubId)
  if (!userIsAdmin && !adminIds.length) {
    return NextResponse.json({ error: 'El club no tiene administradores disponibles para recibir mensajes.' }, { status: 409 })
  }
  const recipientUserId = userIsAdmin ? thread.player_user_id : adminIds[0]
  const now = new Date().toISOString()

  const { data: insertedMessage, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_user_id: user.id,
      recipient_user_id: recipientUserId,
      subject: thread.subject,
      body: message,
      kind: 'club_thread',
      metadata: {
        club_id: clubId,
        tournament_id: thread.tournament_id,
      },
    })
    .select('id')
    .single()

  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })

  await supabaseAdmin.from('message_threads').update({ updated_at: now }).eq('id', threadId)

  if (userIsAdmin) {
    await createOperationalNotification({
      userId: thread.player_user_id,
      clubId,
      tournamentId: thread.tournament_id,
      actorId: user.id,
      type: 'club_message_reply',
      title: 'El club respondió tu mensaje',
      body: thread.subject,
      href: thread.tournament_id ? `/torneos/${thread.tournament_id}` : '/mensajes',
      metadata: { thread_id: threadId, message_id: insertedMessage.id },
    })
  } else {
    await notifyClubAdmins(clubId, {
      tournamentId: thread.tournament_id,
      actorId: user.id,
      type: 'club_message',
      title: 'Nuevo mensaje de jugador',
      body: thread.subject,
      href: thread.tournament_id ? `/club/torneos/${thread.tournament_id}` : '/mensajes',
      metadata: { thread_id: threadId, message_id: insertedMessage.id },
    })
  }

  return NextResponse.json({ ok: true, messageId: insertedMessage.id })
}
