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

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertClubCommercialManager(req, clubId, 'ads:manage')
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('club_ad_campaigns')
    .select('*, sponsor:club_sponsors(id,name,logo_url,website_url,status)')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRelation(error)) return missingCommercialSetupResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns: data ?? [] })
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await assertClubCommercialManager(req, clubId, 'ads:manage')
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const sponsorId = normalizeNullableText(body?.sponsor_id ?? body?.sponsorId, 80)
    const payload = {
      club_id: clubId,
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
      created_by: auth.user!.id,
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
      .insert(payload)
      .select('*, sponsor:club_sponsors(id,name,logo_url,website_url,status)')
      .maybeSingle()

    if (error) {
      if (isMissingRelation(error)) return missingCommercialSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, campaign: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude crear la campaña.' }, { status: 400 })
  }
}
