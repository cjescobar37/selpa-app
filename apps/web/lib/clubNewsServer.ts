import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTokenUser } from '@/lib/platformApiAuth'
import { slugify, uploadPlatformAsset } from '@/lib/platformContent'
import { userHasClubCapability } from '@/lib/clubMembershipServer'

export type ClubNewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ClubNewsMetadata = {
  inline_images?: string[]
  featured_rank?: 1 | 2 | 3 | null
}

function missingRelation(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
}

function missingClubColumn(error?: { message?: string; code?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('club_id') || msg.includes('metadata') || error?.code === '42703'
}

export function clubNewsSetupResponse() {
  return NextResponse.json(
    {
      error: 'Falta aplicar la migración para noticias de clubes.',
      detail: 'Aplicá 20260609_add_club_id_to_platform_news.sql para agregar platform_news.club_id.',
      setupRequired: true,
    },
    { status: 412 },
  )
}

export function isClubNewsSchemaError(error?: { message?: string; code?: string } | null) {
  return missingRelation(error) || missingClubColumn(error)
}

export async function isPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return false
  return Boolean(data?.user_id)
}

export async function assertCanManageClubNews(req: NextRequest, clubId: string, capability: 'news:manage' = 'news:manage') {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const canManage = (await userHasClubCapability(user.id, clubId, capability)) || (await isPlatformAdmin(user.id))
  if (!canManage) return { error: NextResponse.json({ error: 'No autorizado para gestionar noticias de este club.' }, { status: 403 }), user: null }

  return { error: null, user }
}

export function normalizeClubNewsStatus(raw: FormDataEntryValue | null): ClubNewsStatus {
  const status = String(raw ?? 'DRAFT').trim().toUpperCase()
  if (status === 'PUBLISHED' || status === 'ARCHIVED') return status
  return 'DRAFT'
}

export function getTextField(form: FormData, field: string) {
  return String(form.get(field) ?? '').trim()
}

export function getNullableTextField(form: FormData, field: string) {
  const value = getTextField(form, field)
  return value || null
}

export function parseExistingInlineImages(raw: FormDataEntryValue | null) {
  if (!raw) return [] as string[]
  try {
    const parsed = JSON.parse(String(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2)
  } catch {
    return []
  }
}

export function normalizeFeaturedRank(raw: FormDataEntryValue | null): 1 | 2 | 3 | null {
  const value = Number(String(raw ?? '').trim())
  if (value === 1 || value === 2 || value === 3) return value
  return null
}

export function buildClubNewsSlug(input: { title: string; slug?: string | null; clubId: string; existingSlug?: string | null }) {
  const base = slugify(input.slug || input.title) || 'noticia'
  const prefix = input.clubId.slice(0, 8)
  const current = input.existingSlug ? slugify(input.existingSlug) : ''
  const slug = base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`
  return current && current === slug ? current : slug
}

export async function readCoverUrlFromForm(form: FormData, clubId: string, currentCoverUrl?: string | null) {
  const keepCover = String(form.get('keepCover') ?? '1')
  const coverUrlInput = getNullableTextField(form, 'cover_url')
  const file = form.get('cover')

  if (file instanceof File && file.size > 0) {
    return uploadPlatformAsset(file, `clubs/${clubId}/news`)
  }

  if (coverUrlInput) return coverUrlInput
  if (keepCover === '0') return null
  return currentCoverUrl ?? null
}

export async function readInlineImagesFromForm(form: FormData, clubId: string, currentInlineImages: string[] = []) {
  const keepInlineImages = String(form.get('keepInlineImages') ?? '1') === '1'
  const existingInlineImages = parseExistingInlineImages(form.get('existingInlineImages'))
  const inlineUrlFields = [getNullableTextField(form, 'inline_image_1'), getNullableTextField(form, 'inline_image_2')]
    .filter((item): item is string => Boolean(item))
  const inlineFiles = form.getAll('inlineImages').filter((item): item is File => item instanceof File && item.size > 0)
  const uploaded = await Promise.all(
    inlineFiles.slice(0, 2).map((file) => uploadPlatformAsset(file, `clubs/${clubId}/news/inline`)),
  )

  const kept = keepInlineImages ? existingInlineImages.length ? existingInlineImages : currentInlineImages : []
  return [...kept, ...inlineUrlFields, ...uploaded].filter(Boolean).slice(0, 2)
}

export function normalizeClubNewsMetadata(raw: unknown): ClubNewsMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const record = raw as Record<string, unknown>
  const inline = Array.isArray(record.inline_images)
    ? record.inline_images.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2)
    : []
  const rank = record.featured_rank === 1 || record.featured_rank === 2 || record.featured_rank === 3
    ? record.featured_rank
    : null
  return {
    inline_images: inline,
    featured_rank: rank,
  }
}
