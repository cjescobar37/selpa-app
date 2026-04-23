import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership, isClubStaffRole, type ClubRole } from '@/lib/clubMembershipRules'

type MembershipRow = {
  id: string
  club_id: string
  user_id: string
  role: ClubRole
  status: string
  approved_at: string | null
}

export async function getApprovedMembership(userId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('club_memberships')
    .select('id,club_id,user_id,role,status,approved_at')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (error || !data) return null
  const membership = data as MembershipRow
  return isApprovedMembership(membership) ? membership : null
}

export async function isClubAdmin(userId: string, clubId: string) {
  const membership = await getApprovedMembership(userId, clubId)
  return Boolean(membership && isClubStaffRole(membership.role))
}

export async function isClubOwner(userId: string, clubId: string) {
  const membership = await getApprovedMembership(userId, clubId)
  return Boolean(membership && membership.role === 'OWNER')
}

export async function ensureClubPlayerForMembership(input: {
  clubId: string
  userId: string
  approvedBy: string | null
  approvedAt?: string
}) {
  const approvedAt = input.approvedAt ?? new Date().toISOString()

  const { data: existingPlayer, error: playerCheckError } = await supabaseAdmin
    .from('club_players')
    .select('id,approved_at')
    .eq('club_id', input.clubId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (playerCheckError) throw playerCheckError

  if (existingPlayer?.id) {
    if (!existingPlayer.approved_at) {
      const { error } = await supabaseAdmin
        .from('club_players')
        .update({
          approved_at: approvedAt,
          approved_by: input.approvedBy,
        })
        .eq('id', existingPlayer.id)

      if (error) throw error
    }

    return existingPlayer.id as string
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name,first_name,last_name')
    .eq('user_id', input.userId)
    .maybeSingle()

  const displayName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    null

  const { data: inserted, error } = await supabaseAdmin
    .from('club_players')
    .insert({
      club_id: input.clubId,
      user_id: input.userId,
      display_name: displayName,
      category: 6,
      gender: 'M',
      approved_at: approvedAt,
      approved_by: input.approvedBy,
    })
    .select('id')
    .single()

  if (error) throw error
  return inserted.id as string
}

export async function setActiveClubIfApproved(userId: string, clubId: string | null) {
  if (clubId) {
    const membership = await getApprovedMembership(userId, clubId)
    if (!membership) throw new Error('El club activo debe tener membresía aprobada.')
  }

  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId, active_club_id: clubId }, { onConflict: 'user_id' })

  if (error) throw error
}

export async function ensureValidActiveClubForUser(userId: string, preferredClubId?: string | null) {
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('user_settings')
    .select('active_club_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (settingsError) throw settingsError

  if (settings?.active_club_id) {
    const current = await getApprovedMembership(userId, settings.active_club_id)
    if (current) return settings.active_club_id as string
  }

  if (preferredClubId) {
    await setActiveClubIfApproved(userId, preferredClubId)
    return preferredClubId
  }

  await setActiveClubIfApproved(userId, null)
  return null
}
