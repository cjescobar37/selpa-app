import Link from 'next/link'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { getTournamentPosterUrl } from '@/lib/tournamentFlyers'
import { agendaRegistrationLabel } from '@/lib/playerAgenda'
import { sportsDateParts } from '@/lib/sportsDate'
import styles from './PlayerAgenda.module.css'

type Tournament = { id:string; name:string; status:string|null; starts_on:string|null; start_date:string|null; category:number|null; gender:string|null; type?:string|null; tournament_type?:string|null; rules:Record<string,unknown>|null; rules_json:Record<string,unknown>|null }
export default function PlayerAgendaCard({ tournament, club, registrationStatus }: { tournament:Tournament; club?:{name:string;logo_url?:string|null;theme_key:string|null}; registrationStatus?:string|null }) {
  const value = tournament.starts_on ?? tournament.start_date
  const date = sportsDateParts(value)
  const logo = buildAssetProxyUrl(club?.logo_url ?? null)
  const theme = getClubTheme(club?.theme_key ?? null)
  // A real poster helps identify the event; a generated background alone adds no information.
  const flyer = getTournamentPosterUrl(tournament)
  const modality = String(tournament.tournament_type ?? tournament.type ?? '').replaceAll('_',' ').trim()
  const gender = String(tournament.gender ?? '').toUpperCase()
  const branch = ['M','MALE'].includes(gender) ? 'Caballeros' : ['F','FEMALE'].includes(gender) ? 'Damas' : gender === 'MIXED' ? 'Mixto' : 'Rama a confirmar'
  const finished = ['FINISHED','COMPLETED','CLOSED','ARCHIVED'].includes(String(tournament.status).toUpperCase())
  const cancelled = ['CANCELLED','CANCELED'].includes(String(tournament.status).toUpperCase())
  const state = cancelled ? 'Torneo cancelado' : finished ? 'Finalizado' : agendaRegistrationLabel(registrationStatus)
  return <Link href={`/torneos/${tournament.id}`} className={`${styles.card}${flyer?' '+styles.hasFlyer:''}`} style={{ '--agenda-accent':theme.vars.accent, '--agenda-accent-2':theme.vars.accent2, '--agenda-soft':theme.vars.soft } as CSSProperties}>
    <span className={styles.status} data-confirmed={registrationStatus === 'CONFIRMED'}>{state}</span>
    <time className={styles.date} dateTime={value ?? undefined}>
      <strong>{date?.day ?? '—'}</strong>
      <span>{date?.month ?? 'Fecha'}</span>
      <small>{date?.year ?? 'a definir'}</small>
    </time>
    <div className={styles.content}>
      <h3>{tournament.name}</h3>
      <span className={styles.club}><i>{logo ? <Image src={logo} alt="" width={21} height={21} unoptimized /> : getClubInitials(club?.name)}</i>{club?.name ?? 'Club SELPA'}</span>
      <p>{tournament.category ? `${tournament.category}ª categoría` : 'Categoría a confirmar'} · {branch}</p>
      {modality ? <span className={styles.modality}>{modality}</span> : null}
      <span className={styles.action}>Ver detalle <ArrowUpRight size={15} aria-hidden="true" /></span>
    </div>
    {flyer ? <Image src={flyer} alt={`Flyer de ${tournament.name}`} width={80} height={106} unoptimized className={styles.flyer} /> : null}
  </Link>
}
