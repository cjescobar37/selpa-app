import { NextRequest, NextResponse } from 'next/server'
import { notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type RegistrationChangeRequestContext = {
  params: Promise<{ tournamentId: string }>
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

function normalizeRefundPercent(value: unknown) {
  const percent = Number(value ?? 0)
  if (!Number.isFinite(percent)) return null
  return Math.max(0, Math.min(100, Math.round(percent)))
}

function buildRefundPolicyLabel(percent: number | null) {
  if (percent === 100) return '+72 hs: 100%'
  if (percent === 75) return '48-72 hs: 75%'
  if (percent === 50) return '24-48 hs: 50%'
  if (percent === 0) return '<24 hs: 0% o revisión admin'
  return 'Sujeto a aprobación del club'
}

export async function POST(req: NextRequest, context: RegistrationChangeRequestContext) {
  const { tournamentId } = await context.params
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para solicitar la baja.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const type = String(body?.type ?? '').trim().toUpperCase()
  const reason = String(body?.reason ?? '').trim()
  const refundPercent = normalizeRefundPercent(body?.refundEstimatePercent ?? body?.refundPercent)
  const refundPolicyLabel = String(body?.refundPolicyLabel ?? '').trim() || buildRefundPolicyLabel(refundPercent)
  const refundMetadata = {
    hours_before_start: Number.isFinite(Number(body?.hoursBeforeStart)) ? Number(body.hoursBeforeStart) : null,
    estimated_refund_percent: refundPercent,
    estimated_refund_amount: Number.isFinite(Number(body?.refundEstimateAmount)) ? Number(body.refundEstimateAmount) : null,
    policy_label: refundPolicyLabel,
    calculated_at: new Date().toISOString(),
    method: 'client_estimate',
  }

  if (type !== 'CANCEL_REGISTRATION') {
    return NextResponse.json({ error: 'Tipo de solicitud inválido.' }, { status: 400 })
  }

  if (reason.length < 8) {
    return NextResponse.json({ error: 'Contanos brevemente el motivo de la baja.' }, { status: 400 })
  }

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('tournament_teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('club_id', tournament.club_id)
    .or(`player1_user_id.eq.${user.id},player2_user_id.eq.${user.id}`)

  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })
  const teamIds = (teams ?? []).map((team) => String(team.id))
  if (!teamIds.length) return NextResponse.json({ error: 'No encontramos tu equipo en este torneo.' }, { status: 404 })

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id,team_id,status')
    .eq('tournament_id', tournamentId)
    .eq('club_id', tournament.club_id)
    .in('team_id', teamIds)

  if (registrationsError) return NextResponse.json({ error: registrationsError.message }, { status: 500 })

  const registration = (registrations ?? []).find((row) => String(row.status ?? '').toUpperCase() !== 'CANCELLED')
  if (!registration) return NextResponse.json({ error: 'No encontramos una inscripción activa.' }, { status: 404 })

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('tournament_registration_change_requests')
    .select('id,status,type,reason,refund_percent,refund_policy_label,refund_metadata,created_at,resolved_at,resolved_by')
    .eq('tournament_id', tournamentId)
    .eq('registration_id', registration.id)
    .eq('requested_by', user.id)
    .eq('type', 'CANCEL_REGISTRATION')
    .eq('status', 'PENDING')
    .maybeSingle()

  if (existingError && isMissingSchemaObjectError(existingError)) {
    return NextResponse.json(
      {
        error: 'No se pudo procesar la solicitud de baja porque falta activar las columnas de reintegro.',
        code: 'REFUND_METADATA_SCHEMA_MISSING',
      },
      { status: 503 }
    )
  }

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing) return NextResponse.json({ ok: true, request: existing })

  const { data: requestRow, error: insertError } = await supabaseAdmin
    .from('tournament_registration_change_requests')
    .insert({
      tournament_id: tournamentId,
      club_id: tournament.club_id,
      team_id: registration.team_id,
      registration_id: registration.id,
      requested_by: user.id,
      type: 'CANCEL_REGISTRATION',
      status: 'PENDING',
      reason,
      refund_percent: refundPercent,
      refund_policy_label: refundPolicyLabel,
      refund_metadata: refundMetadata,
    })
    .select('id,tournament_id,club_id,team_id,registration_id,requested_by,type,status,reason,refund_percent,refund_policy_label,refund_metadata,created_at,resolved_at,resolved_by')
    .single()

  if (insertError && isMissingSchemaObjectError(insertError)) {
    return NextResponse.json(
      {
        error: 'No se pudo guardar la solicitud de baja porque falta activar las columnas de reintegro.',
        code: 'REFUND_METADATA_SCHEMA_MISSING',
      },
      { status: 503 }
    )
  }

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  await notifyClubAdmins(tournament.club_id, {
    tournamentId,
    actorId: user.id,
    type: 'registration_cancel_requested',
    title: 'Baja solicitada',
    body: 'Una pareja solicitó la baja del torneo.',
    href: `/club/torneos/${tournamentId}`,
    metadata: {
      request_id: requestRow.id,
      registration_id: registration.id,
      team_id: registration.team_id,
      refund_percent: refundPercent,
      refund_policy_label: refundPolicyLabel,
    },
  })

  return NextResponse.json({ ok: true, request: requestRow })
}
