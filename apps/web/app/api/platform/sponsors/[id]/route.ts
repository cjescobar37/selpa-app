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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  try {
    const { id } = await params
    const form = await req.formData()
    const name = String(form.get('name') ?? '').trim()
    const websiteUrl = String(form.get('websiteUrl') ?? '').trim()
    const tier = String(form.get('tier') ?? 'SPONSOR')
    const status = String(form.get('status') ?? 'ACTIVE')
    const sortOrder = Number(form.get('sortOrder') ?? 100)
    const keepLogo = String(form.get('keepLogo') ?? '1')
    const file = form.get('logo')
    let logoUrl: string | null | undefined = undefined
    if (file instanceof File && file.size > 0) logoUrl = await uploadPlatformAsset(file, 'sponsors')
    else if (keepLogo === '0') logoUrl = null
    const payload: Record<string, any> = { name, website_url: websiteUrl || null, tier, status, sort_order: sortOrder, updated_by: auth.user!.id }
    if (logoUrl !== undefined) payload.logo_url = logoUrl
    const { data, error } = await supabaseAdmin.from('platform_sponsors').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return setupResponse('sponsors')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'sponsor.update',
      entityType: 'platform_sponsor',
      entityId: data?.id ?? id,
      entityLabel: data?.name ?? name,
      metadata: {
        tier,
        status,
        sort_order: sortOrder,
      },
      req,
    })
    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar el sponsor.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params
  const { data: existing } = await supabaseAdmin
    .from('platform_sponsors')
    .select('id,name,tier,status,sort_order')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabaseAdmin.from('platform_sponsors').delete().eq('id', id)
  if (error) {
    if (isMissingRelation(error)) return setupResponse('sponsors')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logPlatformAction({
    actorUserId: auth.user!.id,
    action: 'sponsor.delete',
    entityType: 'platform_sponsor',
    entityId: id,
    entityLabel: existing?.name ?? null,
    metadata: {
      tier: existing?.tier ?? null,
      status: existing?.status ?? null,
      sort_order: existing?.sort_order ?? null,
    },
    req,
  })
  return NextResponse.json({ ok: true })
}
