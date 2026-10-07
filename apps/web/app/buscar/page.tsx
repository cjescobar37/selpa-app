'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import PageHeader from '@/components/navigation/PageHeader'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import styles from '@/components/product/ProductFlow.module.css'

type Result = { type: 'jugador' | 'torneo' | 'club' | 'noticia'; title: string; subtitle: string; href: string }
const groups = { torneo: 'Torneos', club: 'Clubes', jugador: 'Jugadores', noticia: 'Noticias' } as const

export default function BuscarPage() {
  const session = useSession()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setResults([]); setError('')
      if (query.trim().length < 2 || !session.user) { setLoading(false); return }
      setLoading(true)
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session?.access_token) throw new Error('SESSION')
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&context=player`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('READ')
        const rows = await response.json()
        if (!controller.signal.aborted) setResults(Array.isArray(rows) ? rows : [])
      } catch {
        if (!controller.signal.aborted) setError('No pudimos buscar. Revisá tu conexión y reintentá.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, session.user, retry])
  return <main className={styles.page}>
    <PageHeader backHref={session.role === 'platform' ? '/platform' : session.role === 'club' ? '/club' : session.user ? '/player' : '/'} title="Buscar" description="Encontrá torneos, clubes, jugadores y noticias." />
    {!session.user ? <section className={styles.panel}><p>Ingresá para buscar jugadores. También podés explorar los contenidos públicos.</p><div className={styles.actions}><Link className={styles.button} href="/login?next=/buscar">Ingresar</Link><Link className={styles.link} href="/torneos">Torneos</Link><Link className={styles.link} href="/clubes">Clubes</Link><Link className={styles.link} href="/noticias">Noticias</Link></div></section> : <>
      <section className={styles.panel}><label className={styles.field}>Buscar en SELPA<input type="search" value={query} onChange={event => { setQuery(event.target.value); setResults([]); setError(''); setLoading(event.target.value.trim().length >= 2) }} placeholder="Nombre del torneo, club o jugador" autoComplete="off" /></label><p>Escribí al menos dos caracteres.</p></section>
      {error ? <div className={styles.panel} role="alert"><p>{error}</p><div><button className={styles.link} onClick={() => setRetry(value => value + 1)}>Reintentar</button></div></div> : null}
      {loading ? <p className={styles.note} role="status">Buscando…</p> : !error && query.trim().length >= 2 && !results.length ? <p className={styles.note} role="status">No encontramos resultados. Probá otro nombre.</p> : null}
      {(Object.keys(groups) as Array<keyof typeof groups>).map(type => {
        const rows = results.filter(item => item.type === type)
        return rows.length ? <section key={type} className={styles.panel}><h2>{groups[type]}</h2>{rows.map(item => <Link className={styles.result} key={item.href} href={item.href}><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><ChevronRight size={18} /></Link>)}</section> : null
      })}
    </>}
  </main>
}
