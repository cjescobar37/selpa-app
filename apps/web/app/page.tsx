import PublicHomeExperience from '@/components/public/PublicHomeExperience'
import { getPublicHomeData } from '@/lib/publicHomeData'
import { Suspense } from 'react'
import SelpaLoader from '@/components/SelpaLoader'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function PublicHomePage() {
  const ua = (await headers()).get('user-agent') ?? ''
  const phone = /iPhone|iPod|Android.*Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua)
  // Stream the existing shell/opening before public data, without changing
  // queries or the resolved home. Tablet/desktop keep their existing delivery.
  return phone
    ? <Suspense fallback={<SelpaLoader title="Cargando SELPA..." subtitle="Buscando torneos y clubes" />}><PublicHomeContent /></Suspense>
    : <PublicHomeContent />
}

async function PublicHomeContent() {
  const data = await getPublicHomeData()

  return (
    <div className="px-wrap px-publicFrame">
      <PublicHomeExperience
        slides={data.slides as any}
        newsArchive={data.newsArchive as any}
        tournaments={data.tournaments as any}
        ads={data.ads as any}
        sponsors={data.sponsors as any}
        metrics={data.metrics}
        clubs={data.clubs as any}
      />
    </div>
  )
}
