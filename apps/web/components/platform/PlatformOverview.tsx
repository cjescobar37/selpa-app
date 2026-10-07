'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import PageHeader from '@/components/navigation/PageHeader'
import { supabase } from '@/lib/supabaseClient'
import { clubStatusLabel, type PlatformClubStatus } from '@/lib/platformStatus'
import styles from '@/components/product/ProductFlow.module.css'

type Summary = {
  clubs: { total:number;active:number;pending:number;rejected:number;suspended:number;recent:Array<{id:string;name:string;city:string|null;status:PlatformClubStatus}> }
  users: { total_profiles:number;memberships_total:number;memberships_pending:number;memberships_approved:number }
  content: { news_total:number;news_published:number;ads_active:number;sponsors_active:number }
}
const entries = [
  ['/platform/solicitudes','Solicitudes','Revisar altas de clubes'], ['/platform/clubs','Clubes','Padrón y estados operativos'],
  ['/platform/usuarios','Usuarios','Personas y membresías'], ['/platform/facturacion','Facturación SELPA','Planes, períodos y pagos Club → SELPA'],
  ['/platform/noticias','Contenido','Noticias publicadas'], ['/platform/publicidad','Publicidad y sponsors','Campañas y aliados'],
  ['/platform/configuracion','Configuración','Identidad y parámetros'], ['/platform/logs','Auditoría','Actividad administrativa'],
] as const

export default function PlatformOverview({ analytics = false }: { analytics?: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError(''); setSummary(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) throw new Error('SESSION')
      const response = await fetch('/api/platform/summary', { headers:{Authorization:`Bearer ${data.session.access_token}`}, cache:'no-store' })
      if (!response.ok) throw new Error('READ')
      setSummary(await response.json())
    } catch { setError('No pudimos cargar el resumen. Reintentá o volvé a ingresar si tu sesión expiró.') }
    finally { setLoading(false) }
  },[])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  },[load])
  const metrics = summary ? analytics ? [
    ['Clubes registrados',summary.clubs.total],['Clubes activos',summary.clubs.active],['Usuarios registrados',summary.users.total_profiles],['Membresías aprobadas',summary.users.memberships_approved],
    ['Membresías pendientes',summary.users.memberships_pending],['Noticias publicadas',summary.content.news_published],['Campañas activas',summary.content.ads_active],['Sponsors activos',summary.content.sponsors_active],
  ] : [['Clubes activos',summary.clubs.active],['Altas pendientes',summary.clubs.pending],['Usuarios registrados',summary.users.total_profiles],['Membresías pendientes',summary.users.memberships_pending]] : []
  return <main className={styles.page}>
    <PageHeader backHref={analytics ? '/platform' : '/'} title={analytics ? 'Analytics' : 'Plataforma'} eyebrow="SELPA" description={analytics ? 'Indicadores operativos reales. No representan uso ni retención.' : 'Gestión de clubes, usuarios y facturación.'} actions={<button type="button" className={styles.link} disabled={loading} onClick={load}>{loading ? 'Cargando…' : 'Actualizar'}</button>} />
    <nav className={styles.nav} aria-label="Plataforma"><Link href="/platform" aria-current={!analytics ? 'page' : undefined}>Inicio</Link><Link href="/platform/analytics" aria-current={analytics ? 'page' : undefined}>Analytics</Link><Link href="/platform/facturacion">Facturación</Link></nav>
    {error ? <section className={styles.panel} role="alert"><p>{error}</p><div><button className={styles.link} onClick={load}>Reintentar</button></div></section> : null}
    {summary ? <section className={styles.metrics} aria-label="Indicadores operativos">{metrics.map(([label,value]) => <article key={label} className={styles.metric}><span>{label}</span><strong>{Number(value).toLocaleString('es-AR')}</strong></article>)}</section> : null}
    <div className={styles.grid}>
      <section className={styles.panel}><h2>{analytics ? 'Fuentes y acciones' : 'Gestión'}</h2>{entries.map(([href,title,description]) => <Link key={href} className={styles.result} href={href}><div><strong>{title}</strong><small>{description}</small></div><ChevronRight size={18}/></Link>)}</section>
      <section className={styles.panel}><h2>Clubes recientes</h2>{loading ? <p role="status">Cargando clubes…</p> : error ? <p>Información no disponible. Reintentá la carga.</p> : summary?.clubs.recent.length ? summary.clubs.recent.map(club => <Link className={styles.result} key={club.id} href={`/platform/clubs?focus=${club.id}`}><div><strong>{club.name}</strong><small>{club.city ?? 'Sin ciudad'} · {clubStatusLabel(club.status)}</small></div><ChevronRight size={18}/></Link>) : <><p>Todavía no hay clubes registrados.</p><Link className={styles.link} href="/platform/clubs/nuevo">Dar de alta un club</Link></>}</section>
    </div>
    {analytics ? <p className={styles.note}>Los conteos reflejan el estado actual de registros canónicos; no estiman retención, sesiones, ingresos ni MRR. Los importes se consultan en Facturación SELPA.</p> : null}
    <details className={styles.disclosure}><summary>Archivo financiero anterior</summary><p className={styles.note}>Circuito legacy separado. No es la fuente de planes, deuda ni cobros Club → SELPA.</p><div className={styles.actions}><Link className={styles.link} href="/platform/pagos">Pagos legacy</Link><Link className={styles.link} href="/platform/liquidaciones">Liquidaciones legacy</Link></div></details>
  </main>
}
