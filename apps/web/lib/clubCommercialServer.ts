import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { getTokenUser } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { ClubCapability } from '@/lib/clubPermissions'

export const CLUB_AD_SLOT_IDS = [
  'CLUB_HOME_HERO',
  'CLUB_HOME_AFTER_TOURNAMENTS',
  'CLUB_HOME_AFTER_NEWS',
] as const

export const CLUB_SPONSOR_STATUSES = ['active', 'inactive'] as const
export const CLUB_CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'ended'] as const
export const CLUB_SPONSOR_CATEGORIES = ['MAIN', 'GOLD', 'SILVER', 'BRONZE', 'INSTITUTIONAL', 'SUPPLIER', 'OTHER'] as const
export const CLUB_CAMPAIGN_TEMPLATES = ['BANNER_HORIZONTAL', 'AD_CARD', 'EDITORIAL_BACKGROUND'] as const

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
  const input = String(value || fallback).trim()
  const normalized = (allowed as readonly string[]).find((item) => item.toLowerCase() === input.toLowerCase())
  return (normalized ?? fallback) as T[number]
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

export function normalizeDateOnly(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const normalized = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
    throw new Error('La fecha no es válida.')
  }
  return normalized
}

export function normalizeHttpUrl(value: unknown, field = 'enlace') {
  const text = normalizeNullableText(value, 1400)
  if (!text) return null
  const url = new URL(text)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`El ${field} debe usar http o https.`)
  return url.toString()
}

export function normalizePlacements(value: unknown, fallback?: unknown) {
  const source = Array.isArray(value) ? value : fallback ? [fallback] : []
  const placements = [...new Set(source.map((item) => normalizeSlotId(item)))]
  if (!placements.length) throw new Error('Seleccioná al menos una ubicación.')
  return placements
}

export async function assertClubCommercialManager(
  req: NextRequest,
  clubId: string,
  capability: Extract<ClubCapability, 'sponsors:manage' | 'ads:manage'>,
) {
  const user = await getTokenUser(req)
  if (!user) {
    return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }
  }

  const [{ data: platformAdmin, error: platformError }, canManage] = await Promise.all([
    supabaseAdmin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    userHasClubCapability(user.id, clubId, capability),
  ])

  if (platformError) {
    return { error: NextResponse.json({ error: platformError.message }, { status: 500 }), user: null }
  }

  if (!platformAdmin?.user_id && !canManage) {
    return { error: NextResponse.json({ error: 'No autorizado para gestionar publicidad del club.' }, { status: 403 }), user: null }
  }

  return { error: null, user }
}

export async function recordClubCommercialAudit(
  clubId: string,
  actorUserId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from('club_team_audit').insert({
    club_id: clubId,
    actor_user_id: actorUserId,
    action,
    metadata,
  })
  if (error) console.error('[club-commercial-audit]', error.message)
}
