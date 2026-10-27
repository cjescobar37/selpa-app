import Link from 'next/link'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { getTournamentFlyerUrl } from '@/lib/tournamentFlyers'
import { agendaRegistrationLabel } from '@/lib/playerAgenda'
import styles from './PlayerAgenda.module.css'

type Tournament = { id:string; name:string; status:string|null; starts_on:string|null; start_date:string|null; category:number|null; gender:string|null; rules:Record<string,unknown>|null; rules_json:Record<string,unknown>|null }
export default function PlayerAgendaCard({ tournament, club, registrationStatus }: { tournament:Tournament; club?:{name:string;logo_url?:string|null;theme_key:string|null}; registrationStatus?:string|null }) {
  const value = tournament.starts_on ?? tournament.start_date
  const date = value ? new Date(`${value.slice(0,10)}T12:00:00`) : null
  const valid = date && !Number.isNaN(date.getTime())
  const logo = buildAssetProxyUrl(club?.logo_url ?? null)
  const theme = getClubTheme(club?.theme_key ?? null)
  const rules = tournament.rules_json ?? tournament.rules ?? {}
  // A real poster helps identify the event; a generated background alone adds no information.
  const flyer = getTournamentFlyerUrl({ rules: { ...rules, flyer_background: undefined }, flyerUrl: rules.flyer_manual_url })
  const gender = String(tournament.gender ?? '').toUpperCase()
  const branch = ['M','MALE'].includes(gender) ? 'Caballeros' : ['F','FEMALE'].includes(gender) ? 'Damas' : gender === 'MIXED' ? 'Mixto' : 'Rama a confirmar'
  const finished = ['FINISHED','COMPLETED','CLOSED','ARCHIVED'].includes(String(tournament.status).toUpperCase())
  const cancelled = ['CANCELLED','CANCELED'].includes(String(tournament.status).toUpperCase())
  const state = cancelled ? 'Torneo cancelado' : finished ? 'Finalizado' : agendaRegistrationLabel(registrationStatus)
  return <Link href={`/torneos/${tournament.id}`} className={styles.card} style={{ '--agenda-accent':theme.vars.accent } as CSSProperties}>
    <time className={styles.date} dateTime={value ?? undefined}>
      <strong>{valid ? date.getDate() : '—'}</strong>
      <span>{valid ? new Intl.DateTimeFormat('es-AR',{month:'short'}).format(date).replace('.','') : 'Fecha'}</span>
      <small>{valid ? date.getFullYear() : 'a definir'}</small>
    </time>
    <div className={styles.content}>
      <span className={styles.status} data-confirmed={registrationStatus === 'CONFIRMED'}>{state}</span>
      <h3>{tournament.name}</h3>
      <span className={styles.club}><i>{logo ? <Image src={logo} alt="" width={21} height={21} unoptimized /> : getClubInitials(club?.name)}</i>{club?.name ?? 'Club SELPA'}</span>
      <p>{tournament.category ? `${tournament.category}ª categoría` : 'Categoría a confirmar'} · {branch}</p>
      {!finished && !cancelled && registrationStatus === 'CONFIRMED' ? <small className={styles.payment}>La confirmación de cupo no acredita el pago.</small> : null}
      <span className={styles.action}>Ver detalle <ArrowUpRight size={15} aria-hidden="true" /></span>
    </div>
    {flyer ? <Image src={flyer} alt="" width={44} height={58} unoptimized className={styles.flyer} /> : null}
  </Link>
}
