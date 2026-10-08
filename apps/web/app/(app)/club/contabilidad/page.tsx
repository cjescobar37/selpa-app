'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, RotateCcw, X } from 'lucide-react'
import PageHeader from '@/components/navigation/PageHeader'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import PaymentProviderPanel from '@/features/finance/PaymentProviderPanel'
import FinanceReports from '@/features/finance/FinanceReports'
import FinanceReconciliations from '@/features/finance/FinanceReconciliations'
import { movementFilters } from '@/lib/clubFinanceF1F'
import { ConfirmedWriteRejection, readWriteIntent, prepareWriteIntent, type WriteIntent } from '@/lib/writeIntentRecovery'
import { humanizeUiError } from '@/lib/productPresentation'
import {
  financeMethodLabels, financeMovementMethod, financeStatusLabels, formatFinanceMoney, normalizeFinanceOverview, validFinanceAmount,
  type FinanceCursor, type FinanceFilter, type FinanceMethod,
  type FinanceMovement, type FinanceObligation, type FinanceOverview, type FinancePage,
} from '@/lib/clubFinanceF1C'
import styles from './FinancePage.module.css'

type Tab = 'summary' | 'obligations' | 'movements' | 'reports' | 'reconciliations'
type OperationalFilter = FinanceFilter | 'CANCELLED'
type Sheet = { kind: 'payment'; obligation: FinanceObligation; key: string }
  | { kind: 'reverse'; movement: FinanceMovement; key: string }
  | null

const filters: Array<{ value: OperationalFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'PARTIAL', label: 'Parciales' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'CANCELLED', label: 'Cancelados' },
]

function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function movementDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value)).replace('.', '')
}

function mergePage<T extends { id: string }>(old: FinancePage<T>, next: FinancePage<T>): FinancePage<T> {
  const known = new Set(old.items.map((item) => item.id))
  return { items: [...old.items, ...next.items.filter((item) => !known.has(item.id))], nextCursor: next.nextCursor }
}

const emptyOverview: FinanceOverview = {
  currency_code: 'ARS', total_pending: 0, total_received: 0, open_obligations: 0,
}
const emptyObligations: FinancePage<FinanceObligation> = { items: [], nextCursor: null }
const emptyMovements: FinancePage<FinanceMovement> = { items: [], nextCursor: null }

