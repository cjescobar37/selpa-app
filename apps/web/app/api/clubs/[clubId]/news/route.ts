import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  assertCanManageClubNews,
  buildClubNewsSlug,
  clubNewsSetupResponse,
  getNullableTextField,
  getTextField,
  isClubNewsSchemaError,
  normalizeFeaturedRank,
  normalizeClubNewsStatus,
  readCoverUrlFromForm,
  readInlineImagesFromForm,
} from '@/lib/clubNewsServer'

export async function GET(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params
  const auth = await assertCanManageClubNews(req, clubId, 'news:manage')
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('platform_news')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isClubNewsSchemaError(error)) return clubNewsSetupResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params
  const auth = await assertCanManageClubNews(req, clubId, 'news:manage')
  if (auth.error) return auth.error

  try {
    const form = await req.formData()
    const title = getTextField(form, 'title')
    const status = normalizeClubNewsStatus(form.get('status'))

    if (!title) return NextResponse.json({ error: 'Falta título.' }, { status: 400 })
    if (status === 'PUBLISHED') {
      const publishAuth = await assertCanManageClubNews(req, clubId, 'news:manage')
      if (publishAuth.error) return publishAuth.error
    }

    const coverUrl = await readCoverUrlFromForm(form, clubId)
    const inlineImages = await readInlineImagesFromForm(form, clubId)
    const featuredRank = normalizeFeaturedRank(form.get('featured_rank'))
    const baseSlug = buildClubNewsSlug({ title, slug: getTextField(form, 'slug'), clubId })
    const payload = {
      club_id: clubId,
      title,
      slug: baseSlug,
      excerpt: getNullableTextField(form, 'excerpt'),
      body: getNullableTextField(form, 'body'),
      cover_url: coverUrl,
      gallery_urls: [],
      metadata: {
        inline_images: inlineImages,
        featured_rank: featuredRank,
      },
      placement: 'GRID',
      status,
      published_at: status === 'PUBLISHED' ? new Date().toISOString() : null,
      created_by: auth.user!.id,
      updated_by: auth.user!.id,
    }

    if (featuredRank) {
      const { data: rankedRows } = await supabaseAdmin
        .from('platform_news')
        .select('id,metadata')
        .eq('club_id', clubId)
        .filter('metadata->>featured_rank', 'eq', String(featuredRank))

      await Promise.all((rankedRows ?? []).map((row: any) => supabaseAdmin
        .from('platform_news')
        .update({ metadata: { ...(row.metadata ?? {}), featured_rank: null } })
        .eq('id', row.id)))
    }

    let { data, error } = await supabaseAdmin.from('platform_news').insert(payload).select('*').maybeSingle()
    if (error?.code === '23505') {
      const retryPayload = { ...payload, slug: `${baseSlug}-${Date.now().toString(36).slice(-5)}` }
      const retry = await supabaseAdmin.from('platform_news').insert(retryPayload).select('*').maybeSingle()
      data = retry.data
      error = retry.error
    }

    if (error) {
      if (isClubNewsSchemaError(error)) return clubNewsSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude crear la noticia.' }, { status: 500 })
  }
}
