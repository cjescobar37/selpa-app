'use client'

import Link from 'next/link'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { useEffect, useState } from 'react'

type PublicNewsArticleProps = {
  title: string
  dateLabel: string
  sourceLabel: string
  excerpt?: string | null
  bodyParagraphs: string[]
  coverUrl?: string | null
  middleImageUrl?: string | null
  finalImageUrl?: string | null
  galleryUrls?: string[]
  clubHref?: string | null
}

export default function PublicNewsArticle({
  title,
  dateLabel,
  sourceLabel,
  excerpt,
  bodyParagraphs,
  coverUrl,
  middleImageUrl,
  finalImageUrl,
  galleryUrls = [],
  clubHref,
}: PublicNewsArticleProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [resolvedClubHref, setResolvedClubHref] = useState<string | null>(clubHref ?? null)
  const backLabel = resolvedClubHref ? 'Volver al club' : 'Volver a noticias'

  useEffect(() => {
    if (!lightboxUrl) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setLightboxUrl(null)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [lightboxUrl])

  useEffect(() => {
    if (clubHref) {
      setResolvedClubHref(clubHref)
      return
    }

    try {
      const referrer = document.referrer ? new URL(document.referrer) : null
      const match = referrer?.origin === window.location.origin ? referrer.pathname.match(/^\/clubs\/[^/?#]+/) : null
      if (match?.[0]) {
        setResolvedClubHref(match[0])
      }
    } catch {
      setResolvedClubHref(null)
    }
  }, [clubHref])

  function imageButton(url: string, alt: string, className: string) {
    return (
      <button type="button" className="publicArticleImageButton" onClick={() => setLightboxUrl(url)}>
        <img src={url} alt={alt} className={className} />
      </button>
    )
  }

  return (
    <>
      <nav className="publicArticleNav" aria-label="Navegación de noticia">
        <Link href={resolvedClubHref ?? '/noticias'} className="pamprax-soft-action">
          <ArrowLeft size={17} strokeWidth={2.5} />
          <span>{backLabel}</span>
        </Link>
        <Link href="/noticias" className="pamprax-soft-action">
          <Newspaper size={17} strokeWidth={2.5} />
          <span>Todas las noticias</span>
        </Link>
      </nav>
      <article className="px-card px-cardTopAccent publicArticle">
        {coverUrl ? imageButton(coverUrl, title, 'publicArticleImage') : null}
        <div className="publicArticleBody">
          <h1 className="px-pageTitle publicArticleTitle">{title}</h1>
          <div className="px-pageSub">{dateLabel} • {sourceLabel}</div>
          {excerpt ? <p className="publicArticleExcerpt">{excerpt}</p> : null}
          {middleImageUrl ? (
            <div className="publicArticleSingleImage">
              {imageButton(middleImageUrl, `${title} imagen media`, 'publicArticleGalleryImage')}
            </div>
          ) : null}
          <div className="publicArticleContent">
            {(bodyParagraphs.length ? bodyParagraphs : ['']).map((paragraph, idx) => <p key={idx}>{paragraph}</p>)}
          </div>
          {finalImageUrl ? (
            <div className="publicArticleSingleImage">
              {imageButton(finalImageUrl, `${title} imagen final`, 'publicArticleGalleryImage')}
            </div>
          ) : null}
          {galleryUrls.length ? (
            <div className="publicArticleGallery">
              {galleryUrls.map((url, idx) => (
                <div key={`${url}-${idx}`}>
                  {imageButton(url, `${title} imagen ${idx + 1}`, 'publicArticleGalleryImage')}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </article>

      {lightboxUrl ? (
        <div className="publicArticleLightbox" role="dialog" aria-modal="true" onClick={() => setLightboxUrl(null)}>
          <button type="button" className="publicArticleLightboxClose" aria-label="Cerrar imagen" onClick={() => setLightboxUrl(null)}>
            ×
          </button>
          <img src={lightboxUrl} alt="Imagen ampliada" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}

    </>
  )
}
