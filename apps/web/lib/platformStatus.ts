export type PlatformClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

export function clubStatusLabel(
  status: PlatformClubStatus,
  options?: { correctionRequested?: boolean }
) {
  if (status === 'PENDING_APPROVAL') {
    return options?.correctionRequested ? 'Correcciones pedidas' : 'Pendiente'
  }
  if (status === 'ACTIVE') return 'Activo'
  if (status === 'REJECTED') return 'Rechazado'
  return 'Suspendido'
}

export function clubStatusBadgeClass(
  status: PlatformClubStatus,
  options?: { correctionRequested?: boolean }
) {
  if (status === 'ACTIVE') return 'is-success'
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'is-danger'
  return options?.correctionRequested ? 'is-neutral' : 'is-warning'
}

export type PlatformMembershipStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | string

export function membershipStatusLabel(status: PlatformMembershipStatus) {
  if (status === 'APPROVED') return 'Aprobado'
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'REJECTED') return 'Rechazado'
  return status
}

export function membershipStatusBadgeClass(status: PlatformMembershipStatus) {
  if (status === 'APPROVED') return 'is-success'
  if (status === 'PENDING') return 'is-warning'
  return 'is-danger'
}

export function platformNotificationTypeLabel(type: string) {
  if (type === 'club_created_pending_review') return 'Alta club'
  if (type === 'club_request_created') return 'Legacy'
  if (type === 'club_corrections_requested') return 'Correcciones'
  if (type === 'club_approved') return 'Aprobado'
  if (type === 'club_rejected') return 'Rechazado'
  if (type === 'club_suspended') return 'Suspendido'
  if (type === 'platform_alert') return 'Alerta'
  return 'Sistema'
}

export function platformNotificationBadgeClass(type: string) {
  if (type === 'club_approved') return 'is-success'
  if (type === 'club_rejected' || type === 'club_suspended') return 'is-danger'
  if (type === 'platform_alert') return 'is-neutral'
  return 'is-warning'
}
