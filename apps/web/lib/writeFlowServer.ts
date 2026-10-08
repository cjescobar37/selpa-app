import { NextResponse } from 'next/server'

type WriteError = { code?: string; message?: string }
// Delivery is ancillary: a failed notification must not disguise a committed write.
export async function afterWriteCommit(operation: string, deliver: () => Promise<unknown>) {
  try { await deliver() } catch { console.error('[write-delivery]', { operation, code: 'DELIVERY_PENDING' }) }
}
const conflicts: Record<string, string> = {
  WRITE_INTENT_CONFLICT: 'Esta solicitud ya se envió con otros datos. Revisá su estado antes de volver a enviarla.',
  WRITE_PENDING_REQUEST: 'Ya hay una solicitud pendiente para este club y responsable.',
  WRITE_ALREADY_RESOLVED: 'Esta solicitud ya fue procesada. Actualizá para ver su estado.',
  WRITE_OWNER_ACCOUNT_REQUIRED: 'El responsable debe registrarse con el email indicado antes de aprobar el club.',
  WRITE_CLUB_EXISTS: 'Ya existe un club con ese nombre.',
  WRITE_PAIR_UNAVAILABLE: 'Alguno de los jugadores ya tiene pareja activa.',
  WRITE_INVITE_EXPIRED: 'La invitación venció. Solicitá una nueva.',
}

export function writeErrorResponse(operation: string, error: WriteError, fallback = 'No pudimos guardar el cambio. Reintentá.') {
  const code = /^[A-Z0-9_]{1,32}$/.test(error.code ?? '') ? error.code : 'UNKNOWN'
  console.error('[write-flow]', { operation, code })
  const message = error.message ?? ''
  const kind = error.code === '42501' ? 'FORBIDDEN'
    : error.code === 'P0002' ? 'NOT_FOUND'
      : ['22023', '23514', '22P02'].includes(error.code ?? '') ? 'VALIDATION'
        : ['23505', '40001', '40P01'].includes(error.code ?? '') ? 'CONFLICT' : 'SERVER'
  const text = conflicts[message] ?? (message === 'WRITE_REASON_REQUIRED' ? 'Indicá el motivo de rechazo.'
    : kind === 'FORBIDDEN' ? 'Tu cuenta no tiene permiso para esta acción.'
      : kind === 'NOT_FOUND' ? 'No encontramos la solicitud. Actualizá el listado.'
        : kind === 'VALIDATION' ? 'Revisá los datos antes de continuar.'
          : kind === 'CONFLICT' ? 'El estado cambió. Actualizá antes de reintentar.' : fallback)
  return NextResponse.json({ error: text, kind }, { status: kind === 'FORBIDDEN' ? 403 : kind === 'NOT_FOUND' ? 404
    : kind === 'VALIDATION' ? 400 : kind === 'CONFLICT' ? 409 : 503 })
}
