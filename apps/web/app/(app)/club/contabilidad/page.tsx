'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, RotateCcw, X } from 'lucide-react'
import ClubBackLink from '@/components/club/ClubBackLink'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import {
  financeMethodLabels, financeStatusLabels, formatFinanceMoney, normalizeFinanceOverview, validFinanceAmount,
  type FinanceCursor, type FinanceFilter, type FinanceMethod,
  type FinanceMovement, type FinanceObligation, type FinanceOverview, type FinancePage,
} from '@/lib/clubFinanceF1C'
import styles from './FinancePage.module.css'

type Tab = 'summary' | 'obligations' | 'movements'
type Sheet = { kind: 'payment'; obligation: FinanceObligation; key: string }
  | { kind: 'reverse'; movement: FinanceMovement; key: string }
  | null

const filters: Array<{ value: FinanceFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'PARTIAL', label: 'Parciales' },
  { value: 'PAID', label: 'Pagados' },
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
  const { activeClub } = useSession()
  const clubId = activeClub?.id ?? null
  const [tab, setTab] = useState<Tab>('summary')
  const [filter, setFilter] = useState<FinanceFilter>('PENDING')
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
  const submitting = useRef(false)
  const refreshId = useRef(0)
  const previousClubId = useRef(clubId)
  const currentData = loadedClubId === clubId

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
    if (!response.ok) throw new Error(json?.error ?? 'No pudimos cargar las finanzas.')
    return json
  }, [token])

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current
    if (!clubId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ clubId, view: 'dashboard', filter })
      const data = await request(`/api/clubs/finance/core?${params}`)
      if (refreshId.current !== requestId) return
      setOverview(normalizeFinanceOverview(data.overview ?? null))
      setObligations(data.obligations ?? emptyObligations)
      setMovements(data.movements ?? emptyMovements)
      setCanManage(Boolean(data.canManage))
      setLoadedClubId(clubId)
    } catch (cause) {
      if (refreshId.current === requestId) setError(cause instanceof Error ? cause.message : 'No pudimos cargar las finanzas.')
    } finally {
      if (refreshId.current === requestId) setLoading(false)
    }
  }, [clubId, filter, request])

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
      const data = await request(`/api/clubs/finance/core?${params}`)
      if (requestId !== refreshId.current) return
      if (kind === 'obligations') setObligations((previous) => mergePage(previous, data.obligations))
      else setMovements((previous) => mergePage(previous, data.movements))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar más registros.')
    } finally {
      setLoadingMore(false)
    }
  }

  function openPayment(obligation: FinanceObligation) {
    setAmount(String(obligation.balance))
    setMethod('CASH')
    setPaidAt(localDateTime(new Date()))
    setReference('')
    setNotes('')
    setError('')
    setSheet({ kind: 'payment', obligation, key: crypto.randomUUID() })
  }

  function openReverse(movement: FinanceMovement) {
    setReason('')
    setError('')
    setSheet({ kind: 'reverse', movement, key: crypto.randomUUID() })
  }

  function reviseAttempt() {
    setSheet((current) => current ? { ...current, key: crypto.randomUUID() } : null)
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
    submitting.current = true
    setSaving(true)
    setError('')
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
      await request('/api/clubs/finance/core', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSheet(null)
      setFeedback(sheet.kind === 'payment' ? 'Cobro registrado' : 'Cobro revertido')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos guardar el cambio.')
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
        <span className={styles.rowMeta}>{financeMethodLabels[row.method]} · {row.status === 'REVERSED' ? 'Revertido' : 'Cobrado'}</span>
      </div>
      <div className={styles.rowSide}>
        <b className={row.status === 'REVERSED' ? styles.reversed : ''}>+ {formatFinanceMoney(row.amount)}</b>
        {canManage && row.status === 'POSTED' ? <button type="button" className={styles.textAction} onClick={() => openReverse(row)}>Revertir cobro</button> : null}
      </div>
    </article>
  }

  return <main className={styles.page}>
    <ClubBackLink href="/club/admin" label="Volver a Club Admin" />
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>CLUB ADMIN</span><h1>Finanzas</h1><p>{activeClub?.name ?? 'Tu club'} · Cobros reales</p></div>
    </header>

    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {feedback ? <p role="status" className={styles.success}>{feedback}</p> : null}

    <section className={styles.overview} aria-label="Resumen financiero">
      <div><span>Pendiente</span><strong>{currentData ? formatFinanceMoney(overview.total_pending) : '—'}</strong></div>
      <div><span>Cobrado</span><strong>{currentData ? formatFinanceMoney(overview.total_received) : '—'}</strong></div>
      <p>{currentData ? `${overview.open_obligations} obligaciones abiertas` : 'Preparando resumen'}</p>
    </section>

    <nav className={styles.tabs} aria-label="Secciones de Finanzas">
      {([['summary', 'Resumen'], ['obligations', 'Cobros'], ['movements', 'Movimientos']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-current={tab === value ? 'page' : undefined}
          className={tab === value ? styles.tabActive : ''} onClick={() => setTab(value)}>{label}</button>)}
    </nav>

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
      <div className={styles.filters} role="group" aria-label="Filtrar cobros">
        {filters.map((option) => <button type="button" key={option.value}
          aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
      </div>
      {obligations.items.length === 0 ? <div className={styles.empty}><strong>{filter === 'PENDING' ? 'No hay cobros pendientes.' : 'No hay obligaciones en este filtro.'}</strong><p>Las nuevas inscripciones confirmadas con cargo aparecerán acá.</p></div>
        : obligations.items.map((row) => <ObligationRow key={row.id} row={row} />)}
      {obligations.nextCursor ? <button className={styles.more} type="button" disabled={loadingMore} onClick={() => void loadMore('obligations')}>{loadingMore ? 'Cargando…' : 'Ver más'}</button> : null}
    </section> : null}

    {!loading && currentData && tab === 'movements' ? <section className={styles.section}>
      <div className={styles.sectionTitle}><div><span>ACTIVIDAD</span><h2>Movimientos</h2></div></div>
      {movements.items.length === 0 ? <div className={styles.empty}><strong>Todavía no hay movimientos.</strong></div>
        : movements.items.map((row) => <MovementRow key={row.id} row={row} />)}
      {movements.nextCursor ? <button className={styles.more} type="button" disabled={loadingMore} onClick={() => void loadMore('movements')}>{loadingMore ? 'Cargando…' : 'Ver más'}</button> : null}
    </section> : null}

    {sheet && currentData ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSheet(null) }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="finance-sheet-title">
        <header><div><span>{sheet.kind === 'payment' ? 'COBRO' : 'CORRECCIÓN'}</span><h2 id="finance-sheet-title">{sheet.kind === 'payment' ? 'Registrar cobro' : 'Revertir cobro'}</h2></div><button type="button" aria-label="Cerrar" disabled={saving} onClick={() => setSheet(null)}><X size={20} /></button></header>
        <p className={styles.sheetContext}>{sheet.kind === 'payment' ? sheet.obligation.debtor_name : sheet.movement.debtor_name}</p>
        {sheet.kind === 'payment' ? <p className={styles.sheetBalance}>Saldo pendiente <strong>{formatFinanceMoney(sheet.obligation.balance)}</strong></p>
          : <p className={styles.sheetWarning}>El movimiento permanecerá visible como «Revertido» y el saldo volverá a estar pendiente. Esta acción requiere un motivo.</p>}
        <form onSubmit={(event) => void submit(event)} className={styles.form}>
          {sheet.kind === 'payment' ? <>
            <label>Importe<input required inputMode="decimal" type="number" min="0.01" step="0.01" max={sheet.obligation.balance} value={amount} onChange={(event) => { setAmount(event.target.value); reviseAttempt() }} /></label>
            <label>Método<select value={method} onChange={(event) => { setMethod(event.target.value as FinanceMethod); reviseAttempt() }}>{Object.entries(financeMethodLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Fecha y hora<input required type="datetime-local" value={paidAt} onChange={(event) => { setPaidAt(event.target.value); reviseAttempt() }} /></label>
            <label>Referencia <span>opcional</span><input maxLength={180} value={reference} onChange={(event) => { setReference(event.target.value); reviseAttempt() }} /></label>
            <label>Nota <span>opcional</span><textarea maxLength={2000} rows={2} value={notes} onChange={(event) => { setNotes(event.target.value); reviseAttempt() }} /></label>
          </> : <label>Motivo de la reversión<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => { setReason(event.target.value); reviseAttempt() }} placeholder="Ej.: cobro registrado por error" /></label>}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <div className={styles.sheetActions}><button type="button" className={styles.cancel} disabled={saving} onClick={() => setSheet(null)}>Cancelar</button><button type="submit" className={styles.submit} disabled={saving}>{saving ? 'Guardando…' : sheet.kind === 'payment' ? 'Confirmar cobro' : <><RotateCcw size={16} /> Confirmar reversión</>}</button></div>
        </form>
      </section>
    </div> : null}
  </main>
}
