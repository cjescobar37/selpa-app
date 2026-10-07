import Link from 'next/link'
import PageHeader from '@/components/navigation/PageHeader'
import PublicAgenda from '@/components/product/PublicAgenda'
import ReadFailure from '@/components/product/ReadFailure'
import { getPublicTournamentItems } from '@/lib/publicTournamentItems'
import styles from '@/components/product/ProductFlow.module.css'

export const dynamic = 'force-dynamic'

export default async function TorneosCalendarioPage() {
  let data: Awaited<ReturnType<typeof getPublicTournamentItems>> | null = null
  try { data = await getPublicTournamentItems() }
  catch { /* Keep read failure separate from a valid empty calendar. */ }
  return <main className={styles.page}>
    <PageHeader backHref="/torneos" title="Calendario" description="Fechas reales publicadas por los clubes." actions={<Link className={styles.link} href="/envivo">En vivo</Link>} />
    {data ? <PublicAgenda tournaments={data.tournaments} mode="calendar" /> : <ReadFailure message="No pudimos cargar el calendario. Intentá nuevamente." />}
  </main>
}
