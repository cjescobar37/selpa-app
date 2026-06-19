'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  const topIds = useMemo(() => new Set([hero?.id, ...grid.map((item) => item.id)].filter(Boolean)), [hero?.id, grid])
  const latest = useMemo(() => archive.filter((item) => !topIds.has(item.id)).slice(0, 6), [archive, topIds])

  function openNews(item: NewsItem) {
    router.push(`/noticias/${item.slug}`)
  }

  return (
    <div className="px-publicNewsSurface">
      <section className="px-publicNewsHero">
        <span>Noticias públicas</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>

      <div className={`px-pageHead ${compactHeader ? 'is-compact' : ''}`}>
        <h2 className="px-pageTitle">Cobertura Pamprax</h2>
        <p className="px-pageSub">Historias, clubes y actividad deportiva destacada.</p>
      </div>

      <div className="px-publicNewsStack">
        {hero ? (
          <article className="publicNewsTile px-publicHeroCard px-publicInteractive" onClick={() => openNews(hero)}>
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
                <article key={item.id} className="publicNewsTile px-publicGridCard px-publicInteractive" onClick={() => openNews(item)}>
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
                <article key={item.id} className="px-publicArchiveItem px-publicInteractive" onClick={() => openNews(item)}>
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

      <style jsx>{`
        .px-publicNewsSurface { display: grid; gap: 18px; }
        .px-publicNewsHero { background: radial-gradient(circle at 12% 0%, rgba(34,211,238,.24), transparent 36%), radial-gradient(circle at 88% 10%, rgba(236,72,153,.08), transparent 30%), linear-gradient(135deg, #020617, #061b3a 58%, #0f274a); border: 1px solid rgba(103,232,249,.14); border-radius: 22px; box-shadow: 0 22px 58px rgba(2,6,23,.16); color: #fff; min-height: 220px; overflow: hidden; padding: clamp(24px, 4.5vw, 42px); position: relative; }
        .px-publicNewsHero::after { background: linear-gradient(90deg, #22d3ee, rgba(34,211,238,.82), rgba(236,72,153,.42)); bottom: 0; content: ""; height: 4px; left: 28px; position: absolute; right: 28px; }
        .px-publicNewsHero span { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .px-publicNewsHero h1 { font-size: clamp(38px, 6vw, 68px); font-weight: 950; letter-spacing: -.06em; line-height: .92; margin: 8px 0; }
        .px-publicNewsHero p { color: rgba(255,255,255,.78); font-size: 16px; font-weight: 750; margin: 0; max-width: 620px; }
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
        .px-publicHeroCard { height: 300px; min-height: 0; }
        .px-publicHeroCard :global(.publicNewsTileImage) { height: 100%; left: 0; object-fit: cover; position: absolute; top: 0; width: 100%; }
        .px-publicHeroOverlay { padding: 18px 18px 16px; background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.74) 58%, rgba(15,23,42,0.92) 100%); }
        .px-publicHeroOverlay h2 { margin: 0 0 6px; max-width: 78%; font-size: clamp(22px, 3vw, 34px); line-height: 1.06; text-wrap: balance; color: #fff; }
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
        @media (max-width: 980px) {
          .px-publicGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .px-publicNewsHero { border-radius: 20px; min-height: 180px; padding: 24px 18px; }
          .px-publicHeroCard { height: 250px; }
          .px-publicHeroOverlay h2 { max-width: 100%; font-size: clamp(22px, 7vw, 30px); }
          .px-publicHeroOverlay p { max-width: 100%; font-size: 13px; }
          .px-publicGrid { grid-template-columns: 1fr; }
          .px-publicArchiveItem { flex-direction: column; align-items: flex-start; }
          .px-publicArchiveMeta p { max-width: 100%; white-space: normal; }
        }
      `}</style>
    </div>
  )
}
