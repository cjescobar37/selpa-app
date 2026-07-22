import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubCommercialManager,
  CLUB_CAMPAIGN_STATUSES,
  isMissingRelation,
  missingCommercialSetupResponse,
  normalizeDate,
  normalizeNullableText,
  normalizeRequiredText,
  normalizeSlotId,
  normalizeStatus,
} from '@/lib/clubCommercialServer'
import { normalizePlatformAdRenderConfig } from '@/lib/platformAdConfig'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; campaignId: string }> },
) {
  try {
    const { clubId, campaignId } = await context.params
    const auth = await assertClubCommercialManager(req, clubId, 'ads:manage')
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const sponsorId = normalizeNullableText(body?.sponsor_id ?? body?.sponsorId, 80)
    const payload = {
      sponsor_id: sponsorId,
      slot_id: normalizeSlotId(body?.slot_id ?? body?.slotId),
      title: normalizeRequiredText(body?.title, 'título del anuncio'),
      description: normalizeNullableText(body?.description, 1000),
      image_url: normalizeNullableText(body?.image_url ?? body?.imageUrl, 1400),
      target_url: normalizeNullableText(body?.target_url ?? body?.targetUrl, 1400),
      status: normalizeStatus(body?.status, CLUB_CAMPAIGN_STATUSES, 'draft'),
      sort_order: Number.isFinite(Number(body?.sort_order ?? body?.sortOrder)) ? Number(body?.sort_order ?? body?.sortOrder) : 100,
      render_config: body?.render_config || body?.renderConfig ? normalizePlatformAdRenderConfig(body?.render_config ?? body?.renderConfig) : null,
      starts_at: normalizeDate(body?.starts_at ?? body?.startsAt),
      ends_at: normalizeDate(body?.ends_at ?? body?.endsAt),
    }

    if (sponsorId) {
      const { data: sponsor, error: sponsorError } = await supabaseAdmin
        .from('club_sponsors')
        .select('id')
        .eq('id', sponsorId)
        .eq('club_id', clubId)
        .maybeSingle()

      if (sponsorError) {
        if (isMissingRelation(sponsorError)) return missingCommercialSetupResponse()
        return NextResponse.json({ error: sponsorError.message }, { status: 500 })
      }
      if (!sponsor) return NextResponse.json({ error: 'El sponsor no pertenece a este club.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('club_ad_campaigns')
      .update(payload)
      .eq('id', campaignId)
      .eq('club_id', clubId)
      .select('*, sponsor:club_sponsors(id,name,logo_url,website_url,status)')
      .maybeSingle()

    if (error) {
      if (isMissingRelation(error)) return missingCommercialSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Campaña no encontrada.' }, { status: 404 })

    return NextResponse.json({ ok: true, campaign: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude actualizar la campaña.' }, { status: 400 })
  }
}
