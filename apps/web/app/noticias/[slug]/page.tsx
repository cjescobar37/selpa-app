import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { getNewsBySlug } from '@/lib/platformContent'
import PublicNewsArticle from '@/components/public/PublicNewsArticle'
import { getClubTheme } from '@/lib/clubThemes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { BRAND } from '@/lib/branding'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getNewsBySlug(slug)
  if (!item) return notFound()
  const paragraphs = String(item.body || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const gallery = Array.isArray(item.gallery_urls) ? item.gallery_urls.filter(Boolean) : []
  const inlineImages = Array.isArray(item.metadata?.inline_images)
    ? item.metadata.inline_images.map((url: unknown) => String(url || '').trim()).filter(Boolean).slice(0, 2)
    : []
  const clubId = typeof item.club_id === 'string' && item.club_id ? item.club_id : null
  const { data: clubThemeData } = clubId
    ? await supabaseAdmin.from('clubs').select('theme_key').eq('id', clubId).maybeSingle()
    : { data: null }
  const clubTheme = clubThemeData?.theme_key ? getClubTheme(clubThemeData.theme_key as string) : null
  const articleThemeStyle = {
    '--club-accent': clubTheme?.vars.accent ?? '#334155',
    '--club-accent-soft': clubTheme?.vars.soft ?? 'rgba(248,250,252,.92)',
    '--club-glow': clubTheme?.vars.glow ?? 'rgba(15,23,42,.08)',
  } as CSSProperties

  return (
    <div className="px-page" style={articleThemeStyle}>
      <PublicNewsArticle
        title={item.title}
        dateLabel={formatDate(item.published_at)}
        sourceLabel={`${BRAND.name} Noticias`}
        excerpt={item.excerpt}
        bodyParagraphs={paragraphs}
        coverUrl={item.cover_url}
        middleImageUrl={inlineImages[0] ?? null}
        finalImageUrl={inlineImages[1] ?? null}
        galleryUrls={gallery}
        clubHref={clubId ? `/clubs/${clubId}` : null}
      />
    </div>
  )
}
