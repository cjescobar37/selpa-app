import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getApprovedMembership, isClubAdmin } from '@/lib/clubMembershipServer'
import { isClubStaffRole } from '@/lib/clubMembershipRules'
import { CLUB_THEMES, getClubTheme } from '@/lib/clubThemes'

type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

const CLUB_THEME_KEYS = new Set(Object.keys(CLUB_THEMES))

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function getAccessScope(userId: string, clubId: string) {
  const { data: platformAdmin, error: platformError } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (platformError) throw platformError
  if (platformAdmin?.user_id) {
    return { canRead: true, canManage: true }
  }

  const membership = await getApprovedMembership(userId, clubId)
  if (!membership) {
    return { canRead: false, canManage: false }
  }

  return {
    canRead: true,
    canManage: isClubStaffRole(membership.role),
  }
}

function normalizeText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeUrl(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  return /^https?:\/\//i.test(normalized) ? normalized : null
}

function normalizeClubPatch(input: Record<string, unknown>) {
  return {
    name: normalizeText(input.name),
    brand_name: normalizeText(input.brand_name),
    legal_name: normalizeText(input.legal_name),
    cuit: String(input.cuit ?? '').replace(/\D/g, '') || null,
    city: normalizeText(input.city),
    province: normalizeText(input.province),
    country: normalizeText(input.country) ?? 'Argentina',
    address: normalizeText(input.address),
    phone: normalizeText(input.phone),
    contact_email: normalizeText(input.contact_email)?.toLowerCase() ?? null,
    website: normalizeUrl(input.website),
    instagram: normalizeText(input.instagram),
    opening_hours: normalizeText(input.opening_hours),
    courts_count: input.courts_count ? Number(input.courts_count) : null,
    courts_surface: normalizeText(input.courts_surface),
    logo_url: normalizeUrl(input.logo_url),
    rules_pdf_url: normalizeUrl(input.rules_pdf_url),
    notes: normalizeText(input.notes),
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const { clubId } = await context.params
  const scope = await getAccessScope(user.id, clubId)
  if (!scope.canRead) {
    return NextResponse.json({ error: 'No autorizado para ver este club.' }, { status: 403 })
  }

  const { data: club, error } = await supabaseAdmin
    .from('clubs')
    .select('id,name,status,city,province,country,address,phone,contact_email,website,instagram,courts_count,opening_hours,courts_surface,rules_pdf_url,logo_url,notes,theme_key,theme_locked,rejected_at,rejection_reason,correction_requested_at,correction_reason,suspended_at,suspension_reason,brand_name,legal_name,cuit')
    .eq('id', clubId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!club) {
    return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
  }

  const reviewFields = scope.canManage
    ? {
        rejected_at: club.rejected_at,
        rejection_reason: club.rejection_reason,
        correction_requested_at: club.correction_requested_at,
        correction_reason: club.correction_reason,
        suspended_at: club.suspended_at,
        suspension_reason: club.suspension_reason,
      }
    : {
        rejected_at: null,
        rejection_reason: null,
        correction_requested_at: null,
        correction_reason: null,
        suspended_at: null,
        suspension_reason: null,
      }

  return NextResponse.json({
    club: {
      ...club,
      ...reviewFields,
    },
  })
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const { clubId } = await context.params
  const canManage = await isClubAdmin(user.id, clubId)
  if (!canManage) {
    return NextResponse.json({ error: 'No autorizado para editar este club.' }, { status: 403 })
  }

  const { data: currentClub, error: currentClubError } = await supabaseAdmin
    .from('clubs')
    .select('id,status,owner_user_id,theme_key,theme_locked')
    .eq('id', clubId)
    .maybeSingle()

  if (currentClubError) {
    return NextResponse.json({ error: currentClubError.message }, { status: 500 })
  }

  if (!currentClub) {
    return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const patch = normalizeClubPatch(body as Record<string, unknown>)
  const bodyRecord = body as Record<string, unknown>
  const wantsThemeUpdate = Object.prototype.hasOwnProperty.call(bodyRecord, 'theme_key')

  if (wantsThemeUpdate) {
    const requestedThemeKey = String(bodyRecord.theme_key ?? '').trim()
    if (!CLUB_THEME_KEYS.has(requestedThemeKey)) {
      return NextResponse.json({ error: 'Identidad visual inválida.' }, { status: 400 })
    }

    const currentThemeKey = getClubTheme(currentClub.theme_key).key
    if (currentClub.theme_locked && requestedThemeKey !== currentThemeKey) {
      return NextResponse.json({
        error: 'La identidad visual del club queda fija para mantener consistencia de marca.',
      }, { status: 409 })
    }

    if (!currentClub.theme_locked) {
      Object.assign(patch, {
        theme_key: requestedThemeKey,
        theme_locked: true,
      })
    }
  }

  if (patch.courts_count !== null && (!Number.isInteger(patch.courts_count) || patch.courts_count < 1 || patch.courts_count > 20)) {
    return NextResponse.json({ error: 'La cantidad de canchas debe estar entre 1 y 20.' }, { status: 400 })
  }

  if ((currentClub.status as ClubStatus) !== 'ACTIVE' && !currentClub.owner_user_id) {
    return NextResponse.json({ error: 'El club no tiene owner consistente. Revisalo desde plataforma.' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('clubs')
    .update(patch)
    .eq('id', clubId)
    .select('id,name,status,brand_name,legal_name,cuit,city,province,country,address,phone,contact_email,website,instagram,opening_hours,courts_count,courts_surface,logo_url,rules_pdf_url,notes,theme_key,theme_locked,rejected_at,rejection_reason,correction_requested_at,correction_reason,suspended_at,suspension_reason')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, club: updated })
}
