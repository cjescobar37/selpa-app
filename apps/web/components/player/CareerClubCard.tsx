'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Check, Building2 } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import type { CareerIdentity } from '@/features/player-career/player-career.types'
import styles from './CareerExperience.module.css'

export default function CareerClubCard({ identity, own, demo, category, gender }: { identity: CareerIdentity; own: boolean; demo: boolean; category?: string; gender?: string }) {
  const session = useSession()
  const context = identity.contexts.find(item => item.clubPlayerId === identity.selectedClubPlayerId)!
  const logo = buildAssetProxyUrl(context.clubLogoUrl ?? null)
  const details = [category ?? (context.category ? `${context.category}ª categoría` : null), (gender ?? context.gender) === 'F' ? 'Damas' : (gender ?? context.gender) === 'M' ? 'Caballeros' : (gender ?? context.gender) === 'MIXED' ? 'Mixto' : null].filter(Boolean).join(' · ')
  return <section className={styles.clubCard} aria-label="Club deportivo">
    <div className={styles.clubIdentity}>
      <span className={styles.clubLogo}>{logo ? <Image src={logo} alt="" fill sizes="52px" unoptimized /> : <Building2 size={26} aria-hidden="true" />}</span>
      <div><span className={styles.clubKicker}>Club deportivo</span><h2>{context.clubName}</h2>{details ? <p>{details}</p> : null}</div>
      <Link className={styles.clubVisit} href={demo ? '/preview/demo' : `/clubs/${context.clubId}`} aria-label={`Visitar ${context.clubName}`}><ArrowUpRight size={21} aria-hidden="true" /></Link>
    </div>
    {own && context.clubId === session.activeClubId ? <span className={styles.activeClub}><Check size={13} aria-hidden="true" />Tu club activo</span> : null}
    {identity.contexts.length > 1 ? <label className={styles.context}>Ver carrera en otro club<select value={context.clubPlayerId} onChange={event => {
      const selected = identity.contexts.find(item => item.clubPlayerId === event.target.value)!
      window.location.assign(own ? `/player/carrera/${selected.clubPlayerId}` : `/jugadores/${identity.userId}?clubId=${selected.clubId}`)
    }}>{identity.contexts.map(item => <option key={item.clubPlayerId} value={item.clubPlayerId}>{item.clubName}</option>)}</select></label> : null}
  </section>
}
