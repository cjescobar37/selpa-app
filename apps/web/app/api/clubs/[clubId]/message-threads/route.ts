import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { getClubAdminUserIds, notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Context = {
  params: Promise<{ clubId: string }>
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

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

async function isPlatformAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data?.user_id)
}

async function canUserStartClubThread(userId: string, clubId: string, tournamentId: string | null) {
  if ((await isClubAdmin(userId, clubId)) || (await isPlatformAdmin(userId))) return true

  const { data: clubPlayer } = await supabaseAdmin
    .from('club_players')
    .select('id,approved_at')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .not('approved_at', 'is', null)
    .maybeSingle()

  if (clubPlayer?.id) return true
  if (!tournamentId) return false

  const { data: team } = await supabaseAdmin
    .from('tournament_teams')
    .select('id')
    .eq('club_id', clubId)
    .eq('tournament_id', tournamentId)
    .or(`player1_user_id.eq.${userId},player2_user_id.eq.${userId}`)
    .maybeSingle()

  return Boolean(team?.id)
}

export async function GET(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId } = await context.params
  const canManage = (await isClubAdmin(user.id, clubId)) || (await isPlatformAdmin(user.id))
  if (!canManage) return NextResponse.json({ error: 'No autorizado para ver mensajes del club.' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('message_threads')
    .select('id,club_id,tournament_id,player_user_id,subject,status,created_at,updated_at,metadata')
    .eq('club_id', clubId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error && isMissingSchemaObjectError(error)) {
    return NextResponse.json({ error: 'Falta aplicar la migración de message_threads.' }, { status: 503 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ threads: data ?? [] })
}

export async function POST(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para enviar un mensaje.' }, { status: 401 })

  const { clubId } = await context.params
  const body = await req.json().catch(() => ({}))
  const tournamentId = body?.tournamentId ? String(body.tournamentId) : null
  const subject = String(body?.subject ?? 'Consulta al club').trim()
  const message = String(body?.message ?? body?.body ?? '').trim()
  const contextLabel = String(body?.context ?? 'general').trim() || 'general'

  if (subject.length < 3 || message.length < 4) {
    return NextResponse.json({ error: 'Completá asunto y mensaje.' }, { status: 400 })
  }

  if (tournamentId) {
    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id')
      .eq('id', tournamentId)
      .maybeSingle()

    if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    if (!tournament || tournament.club_id !== clubId) {
      return NextResponse.json({ error: 'El torneo no pertenece a este club.' }, { status: 400 })
    }
  }

  const canStartThread = await canUserStartClubThread(user.id, clubId, tournamentId)
  if (!canStartThread) {
    return NextResponse.json({ error: 'No autorizado para escribirle a este club.' }, { status: 403 })
  }

  let existingQuery = supabaseAdmin
    .from('message_threads')
    .select('id,subject,status')
    .eq('club_id', clubId)
    .eq('player_user_id', user.id)
    .eq('status', 'OPEN')
  existingQuery = tournamentId ? existingQuery.eq('tournament_id', tournamentId) : existingQuery.is('tournament_id', null)

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()

  if (existingError && isMissingSchemaObjectError(existingError)) {
    return NextResponse.json({ error: 'Falta aplicar la migración de mensajería del club.' }, { status: 503 })
  }
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const now = new Date().toISOString()
  let threadId = existing?.id as string | undefined

  if (!threadId) {
    const { data: insertedThread, error: threadError } = await supabaseAdmin
      .from('message_threads')
      .insert({
        club_id: clubId,
        tournament_id: tournamentId,
        player_user_id: user.id,
        subject,
        status: 'OPEN',
        updated_at: now,
        metadata: { context: contextLabel },
      })
      .select('id')
      .single()

    if (threadError && isMissingSchemaObjectError(threadError)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de mensajería del club.' }, { status: 503 })
    }
    if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
    threadId = insertedThread.id
  } else {
    await supabaseAdmin
      .from('message_threads')
      .update({ updated_at: now })
      .eq('id', threadId)
  }

  const adminIds = await getClubAdminUserIds(clubId)
  if (!adminIds.length) {
    return NextResponse.json({ error: 'El club no tiene administradores disponibles para recibir mensajes.' }, { status: 409 })
  }
  const recipientUserId = adminIds[0]

  const { data: insertedMessage, error: messageError } = await supabaseAdmin
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_user_id: user.id,
      recipient_user_id: recipientUserId,
      subject,
      body: message,
      kind: 'club_thread',
      metadata: {
        club_id: clubId,
        tournament_id: tournamentId,
        context: contextLabel,
      },
    })
    .select('id')
    .single()

  if (messageError && isMissingSchemaObjectError(messageError)) {
    return NextResponse.json({ error: 'Falta aplicar la migración de mensajes con thread_id.' }, { status: 503 })
  }
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })

  await notifyClubAdmins(clubId, {
    tournamentId,
    actorId: user.id,
    type: 'club_message',
    title: 'Nuevo mensaje de jugador',
    body: subject,
    href: tournamentId ? `/club/torneos/${tournamentId}` : '/mensajes',
    metadata: {
      thread_id: threadId,
      message_id: insertedMessage.id,
      context: contextLabel,
    },
  })

  return NextResponse.json({ ok: true, threadId, messageId: insertedMessage.id })
}
