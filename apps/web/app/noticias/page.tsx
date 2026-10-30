export const dynamic = 'force-dynamic'

import { listPublishedContent } from '@/lib/platformContent'
import PublicNewsExperience from '@/components/public/PublicNewsExperience'
import { BRAND } from '@/lib/branding'

function normalizeBrandText(value: unknown) {
  if (typeof value !== 'string') return value
  return value.replace(/PAMPRAX|PAMPrax|Pamprax|pamprax/g, BRAND.name.toUpperCase())
}

function normalizeNewsBrand<T extends Record<string, unknown> | null>(item: T): T {
  if (!item) return item
  return {
    ...item,
    title: normalizeBrandText(item.title),
    excerpt: normalizeBrandText(item.excerpt),
    body: normalizeBrandText(item.body),
  }
}

export default async function NoticiasPublicPage() {
  const { heroNews, gridNews, archiveNews } = await listPublishedContent()

  return (
    <div className="px-page px-publicFrame">
      <PublicNewsExperience
        hero={normalizeNewsBrand(heroNews)}
        grid={gridNews.map((item) => normalizeNewsBrand(item))}
        archive={archiveNews.map((item) => normalizeNewsBrand(item))}
        title="Noticias"
        subtitle={`Actualidad, comunicados y novedades de la comunidad ${BRAND.name.toUpperCase()}.`}
      />
    </div>
  )
}
