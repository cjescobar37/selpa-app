import Link from 'next/link'
import type { ReactNode } from 'react'
import PageHeader from '@/components/navigation/PageHeader'
import { getClubTheme } from '@/lib/clubThemes'
import type { PairRankingRow } from '@/components/ranking/PairRankingBoard'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import RankingEntryFrame from '@/components/ranking/RankingEntryFrame'
import OwnRankingPosition from '@/components/ranking/OwnRankingPosition'
import RankingRetryButton from '@/components/ranking/RankingRetryButton'
import RankingDiscovery from '@/components/ranking/RankingDiscovery'
import PublishedRankingClubCard, { RankingClubCards } from './PublishedRankingClubCard'
import { Users, WifiOff } from 'lucide-react'
import type { RankingContext, RankingPage } from '@/features/player-career/player-career.types'
import { individualRankingEntries, pairRankingEntries, rankingHref, rankingTiers, type RankingEntry, type RankingReadIssue, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import styles from './PublicRankingExperience.module.css'

export type PublicRankingExperienceProps = {
  clubs: Array<{ id: string; name: string; logo_url: string | null; theme_key: string | null; categoryCount?: number | null }>;
  clubsCount: number; contexts: RankingContext[]; ranking: RankingPage; pairs: PairRankingRow[]; total: number;
  params: RankingSearch; error: RankingReadIssue | null;
  presentation: { counts: { M: number | null; F: number | null }; leaderPoints: number | null };
  demo?: boolean; seasons?: Array<{ id: string; name: string }>; privateSeason?: boolean; unpublishedContext?: boolean; adminActions?: ReactNode;
  enabledBranches?: Array<'M' | 'F' | 'MIXED'>;
}
export default function PublicRankingExperience({ clubs, clubsCount, contexts, ranking, pairs, total, params, error, demo = false, seasons = [], privateSeason = false, unpublishedContext = false, adminActions, enabledBranches }: PublicRankingExperienceProps) {
  const clubId = params.clubId ?? params.club
  const context = ranking.context
  const href = (page: number) => rankingHref(params, { clubId: clubId ?? '', page: String(page) })
  const selectedClub = clubs.find(c => c.id === clubId)
  const gender = context?.gender ?? params.gender ?? 'M'
  const modality = params.modality ?? 'PAIRS'
  const entries = (modality === 'PAIRS' ? pairRankingEntries(pairs) : individualRankingEntries(ranking.rows)).map(entry =>
    demo && entry.href ? { ...entry, href: '/preview/demo?view=profile&playerId=' + entry.id, userIds: [] } : entry)
  const tiers = rankingTiers(entries)
  const search = Boolean(params.q?.trim())
  const participantLabel = modality === 'PAIRS' ? total === 1 ? 'pareja' : 'parejas' : gender === 'F' ? total === 1 ? 'jugadora' : 'jugadoras' : total === 1 ? 'jugador' : 'jugadores'
  return <section className={styles.shell} aria-label="Ranking SELPA" data-public-ranking data-gender={gender} data-mobile-club-theme={selectedClub ? getClubTheme(selectedClub.theme_key).key : undefined}>
    {!clubId ? <>
      <PageHeader title="Ranking SELPA" eyebrow="Competencia pública" legacyClassName="publicRankingIndexHeader" />
      <div className={styles.sectionHeading}><h2>Elegí tu club</h2>{!error ? <span>{clubsCount} {clubsCount === 1 ? 'club' : 'clubes'}</span> : null}</div>
      {error ? <ReadError issue={error} /> : <>
        <RankingClubCards>{clubs.map(club => <PublishedRankingClubCard key={club.id} name={club.name} logoUrl={club.logo_url} themeKey={club.theme_key}
          href={rankingHref({clubId:club.id,gender:params.gender})}
          detail={club.categoryCount != null ? `${club.categoryCount} ${club.categoryCount===1?'categoría activa':'categorías activas'}` : undefined} />)}</RankingClubCards>
        {!clubs.length ? <EmptyState detail="Todavía no hay clubes para mostrar." /> : null}
        {clubsCount > 40 ? <nav className={styles.pager} aria-label="Páginas de clubes">
          {Number(params.clubsPage ?? 1) > 1 ? <Link href={rankingHref({ clubsPage: String(Number(params.clubsPage) - 1), gender: params.gender })}>Anterior</Link> : <span />}
          {Number(params.clubsPage ?? 1) * 40 < clubsCount ? <Link href={rankingHref({ clubsPage: String(Number(params.clubsPage ?? 1) + 1), gender: params.gender })}>Más clubes</Link> : null}
        </nav> : null}
      </>}
    </> : <>
      <PageHeader title="Ranking" eyebrow="Competencia del club" backHref={params.scope === 'club' ? '/club' : '/ranking'} description={selectedClub?.name ?? 'Club seleccionado'} />
      {privateSeason || unpublishedContext ? <p className={styles.privacy}>{privateSeason ? 'Temporada privada' : 'Ámbito no publicado'} · Vista interna del club</p> : null}
      {adminActions}
      <RankingDiscovery contexts={contexts} current={context} params={params} seasons={seasons} enabledBranches={enabledBranches} />
      {!demo && context && params.scope !== 'club' ? <OwnRankingPosition context={context} params={params} /> : null}
      {error ? <ReadError issue={error} /> : !context || !entries.length ?
        <EmptyState detail={gender === 'MIXED' && modality === 'INDIVIDUAL' ? 'Individual mixto pendiente.' : search ? 'Probá otro nombre o quitá la búsqueda.' : undefined}
          href={search ? rankingHref(params, { q: undefined, page: undefined }) : ranking.page > 1 ? href(1) : undefined} action={search ? 'Quitar búsqueda' : 'Primera página'} /> :
        <>
          <div className={styles.sectionHeading}><h2>{search ? 'Resultados' : tiers.leaders.length || tiers.challengers.length ? 'Top 5' : 'Clasificación'}</h2>
            <span>{total} {participantLabel}{context.segmentName ? ' · ' + context.segmentName : ''}</span>
          </div>
          {tiers.leaders.length ? <section className={styles.leaders} aria-label="Puestos 1 a 3">
            {tiers.leaders.map(entry => <EntryCard key={entry.id} entry={entry} tier="leader" category={context.categoryName} />)}
          </section> : null}
          {tiers.challengers.length ? <section className={styles.challengerGrid} aria-label="Puestos 4 y 5">
            {tiers.challengers.map(entry => <EntryCard key={entry.id} entry={entry} tier="challenger" category={context.categoryName} />)}
          </section> : null}
          {tiers.rest.length ? <section className={styles.classification} aria-label="Clasificación desde el puesto 6">
            {!search && (tiers.leaders.length || tiers.challengers.length) ? <div className={styles.sectionHeading}><h2>Clasificación</h2><span>Desde el puesto 6</span></div> : null}
            <div className={styles.rows}>{tiers.rest.map(entry => <EntryCard key={entry.id} entry={entry} tier="row" category={context.categoryName} />)}</div>
          </section> : null}
        </>}
      {!error && context && entries.length > 0 ? <nav className={styles.pager} aria-label="Páginas de ranking">
        {ranking.page > 1 ? <Link href={href(ranking.page - 1)}>Anterior</Link> : <span />}
        <span>Página {ranking.page} de {Math.max(1, Math.ceil(total / ranking.pageSize))}</span>
        {ranking.page * ranking.pageSize < total ? <Link href={href(ranking.page + 1)}>Siguiente</Link> : <span />}
      </nav> : null}
      {!error && entries.length ? <p className={styles.footnote}>{demo ? 'DEMO · Datos sintéticos.' : 'Puestos oficiales · Los empates comparten posición.'}</p> : null}
    </>}
  </section>
}

function EntryCard({ entry, tier, category }: { entry: RankingEntry; tier: 'leader' | 'challenger' | 'row'; category: string }) {
  return <RankingEntryFrame className={[styles.entry, styles[tier], entry.avatars.length > 1 ? styles.pair : ''].join(' ')} href={entry.href}
    userIds={entry.userIds ?? []} position={entry.position} tier={tier} id={entry.id} label={entry.name + ' · puesto ' + entry.position + ' · ' + entry.points + ' puntos'}>
    <span className={styles.position}><small>#</small>{entry.position}</span>
    <div className={styles.avatars}>{entry.avatars.map((avatar, index) =>
      <RankingPlayerAvatar key={index} className={styles.avatar} name={avatar.name} src={avatar.url} sizes={tier === 'leader' ? '(max-width: 767px) 145px, 150px' : '48px'} />)}
    </div>
    <div className={styles.entryIdentity}>
      <span className={styles.category}>{category}</span>
      <h3>{entry.avatars.map((avatar, index) => <span key={index}>{avatar.name}</span>)}</h3>
      {entry.isTied ? <span className={styles.tie}>Puesto compartido</span> : null}
    </div>
    <div className={styles.points}><strong>{entry.points.toLocaleString('es-AR')}</strong><span>puntos</span></div>
  </RankingEntryFrame>
}
function EmptyState({ detail, href, action }: { detail?: string; href?: string; action?: string }) {
  return <section className={styles.empty} data-ranking-state="empty"><Users size={23} aria-hidden="true" /><div><h2>Sin ranking disponible</h2>{detail ? <p>{detail}</p> : null}</div>{href ? <Link href={href}>{action}</Link> : null}</section>
}
function ReadError({ issue }: { issue: RankingReadIssue }) {
  return <section className={styles.readError} role="alert" data-ranking-state="error" data-read-issue={issue}>
    <WifiOff size={24} aria-hidden="true" /><h2>No pudimos cargar el ranking</h2>
    <p>{issue === 'MODEL_UNAVAILABLE' ? 'La lectura oficial no está disponible en este entorno.' : 'Reintentá sin perder los filtros.'}</p>
    <RankingRetryButton className={styles.retry} />
  </section>
}
