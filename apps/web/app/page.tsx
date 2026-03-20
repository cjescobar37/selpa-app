import Link from 'next/link'
import { listPublishedContent } from '@/lib/platformContent'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function PublicHomePage() {
  const { heroNews, gridNews, ads, sponsors } = await listPublishedContent()
  const heroAds = ads.filter((item: any) => item.slot === 'HOME_HERO').slice(0, 1)
  const gridAds = ads.filter((item: any) => item.slot !== 'HOME_HERO').slice(0, 3)

  return (
    <div className="px-wrap">
      <div className="px-card px-cardTopAccent publicHeroNews">
        <div className="publicHeroLayout">
          <div className="publicHeroMain">
            {heroNews?.cover_url ? <img src={heroNews.cover_url} alt={heroNews.title} className="publicHeroImage" /> : <div className="publicHeroFallback" />}
            <div className="publicHeroOverlay">
              <span className="px-pill">Noticia destacada</span>
              <h1 className="publicHeroHeadline">{heroNews?.title || 'PAMPRAX listo para publicar contenido real'}</h1>
              <p className="publicHeroExcerpt">{heroNews?.excerpt || 'Desde platform ya podés cargar noticias, sponsors y campañas reales para el home invitado.'}</p>
              <div className="publicHeroActions">
                <Link className="px-btn" href={heroNews ? `/noticias/${heroNews.slug}` : '/noticias'}>Leer noticia</Link>
                <Link className="px-btn px-btn--ghost" href="/torneos">Ver torneos</Link>
              </div>
            </div>
          </div>
          <div className="publicHeroSide">
            {(gridNews.length ? gridNews : []).slice(0, 4).map((item: any) => (
              <article key={item.id} className="publicSideNewsCard">
                {item.cover_url ? <img src={item.cover_url} alt={item.title} className="publicSideNewsImage" /> : <div className="publicSideNewsImage publicSideNewsFallback" />}
                <div className="publicSideNewsOverlay">
                  <div className="publicSideNewsTitle">{item.title}</div>
                  <div className="publicSideNewsDate">{formatDate(item.published_at)}</div>
                </div>
                <Link className="publicSideNewsLink" href={`/noticias/${item.slug}`} aria-label={item.title} />
              </article>
            ))}
          </div>
        </div>
      </div>

      {heroAds[0] ? (
        <section className="public-section">
          <a className="publicPromoBanner" href={heroAds[0].link_url || '#'} target="_blank" rel="noreferrer">
            {heroAds[0].image_url ? <img src={heroAds[0].image_url} alt={heroAds[0].title} className="publicPromoBannerImage" /> : null}
            <div className="publicPromoBannerCopy">
              <span className="px-pill">Publicidad</span>
              <strong>{heroAds[0].title}</strong>
              {heroAds[0].description ? <span>{heroAds[0].description}</span> : null}
            </div>
          </a>
        </section>
      ) : null}

      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Últimas noticias</div>
            <div className="public-sub">Contenido real cargado desde el panel de plataforma.</div>
          </div>
          <Link className="public-actionLink" href="/noticias">Ver todas →</Link>
        </div>
        <div className="publicNewsGrid">
          {[heroNews, ...gridNews].filter(Boolean).slice(0, 6).map((item: any) => (
            <article key={item.id} className="publicNewsTile">
              {item.cover_url ? <img src={item.cover_url} alt={item.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
              <div className="publicNewsTileOverlay">
                <span className="px-pill">{item.placement === 'HERO' ? 'Destacada' : 'Noticia'}</span>
                <h3>{item.title}</h3>
                <div>{formatDate(item.published_at)}</div>
              </div>
              <Link className="publicNewsTileLink" href={`/noticias/${item.slug}`} aria-label={item.title} />
            </article>
          ))}
        </div>
      </section>

      {gridAds.length ? (
        <section className="public-section">
          <div className="publicAdsGrid">
            {gridAds.map((item: any) => (
              <a key={item.id} className="publicAdCard" href={item.link_url || '#'} target="_blank" rel="noreferrer">
                {item.image_url ? <img src={item.image_url} alt={item.title} className="publicAdCardImage" /> : null}
                <div className="publicAdCardCopy"><strong>{item.title}</strong><span>{item.description || 'Campaña activa'}</span></div>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Sponsors & aliados</div>
            <div className="public-sub">Bloque real administrado desde platform.</div>
          </div>
        </div>
        <div className="sponsorRow">
          {sponsors.length ? sponsors.map((item: any) => (
            <a key={item.id} className="px-card px-card--flat sponsorCard sponsorCard--real" href={item.website_url || '#'} target="_blank" rel="noreferrer">
              {item.logo_url ? <img src={item.logo_url} alt={item.name} className="sponsorLogoReal" /> : <div className="sponsorLogoFallback">{item.name.slice(0, 2).toUpperCase()}</div>}
              <div className="sponsorType"><span className="dotMagenta" /><span>{item.tier}</span></div>
              <div className="sponsorNameReal">{item.name}</div>
            </a>
          )) : <div className="px-empty">Todavía no hay sponsors cargados.</div>}
        </div>
      </section>
    </div>
  )
}
