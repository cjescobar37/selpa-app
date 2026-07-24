import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubCommercialManager,
  CLUB_CAMPAIGN_STATUSES,
  CLUB_CAMPAIGN_TEMPLATES,
  isMissingRelation,
  missingCommercialSetupResponse,
  normalizeDate,
  normalizeNullableText,
  normalizeRequiredText,
  normalizePlacements,
  normalizeHttpUrl,
  normalizeStatus,
  recordClubCommercialAudit,
} from '@/lib/clubCommercialServer'
import { normalizePlatformAdRenderConfig } from '@/lib/platformAdConfig'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertClubCommercialManager(req, clubId, 'ads:manage')
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('club_ad_campaigns')
    .select('*, sponsor:club_sponsors(id,name,logo_url,website_url,status,ends_on), placements:club_ad_campaign_placements(placement_key)')
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
    const placements = normalizePlacements(body?.placements, body?.slot_id ?? body?.slotId)
    const startsAt = normalizeDate(body?.starts_at ?? body?.startsAt)
    const endsAt = normalizeDate(body?.ends_at ?? body?.endsAt)
    if (startsAt && endsAt && endsAt < startsAt) throw new Error('La fecha final debe ser posterior al inicio.')
    const requestedStatus = normalizeStatus(body?.status, CLUB_CAMPAIGN_STATUSES, 'draft')
    const imageUrl = normalizeNullableText(body?.image_url ?? body?.imageUrl, 1400)
    if (['active', 'scheduled'].includes(requestedStatus) && !imageUrl) {
      throw new Error('Subí una imagen antes de publicar.')
    }
    const payload = {
      club_id: clubId,
      sponsor_id: sponsorId,
      slot_id: placements[0],
      internal_name: normalizeRequiredText(body?.internal_name ?? body?.internalName ?? body?.title, 'nombre interno'),
      title: normalizeRequiredText(body?.title, 'título del anuncio'),
      description: normalizeNullableText(body?.description, 1000),
      image_url: imageUrl,
      target_url: normalizeHttpUrl(body?.target_url ?? body?.targetUrl, 'enlace'),
      cta_label: normalizeNullableText(body?.cta_label ?? body?.ctaLabel, 60),
      internal_notes: normalizeNullableText(body?.internal_notes ?? body?.internalNotes, 2000),
      template_key: normalizeStatus(body?.template_key ?? body?.templateKey, CLUB_CAMPAIGN_TEMPLATES, 'BANNER_HORIZONTAL').toUpperCase(),
      image_path: normalizeNullableText(body?.image_path ?? body?.imagePath, 1200),
      status: requestedStatus === 'active' && startsAt && startsAt > new Date().toISOString() ? 'scheduled' : requestedStatus,
      sort_order: Number.isFinite(Number(body?.sort_order ?? body?.sortOrder)) ? Number(body?.sort_order ?? body?.sortOrder) : 100,
      render_config: body?.render_config || body?.renderConfig ? normalizePlatformAdRenderConfig(body?.render_config ?? body?.renderConfig) : null,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: auth.user!.id,
    }

    if (sponsorId) {
      const { data: sponsor, error: sponsorError } = await supabaseAdmin
        .from('club_sponsors')
        .select('id,status,ends_on')
        .eq('id', sponsorId)
        .eq('club_id', clubId)
        .maybeSingle()

      if (sponsorError) {
        if (isMissingRelation(sponsorError)) return missingCommercialSetupResponse()
        return NextResponse.json({ error: sponsorError.message }, { status: 500 })
      }
      if (!sponsor) return NextResponse.json({ error: 'El sponsor no pertenece a este club.' }, { status: 400 })
      if (['active', 'scheduled'].includes(payload.status) && (
        sponsor.status !== 'active' || (sponsor.ends_on && sponsor.ends_on < new Date().toISOString().slice(0, 10))
      )) {
        return NextResponse.json({ error: 'El sponsor está inactivo o vencido. Actualizalo antes de publicar.' }, { status: 400 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('club_ad_campaigns')
      .insert(payload)
      .select('*, sponsor:club_sponsors(id,name,logo_url,website_url,status,ends_on)')
      .maybeSingle()

    if (error) {
      if (isMissingRelation(error)) return missingCommercialSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: placementError } = await supabaseAdmin.from('club_ad_campaign_placements').insert(
      placements.map((placementKey) => ({ club_id: clubId, campaign_id: data!.id, placement_key: placementKey })),
    )
    if (placementError) {
      await supabaseAdmin.from('club_ad_campaigns').delete().eq('id', data!.id)
      return NextResponse.json({ error: placementError.message }, { status: 400 })
    }
    await recordClubCommercialAudit(clubId, auth.user!.id, 'CAMPAIGN_CREATED', { campaign_id: data?.id, placements })
    return NextResponse.json({ ok: true, campaign: { ...data, placements: placements.map((placement_key) => ({ placement_key })) } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude crear la campaña.' }, { status: 400 })
  }
}
