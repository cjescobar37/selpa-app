'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, WalletCards } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { getCurrentSession } from '@/lib/supabaseClient'
import { playerFinanceQuery, type PlayerFinanceData, type PlayerFinanceFilter, type PlayerFinanceTab } from '@/lib/playerFinanceF1D'
import PlayerFinanceContent from './PlayerFinanceContent'
import styles from './PlayerFinance.module.css'

export default function PlayerPaymentsPage() {
  const session = useSession()
  const userId = session.user?.id
  const [result, setResult] = useState<{ userId: string; data: PlayerFinanceData } | null>(null)
  const [initialError, setInitialError] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<PlayerFinanceTab>('obligations')
  const [filter, setFilter] = useState<PlayerFinanceFilter>('ALL')
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const pageController = useRef<AbortController | null>(null)
  const data = result?.userId === userId ? result?.data : null

  useEffect(() => {
    if (session.status !== 'ready' || !userId) return
    const controller = new AbortController()
    async function load() {
      setInitialError('')
      setResult(null)
      setFilter('ALL')
      setTab('obligations')
      setPageError('')
      setBusy(false)
      try {
        const { data: auth } = await getCurrentSession()
        if (controller.signal.aborted) return
        if (!auth.session?.access_token || auth.session.user.id !== userId) throw new Error('Tu sesión venció. Volvé a ingresar.')
        const response = await fetch(`/api/player/finance?${playerFinanceQuery()}`, {
          headers: { Authorization: `Bearer ${auth.session.access_token}` }, cache: 'no-store', signal: controller.signal,
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'No pudimos cargar tus pagos.')
        if (!controller.signal.aborted) setResult({ userId: userId!, data: json as PlayerFinanceData })
      } catch (error) {
        if (!controller.signal.aborted) setInitialError(error instanceof Error ? error.message : 'No pudimos cargar tus pagos.')
      }
    }
    void load()
    return () => { controller.abort(); pageController.current?.abort() }
  }, [session.status, userId, retry])

  async function loadPage(target: PlayerFinanceTab, nextFilter: PlayerFinanceFilter, append: boolean) {
    if (!data || !userId) return
    pageController.current?.abort()
    const controller = new AbortController()
    pageController.current = controller
    setBusy(true)
    setPageError('')
    const cursor = append ? data[target].nextCursor : null
    if (!append) setResult(current => current && current.userId === userId
      ? { ...current, data: { ...current.data, [target]: { items: [], nextCursor: null } } } : current)
    try {
      const { data: auth } = await getCurrentSession()
      if (controller.signal.aborted) return
      if (!auth.session?.access_token || auth.session.user.id !== userId) throw new Error('Tu sesión venció. Volvé a ingresar.')
      const response = await fetch(`/api/player/finance?${playerFinanceQuery(target, nextFilter, cursor)}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` }, cache: 'no-store', signal: controller.signal,
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No pudimos cargar esta lista.')
      if (controller.signal.aborted) return
      setResult(current => {
        if (!current || current.userId !== userId) return current
        const nextPage = json[target] as PlayerFinanceData[typeof target]
        return { userId, data: { ...current.data, [target]: {
          items: append ? [...current.data[target].items, ...nextPage.items] : nextPage.items,
          nextCursor: nextPage.nextCursor,
        } } }
      })
    } catch (error) {
      if (!controller.signal.aborted) setPageError(error instanceof Error ? error.message : 'No pudimos cargar esta lista.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function changeTab(next: PlayerFinanceTab) {
    pageController.current?.abort()
    setBusy(false)
    setPageError('')
    setTab(next)
    // A cancelled filter request must not leave a mismatched list behind.
    if (next === 'obligations') void loadPage('obligations', filter, false)
  }

  function changeFilter(next: PlayerFinanceFilter) {
    setFilter(next)
    void loadPage('obligations', next, false)
  }

  return <PlayerSpaceLayout><main className={styles.page}>
    <Link href="/player" className={styles.back}><ArrowLeft size={16} aria-hidden="true" />Mi espacio</Link>
    <header className={styles.heading}><div><span>Tu actividad</span><h1>Mis pagos</h1><p>Tus cargos en todos los clubes</p></div><WalletCards size={25} aria-hidden="true" /></header>
    {session.status === 'loading' || (!data && !initialError) ? <PlayerStatePanel kind="loading" title="Cargando tus pagos" message="Preparando tu resumen" compact />
      : initialError ? <PlayerStatePanel kind="error" title="No pudimos cargar tus pagos" message={initialError} onRetry={() => setRetry(value => value + 1)} compact />
      : data ? <PlayerFinanceContent data={data} tab={tab} filter={filter} busy={busy} error={pageError}
        onTab={changeTab} onFilter={changeFilter} onMore={() => void loadPage(tab, filter, true)}
        onRetry={() => void loadPage(tab, filter, false)} /> : null}
  </main></PlayerSpaceLayout>
}
