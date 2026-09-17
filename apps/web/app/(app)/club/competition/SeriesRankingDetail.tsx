'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CircuitHistoryRow } from '@/features/competition/series/competition-series.point-history'
import styles from './CompetitionControl.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type Selection = { mode: 'individual' | 'pairs'; divisionId: string; playerId?: string; pairKey?: string }
type Detail = {
  name: string; position: number; points: number; eventsPlayed: number; titles: number
  bestResult: string | null; latestEvent: string | null; finalized: boolean; history: CircuitHistoryRow[]
}

function dateLabel(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export default function SeriesRankingDetail({ clubId, seriesId, request, selection, onBack }: {
  clubId: string; seriesId: string; request: Request; selection: Selection; onBack: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ mode: selection.mode, divisionId: selection.divisionId })
    if (selection.playerId) params.set('playerId', selection.playerId)
    if (selection.pairKey) params.set('pairKey', selection.pairKey)
    void request<Detail>(`/api/clubs/${clubId}/competition/series/${seriesId}/ranking/detail?${params}`)
      .then(result => { if (active) { setDetail(result); setFailed(false) } })
      .catch(() => { if (active) { setDetail(null); setFailed(true) } })
    return () => { active = false }
  }, [clubId, request, selection, seriesId])

  return <section className={styles.rankingDetail} aria-label="Detalle de puntos del circuito">
    <button type="button" className={styles.rankingBack} onClick={onBack}><ArrowLeft size={16} /> Volver al ranking</button>
    {failed ? <p>No pudimos cargar el historial. Volvé al ranking e intentá nuevamente.</p> : !detail ? <p>Cargando historial…</p> : <>
      <header className={styles.rankingDetailHeader}>
        <small>{detail.finalized ? 'RESULTADO FINAL · FINALIZADO' : 'RANKING DEL CIRCUITO'}</small>
        <h2>{detail.name}</h2>
        <strong>#{detail.position} · {detail.points.toLocaleString('es-AR')} pts</strong>
      </header>
      <div className={styles.rankingDetailStats}>
        <span><small>Fechas</small><b>{detail.eventsPlayed}</b></span>
        <span><small>Títulos</small><b>{detail.titles}</b></span>
        <span><small>Mejor resultado</small><b>{detail.bestResult ?? '—'}</b></span>
      </div>
      {detail.latestEvent ? <p className={styles.rankingLatest}>Última fecha: {detail.latestEvent}</p> : null}
      <h3 className={styles.rankingHistoryTitle}>Historial de puntos</h3>
      {detail.history.length ? <div className={styles.rankingHistoryList}>{detail.history.map(row => <article className={styles.rankingHistoryRow} key={row.eventId}>
        <div className={styles.rankingHistoryMain}><div><strong>{row.eventName}</strong><small>{row.result}{dateLabel(row.eventDate) ? ` · ${dateLabel(row.eventDate)}` : ''}</small>{row.corrected ? <em>Resultado corregido</em> : null}{!row.counted ? <em>No suma al total del ranking</em> : null}</div><b>{row.points > 0 ? '+' : ''}{row.points.toLocaleString('es-AR')} pts</b></div>
        {row.showBreakdown ? <details className={styles.rankingBreakdown}><summary>Cómo se calcularon</summary><dl><div><dt>Base</dt><dd>{row.base} pts</dd></div>{row.bonus ? <div><dt>Bonus</dt><dd>+{row.bonus} pts</dd></div> : null}{row.penalty ? <div><dt>Penalización</dt><dd>{row.penalty} pts</dd></div> : null}{row.multiplier !== 1 ? <div><dt>Multiplicador</dt><dd>×{row.multiplier}</dd></div> : null}<div><dt>Total</dt><dd>{row.points} pts</dd></div></dl></details> : null}
      </article>)}</div> : <p className={styles.rankingHistoryEmpty}>{detail.points > 0 ? 'El detalle de estos puntos todavía no está disponible.' : 'Todavía no hay puntos publicados para mostrar en este circuito.'}</p>}
      <footer className={styles.rankingHistoryTotal}><span>{detail.finalized ? 'Total final' : 'Total en el ranking'}</span><strong>{detail.points.toLocaleString('es-AR')} pts</strong></footer>
    </>}
  </section>
}
