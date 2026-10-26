import { Activity, ArrowUpRight, ShieldCheck } from 'lucide-react'
import type { CareerStats } from '@/features/player-career/player-career.types'
import { careerPerformance } from '@/features/player-career/career-performance.presentation'
import styles from './CareerExperience.module.css'

export default function CareerPerformance({ stats, available, loading = false }: { stats?: CareerStats | null; available: boolean; loading?: boolean }) {
  const view = careerPerformance(stats, available)
  return <section className={styles.performance} aria-label="Rendimiento deportivo" aria-busy={loading || undefined}>
    <header><Activity size={17} aria-hidden="true"/><h2>Rendimiento</h2><span>Partidos oficiales</span></header>
    <dl className={styles.performanceGrid}>
      {[
        ['Jugados', view?.played], ['Ganados', view?.wins], ['Perdidos', view?.losses],
        ['Efectividad', view?.effectiveness === null || view?.effectiveness === undefined ? undefined : `${view.effectiveness}%`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{loading ? <i className={styles.skeleton}/> : value ?? '—'}</dd></div>)}
    </dl>
    {view?.winShare !== null && view?.winShare !== undefined ? <div className={styles.performanceBalance}>
      <div className={styles.balanceTrack} role="img" aria-label={`${view.wins} partidos ganados y ${view.losses} perdidos`}><span style={{width:`${view.winShare}%`}}/></div>
      <p><span><i/>Ganados</span><span><i/>Perdidos</span></p>
    </div> : !loading ? <p className={styles.performanceNote}><ShieldCheck size={16} aria-hidden="true"/>{view ? 'Tu balance aparecerá cuando haya partidos oficiales.' : 'Los números se completan con resultados verificados.'}</p> : null}
    {view ? <p className={styles.performanceFoot}><ArrowUpRight size={14} aria-hidden="true"/>Carrera en este club · sin BYE ni WO</p> : null}
  </section>
}
