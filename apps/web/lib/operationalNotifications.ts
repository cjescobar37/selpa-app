import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership, isClubStaffRole } from '@/lib/clubMembershipRules'

type NotificationInput = {
  userId: string
  clubId?: string | null
  tournamentId?: string | null
  actorId?: string | null
  type: string
  title: string
  body?: string | null
  href?: string | null
  metadata?: Record<string, unknown>
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST205' || message.includes('column') || message.includes('schema cache')
}

export async function getClubAdminUserIds(clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('club_memberships')
    .select('user_id,role,status,approved_at')
    .eq('club_id', clubId)
    .eq('status', 'APPROVED')

  if (error) {
    console.warn('[Pamprax] No se pudieron leer admins del club para notificar:', error.message)
    return []
  }

  return Array.from(new Set((data ?? [])
    .filter((membership: any) => isApprovedMembership(membership) && isClubStaffRole(membership.role))
    .map((membership: any) => String(membership.user_id))
    .filter(Boolean)))
}

export async function createOperationalNotification(input: NotificationInput) {
  const payload = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.body ?? null,
    read: false,
    link: input.href ?? null,
    club_id: input.clubId ?? null,
    tournament_id: input.tournamentId ?? null,
    actor_id: input.actorId ?? null,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
  }

  const { error } = await supabaseAdmin.from('notifications').insert(payload)
  if (!error) return

  if (!isMissingColumnError(error)) {
    console.warn('[Pamprax] No se pudo crear notificación:', error.message)
    return
  }

  const legacyPayload = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.body ?? null,
    read: false,
    sender_user_id: input.actorId ?? null,
    link: input.href ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      club_id: input.clubId ?? null,
      tournament_id: input.tournamentId ?? null,
      href: input.href ?? null,
    },
  }

  const { error: legacyError } = await supabaseAdmin.from('notifications').insert(legacyPayload)
  if (legacyError) {
    console.warn('[Pamprax] No se pudo crear notificación legacy:', legacyError.message)
  }
}

export async function notifyClubAdmins(clubId: string, input: Omit<NotificationInput, 'userId' | 'clubId'>) {
  const adminIds = await getClubAdminUserIds(clubId)
  await Promise.all(adminIds.map((userId) => createOperationalNotification({
    ...input,
    userId,
    clubId,
  })))
  return adminIds
}
