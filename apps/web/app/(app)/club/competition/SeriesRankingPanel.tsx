'use client'

import { useEffect, useState } from 'react'
import { Medal, Trophy } from 'lucide-react'
import type { CompetitionPipelineState } from '@/lib/competitionTournamentState'
import { groupSeriesRankingByDivision, type SeriesDivisionLabel } from '@/features/competition/series/competition-series.ranking-groups'
import SeriesRankingDetail from './SeriesRankingDetail'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import styles from './CompetitionControl.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type IndividualRow = { series_division_id: string; position: number; club_player_id: string; display_name: string; avatar_url: string | null; points: number; events_played: number; titles: number }
type PairRow = { series_division_id: string; pair_key: string; position: number; player1_name: string; player2_name: string; player1_avatar_url: string | null; player2_avatar_url: string | null; points: number; events_played: number; titles: number }
type Selection = { mode: 'individual' | 'pairs'; divisionId: string; playerId?: string; pairKey?: string }

function Avatar({ name, url }: { name: string; url: string | null }) {
  return <RankingPlayerAvatar className={styles.rankingAvatar} name={name} src={url} sizes="31px" />
}

export default function SeriesRankingPanel({ clubId, seriesId, request, pipelineState, eventName, hasPublishedEvent, divisions, finalized = false }: {
  clubId: string; seriesId: string; request: Request; pipelineState: CompetitionPipelineState | null
  eventName: string | null; hasPublishedEvent: boolean; divisions: SeriesDivisionLabel[]; finalized?: boolean
}) {
  const [rows, setRows] = useState<IndividualRow[] | null>(null)
  const [pairs, setPairs] = useState<PairRow[]>([])
  const [view, setView] = useState<'individual' | 'pairs'>('individual')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pairsUnavailable, setPairsUnavailable] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void request<{ ranking: IndividualRow[]; pairs: PairRow[]; pairsUnavailable: boolean }>(`/api/clubs/${clubId}/competition/series/${seriesId}/ranking?scope=division&include=pairs`)
      .then(result => {
        if (!active) return
        setRows(result.ranking)
        setPairs(result.pairs ?? [])
        setPairsUnavailable(Boolean(result.pairsUnavailable))
        setView(result.ranking.length ? 'individual' : (result.pairs?.length ? 'pairs' : 'individual'))
        setFailed(false)
      })
      .catch(() => { if (active) { setRows([]); setPairs([]); setFailed(true) } })
    return () => { active = false }
  }, [clubId, request, seriesId])

  if (selection) return <SeriesRankingDetail clubId={clubId} seriesId={seriesId} request={request} selection={selection} onBack={() => setSelection(null)} />
  if (rows === null) return <section className={styles.controlEmpty}><Medal size={23} /><strong>Cargando posiciones…</strong></section>
  if (!rows.length && !pairs.length) {
    if (failed) return <section className={`${styles.controlEmpty} ${styles.controlEmptyError}`}><Trophy size={25} /><strong>No pudimos cargar las posiciones</strong><p>Intentá nuevamente en unos momentos.</p></section>
    if (hasPublishedEvent) return <section className={`${styles.controlEmpty} ${styles.controlEmptyWarning}`}><Trophy size={25} /><strong>Hay puntos publicados, pero el ranking está vacío</strong><p>Revisá la división del circuito o intentá nuevamente.</p></section>
    if (pipelineState) return <section className={styles.controlEmpty}><Trophy size={25} /><strong>{eventName ? `${eventName} ya terminó` : 'Los resultados ya están completos'}</strong><p>Los puntos todavía no fueron publicados.</p></section>
    return <section className={styles.controlEmpty}><Trophy size={25} /><strong>Aún no hay puntos publicados</strong><p>El ranking aparecerá cuando se publiquen los puntos de la primera fecha.</p></section>
  }

  const showPairs = pairs.length > 0
  return <section>
    <header className={styles.rankingHeader}><small>{finalized ? 'RESULTADO FINAL · FINALIZADO' : 'RANKING'}</small><strong>{finalized ? 'Posiciones definitivas' : 'Posiciones del circuito'}</strong></header>
    {showPairs && rows.length ? <div className={styles.rankingSwitch} role="group" aria-label="Tipo de ranking">
      <button type="button" className={view === 'individual' ? styles.rankingSwitchActive : ''} aria-pressed={view === 'individual'} onClick={() => setView('individual')}>Individual</button>
      <button type="button" className={view === 'pairs' ? styles.rankingSwitchActive : ''} aria-pressed={view === 'pairs'} onClick={() => setView('pairs')}>Parejas</button>
    </div> : null}
    {view === 'individual' ? groupSeriesRankingByDivision(rows, divisions).map(group => <section className={styles.rankingDivision} key={group.id} aria-label={`Ranking individual de ${group.name}`}>
      <h3>{group.name}</h3><div className={styles.rankingList}>{group.rows.map(row => <button type="button" className={styles.rankingRow} key={row.club_player_id} onClick={() => setSelection({ mode: 'individual', divisionId: group.id, playerId: row.club_player_id })} aria-label={`Ver puntos de ${row.display_name}, puesto ${row.position}`}>
        <strong className={styles.rankingPosition}>#{row.position}</strong><span className={styles.rankingIdentity}><Avatar name={row.display_name} url={row.avatar_url} /><span><b>{row.display_name}</b><small>{row.events_played} {row.events_played === 1 ? 'fecha' : 'fechas'}{row.titles ? ` · ${row.titles} ${row.titles === 1 ? 'título' : 'títulos'}` : ''}</small></span></span><strong className={styles.rankingPoints}>{row.points.toLocaleString('es-AR')} <small>pts</small></strong>
      </button>)}</div>
    </section>) : groupSeriesRankingByDivision(pairs, divisions).map(group => <section className={styles.rankingDivision} key={group.id} aria-label={`Ranking de parejas de ${group.name}`}>
      <h3>{group.name}</h3><div className={styles.rankingList}>{group.rows.map(row => <button type="button" className={styles.rankingRow} key={row.pair_key} onClick={() => setSelection({ mode: 'pairs', divisionId: group.id, pairKey: row.pair_key })} aria-label={`Ver puntos de ${row.player1_name} y ${row.player2_name}, puesto ${row.position}`}>
        <strong className={styles.rankingPosition}>#{row.position}</strong><span className={styles.rankingIdentity}><span className={styles.pairAvatars}><i><Avatar name={row.player1_name} url={row.player1_avatar_url} /></i><i><Avatar name={row.player2_name} url={row.player2_avatar_url} /></i></span><span><b>{row.player1_name} / {row.player2_name}</b><small>{row.events_played} {row.events_played === 1 ? 'fecha' : 'fechas'}{row.titles ? ` · ${row.titles} ${row.titles === 1 ? 'título' : 'títulos'}` : ''}</small></span></span><strong className={styles.rankingPoints}>{row.points.toLocaleString('es-AR')} <small>pts</small></strong>
      </button>)}</div>
    </section>)}
    {pairsUnavailable && divisions.some(division => division.modality === 'PAIRS') ? <p className={styles.rankingUnavailable}>El ranking de parejas todavía no está disponible.</p> : null}
  </section>
}
