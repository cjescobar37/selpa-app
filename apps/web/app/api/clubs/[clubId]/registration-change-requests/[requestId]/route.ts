import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { createOperationalNotification } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Context = {
  params: Promise<{ clubId: string; requestId: string }>
}

type ChangeRequestRow = {
  id: string
  club_id: string
  tournament_id: string
  team_id: string | null
  registration_id: string | null
  requested_by: string
  type: string
  status: string
  refund_percent?: number | null
  refund_policy_label?: string | null
  created_at?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
}

const allowedStatuses = new Set(['APPROVED', 'REJECTED'])

// Keep older deployments usable while the refund metadata migration reaches Supabase.
function isMissingRefundColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('refund_')
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

export async function PATCH(req: NextRequest, context: Context) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const { clubId, requestId } = await context.params
  const canManage = (await userHasClubCapability(user.id, clubId, 'registrations:manage')) || (await isPlatformAdmin(user.id))
  if (!canManage) return NextResponse.json({ error: 'No autorizado para gestionar bajas.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const status = String(body?.status ?? '').trim().toUpperCase()
  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Estado inválido. Usá APPROVED o REJECTED.' }, { status: 400 })
  }

  const currentModernResult = await supabaseAdmin
    .from('tournament_registration_change_requests')
    .select('id,club_id,tournament_id,team_id,registration_id,requested_by,type,status,refund_percent,refund_policy_label')
    .eq('id', requestId)
    .eq('club_id', clubId)
    .maybeSingle()

  let currentData = currentModernResult.data as ChangeRequestRow | null
  let currentError = currentModernResult.error
  if (currentError && isMissingRefundColumnError(currentError)) {
    const currentLegacyResult = await supabaseAdmin
      .from('tournament_registration_change_requests')
      .select('id,club_id,tournament_id,team_id,registration_id,requested_by,type,status')
      .eq('id', requestId)
      .eq('club_id', clubId)
      .maybeSingle()
    currentData = currentLegacyResult.data as ChangeRequestRow | null
    currentError = currentLegacyResult.error
  }

  if (currentError) return NextResponse.json({ error: 'No se pudo consultar la solicitud de baja.' }, { status: 500 })
  const current = currentData
    ? {
        ...currentData,
        refund_percent: currentData.refund_percent ?? null,
        refund_policy_label: currentData.refund_policy_label ?? 'A confirmar',
      }
    : null
  if (!current) return NextResponse.json({ error: 'Solicitud de baja no encontrada para este club.' }, { status: 404 })
  if (String(current.type).toUpperCase() !== 'CANCEL_REGISTRATION') {
    return NextResponse.json({ error: 'Tipo de solicitud no soportado.' }, { status: 400 })
  }
  if (String(current.status).toUpperCase() !== 'PENDING') {
    return NextResponse.json({ error: 'La solicitud ya fue resuelta.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const updateModernResult = await supabaseAdmin
    .from('tournament_registration_change_requests')
    .update({
      status,
      resolved_at: now,
      resolved_by: user.id,
    })
    .eq('id', requestId)
    .eq('club_id', clubId)
    .select('id,club_id,tournament_id,team_id,registration_id,requested_by,type,status,refund_percent,refund_policy_label,created_at,resolved_at,resolved_by')
    .maybeSingle()

  let updateData = updateModernResult.data as ChangeRequestRow | null
  let updateError = updateModernResult.error
  if (updateError && isMissingRefundColumnError(updateError)) {
    const updateLegacyResult = await supabaseAdmin
      .from('tournament_registration_change_requests')
      .update({ status, resolved_at: now, resolved_by: user.id })
      .eq('id', requestId)
      .eq('club_id', clubId)
      .select('id,club_id,tournament_id,team_id,registration_id,requested_by,type,status,created_at,resolved_at,resolved_by')
      .maybeSingle()
    updateData = updateLegacyResult.data as ChangeRequestRow | null
    updateError = updateLegacyResult.error
  }

  if (updateError) return NextResponse.json({ error: 'No se pudo resolver la solicitud de baja.' }, { status: 500 })
  const requestRow = updateData
    ? {
        ...updateData,
        refund_percent: updateData.refund_percent ?? null,
        refund_policy_label: updateData.refund_policy_label ?? 'A confirmar',
      }
    : null

  if (status === 'APPROVED' && current.registration_id) {
    const { error: registrationUpdateError } = await supabaseAdmin
      .from('tournament_registrations')
      .update({ status: 'CANCELLED', updated_at: now })
      .eq('id', current.registration_id)
      .eq('club_id', clubId)

    if (registrationUpdateError) {
      await supabaseAdmin
        .from('tournament_registration_change_requests')
        .update({ status: 'PENDING', resolved_at: null, resolved_by: null })
        .eq('id', requestId)
        .eq('club_id', clubId)

      return NextResponse.json({ error: registrationUpdateError.message }, { status: 500 })
    }
  }

  const { data: team } = current.team_id
    ? await supabaseAdmin
      .from('tournament_teams')
      .select('player1_user_id,player2_user_id')
      .eq('id', current.team_id)
      .maybeSingle()
    : { data: null }

  const recipients = Array.from(new Set([current.requested_by, team?.player1_user_id, team?.player2_user_id].filter(Boolean).map(String)))
  await Promise.all(recipients.map((recipientId) => createOperationalNotification({
    userId: recipientId,
    clubId,
    tournamentId: current.tournament_id,
    actorId: user.id,
    type: status === 'APPROVED' ? 'registration_cancel_approved' : 'registration_cancel_rejected',
    title: status === 'APPROVED' ? 'Baja aprobada' : 'Baja rechazada',
    body: status === 'APPROVED'
      ? 'El club aprobó tu solicitud de baja del torneo.'
      : 'El club rechazó tu solicitud de baja. Tu inscripción se mantiene activa.',
    href: `/torneos/${current.tournament_id}`,
    metadata: {
      request_id: current.id,
      registration_id: current.registration_id,
      team_id: current.team_id,
      refund_percent: current.refund_percent,
      refund_policy_label: current.refund_policy_label,
    },
  })))

  return NextResponse.json({ ok: true, request: requestRow })
}
