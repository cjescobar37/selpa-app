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

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin.from('platform_news').select('*').order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelation(error)) return setupResponse('noticias')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const form = await req.formData()
    const title = String(form.get('title') ?? '').trim()
    const excerpt = String(form.get('excerpt') ?? '').trim()
    const body = String(form.get('body') ?? '').trim()
    const placement = String(form.get('placement') ?? 'GRID')
    const status = String(form.get('status') ?? 'DRAFT')
    const slugInput = String(form.get('slug') ?? '').trim()
    const file = form.get('cover')

    if (!title) return NextResponse.json({ error: 'Falta título.' }, { status: 400 })

    let coverUrl: string | null = null
    if (file instanceof File && file.size > 0) coverUrl = await uploadPlatformAsset(file, 'news')

    const payload = {
      title,
      slug: slugify(slugInput || title),
      excerpt: excerpt || null,
      body: body || null,
      placement,
      status,
      cover_url: coverUrl,
      published_at: status === 'PUBLISHED' ? new Date().toISOString() : null,
      created_by: auth.user!.id,
      updated_by: auth.user!.id,
    }

    const { data, error } = await supabaseAdmin.from('platform_news').insert(payload).select('*').maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return setupResponse('noticias')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude crear la noticia.' }, { status: 500 })
  }
}
