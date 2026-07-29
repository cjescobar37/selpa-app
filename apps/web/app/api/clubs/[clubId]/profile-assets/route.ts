import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertCanManageClubProfile, CLUB_PROFILE_BUCKET, clubProfileSetupResponse, isMissingClubProfileSchema, type ClubProfileMediaKind } from '@/lib/clubProfileServer'

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const FOLDERS: Record<ClubProfileMediaKind, string> = { COVER: 'covers', STORY: 'history', GALLERY: 'gallery' }

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertCanManageClubProfile(req, clubId)
  if (auth.error) return auth.error
  const form = await req.formData()
  const kind = String(form.get('kind') ?? '').toUpperCase() as ClubProfileMediaKind
  const file = form.get('file')
  if (!FOLDERS[kind] || !(file instanceof File) || !TYPES.has(file.type) || file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Usá JPG, PNG o WEBP de hasta 8 MB.' }, { status: 400 })
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${FOLDERS[kind]}/${clubId}/${crypto.randomUUID()}.${extension}`
  const upload = await supabaseAdmin.storage.from(CLUB_PROFILE_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (upload.error) return isMissingClubProfileSchema(upload.error) ? clubProfileSetupResponse() : NextResponse.json({ error: upload.error.message }, { status: 500 })
  const publicUrl = supabaseAdmin.storage.from(CLUB_PROFILE_BUCKET).getPublicUrl(path).data.publicUrl
  const { data: previous } = kind === 'GALLERY' ? { data: [] } : await supabaseAdmin.from('club_media').select('storage_path').eq('club_id', clubId).eq('kind', kind)
  if (kind !== 'GALLERY') await supabaseAdmin.from('club_media').delete().eq('club_id', clubId).eq('kind', kind)
  const { data, error } = await supabaseAdmin.from('club_media').insert({ club_id: clubId, kind, storage_path: path, public_url: publicUrl, alt_text: String(form.get('alt_text') ?? '').trim() || null, caption: String(form.get('caption') ?? '').trim() || null, sort_order: Number(form.get('sort_order') ?? 0), created_by: auth.user?.id }).select('id,kind,storage_path,public_url,alt_text,caption,sort_order,is_visible').single()
  if (error) {
    await supabaseAdmin.storage.from(CLUB_PROFILE_BUCKET).remove([path])
    return isMissingClubProfileSchema(error) ? clubProfileSetupResponse() : NextResponse.json({ error: error.message }, { status: 500 })
  }
  const oldPaths = (previous ?? []).map((item) => item.storage_path).filter(Boolean)
  if (oldPaths.length) await supabaseAdmin.storage.from(CLUB_PROFILE_BUCKET).remove(oldPaths)
  return NextResponse.json({ ok: true, media: data })
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertCanManageClubProfile(req, clubId)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => ({}))
  const order = Array.isArray(body?.order) ? body.order.map(String) : []
  for (const [index, id] of order.entries()) await supabaseAdmin.from('club_media').update({ sort_order: index }).eq('club_id', clubId).eq('kind', 'GALLERY').eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertCanManageClubProfile(req, clubId)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '')
  const { data } = await supabaseAdmin.from('club_media').select('storage_path').eq('club_id', clubId).eq('id', id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Imagen no encontrada.' }, { status: 404 })
  const removed = await supabaseAdmin.storage.from(CLUB_PROFILE_BUCKET).remove([data.storage_path])
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 })
  await supabaseAdmin.from('club_media').delete().eq('club_id', clubId).eq('id', id)
  return NextResponse.json({ ok: true })
}
