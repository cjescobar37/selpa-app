import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import PublicAgenda from '@/components/product/PublicAgenda'
import ReadFailure from '@/components/product/ReadFailure'
import { getPublicTournamentItems } from '@/lib/publicTournamentItems'
import styles from '@/components/product/ProductFlow.module.css'

export const dynamic = 'force-dynamic'

export default async function EnVivoPage() {
  let data: Awaited<ReturnType<typeof getPublicTournamentItems>> | null = null
  try { data = await getPublicTournamentItems() }
  catch { /* A failed read must be distinct from a valid empty agenda. */ }
  return <main className={styles.page}>
    <PageHeader backHref="/" title="En vivo" description="Seguí los torneos que están en juego." actions={<Link className={styles.link} href="/torneos">Torneos</Link>} />
    {data ? <PublicAgenda tournaments={data.tournaments} mode="live" /> : <ReadFailure message="No pudimos cargar los torneos en juego. Intentá nuevamente." />}
  </main>
}
