export const PLATFORM_NOTIFICATION_TYPES = [
  'club_request_created',
  'club_created_pending_review',
  'club_corrections_requested',
  'club_approved',
  'club_rejected',
  'club_suspended',
  'platform_alert',
] as const

export type PlatformNotificationType = (typeof PLATFORM_NOTIFICATION_TYPES)[number]

export function isPlatformNotificationType(type?: string | null) {
  return Boolean(type && PLATFORM_NOTIFICATION_TYPES.includes(type as PlatformNotificationType))
}

export function withNotificationScope<T extends Record<string, unknown> | null | undefined>(
  metadata: T,
  scope: 'platform' | 'club' | 'user'
) {
  return {
    ...(metadata ?? {}),
    scope,
  }
}
