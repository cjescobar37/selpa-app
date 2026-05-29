'use client'

import { useMemo, useState } from 'react'

type NewsItem = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  gallery_urls: string[] | null
  placement: 'HERO' | 'GRID' | 'ARCHIVE'
  status?: string | null
  published_at: string | null
  updated_at?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function placementLabel(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'Destacada'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Grilla'
}

function placementBadgeClass(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'px-publicPlacement px-publicPlacement--hero'
  if (placement === 'ARCHIVE') return 'px-publicPlacement px-publicPlacement--archive'
  return 'px-publicPlacement px-publicPlacement--grid'
}

export default function PublicNewsExperience({
  hero,
  grid,
  archive,
  title,
  subtitle,
  compactHeader = false,
}: {
  hero: NewsItem | null
  grid: NewsItem[]
  archive: NewsItem[]
  title: string
  subtitle: string
  compactHeader?: boolean
}) {
  const [selected, setSelected] = useState<NewsItem | null>(null)

  const topIds = useMemo(() => new Set([hero?.id, ...grid.map((item) => item.id)].filter(Boolean)), [hero?.id, grid])
  const latest = useMemo(() => archive.filter((item) => !topIds.has(item.id)).slice(0, 6), [archive, topIds])

  return (
    <div className="px-publicNewsSurface">
      <div className={`px-pageHead ${compactHeader ? 'is-compact' : ''}`}>
        <h1 className="px-pageTitle">{title}</h1>
        <p className="px-pageSub">{subtitle}</p>
      </div>

      <div className="px-publicNewsStack">
        {hero ? (
          <article className="publicNewsTile px-publicHeroCard px-publicInteractive" onClick={() => setSelected(hero)}>
            {hero.cover_url ? <img src={hero.cover_url} alt={hero.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
            <div className="publicNewsTileOverlay px-publicHeroOverlay">
              <span className={placementBadgeClass('HERO')}>Destacada</span>
              <h2>{hero.title}</h2>
              <p>{hero.excerpt || 'Última novedad institucional de Pamprax.'}</p>
              <div>{formatDate(hero.published_at || hero.updated_at)}</div>
            </div>
          </article>
        ) : null}

        {grid.length ? (
          <section className="px-publicSection">
            <div className="px-publicSectionHead">
              <h3>Últimas noticias</h3>
            </div>
            <div className="publicNewsGrid px-publicGrid">
              {grid.map((item) => (
                <article key={item.id} className="publicNewsTile px-publicGridCard px-publicInteractive" onClick={() => setSelected(item)}>
                  {item.cover_url ? <img src={item.cover_url} alt={item.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
                  <div className="publicNewsTileOverlay">
                    <span className={placementBadgeClass(item.placement)}>{placementLabel(item.placement)}</span>
                    <h3>{item.title}</h3>
                    <div>{formatDate(item.published_at || item.updated_at)}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {latest.length ? (
          <section className="px-publicSection">
            <div className="px-publicSectionHead">
              <h3>Archivo reciente</h3>
            </div>
            <div className="px-publicArchiveList">
              {latest.map((item) => (
                <article key={item.id} className="px-publicArchiveItem px-publicInteractive" onClick={() => setSelected(item)}>
                  <div className="px-publicArchiveMeta">
                    <span className={placementBadgeClass(item.placement)}>{placementLabel(item.placement)}</span>
                    <strong>{item.title}</strong>
                    <p>{item.excerpt || 'Sin bajada.'}</p>
                  </div>
                  <span>{formatDate(item.published_at || item.updated_at)}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!hero && !grid.length && !latest.length ? (
          <section className="px-publicNewsEmpty">
            <strong>Todavía no hay noticias públicas</strong>
            <p>Cuando Pamprax o los clubes publiquen contenido, va a aparecer en esta portada editorial.</p>
          </section>
        ) : null}
      </div>

      {selected ? (
        <div className="px-publicArticleOverlay" role="dialog" aria-modal="true">
          <div className="px-publicArticleShell">
            <div className="px-publicArticleHead">
              <span className={placementBadgeClass(selected.placement)}>{placementLabel(selected.placement)}</span>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setSelected(null)}>
                Cerrar noticia
              </button>
            </div>
            <article className="px-publicArticleBodyWrap">
              {selected.cover_url ? <img src={selected.cover_url} alt={selected.title} className="px-publicArticleHero" /> : null}
              <div className="px-publicArticleBody">
                <h2>{selected.title}</h2>
                {selected.excerpt ? <p className="px-publicArticleLead">{selected.excerpt}</p> : null}
                <div className="px-publicArticleCopy">
                  {String(selected.body || 'Sin contenido cargado.')
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
                {Array.isArray(selected.gallery_urls) && selected.gallery_urls.length ? (
                  <div className="px-publicArticleGallery">
                    {selected.gallery_urls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt={`Galería ${index + 1}`} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .px-publicNewsSurface { display: grid; gap: 18px; }
        .px-pageHead.is-compact { margin-bottom: 0; padding-bottom: 4px; }
        .px-publicNewsStack { display: grid; gap: 18px; }
        .px-publicInteractive { cursor: pointer; transition: transform 200ms ease, box-shadow 200ms ease, filter 200ms ease; }
        .px-publicInteractive:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14); }
        .px-publicInteractive :global(.publicNewsTileImage),
        .px-publicInteractive :global(img) { transition: transform 220ms ease, filter 220ms ease; }
        .px-publicInteractive :global(.publicNewsTileOverlay) { transition: background 220ms ease; }
        .px-publicInteractive:hover :global(.publicNewsTileImage),
        .px-publicInteractive:hover :global(img) { transform: scale(1.035); filter: saturate(1.05) contrast(1.03); }
        .px-publicInteractive:hover :global(.publicNewsTileOverlay) { background: linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.72) 62%, rgba(15,23,42,0.95) 100%); }
        .px-publicHeroCard { min-height: 360px; }
        .px-publicHeroOverlay { padding: 18px 18px 16px; background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.74) 58%, rgba(15,23,42,0.92) 100%); }
        .px-publicHeroOverlay h2 { margin: 0 0 6px; max-width: 78%; font-size: clamp(24px, 3.4vw, 38px); line-height: 1.06; text-wrap: balance; color: #fff; }
        .px-publicHeroOverlay p { margin: 0 0 8px; max-width: 72%; color: rgba(255,255,255,.84); font-size: 15px; line-height: 1.45; }
        .px-publicHeroOverlay div:last-child { color: rgba(255,255,255,.78); font-size: 13px; }
        .px-publicSection { display: grid; gap: 10px; }
        .px-publicSectionHead h3 { margin: 0; font-size: 16px; }
        .px-publicGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .px-publicGridCard { min-height: 220px; }
        .px-publicArchiveList { display: grid; gap: 8px; }
        .px-publicArchiveItem { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,.88); }
        .px-publicArchiveItem:hover { border-color: rgba(16,185,129,.22); }
        .px-publicNewsEmpty { background: radial-gradient(circle at 12% 0%, rgba(34,211,238,.18), transparent 34%), #fff; border: 1px dashed rgba(15,23,42,.14); border-radius: 16px; color: rgba(23,37,63,.68); display: grid; gap: 6px; padding: 28px; }
        .px-publicNewsEmpty strong { color: #061b3a; font-size: 20px; font-weight: 950; }
        .px-publicNewsEmpty p { margin: 0; }
        .px-publicArchiveMeta { min-width: 0; display: grid; gap: 4px; }
        .px-publicArchiveMeta strong { font-size: 14px; line-height: 1.2; }
        .px-publicArchiveMeta p { margin: 0; color: rgba(23,37,63,.62); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 540px; }
        .px-publicPlacement { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .px-publicPlacement--hero { background: rgba(236,72,153,.14); color: #be185d; }
        .px-publicPlacement--grid { background: rgba(59,130,246,.12); color: #1d4ed8; }
        .px-publicPlacement--archive { background: rgba(100,116,139,.14); color: #475569; }
        .px-publicArticleOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15,23,42,.72); z-index: 80; padding: 16px; overflow-y: auto; overflow-x: hidden; }
        .px-publicArticleShell { width: min(920px, 100%); min-height: calc(100vh - 104px); margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: auto minmax(0,1fr); }
        .px-publicArticleHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(15,23,42,.08); background: #fff; position: sticky; top: 0; z-index: 1; }
        .px-publicArticleBodyWrap { min-height: 0; overflow-y: auto; }
        .px-publicArticleHero, .px-publicArticleGallery img { width: 100%; display: block; object-fit: cover; }
        .px-publicArticleHero { height: 280px; }
        .px-publicArticleBody { display: grid; gap: 14px; padding: 18px; }
        .px-publicArticleBody h2 { margin: 0; font-size: 32px; line-height: 1.08; }
        .px-publicArticleLead { margin: 0; font-size: 18px; line-height: 1.45; color: rgba(23,37,63,.74); }
        .px-publicArticleCopy { display: grid; gap: 12px; color: #0f172a; font-size: 15px; line-height: 1.72; }
        .px-publicArticleCopy p { margin: 0; }
        .px-publicArticleGallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .px-publicArticleGallery img { aspect-ratio: 4 / 3; border-radius: 8px; }
        @media (max-width: 980px) {
          .px-publicGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .px-publicHeroCard { min-height: 250px; }
          .px-publicHeroOverlay h2 { max-width: 100%; font-size: clamp(22px, 7vw, 30px); }
          .px-publicHeroOverlay p { max-width: 100%; font-size: 13px; }
          .px-publicGrid { grid-template-columns: 1fr; }
          .px-publicArchiveItem { flex-direction: column; align-items: flex-start; }
          .px-publicArchiveMeta p { max-width: 100%; white-space: normal; }
          .px-publicArticleOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-publicArticleShell { min-height: calc(100vh - 64px); border-radius: 0; }
          .px-publicArticleHero { height: 220px; }
          .px-publicArticleBody { padding: 14px; }
          .px-publicArticleBody h2 { font-size: 26px; }
          .px-publicArticleLead { font-size: 16px; }
          .px-publicArticleGallery { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