export default function ClubFinancePage() {
  const { activeClub, user } = useSession()
  const clubId = activeClub?.id ?? null
  const [tab, setTab] = useState<Tab>('summary')
  const [filter, setFilter] = useState<OperationalFilter>('PENDING')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [movementFilter, setMovementFilter] = useState('ALL')
  const [requiresReview, setRequiresReview] = useState(false)
  const [f1fAvailable, setF1fAvailable] = useState(true)
  const [overview, setOverview] = useState<FinanceOverview>(emptyOverview)
  const [obligations, setObligations] = useState<FinancePage<FinanceObligation>>(emptyObligations)
  const [movements, setMovements] = useState<FinancePage<FinanceMovement>>(emptyMovements)
  const [canManage, setCanManage] = useState(false)
  const [loadedClubId, setLoadedClubId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<FinanceMethod>('CASH')
  const [paidAt, setPaidAt] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [pendingIntent, setPendingIntent] = useState<WriteIntent | null>(null)
  const intentScope = user?.id && clubId ? `selpa.write-intent.finance:${user.id}:${clubId}` : null
  const submitting = useRef(false)
  const sheetRef = useRef<HTMLElement>(null)
  const refreshId = useRef(0)
  const previousClubId = useRef(clubId)
  const currentData = Boolean(clubId) && loadedClubId === clubId
  const sheetKey = sheet?.key
  useEffect(() => {
    if (!sheetKey || !currentData) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)')?.focus())
    const trap = (event: KeyboardEvent) => {
      const panel = sheetRef.current
      if (!panel) return
      if (event.key === 'Escape') { event.preventDefault(); if (!submitting.current) setSheet(null); return }
      if (event.key !== 'Tab') return
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', trap)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [currentData, sheetKey])
  // Depend on the effective query, not the selected presentation tab.
  const readFilter = tab === 'summary' ? 'PENDING' : filter
  const readSearch = tab === 'summary' ? '' : search
  const readMethod = tab === 'summary' ? 'ALL' : movementFilter

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const request = useCallback(async (url: string, init?: RequestInit) => {
    const accessToken = await token()
    if (!accessToken) throw new Error('Tu sesión venció. Volvé a ingresar.')
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
    })
    const json = await response.json().catch(() => ({}))
    const rejected = ['CLUB_FINANCE_OVER_ALLOCATION', 'CLUB_FINANCE_OBLIGATION_NOT_PAYABLE', 'CLUB_FINANCE_PAYMENT_ALREADY_REVERSED', 'CLUB_FINANCE_REASON_REQUIRED'].includes(json?.code)
    if (!response.ok) throw new (rejected ? ConfirmedWriteRejection : Error)(json?.code === 'PGRST202'
      ? 'No pudimos cargar las finanzas. Reintentá en unos segundos.'
      : humanizeUiError(json?.error, 'No pudimos cargar las finanzas. Reintentá en unos segundos.'))
    return json
  }, [token])

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current
    if (!clubId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ clubId, view: 'dashboard', filter: readFilter,
        search: readSearch, method: readMethod })
      const data = await request(`/api/clubs/finance/operations?${params}`)
      if (refreshId.current !== requestId) return
      setOverview(normalizeFinanceOverview(data.overview ?? null))
      setObligations(data.obligations ?? emptyObligations)
      setMovements(data.movements ?? emptyMovements)
      setCanManage(Boolean(data.canManage))
      setRequiresReview(Boolean(data.requiresReview))
      setF1fAvailable(data.f1fAvailable !== false)
      if (data.f1fAvailable === false) setTab(current => current === 'reports' || current === 'reconciliations' ? 'summary' : current)
      setLoadedClubId(clubId)
    } catch (cause) {
      if (refreshId.current === requestId) setError(cause instanceof Error ? cause.message : 'No pudimos cargar las finanzas.')
    } finally {
      if (refreshId.current === requestId) setLoading(false)
    }
  }, [clubId, readFilter, readSearch, readMethod, request])

  // Fetching remote state when club/filter changes is intentional.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (previousClubId.current === clubId) return
    previousClubId.current = clubId
    // A sheet must never carry an old club's obligation into another club.
    setSheet(null)
  }, [clubId])
  useEffect(() => {
    if (!sheet) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !submitting.current) setSheet(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sheet])

  async function loadMore(kind: 'obligations' | 'movements') {
    if (!clubId || !currentData || loadingMore) return
    const requestId = refreshId.current
    const cursor: FinanceCursor = kind === 'obligations' ? obligations.nextCursor : movements.nextCursor
    if (!cursor) return
    setLoadingMore(true)
    setError('')
    try {
      const params = new URLSearchParams({
        clubId, view: kind, beforeAt: cursor.at, beforeId: cursor.id,
      })
      if (kind === 'obligations') params.set('filter', filter)
      if (kind === 'obligations') params.set('search', search)
      if (kind === 'movements') params.set('method', movementFilter)
      const data = await request(`/api/clubs/finance/operations?${params}`)
      if (requestId !== refreshId.current) return
      if (kind === 'obligations') setObligations((previous) => mergePage(previous, data.obligations))
      else setMovements((previous) => mergePage(previous, data.movements))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar más registros.')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    let alive=true
    queueMicrotask(()=>{
      if(!alive)return
      if (!intentScope) { setPendingIntent(null); return }
      try { setPendingIntent(readWriteIntent(sessionStorage, intentScope)) }
      catch (cause) { setError(humanizeUiError(cause instanceof Error ? cause.message : null)) }
    })
    return()=>{alive=false}
  }, [intentScope])

  function openPayment(obligation: FinanceObligation) {
    if (pendingIntent) { setError('Primero confirmá el intento pendiente con «Reintentar operación».'); return }
    setAmount(String(obligation.balance))
    setMethod('CASH')
    setPaidAt(localDateTime(new Date()))
    setReference('')
    setNotes('')
    setError('')
    setSheet({ kind: 'payment', obligation, key: crypto.randomUUID() })
  }

  function openReverse(movement: FinanceMovement) {
    if (pendingIntent) { setError('Primero confirmá el intento pendiente con «Reintentar operación».'); return }
    setReason('')
    setError('')
    setSheet({ kind: 'reverse', movement, key: crypto.randomUUID() })
  }

  function reviseAttempt() {
    // Once dispatched, its key/payload cannot be replaced by edits or closing the sheet.
    if (!submitting.current && !pendingIntent) setSheet((current) => current ? { ...current, key: crypto.randomUUID() } : null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clubId || !sheet || !canManage || submitting.current) return
    if (sheet.kind === 'payment' && !validFinanceAmount(amount, sheet.obligation.balance)) {
      setError('El importe debe ser mayor a cero y no superar el saldo pendiente.')
      return
    }
    if (sheet.kind === 'reverse' && reason.trim().length < 3) {
      setError('Ingresá un motivo de al menos tres caracteres.')
      return
    }
    if (!intentScope) return
    try {
      const payload = sheet.kind === 'payment'
        ? {
            clubId, action: 'payment.register', id: sheet.obligation.id,
            amount, balance: sheet.obligation.balance, method,
            paidAt: new Date(paidAt).toISOString(), reference, notes,
            idempotencyKey: sheet.key,
          }
        : {
            clubId, action: 'payment.reverse', id: sheet.movement.id,
            reason: reason.trim(), idempotencyKey: sheet.key,
          }
      const intent = prepareWriteIntent(sessionStorage, intentScope, payload, sheet.key)
      setPendingIntent(intent)
      await dispatchIntent(intent)
    } catch (cause) {
      setError(humanizeUiError(cause instanceof Error ? cause.message : null, 'No pudimos conservar el intento.'))
    }
  }

  async function dispatchIntent(intent: WriteIntent) {
    if (!intentScope || intent.scope!==intentScope || intent.payload.clubId!==clubId || submitting.current || !canManage) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      await request('/api/clubs/finance/core', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent.payload),
      })
      sessionStorage.removeItem(intentScope)
      setPendingIntent(null)
      setSheet(null)
      setFeedback(intent.payload.action === 'payment.register' ? 'Cobro registrado' : 'Cobro revertido')
      await refresh()
    } catch (cause) {
      if (cause instanceof ConfirmedWriteRejection) {
        sessionStorage.removeItem(intentScope)
        setPendingIntent(null)
        // A confirmed rollback may be edited; an unknown outcome must retain its command.
        setSheet(current => current ? { ...current, key: crypto.randomUUID() } : null)
      }
      setError(humanizeUiError(cause instanceof Error ? cause.message : null, 'No pudimos confirmar. Reintentá la operación pendiente.'))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  function ObligationRow({ row }: { row: FinanceObligation }) {
    const payable = row.balance > 0 && row.financial_status !== 'CANCELLED'
    return <article className={styles.row}>
      <div className={styles.rowBody}>
        <strong>{row.debtor_name}</strong>
        <span>{row.tournament_name ?? row.concept}</span>
        <div className={styles.rowMeta}>
          <span className={`${styles.status} ${styles[`status${row.financial_status}`]}`}>
            {financeStatusLabels[row.financial_status]}
          </span>
          {row.financial_status === 'PARTIAL' ? <span>{formatFinanceMoney(row.allocated_net)} de {formatFinanceMoney(row.original_amount)}</span> : null}
        </div>
      </div>
      <div className={styles.rowSide}>
        <b>{row.financial_status === 'CANCELLED' ? '—' : formatFinanceMoney(payable ? row.balance : row.original_amount)}</b>
        {payable ? <small>Falta cobrar</small> : null}
        {canManage && payable ? <button type="button" className={styles.smallAction} onClick={() => openPayment(row)}>Registrar cobro</button> : null}
      </div>
    </article>
  }

  function MovementRow({ row }: { row: FinanceMovement }) {
    return <article className={styles.row}>
      <div className={styles.rowBody}>
        <span className={styles.date}>{movementDate(row.paid_at)}</span>
        <strong>{row.debtor_name}</strong>
        <span>{row.concept}</span>
        <span className={styles.rowMeta}>{financeMovementMethod(row)} · {row.status === 'REVERSED' ? 'Revertido' : 'Cobrado'}</span>
      </div>
      <div className={styles.rowSide}>
        <b className={row.status === 'REVERSED' ? styles.reversed : ''}>{row.status === 'REVERSED' ? '' : '+ '}{formatFinanceMoney(row.amount)}</b>
        {row.status === 'REVERSED' ? <small>No suma al neto</small> : null}
        {canManage && row.status === 'POSTED' ? <button type="button" className={styles.textAction} onClick={() => openReverse(row)}>Revertir cobro</button> : null}
      </div>
    </article>
  }

  return <main className={styles.page}>
    <PageHeader backHref="/club/admin" title="Finanzas" eyebrow="CLUB ADMIN"
      description={`${activeClub?.name ?? 'Tu club'} · Cobros reales`} />

    {!clubId ? <p className={styles.caption}>Seleccioná un club para consultar sus finanzas.</p> : null}

    {pendingIntent && canManage ? <div role="status" className={styles.error}>
      <p>Hay un cobro o reversión pendiente de confirmar. El reintento conserva los datos originales y no duplica el movimiento.</p>
      <button type="button" className={styles.cancel} disabled={saving} onClick={() => void dispatchIntent(pendingIntent)}>Reintentar operación</button>
    </div> : null}
    {error ? <div role="alert" className={styles.error}><p>{humanizeUiError(error, 'No pudimos completar la operación financiera. Reintentá.')}</p><button type="button" className={styles.cancel} disabled={loading} onClick={() => void refresh()}>Reintentar</button></div> : null}
    {feedback ? <p role="status" className={styles.success}>{feedback}</p> : null}

    {tab !== 'reports' ? <section className={styles.overview} aria-label="Resumen financiero">
      <div><span>Pendiente</span><strong>{currentData ? formatFinanceMoney(overview.total_pending) : '—'}</strong></div>
      <div><span>Cobrado</span><strong>{currentData ? formatFinanceMoney(overview.total_received) : '—'}</strong></div>
      <p>{currentData ? `${overview.open_obligations} obligaciones abiertas` : 'Preparando resumen'}</p>
    </section> : null}
    {currentData && requiresReview ? <button type="button" className={styles.attention} onClick={() => setTab('reconciliations')}>Requiere revisión <ArrowRight size={16} /></button> : null}

    <nav className={styles.tabs} aria-label="Secciones de Finanzas">
      {([['summary', 'Resumen'], ['obligations', 'Cobros'], ['movements', 'Movimientos'], ['reports', 'Reportes'], ['reconciliations', 'Conciliaciones']] as const).map(([value, label]) =>
        <button key={value} type="button" disabled={!f1fAvailable && (value === 'reports' || value === 'reconciliations')} aria-current={tab === value ? 'page' : undefined}
          className={tab === value ? styles.tabActive : ''} onClick={() => setTab(value)}>{label}</button>)}
    </nav>
    {currentData && !f1fAvailable ? <p className={styles.caption}>Reportes y conciliaciones estarán disponibles al instalar F1F. Tus cobros siguen operativos.</p> : null}
    {clubId && currentData && tab === 'summary' ? <PaymentProviderPanel key={clubId} clubId={clubId} canManage={canManage} request={request} /> : null}

    {clubId && currentData && tab === 'reports' ? <FinanceReports key={clubId} clubId={clubId} request={request} /> : null}
    {clubId && currentData && tab === 'reconciliations' ? <FinanceReconciliations key={clubId} clubId={clubId} canManage={canManage} request={request} onChanged={() => void refresh()} /> : null}

    {loading ? <div className={styles.loading} aria-label="Cargando finanzas"><span /><span /><span /></div> : null}
    {!loading && currentData && tab === 'summary' ? <div className={styles.sections}>
      <section className={styles.section}>
        <div className={styles.sectionTitle}><div><span>POR COBRAR</span><h2>Pendientes</h2></div><button type="button" onClick={() => setTab('obligations')}>Ver todos <ArrowRight size={15} /></button></div>
        {obligations.items.length === 0 ? <div className={styles.empty}><strong>No hay cobros pendientes.</strong><p>Las nuevas inscripciones confirmadas con cargo aparecerán acá.</p></div>
          : obligations.items.slice(0, 3).map((row) => <ObligationRow key={row.id} row={row} />)}
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTitle}><div><span>ACTIVIDAD</span><h2>Últimos movimientos</h2></div><button type="button" onClick={() => setTab('movements')}>Ver todos <ArrowRight size={15} /></button></div>
        {movements.items.length === 0 ? <div className={styles.empty}><strong>Todavía no hay movimientos.</strong></div>
          : movements.items.slice(0, 3).map((row) => <MovementRow key={row.id} row={row} />)}
      </section>
    </div> : null}

    {!loading && currentData && tab === 'obligations' ? <section className={styles.section}>
      <div className={styles.sectionTitle}><div><span>COBROS</span><h2>Obligaciones</h2></div></div>
      {f1fAvailable ? <form className={styles.searchBar} onSubmit={e => { e.preventDefault(); setSearch(searchDraft.trim()) }}>
        <input type="search" aria-label="Buscar jugador, pareja o torneo" placeholder="Jugador, pareja o torneo" maxLength={120} value={searchDraft} onChange={e => setSearchDraft(e.target.value)} />
        <button type="submit" className={styles.smallAction}>Buscar</button>
      </form> : null}
      {search ? <button className={styles.textAction} onClick={() => { setSearch(''); setSearchDraft('') }}>Limpiar búsqueda</button> : null}
      <div className={styles.filters} role="group" aria-label="Filtrar cobros">
        {filters.filter(option => f1fAvailable || option.value !== 'CANCELLED').map((option) => <button type="button" key={option.value}
          aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
      </div>
      {obligations.items.length === 0 ? <div className={styles.empty}><strong>{filter === 'PENDING' ? 'No hay cobros pendientes.' : 'No hay obligaciones en este filtro.'}</strong><p>Las nuevas inscripciones confirmadas con cargo aparecerán acá.</p></div>
        : obligations.items.map((row) => <ObligationRow key={row.id} row={row} />)}
      {obligations.nextCursor ? <button className={styles.more} type="button" disabled={loadingMore} onClick={() => void loadMore('obligations')}>{loadingMore ? 'Cargando…' : 'Ver más'}</button> : null}
    </section> : null}

    {!loading && currentData && tab === 'movements' ? <section className={styles.section}>
      <div className={styles.sectionTitle}><div><span>ACTIVIDAD</span><h2>Movimientos</h2></div></div>
      {f1fAvailable ? <div className={styles.filters} aria-label="Método del cobro">
        {movementFilters.map(([value, label]) => <button key={value} aria-pressed={movementFilter === value} onClick={() => setMovementFilter(value)}>{label}</button>)}
      </div> : null}
      {movements.items.length === 0 ? <div className={styles.empty}><strong>Todavía no hay movimientos.</strong></div>
        : movements.items.map((row) => <MovementRow key={row.id} row={row} />)}
      {movements.nextCursor ? <button className={styles.more} type="button" disabled={loadingMore} onClick={() => void loadMore('movements')}>{loadingMore ? 'Cargando…' : 'Ver más'}</button> : null}
    </section> : null}

    {sheet && currentData ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSheet(null) }}>
      <section ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="finance-sheet-title">
        <header><div><span>{sheet.kind === 'payment' ? 'COBRO' : 'CORRECCIÓN'}</span><h2 id="finance-sheet-title">{sheet.kind === 'payment' ? 'Registrar cobro' : 'Revertir cobro'}</h2></div><button type="button" aria-label="Cerrar" disabled={saving} onClick={() => setSheet(null)}><X size={20} /></button></header>
        <p className={styles.sheetContext}>{sheet.kind === 'payment' ? sheet.obligation.debtor_name : sheet.movement.debtor_name}</p>
        {sheet.kind === 'payment' ? <p className={styles.sheetBalance}>Saldo pendiente <strong>{formatFinanceMoney(sheet.obligation.balance)}</strong></p>
          : <p className={styles.sheetWarning}>El movimiento permanecerá visible como «Revertido» y el saldo volverá a estar pendiente. Esta acción requiere un motivo.</p>}
        {sheet.kind === 'reverse' && sheet.movement.provider === 'MERCADO_PAGO' ? <p className={styles.sheetWarning}>Revertir este cobro corrige el registro en SELPA. No devuelve dinero en Mercado Pago; el pago requerirá revisión.</p> : null}
        <form onSubmit={(event) => void submit(event)} className={styles.form}>
          {sheet.kind === 'payment' ? <>
            <label>Importe<input disabled={saving || Boolean(pendingIntent)} required inputMode="decimal" type="number" min="0.01" step="0.01" max={sheet.obligation.balance} value={amount} onChange={(event) => { setAmount(event.target.value); reviseAttempt() }} /></label>
            <label>Método<select disabled={saving || Boolean(pendingIntent)} value={method} onChange={(event) => { setMethod(event.target.value as FinanceMethod); reviseAttempt() }}>{Object.entries(financeMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Fecha y hora<input disabled={saving || Boolean(pendingIntent)} required type="datetime-local" value={paidAt} onChange={(event) => { setPaidAt(event.target.value); reviseAttempt() }} /></label>
            <label>Referencia <span>opcional</span><input disabled={saving || Boolean(pendingIntent)} maxLength={180} value={reference} onChange={(event) => { setReference(event.target.value); reviseAttempt() }} /></label>
            <label>Nota <span>opcional</span><textarea disabled={saving || Boolean(pendingIntent)} maxLength={2000} rows={2} value={notes} onChange={(event) => { setNotes(event.target.value); reviseAttempt() }} /></label>
          </> : <label>Motivo de la reversión<textarea disabled={saving || Boolean(pendingIntent)} required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => { setReason(event.target.value); reviseAttempt() }} placeholder="Ej.: cobro registrado por error" /></label>}
          {error ? <p role="alert" className={styles.error}>{humanizeUiError(error)}</p> : null}
          <div className={styles.sheetActions}><button type="button" className={styles.cancel} disabled={saving} onClick={() => setSheet(null)}>Cerrar</button>{pendingIntent
            ? <button type="button" className={styles.submit} disabled={saving} onClick={() => void dispatchIntent(pendingIntent)}>{saving ? 'Confirmando…' : 'Reintentar operación'}</button>
            : <button type="submit" className={styles.submit} disabled={saving}>{saving ? 'Guardando…' : sheet.kind === 'payment' ? 'Confirmar cobro' : <><RotateCcw size={16} /> Confirmar reversión</>}</button>}</div>
        </form>
      </section>
    </div> : null}
  </main>
}
