import { NextResponse } from 'next/server'

export const CLUB_INVITE_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'invalid_role',
  'invalid_email',
  'membership_already_exists',
  'membership_pending',
  'membership_rejected',
  'membership_banned',
  'pending_invite_exists',
  'invite_not_found',
  'invite_expired',
  'invite_already_used',
  'invite_identity_mismatch',
  'cross_club_forbidden',
] as const

export type ClubInviteErrorCode = (typeof CLUB_INVITE_ERROR_CODES)[number]

const ERROR_RESPONSES: Record<ClubInviteErrorCode, { status: number; message: string }> = {
  unauthorized: { status: 401, message: 'Sesión inválida.' },
  forbidden: { status: 403, message: 'No tenés permisos para realizar esta acción.' },
  invalid_role: { status: 400, message: 'El rol seleccionado no es válido.' },
  invalid_email: { status: 400, message: 'Ingresá un email válido.' },
  membership_already_exists: { status: 409, message: 'Ese usuario ya pertenece al club.' },
  membership_pending: { status: 409, message: 'Ese usuario ya tiene una solicitud pendiente.' },
  membership_rejected: { status: 409, message: 'La membresía fue rechazada y requiere una acción administrativa específica.' },
  membership_banned: { status: 409, message: 'La membresía está bloqueada.' },
  pending_invite_exists: { status: 409, message: 'Ya existe una invitación pendiente para ese email.' },
  invite_not_found: { status: 404, message: 'Invitación no encontrada.' },
  invite_expired: { status: 410, message: 'La invitación venció.' },
  invite_already_used: { status: 409, message: 'La invitación ya fue resuelta.' },
  invite_identity_mismatch: { status: 403, message: 'La invitación no corresponde al usuario autenticado.' },
  cross_club_forbidden: { status: 403, message: 'La operación no corresponde a este club.' },
}

export function getClubInviteErrorCode(error: unknown): ClubInviteErrorCode | null {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '')
  const match = message.match(/SELPA_CODE:([a-z_]+)/)
  const code = match?.[1]
  return CLUB_INVITE_ERROR_CODES.includes(code as ClubInviteErrorCode)
    ? code as ClubInviteErrorCode
    : null
}

export function clubInviteErrorResponse(error: unknown) {
  const code = getClubInviteErrorCode(error)
  if (!code) {
    return NextResponse.json(
      { error: 'No pudimos completar la operación.', code: 'invite_operation_failed' },
      { status: 500 },
    )
  }
  const response = ERROR_RESPONSES[code]
  return NextResponse.json({ error: response.message, code }, { status: response.status })
}
