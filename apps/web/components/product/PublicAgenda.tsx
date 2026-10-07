'use client'

import Link from 'next/link'
import { useState } from 'react'
import CommunityTournamentCalendar from '@/components/public/CommunityTournamentCalendar'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'
import type { PublicTournamentItem } from '@/components/public/PublicTournamentsExperience'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import styles from './ProductFlow.module.css'

export default function PublicAgenda({ tournaments, mode }: { tournaments: PublicTournamentItem[]; mode: 'live' | 'calendar' }) {
  const [limit, setLimit] = useState(6)
  const items = mode === 'live' ? tournaments.filter(item => getTournamentDisplayStatus(item).key === 'live') : tournaments
  if (mode === 'calendar') return <CommunityTournamentCalendar tournaments={items} />
  return <section className={styles.panel}>
    <h2>{items.length ? `${items.length} ${items.length === 1 ? 'torneo en juego' : 'torneos en juego'}` : 'No hay torneos en juego ahora'}</h2>
    <p>Entrá al torneo para consultar sus cruces, agenda y resultados publicados por el club.</p>
    {items.length ? <div className={styles.grid}>{items.slice(0, limit).map(item => <TournamentPublicCard key={item.id} tournament={item} compactAgenda showClub />)}</div> : null}
    <div className={styles.actions}>
      {items.length > limit ? <button className={styles.link} onClick={() => setLimit(value => value + 6)}>Ver más torneos</button> : null}
      <Link className={styles.link} href="/torneos/calendario">Ver calendario</Link>
    </div>
  </section>
}
