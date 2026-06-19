import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  assertCanManageClubNews,
  buildClubNewsSlug,
  clubNewsSetupResponse,
  getNullableTextField,
  getTextField,
  isClubNewsSchemaError,
  normalizeClubNewsMetadata,
  normalizeFeaturedRank,
  normalizeClubNewsStatus,
  readCoverUrlFromForm,
  readInlineImagesFromForm,
} from '@/lib/clubNewsServer'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clubId: string; newsId: string }> }) {
  const { clubId, newsId } = await params
  const auth = await assertCanManageClubNews(req, clubId, 'content:edit')
  if (auth.error) return auth.error

  try {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('platform_news')
      .select('id,club_id,title,slug,cover_url,status,published_at,metadata')
      .eq('id', newsId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (existingError) {
      if (isClubNewsSchemaError(existingError)) return clubNewsSetupResponse()
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }
    if (!existing) return NextResponse.json({ error: 'Noticia no encontrada para este club.' }, { status: 404 })

    const form = await req.formData()
    const title = getTextField(form, 'title')
    const status = normalizeClubNewsStatus(form.get('status'))

    if (!title) return NextResponse.json({ error: 'Falta título.' }, { status: 400 })
    if (status === 'PUBLISHED') {
      const publishAuth = await assertCanManageClubNews(req, clubId, 'content:publish')
      if (publishAuth.error) return publishAuth.error
    }

    const coverUrl = await readCoverUrlFromForm(form, clubId, existing.cover_url)
    const currentMetadata = normalizeClubNewsMetadata(existing.metadata)
    const inlineImages = await readInlineImagesFromForm(form, clubId, currentMetadata.inline_images)
    const featuredRank = normalizeFeaturedRank(form.get('featured_rank'))
    const baseSlug = buildClubNewsSlug({
      title,
      slug: getTextField(form, 'slug'),
      clubId,
      existingSlug: existing.slug,
    })
    const wasPublished = String(existing.status ?? '').toUpperCase() === 'PUBLISHED'
    const payload: Record<string, unknown> = {
      title,
      slug: baseSlug,
      excerpt: getNullableTextField(form, 'excerpt'),
      body: getNullableTextField(form, 'body'),
      cover_url: coverUrl,
      metadata: {
        ...currentMetadata,
        inline_images: inlineImages,
        featured_rank: featuredRank,
      },
      status,
      updated_by: auth.user!.id,
      published_at: status === 'PUBLISHED' ? (wasPublished ? existing.published_at ?? new Date().toISOString() : new Date().toISOString()) : null,
    }

    if (featuredRank) {
      const { data: rankedRows } = await supabaseAdmin
        .from('platform_news')
        .select('id,metadata')
        .eq('club_id', clubId)
        .neq('id', newsId)
        .filter('metadata->>featured_rank', 'eq', String(featuredRank))

      await Promise.all((rankedRows ?? []).map((row: any) => supabaseAdmin
        .from('platform_news')
        .update({ metadata: { ...(row.metadata ?? {}), featured_rank: null } })
        .eq('id', row.id)))
    }

    let { data, error } = await supabaseAdmin
      .from('platform_news')
      .update(payload)
      .eq('id', newsId)
      .eq('club_id', clubId)
      .select('*')
      .maybeSingle()

    if (error?.code === '23505') {
      const retryPayload = { ...payload, slug: `${baseSlug}-${Date.now().toString(36).slice(-5)}` }
      const retry = await supabaseAdmin
        .from('platform_news')
        .update(retryPayload)
        .eq('id', newsId)
        .eq('club_id', clubId)
        .select('*')
        .maybeSingle()
      data = retry.data
      error = retry.error
    }

    if (error) {
      if (isClubNewsSchemaError(error)) return clubNewsSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar la noticia.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ clubId: string; newsId: string }> }) {
  const { clubId, newsId } = await params
  const auth = await assertCanManageClubNews(req, clubId, 'content:edit')
  if (auth.error) return auth.error

  const { error } = await supabaseAdmin
    .from('platform_news')
    .delete()
    .eq('id', newsId)
    .eq('club_id', clubId)

  if (error) {
    if (isClubNewsSchemaError(error)) return clubNewsSetupResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
