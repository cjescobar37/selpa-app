import { NextRequest, NextResponse } from 'next/server'
import { assertClubCommercialManager } from '@/lib/clubCommercialServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const BUCKET = 'club-commercial-assets'
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

function safeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const form = await req.formData()
  const kind = String(form.get('kind') ?? '')
  const file = form.get('file')
  if (!(file instanceof File) || !['sponsors', 'campaigns'].includes(kind)) {
    return NextResponse.json({ error: 'Archivo o tipo inválido.' }, { status: 400 })
  }
  const auth = await assertClubCommercialManager(req, clubId, kind === 'sponsors' ? 'sponsors:manage' : 'ads:manage')
  if (auth.error) return auth.error
  if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Usá JPG, PNG o WEBP de hasta 5 MB.' }, { status: 400 })
  }
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${kind}/${clubId}/${crypto.randomUUID()}-${safeName(file.name.replace(/\.[^.]+$/, '')) || 'asset'}.${extension}`
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, path, publicUrl: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const body = await req.json().catch(() => ({}))
  const path = String(body?.path ?? '')
  const kind = path.split('/')[0]
  if (!['sponsors', 'campaigns'].includes(kind) || !path.startsWith(`${kind}/${clubId}/`)) {
    return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 })
  }
  const auth = await assertClubCommercialManager(req, clubId, kind === 'sponsors' ? 'sponsors:manage' : 'ads:manage')
  if (auth.error) return auth.error
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
