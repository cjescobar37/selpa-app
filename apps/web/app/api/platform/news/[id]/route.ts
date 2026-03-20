import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { platformContentSetupMessage, slugify, uploadPlatformAsset } from '@/lib/platformContent'

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
    const title = String(form.get('title') ?? '').trim()
    const excerpt = String(form.get('excerpt') ?? '').trim()
    const body = String(form.get('body') ?? '').trim()
    const placement = String(form.get('placement') ?? 'GRID')
    const status = String(form.get('status') ?? 'DRAFT')
    const slugInput = String(form.get('slug') ?? '').trim()
    const keepCover = String(form.get('keepCover') ?? '1')
    const file = form.get('cover')

    let coverUrl: string | null | undefined = undefined
    if (file instanceof File && file.size > 0) coverUrl = await uploadPlatformAsset(file, 'news')
    else if (keepCover === '0') coverUrl = null

    const payload: Record<string, any> = {
      title,
      slug: slugify(slugInput || title),
      excerpt: excerpt || null,
      body: body || null,
      placement,
      status,
      updated_by: auth.user!.id,
      published_at: status === 'PUBLISHED' ? new Date().toISOString() : null,
    }
    if (coverUrl !== undefined) payload.cover_url = coverUrl

    const { data, error } = await supabaseAdmin.from('platform_news').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return setupResponse('noticias')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar la noticia.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  const { id } = await params
  const { error } = await supabaseAdmin.from('platform_news').delete().eq('id', id)
  if (error) {
    if (isMissingRelation(error)) return setupResponse('noticias')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
