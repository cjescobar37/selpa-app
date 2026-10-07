'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, WalletCards } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { getCurrentSession } from '@/lib/supabaseClient'
import { playerFinanceQuery, type PlayerFinanceData, type PlayerFinanceFilter, type PlayerFinanceTab } from '@/lib/playerFinanceF1D'
import PlayerFinanceContent from './PlayerFinanceContent'
import styles from './PlayerFinance.module.css'

function subscribeToReturn(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}
function paymentReturnReference() {
  const value = new URLSearchParams(window.location.search).get('paymentReturn') ?? ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null
}

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
  const [payingId, setPayingId] = useState<string | null>(null)
  const paymentReturn = useSyncExternalStore(subscribeToReturn, paymentReturnReference, () => null)
  const [returnStatus, setReturnStatus] = useState('VERIFYING')
  const [returnRefresh, setReturnRefresh] = useState(0)
  const checkoutKeys = useRef(new Map<string, string>())
  const pageController = useRef<AbortController | null>(null)
  const data = result?.userId === userId ? result?.data : null

  useEffect(() => {
    if (!paymentReturn || !userId || session.status !== 'ready') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined, attempts = 0
    async function verifyReturn() {
      try {
        const { data: auth } = await getCurrentSession()
        if (controller.signal.aborted || auth.session?.user.id !== userId) return
        const response = await fetch(`/api/player/finance/checkout?reference=${encodeURIComponent(paymentReturn!)}`, {
          headers: { Authorization: `Bearer ${auth.session?.access_token}` }, cache: 'no-store', signal: controller.signal })
        const json = await response.json()
        if (!response.ok || controller.signal.aborted) return
        setReturnStatus(json.status)
        if (json.status === 'APPROVED') setRetry(value => value + 1)
        else if (++attempts < 4 && ['PENDING', 'CHECKOUT_READY', 'CREATED'].includes(json.status)) timer = setTimeout(() => void verifyReturn(), 4000)
      } catch { /* Manual refresh remains available. Never infer payment from URL parameters. */ }
    }
    void verifyReturn()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [paymentReturn, userId, session.status, returnRefresh])

  async function pay(obligationId: string) {
    if (payingId || !userId) return
    setPayingId(obligationId)
    setPageError('')
    try {
      const { data: auth } = await getCurrentSession()
      if (!auth.session?.access_token || auth.session.user.id !== userId) throw new Error('Tu sesión venció. Volvé a ingresar.')
      const idempotencyKey = checkoutKeys.current.get(obligationId) ?? crypto.randomUUID()
      checkoutKeys.current.set(obligationId, idempotencyKey)
      const response = await fetch('/api/player/finance/checkout', { method: 'POST',
        headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ obligationId, idempotencyKey }) })
      const json = await response.json()
      if (!response.ok) { checkoutKeys.current.delete(obligationId); throw new Error(json.error || 'No pudimos preparar el pago.') }
      const checkout = new URL(json.checkoutUrl)
      if (checkout.protocol !== 'https:' || !['www.mercadopago.com.ar', 'mercadopago.com.ar', 'sandbox.mercadopago.com.ar'].includes(checkout.hostname)) throw new Error('El enlace de pago no es válido.')
      window.location.assign(checkout.toString())
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : 'No pudimos preparar el pago.') }
    finally { setPayingId(null) }
  }

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
    {paymentReturn ? <section className={styles.returnNotice} role="status"><strong>{returnStatus === 'APPROVED' ? 'Pago confirmado' : returnStatus === 'VERIFYING' ? 'Estamos verificando tu pago' : ['RECONCILIATION_REQUIRED', 'REVERSED'].includes(returnStatus) ? 'El club está revisando tu pago' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(returnStatus) ? 'El pago no se completó' : 'Pago en proceso'}</strong>
      <p>{returnStatus === 'APPROVED' ? 'El cobro ya está registrado en SELPA.' : 'El estado se actualiza cuando Mercado Pago confirma el cobro.'}</p>
      <button type="button" onClick={() => { setRetry(value => value + 1); setReturnRefresh(value => value + 1) }}>Actualizar estado</button></section> : null}
    {session.status === 'loading' || (!data && !initialError) ? <PlayerStatePanel kind="loading" title="Cargando tus pagos" message="Preparando tu resumen" compact />
      : initialError ? <PlayerStatePanel kind="error" title="No pudimos cargar tus pagos" message={initialError} onRetry={() => setRetry(value => value + 1)} compact />
      : data ? <PlayerFinanceContent data={data} tab={tab} filter={filter} busy={busy} error={pageError}
        onTab={changeTab} onFilter={changeFilter} onMore={() => void loadPage(tab, filter, true)}
        onRetry={() => void loadPage(tab, filter, false)} onPay={id => void pay(id)} payingId={payingId} /> : null}
  </main></PlayerSpaceLayout>
}
