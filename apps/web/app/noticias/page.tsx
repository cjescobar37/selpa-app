export const dynamic = 'force-dynamic'

import { listPublishedContent } from '@/lib/platformContent'
import PublicNewsExperience from '@/components/public/PublicNewsExperience'

export default async function NoticiasPublicPage() {
  const { heroNews, gridNews, archiveNews } = await listPublishedContent()

  return (
    <div className="px-page">
      <PublicNewsExperience
        hero={heroNews as any}
        grid={gridNews as any}
        archive={archiveNews as any}
        title="Noticias"
        subtitle="Últimas noticias, comunicados y archivo histórico real cargado desde PAMPRAX."
      />
    </div>
  )
}
