import Link from 'next/link'
import { listPublishedContent } from '@/lib/platformContent'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function NoticiasPublicPage() {
  const { archiveNews } = await listPublishedContent()

  return (
    <div className="px-page">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Noticias</h1>
        <p className="px-pageSub">Últimas noticias, comunicados y archivo histórico real cargado desde PAMPRAX.</p>
      </div>

      <div className="publicNewsGrid publicNewsGrid--archive">
        {archiveNews.map((item: any) => (
          <article key={item.id} className="publicNewsTile">
            {item.cover_url ? <img src={item.cover_url} alt={item.title} className="publicNewsTileImage" /> : <div className="publicNewsTileImage publicNewsTileFallback" />}
            <div className="publicNewsTileOverlay">
              <span className="px-pill">{item.placement}</span>
              <h3>{item.title}</h3>
              <div>{formatDate(item.published_at)}</div>
            </div>
            <Link className="publicNewsTileLink" href={`/noticias/${item.slug}`} aria-label={item.title} />
          </article>
        ))}
      </div>
    </div>
  )
}
