import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubCommercialManager,
  CLUB_SPONSOR_CATEGORIES,
  CLUB_SPONSOR_STATUSES,
  isMissingRelation,
  missingCommercialSetupResponse,
  normalizeNullableText,
  normalizeDateOnly,
  normalizeHttpUrl,
  normalizeRequiredText,
  normalizeStatus,
  recordClubCommercialAudit,
} from '@/lib/clubCommercialServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; sponsorId: string }> },
) {
  try {
    const { clubId, sponsorId } = await context.params
    const auth = await assertClubCommercialManager(req, clubId, 'sponsors:manage')
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const payload = {
      name: normalizeRequiredText(body?.name, 'nombre del sponsor'),
      logo_url: normalizeNullableText(body?.logo_url ?? body?.logoUrl, 1200),
      website_url: normalizeHttpUrl(body?.website_url ?? body?.websiteUrl, 'sitio web'),
      description: normalizeNullableText(body?.description, 500),
      category: normalizeStatus(body?.category, CLUB_SPONSOR_CATEGORIES, 'OTHER').toUpperCase(),
      contact_name: normalizeNullableText(body?.contact_name ?? body?.contactName, 180),
      contact_email: normalizeNullableText(body?.contact_email ?? body?.contactEmail, 180),
      contact_phone: normalizeNullableText(body?.contact_phone ?? body?.contactPhone, 80),
      starts_on: normalizeDateOnly(body?.starts_on ?? body?.startsOn),
      ends_on: normalizeDateOnly(body?.ends_on ?? body?.endsOn),
      contribution_amount: body?.contribution_amount || body?.contributionAmount
        ? Number(body?.contribution_amount ?? body?.contributionAmount) : null,
      currency_code: String(body?.currency_code ?? body?.currencyCode ?? 'ARS').trim().toUpperCase().slice(0, 3),
      internal_notes: normalizeNullableText(body?.internal_notes ?? body?.internalNotes, 2000),
      visual_priority: Number.isFinite(Number(body?.visual_priority ?? body?.visualPriority))
        ? Number(body?.visual_priority ?? body?.visualPriority) : 100,
      logo_path: normalizeNullableText(body?.logo_path ?? body?.logoPath, 1200),
      status: normalizeStatus(body?.status, CLUB_SPONSOR_STATUSES, 'active'),
    }

    const { data, error } = await supabaseAdmin
      .from('club_sponsors')
      .update(payload)
      .eq('id', sponsorId)
      .eq('club_id', clubId)
      .select('*')
      .maybeSingle()

    if (error) {
      if (isMissingRelation(error)) return missingCommercialSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Sponsor no encontrado.' }, { status: 404 })

    await recordClubCommercialAudit(clubId, auth.user!.id, 'SPONSOR_UPDATED', { sponsor_id: sponsorId })
    return NextResponse.json({ ok: true, sponsor: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude actualizar el sponsor.' }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; sponsorId: string }> },
) {
  const { clubId, sponsorId } = await context.params
  const auth = await assertClubCommercialManager(req, clubId, 'sponsors:manage')
  if (auth.error) return auth.error
  const { error } = await supabaseAdmin.from('club_sponsors').delete().eq('id', sponsorId).eq('club_id', clubId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await recordClubCommercialAudit(clubId, auth.user!.id, 'SPONSOR_DELETED', { sponsor_id: sponsorId })
  return NextResponse.json({ ok: true })
}
