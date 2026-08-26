import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertCanManageClubProfile, clubProfileSetupResponse, isMissingClubProfileSchema, text } from '@/lib/clubProfileServer'

const FACILITY_KEYS = new Set(['LOCKER_ROOMS', 'BAR', 'PARKING', 'SCHOOL', 'WIFI', 'STORE', 'RACKET_RENTAL', 'OTHER'])

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertCanManageClubProfile(req, clubId)
  if (auth.error) return auth.error

  const [clubResult, profileResult, mediaResult, facilitiesResult, playersResult, tournamentsResult] = await Promise.all([
    supabaseAdmin.from('clubs').select('id,name,logo_url,description,city,province,country,address,phone,mobile_phone,contact_email,website,instagram,opening_hours,opening_hours_json,courts_count,courts_surface,court_surfaces,theme_key,is_active,status').eq('id', clubId).maybeSingle(),
    supabaseAdmin.from('club_public_profiles').select('club_id,tagline,story,publication_status,published_at,updated_at').eq('club_id', clubId).maybeSingle(),
    supabaseAdmin.from('club_media').select('id,club_id,kind,storage_path,public_url,alt_text,caption,sort_order,is_visible,created_at').eq('club_id', clubId).order('sort_order').order('created_at'),
    supabaseAdmin.from('club_facilities').select('id,facility_key,label,description,is_available,sort_order').eq('club_id', clubId).order('sort_order').order('label'),
    supabaseAdmin.from('club_players').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('operational_status', 'ACTIVE').not('approved_at', 'is', null),
    supabaseAdmin.from('tournaments').select('id', { count: 'exact', head: true }).eq('club_id', clubId).not('status', 'in', '("DRAFT","CANCELLED","ARCHIVED")'),
  ])

  const firstError = [clubResult.error, profileResult.error, mediaResult.error, facilitiesResult.error].find(Boolean)
  if (firstError) return isMissingClubProfileSchema(firstError) ? clubProfileSetupResponse() : NextResponse.json({ error: 'No pudimos cargar el perfil del club.', code: 'CLUB_PROFILE_LOAD_FAILED' }, { status: 500 })
  if (!clubResult.data) return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })

  return NextResponse.json({
    club: clubResult.data,
    profile: profileResult.data ?? { club_id: clubId, tagline: null, story: null, publication_status: 'DRAFT', published_at: null },
    media: mediaResult.data ?? [],
    facilities: facilitiesResult.data ?? [],
    metrics: { players: playersResult.count ?? 0, courts: clubResult.data.courts_count ?? 0, tournaments: tournamentsResult.count ?? 0 },
  })
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertCanManageClubProfile(req, clubId)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const publicationStatus = body.publication_status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  const profilePatch = {
    club_id: clubId,
    tagline: text(body.tagline, 120),
    story: text(body.story, 4000),
    publication_status: publicationStatus,
    published_at: publicationStatus === 'PUBLISHED' ? new Date().toISOString() : null,
  }
  const clubInput = (body.club && typeof body.club === 'object' ? body.club : {}) as Record<string, unknown>
  const publicName = text(clubInput.name, 120)
  if (!publicName) return NextResponse.json({ error: 'El nombre del club es obligatorio.' }, { status: 400 })
  const clubPatch = {
    name: publicName, city: text(clubInput.city, 90), province: text(clubInput.province, 90),
    description: text(clubInput.description, 500), address: text(clubInput.address, 180),
    phone: text(clubInput.phone, 40), mobile_phone: text(clubInput.mobile_phone, 40),
    contact_email: text(clubInput.contact_email, 180)?.toLowerCase() ?? null,
    website: text(clubInput.website, 500), instagram: text(clubInput.instagram, 180),
  }
  const facilities = Array.isArray(body.facilities) ? body.facilities.slice(0, 24) : []

  const { error: profileError } = await supabaseAdmin.from('club_public_profiles').upsert(profilePatch, { onConflict: 'club_id' })
  if (profileError) return isMissingClubProfileSchema(profileError) ? clubProfileSetupResponse() : NextResponse.json({ error: 'No pudimos guardar el perfil público.', code: 'CLUB_PROFILE_SAVE_FAILED' }, { status: 500 })
  const { error: clubError } = await supabaseAdmin.from('clubs').update(clubPatch).eq('id', clubId)
  if (clubError) return NextResponse.json({ error: 'No pudimos actualizar los datos públicos del club.', code: 'CLUB_PROFILE_CLUB_UPDATE_FAILED' }, { status: 500 })
  const { error: deleteError } = await supabaseAdmin.from('club_facilities').delete().eq('club_id', clubId)
  if (deleteError) return NextResponse.json({ error: 'No pudimos actualizar los servicios del club.', code: 'CLUB_PROFILE_FACILITIES_FAILED' }, { status: 500 })
  if (facilities.length) {
    const rows = facilities.map((item, index) => {
      const record = item as Record<string, unknown>
      const requestedKey = String(record.facility_key ?? 'OTHER').toUpperCase()
      return { club_id: clubId, facility_key: FACILITY_KEYS.has(requestedKey) ? requestedKey : 'OTHER', label: text(record.label, 80) ?? 'Otro servicio', description: text(record.description, 500), is_available: record.is_available !== false, sort_order: index }
    })
    const { error } = await supabaseAdmin.from('club_facilities').insert(rows)
    if (error) return NextResponse.json({ error: 'No pudimos actualizar los servicios del club.', code: 'CLUB_PROFILE_FACILITIES_FAILED' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
