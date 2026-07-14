import PublicHomeExperience from '@/components/public/PublicHomeExperience'
import { getPublicHomeData } from '@/lib/publicHomeData'

export default async function PublicHomePage() {
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
