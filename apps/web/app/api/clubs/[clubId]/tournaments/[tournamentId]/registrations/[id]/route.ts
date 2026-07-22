import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'
type AdmissionAction = 'validate_payment' | 'approve_pay_at_venue' | 'grant_exception' | 'block'
type AdmissionStatus =
  | 'MANUAL_PAYMENT_VALIDATED'
  | 'PAY_AT_VENUE_APPROVED'
  | 'EXCEPTION_APPROVED'
  | 'BLOCKED'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function normalizeStatus(value: unknown): RegistrationStatus | null {
  const status = String(value ?? '').trim().toUpperCase()
  if (status === 'CONFIRMED' || status === 'PENDING' || status === 'CANCELLED') return status
  if (status === 'APPROVE' || status === 'APPROVED') return 'CONFIRMED'
  if (status === 'CANCEL' || status === 'CANCELED') return 'CANCELLED'
  return null
}

function normalizeAdmissionAction(value: unknown): AdmissionAction | null {
  const action = String(value ?? '').trim().toLowerCase()
  if (
    action === 'validate_payment' ||
    action === 'approve_pay_at_venue' ||
    action === 'grant_exception' ||
    action === 'block'
  ) {
    return action
  }
  return null
}

function getAdmissionStatusForAction(action: AdmissionAction): AdmissionStatus {
  if (action === 'validate_payment') return 'MANUAL_PAYMENT_VALIDATED'
  if (action === 'approve_pay_at_venue') return 'PAY_AT_VENUE_APPROVED'
  if (action === 'grant_exception') return 'EXCEPTION_APPROVED'
  return 'BLOCKED'
}

function defaultAdmissionReason(action: AdmissionAction) {
  if (action === 'validate_payment') return 'Pago validado manualmente.'
  if (action === 'approve_pay_at_venue') return 'Pago en predio aprobado.'
  if (action === 'grant_exception') return 'Excepción aprobada.'
  return 'Bloqueada para competir.'
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string; id: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId, id } = await context.params
    const canManage = await userHasClubCapability(user.id, clubId, 'registrations:manage')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para gestionar inscripciones.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const admissionAction = normalizeAdmissionAction(body?.action)
    const nextStatus = normalizeStatus(body?.status ?? body?.action)

    const { data: current, error: currentError } = await supabaseAdmin
      .from('tournament_registrations')
      .select('id,tournament_id,club_id,status')
      .eq('id', id)
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 })
    }

    if (!current) {
      return NextResponse.json({ error: 'Inscripción no encontrada para este torneo.' }, { status: 404 })
    }

    if (current.status === 'CANCELLED') {
      return NextResponse.json({ error: 'La inscripción ya está cancelada.' }, { status: 409 })
    }

    if (admissionAction) {
      const reason = String(body?.reason ?? '').trim()
      if ((admissionAction === 'grant_exception' || admissionAction === 'block') && !reason) {
        return NextResponse.json(
          { error: 'Esta acción requiere un motivo breve.', code: 'REASON_REQUIRED' },
          { status: 400 }
        )
      }

      const admissionStatus = getAdmissionStatusForAction(admissionAction)
      const resolvedReason = reason || defaultAdmissionReason(admissionAction)
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tournament_registrations')
        .update({
          admission_status: admissionStatus,
          admission_reason: resolvedReason,
          admission_by: user.id,
          admission_at: new Date().toISOString(),
          eligibility_blocked_reason: admissionAction === 'block' ? resolvedReason : null,
        })
        .eq('id', id)
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .select('id,tournament_id,club_id,team_id,status,admission_status,admission_reason,admission_by,admission_at,eligibility_blocked_reason,created_by,created_at,updated_at')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, registration: updated })
    }

    if (!nextStatus || nextStatus === 'PENDING') {
      return NextResponse.json({ error: 'Estado inválido. Usá CONFIRMED o CANCELLED.' }, { status: 400 })
    }

    if (nextStatus === 'CONFIRMED' && current.status === 'CONFIRMED') {
      return NextResponse.json({ ok: true, registration: current })
    }

    if (nextStatus === 'CONFIRMED') {
      const { data: tournament, error: tournamentError } = await supabaseAdmin
        .from('tournaments')
        .select('id,max_pairs,registration_deadline,signup_deadline')
        .eq('id', tournamentId)
        .eq('club_id', clubId)
        .maybeSingle()

      if (tournamentError) {
        return NextResponse.json({ error: tournamentError.message }, { status: 500 })
      }

      if (!tournament) {
        return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
      }

      const registrationDeadline = tournament.registration_deadline ?? tournament.signup_deadline
      if (registrationDeadline && Date.now() > new Date(registrationDeadline).getTime()) {
        return NextResponse.json(
          {
            error: 'La inscripción de este torneo ya cerró.',
            code: 'REGISTRATION_CLOSED',
          },
          { status: 409 }
        )
      }

      if (tournament.max_pairs !== null && tournament.max_pairs !== undefined) {
        const { count, error: countError } = await supabaseAdmin
          .from('tournament_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', clubId)
          .eq('tournament_id', tournamentId)
          .eq('status', 'CONFIRMED')

        if (countError) {
          return NextResponse.json({ error: countError.message }, { status: 500 })
        }

        if ((count ?? 0) >= Number(tournament.max_pairs)) {
          return NextResponse.json(
            {
              error: 'El torneo ya alcanzó el cupo máximo de equipos.',
              code: 'TOURNAMENT_FULL',
            },
            { status: 409 }
          )
        }
      }
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('tournament_registrations')
      .update({ status: nextStatus })
      .eq('id', id)
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .select('id,tournament_id,club_id,team_id,status,admission_status,admission_reason,admission_by,admission_at,eligibility_blocked_reason,created_by,created_at,updated_at')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, registration: updated })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error actualizando inscripción.') }, { status: 500 })
  }
}
