import { NextRequest, NextResponse } from 'next/server'
import { userHasClubPermission } from '@/lib/clubMembershipServer'
import { getTokenUser } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const CLUB_AD_SLOT_IDS = [
  'CLUB_HOME_HERO',
  'CLUB_HOME_AFTER_TOURNAMENTS',
  'CLUB_HOME_AFTER_NEWS',
] as const

export const CLUB_SPONSOR_STATUSES = ['active', 'inactive'] as const
export const CLUB_CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'ended'] as const

export type ClubAdSlotId = (typeof CLUB_AD_SLOT_IDS)[number]
export type ClubSponsorStatus = (typeof CLUB_SPONSOR_STATUSES)[number]
export type ClubCampaignStatus = (typeof CLUB_CAMPAIGN_STATUSES)[number]

export function isMissingRelation(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist')) || (msg.includes('render_config') && msg.includes('schema cache'))
}

export function missingCommercialSetupResponse() {
  return NextResponse.json(
    { error: 'Primero aplicá la migración de inventario comercial del club.', setupRequired: true },
    { status: 412 },
  )
}

export function normalizeNullableText(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function normalizeRequiredText(value: unknown, field: string, maxLength = 180) {
  const text = normalizeNullableText(value, maxLength)
  if (!text) throw new Error(`Falta ${field}.`)
  return text
}

export function normalizeStatus<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  const normalized = String(value || fallback).trim().toLowerCase()
  return (allowed as readonly string[]).includes(normalized) ? normalized as T[number] : fallback
}

export function normalizeSlotId(value: unknown) {
  const slotId = String(value || '').trim().toUpperCase()
  if (!(CLUB_AD_SLOT_IDS as readonly string[]).includes(slotId)) {
    throw new Error('El slot publicitario no es válido.')
  }
  return slotId as ClubAdSlotId
}

export function normalizeDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('La fecha no es válida.')
  return date.toISOString()
}

export async function assertClubCommercialManager(req: NextRequest, clubId: string) {
  const user = await getTokenUser(req)
  if (!user) {
    return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }
  }

  const [{ data: platformAdmin, error: platformError }, canEditContent, canConfigureClub] = await Promise.all([
    supabaseAdmin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    userHasClubPermission(user.id, clubId, 'content:edit'),
    userHasClubPermission(user.id, clubId, 'club:configure'),
  ])

  if (platformError) {
    return { error: NextResponse.json({ error: platformError.message }, { status: 500 }), user: null }
  }

  if (!platformAdmin?.user_id && !canEditContent && !canConfigureClub) {
    return { error: NextResponse.json({ error: 'No autorizado para gestionar publicidad del club.' }, { status: 403 }), user: null }
  }

  return { error: null, user }
}
