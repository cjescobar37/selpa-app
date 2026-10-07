import PublicTournamentsExperience from '@/components/public/PublicTournamentsExperience'
import { getPublicTournamentItems } from '@/lib/publicTournamentItems'
import ReadFailure from '@/components/product/ReadFailure'

export const dynamic = 'force-dynamic'

export default async function TorneosPublicPage() {
  let data: Awaited<ReturnType<typeof getPublicTournamentItems>> | null = null
  try { data = await getPublicTournamentItems() }
  catch { /* Rendering errors are not swallowed by this data-read boundary. */ }
  return <div className="px-wrap px-publicFrame">{data ? <PublicTournamentsExperience tournaments={data.tournaments} clubs={data.clubs} /> : <ReadFailure message="No pudimos cargar los torneos. Intentá nuevamente." />}</div>
}
