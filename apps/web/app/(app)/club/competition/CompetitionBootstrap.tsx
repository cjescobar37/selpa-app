'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Beaker, Check, LoaderCircle } from 'lucide-react'
import type { CompetitionBootstrapResult } from '@/features/competition/bootstrap/competition-bootstrap.types'
import styles from './CompetitionBootstrap.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
export default function CompetitionBootstrap({ clubId, request }: { clubId: string; request: Request }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CompetitionBootstrapResult | null>(null)
  const [error, setError] = useState('')
  const [schemes, setSchemes] = useState<{ id: string; name: string }[]>([])
  const [schemeId, setSchemeId] = useState('')

  useEffect(() => {
    void request<{ schemes: { id: string; name: string; is_active: boolean }[] }>(`/api/clubs/${clubId}/competition/points-schemes`)
      .then((data) => { const active = data.schemes.filter((item) => item.is_active); setSchemes(active); setSchemeId((current) => current || active[0]?.id || '') })
      .catch(() => undefined)
  }, [clubId, request])

  async function run() {
    setRunning(true); setError(''); setResult(null)
    try {
      const data = await request<CompetitionBootstrapResult>(`/api/clubs/${clubId}/competition/bootstrap`, { method: 'POST', body: JSON.stringify({ schemeId: schemeId || undefined }) })
      setResult(data)
      window.setTimeout(() => router.push(`/club/competition/series/${data.seriesId}`), 1800)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos inicializar el entorno.') }
    finally { setRunning(false) }
  }

  return <section className={styles.bootstrap} aria-live="polite">
    <div><Beaker size={18} /><span><strong>Entorno Competition QA</strong><small>Prepará una configuración reutilizable sin duplicar datos.</small></span></div>
    {schemes.length > 1 ? <select aria-label="Esquema de puntos" value={schemeId} onChange={(event) => setSchemeId(event.target.value)}>{schemes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : null}
    {schemes.length ? <button onClick={() => void run()} disabled={running || !schemeId}>{running ? <><LoaderCircle className={styles.spin} size={16} />Inicializando…</> : 'Inicializar entorno de prueba'}</button> : <Link href="/club/competition/points-schemes">Crear esquema de puntos</Link>}
    {running ? <ol className={styles.steps}><li>Catálogos y temporada</li><li>Divisiones y reglas</li><li>Elegibilidad y primera fecha</li></ol> : null}
    {result ? <div className={styles.result}><strong><Check size={15} />Entorno listo</strong><p>{result.actions.filter((item) => item.outcome === 'CREATED').length} creados · {result.actions.filter((item) => item.outcome === 'REUSED').length} reutilizados. Abriendo circuito…</p></div> : null}
    {error ? <p className={styles.error}>{error}</p> : null}
  </section>
}
