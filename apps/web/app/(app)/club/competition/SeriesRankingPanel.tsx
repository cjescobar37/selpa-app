'use client'

import { useEffect, useState } from 'react'
import { Medal, Trophy } from 'lucide-react'
import styles from './CompetitionControl.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type CompetitionSeriesRankingRow = {
  position: number
  club_player_id: string
  display_name: string
  avatar_url: string | null
  points: number
  events_played: number
  titles: number
}

export default function SeriesRankingPanel({ clubId, seriesId, request, hasCompletedEvent }: { clubId: string; seriesId: string; request: Request; hasCompletedEvent: boolean }) {
  const [rows, setRows] = useState<CompetitionSeriesRankingRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void request<{ ranking: CompetitionSeriesRankingRow[] }>(`/api/clubs/${clubId}/competition/series/${seriesId}/ranking`)
      .then(result => { if (active) setRows(result.ranking) })
      .catch(() => { if (active) { setRows([]); setFailed(true) } })
    return () => { active = false }
  }, [clubId, request, seriesId])

  if (rows === null) return <section className={styles.controlEmpty}><Medal size={23} /><strong>Cargando posiciones…</strong></section>
  if (!rows.length) return <section className={styles.controlEmpty}><Trophy size={25} /><strong>{failed ? 'No pudimos cargar las posiciones' : 'Todavía no hay posiciones.'}</strong><p>{hasCompletedEvent ? 'Procesá los resultados de la fecha para actualizar el ranking.' : 'El ranking aparecerá cuando se procesen los primeros resultados.'}</p></section>
  return <section className={styles.rankingList} aria-label="Ranking del circuito">{rows.map(row => <article className={styles.rankingRow} key={row.club_player_id}><strong className={styles.rankingPosition}>#{row.position}</strong><div className={styles.rankingIdentity}><span className={row.avatar_url ? styles.rankingAvatar : undefined} style={row.avatar_url ? { backgroundImage: `url(${row.avatar_url})` } : undefined}>{row.avatar_url ? null : row.display_name.slice(0, 1)}</span><div><b>{row.display_name}</b><small>{row.events_played} {row.events_played === 1 ? 'fecha' : 'fechas'}{row.titles ? ` · ${row.titles} ${row.titles === 1 ? 'título' : 'títulos'}` : ''}</small></div></div><strong className={styles.rankingPoints}>{row.points.toLocaleString('es-AR')} <small>pts</small></strong></article>)}</section>
}
