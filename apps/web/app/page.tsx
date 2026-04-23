import { listPublishedContent } from '@/lib/platformContent'
import PublicHomeExperience from '@/components/public/PublicHomeExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'

export default async function PublicHomePage() {
  const { archiveNews, ads, sponsors } = await listPublishedContent()
  const prioritizedSlides = [
    ...archiveNews.filter((item: any) => item.placement === 'HERO'),
    ...archiveNews.filter((item: any) => item.placement !== 'HERO'),
  ]
    .filter((item: any, index: number, list: any[]) => list.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 3)

  const { data: tournamentRows } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .neq('status', 'DRAFT')
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(4)

  const tournaments = (tournamentRows ?? [])
    .map((row: any) => toTournamentView(row))
    .filter(Boolean)

  return (
    <div className="px-wrap">
      <PublicHomeExperience
        slides={prioritizedSlides as any}
        newsArchive={archiveNews as any}
        tournaments={tournaments as any}
        ads={ads as any}
        sponsors={sponsors as any}
      />
    </div>
  )
}
