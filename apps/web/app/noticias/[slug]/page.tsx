import { notFound } from 'next/navigation'
import { getNewsBySlug } from '@/lib/platformContent'

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

  return (
    <div className="px-page">
      <article className="px-card px-cardTopAccent publicArticle">
        {item.cover_url ? <img src={item.cover_url} alt={item.title} className="publicArticleImage" /> : null}
        <div className="publicArticleBody">
          <span className="px-pill">{item.placement}</span>
          <h1 className="px-pageTitle" style={{ marginTop: 14 }}>{item.title}</h1>
          <div className="px-pageSub">{formatDate(item.published_at)} • PAMPRAX Noticias</div>
          {item.excerpt ? <p className="publicArticleExcerpt">{item.excerpt}</p> : null}
          <div className="publicArticleContent">
            {(paragraphs.length ? paragraphs : ['']).map((paragraph: string, idx: number) => <p key={idx}>{paragraph}</p>)}
          </div>
          {gallery.length ? (
            <div className="publicArticleGallery">
              {gallery.map((url: string, idx: number) => (
                <img key={`${url}-${idx}`} src={url} alt={`${item.title} imagen ${idx + 1}`} className="publicArticleGalleryImage" />
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  )
}
