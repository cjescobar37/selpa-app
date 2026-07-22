import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubCommercialManager,
  CLUB_SPONSOR_STATUSES,
  isMissingRelation,
  missingCommercialSetupResponse,
  normalizeNullableText,
  normalizeRequiredText,
  normalizeStatus,
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
      website_url: normalizeNullableText(body?.website_url ?? body?.websiteUrl, 1200),
      contact_name: normalizeNullableText(body?.contact_name ?? body?.contactName, 180),
      contact_email: normalizeNullableText(body?.contact_email ?? body?.contactEmail, 180),
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

    return NextResponse.json({ ok: true, sponsor: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude actualizar el sponsor.' }, { status: 400 })
  }
}
