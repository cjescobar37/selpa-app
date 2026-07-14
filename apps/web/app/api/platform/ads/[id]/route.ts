import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { platformContentSetupMessage, uploadPlatformAsset } from '@/lib/platformContent'
import { logPlatformAction } from '@/lib/platformAudit'

function isMissingRelation(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
}

function setupResponse(entity: string) {
  return NextResponse.json({ error: `Primero aplicá la migración de contenido para ${entity}.`, detail: platformContentSetupMessage(), setupRequired: true }, { status: 412 })
}

const ALLOWED_AD_SLOTS = new Set(['HOME_AFTER_RANKING', 'HOME_AFTER_NEWS_HERO'])
const ALLOWED_AD_STATUSES = new Set(['ACTIVE', 'PAUSED'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  try {
    const { id } = await params
    const form = await req.formData()
    const title = String(form.get('title') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const linkUrl = String(form.get('linkUrl') ?? '').trim()
    const slot = String(form.get('slot') ?? 'HOME_AFTER_RANKING')
    const status = String(form.get('status') ?? 'ACTIVE')
    const sortOrder = Number(form.get('sortOrder') ?? 100)
    const keepImage = String(form.get('keepImage') ?? '1')
    const file = form.get('image')
    if (!ALLOWED_AD_SLOTS.has(slot)) return NextResponse.json({ error: 'Posición de publicidad inválida.' }, { status: 400 })
    if (!ALLOWED_AD_STATUSES.has(status)) return NextResponse.json({ error: 'Estado de publicidad inválido.' }, { status: 400 })
    let imageUrl: string | null | undefined = undefined
    if (file instanceof File && file.size > 0) imageUrl = await uploadPlatformAsset(file, 'ads')
    else if (keepImage === '0') imageUrl = null
    const payload: Record<string, any> = { title, description: description || null, link_url: linkUrl || null, slot, status, sort_order: sortOrder, updated_by: auth.user!.id }
    if (imageUrl !== undefined) payload.image_url = imageUrl
    const { data, error } = await supabaseAdmin.from('platform_ad_campaigns').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return setupResponse('campañas')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'ad.update',
      entityType: 'platform_ad_campaign',
      entityId: data?.id ?? id,
      entityLabel: data?.title ?? title,
      metadata: {
        slot,
        status,
        sort_order: sortOrder,
      },
      req,
    })
    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar la campaña.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params
  const { data: existing } = await supabaseAdmin
    .from('platform_ad_campaigns')
    .select('id,title,slot,status,sort_order')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabaseAdmin.from('platform_ad_campaigns').delete().eq('id', id)
  if (error) {
    if (isMissingRelation(error)) return setupResponse('campañas')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logPlatformAction({
    actorUserId: auth.user!.id,
    action: 'ad.delete',
    entityType: 'platform_ad_campaign',
    entityId: id,
    entityLabel: existing?.title ?? null,
    metadata: {
      slot: existing?.slot ?? null,
      status: existing?.status ?? null,
      sort_order: existing?.sort_order ?? null,
    },
    req,
  })
  return NextResponse.json({ ok: true })
}
