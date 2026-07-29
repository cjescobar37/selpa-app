import { NextRequest, NextResponse } from 'next/server'
import { requireClubCapability } from '@/lib/clubMembershipServer'

export const CLUB_PROFILE_BUCKET = 'club-profile-assets'
export const CLUB_PROFILE_KINDS = ['COVER', 'STORY', 'GALLERY'] as const
export type ClubProfileMediaKind = (typeof CLUB_PROFILE_KINDS)[number]

export async function assertCanManageClubProfile(req: NextRequest, clubId: string) {
  return requireClubCapability(req, clubId, 'club:profile_manage')
}

export function isMissingClubProfileSchema(error: unknown) {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase()
  return message.includes('club_public_profiles') || message.includes('club_media') || message.includes('club_facilities') || message.includes('club:profile_manage')
}

export function clubProfileSetupResponse() {
  return NextResponse.json({
    error: 'Falta aplicar la migración del Perfil del club.',
    migration: '20260730_club_public_profile_v1.sql',
    setupRequired: true,
  }, { status: 412 })
}

export function text(value: unknown, max: number) {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, max) : null
}
