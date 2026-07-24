'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'

type Section = 'summary' | 'transactions' | 'receivables' | 'expenses' | 'balance' | 'debtors' | 'closures'
type Sheet = 'income' | 'expense' | 'receivable' | 'payment' | 'void' | 'close' | 'reopen' | null
type Transaction = {
  id: string; transaction_type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT'; concept: string; category: string
  amount: number | string; currency_code: string; payment_method: string; status: string; occurred_at: string
  responsible_user_id: string | null; tournament_id: string | null; reference_type: string | null; notes: string | null
}
type Receivable = {
  id: string; debtor_name: string; contact: string | null; concept: string; tournament_id: string | null
  category: string | null; total_amount: number | string; paid_amount: number | string; waived_amount: number | string
  currency_code: string; due_date: string | null; status: string; notes: string | null; created_at: string
}
type Closure = {
  id: string; period_start: string; period_end: string; status: string; income_total: number | string
  expense_total: number | string; adjustment_total: number | string; receivable_pending_total: number | string
  result_total: number | string; transaction_count: number; notes: string | null; closed_at: string
}
type Tournament = { id: string; name: string; start_date: string | null }
type FinanceData = {
  period: { start: string; end: string }; canManage: boolean; canReopen: boolean
  transactions: Transaction[]; receivables: Receivable[]; closures: Closure[]; tournaments: Tournament[]
}

const sections: Array<{ value: Section; label: string }> = [
  { value: 'summary', label: 'Resumen' },
  { value: 'transactions', label: 'Movimientos' },
  { value: 'receivables', label: 'Cobros' },
  { value: 'expenses', label: 'Gastos' },
  { value: 'balance', label: 'Balance' },
  { value: 'debtors', label: 'Deudores' },
  { value: 'closures', label: 'Cierres' },
]

const paymentMethods = [
  ['CASH', 'Efectivo'], ['BANK_TRANSFER', 'Transferencia'], ['MERCADO_PAGO', 'Mercado Pago'],
  ['CARD', 'Tarjeta'], ['OTHER', 'Otro'],
]
const expenseCategories = ['Premios', 'Pelotas', 'Mantenimiento', 'Limpieza', 'Servicios', 'Profesores', 'Personal', 'Buffet', 'Alquiler', 'Impuestos', 'Publicidad', 'Otros']
const methodLabels = Object.fromEntries(paymentMethods)
const statusLabels: Record<string, string> = {
  POSTED: 'Registrado', VOIDED: 'Anulado', PENDING: 'Pendiente', PARTIAL: 'Parcial',
  PAID: 'Pagado', WAIVED: 'Bonificado', OVERDUE: 'Vencido', CLOSED: 'Cerrado', REOPENED: 'Reabierto',
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | string, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount(value))
}

function shortDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(value)).replace('.', '')
}

function monthLabel(start: string) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${start}T12:00:00`))
}

function monthBounds(offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { start: local(start), end: local(end) }
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`finance-status finance-status--${status.toLowerCase()}`}>{statusLabels[status] ?? status}</span>
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="finance-empty"><strong>{title}</strong><span>{detail}</span>{action}</div>
}

function Metric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <article className={`finance-metric ${tone ? `finance-metric--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></article>
}

export default function ClubContabilidadPage() {
  const { activeClub } = useSession()
  const [activeSection, setActiveSection] = useState<Section>('summary')
  const [period, setPeriod] = useState(monthBounds())
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false)
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState({ query: '', type: 'ALL', method: 'ALL' })
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = {
    '--finance-accent': theme.vars.accent,
    '--finance-accent-2': theme.vars.accent2,
    '--finance-soft': theme.vars.soft,
    '--finance-glow': theme.vars.glow,
  } as CSSProperties

  const loadFinance = useCallback(async () => {
    if (!activeClub?.id) { setLoading(false); setData(null); return }
    setLoading(true); setError('')
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) { setError('Tu sesión venció. Volvé a ingresar.'); setLoading(false); return }
    const params = new URLSearchParams({ clubId: activeClub.id, start: period.start, end: period.end })
    const response = await fetch(`/api/clubs/finance?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) setError(json?.error ?? 'No pudimos cargar las finanzas.')
    else setData(json as FinanceData)
    setLoading(false)
  }, [activeClub, period.end, period.start])

  // La carga remota sincroniza el workspace con el club y período activos.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadFinance() }, [loadFinance])
  useEffect(() => {
    if (!activeClub?.id) return
    void supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle()
      .then(({ data: club }) => setThemeKey((club?.theme_key as string | null) ?? null))
  }, [activeClub?.id])

  const summary = useMemo(() => {
    const posted = (data?.transactions ?? []).filter((row) => row.status === 'POSTED')
    const income = posted.filter((row) => row.transaction_type === 'INCOME').reduce((total, row) => total + amount(row.amount), 0)
    const expenses = posted.filter((row) => row.transaction_type === 'EXPENSE').reduce((total, row) => total + amount(row.amount), 0)
    const adjustments = posted.filter((row) => row.transaction_type === 'ADJUSTMENT').reduce((total, row) => total + amount(row.amount), 0)
    const pending = (data?.receivables ?? []).filter((row) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(row.status))
    const pendingTotal = pending.reduce((total, row) => total + amount(row.total_amount) - amount(row.paid_amount) - amount(row.waived_amount), 0)
    return { income, expenses, adjustments, result: income - expenses + adjustments, pending, pendingTotal }
  }, [data])

  const visibleTransactions = useMemo(() => (data?.transactions ?? []).filter((row) => {
    const query = filter.query.trim().toLowerCase()
    return (filter.type === 'ALL' || row.transaction_type === filter.type)
      && (filter.method === 'ALL' || row.payment_method === filter.method)
      && (!query || `${row.concept} ${row.category} ${row.notes ?? ''}`.toLowerCase().includes(query))
  }), [data, filter])
  const expenses = useMemo(() => (data?.transactions ?? []).filter((row) => row.transaction_type === 'EXPENSE'), [data])
  const debtors = useMemo(() => (data?.receivables ?? []).filter((row) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(row.status)), [data])
  const selectedReceivable = data?.receivables.find((row) => row.id === selectedId) ?? null
  const selectedClosure = data?.closures.find((row) => row.id === selectedId) ?? null

  async function mutate(action: string, payload: Record<string, unknown>) {
    if (!activeClub?.id) return false
    setSaving(true); setError(''); setMessage('')
    const { data: session } = await supabase.auth.getSession()
    const response = await fetch('/api/clubs/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token ?? ''}` },
      body: JSON.stringify({ clubId: activeClub.id, action, ...payload }),
    })
    const json = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) { setError(json?.error ?? 'No pudimos guardar el cambio.'); return false }
    setMessage('Cambio guardado correctamente.')
    setSheet(null); setSelectedId(null)
    await loadFinance()
    return true
  }

  function open(next: Sheet, id?: string) { setSelectedId(id ?? null); setSheet(next); setError(''); setMessage('') }
  const primaryAction = activeSection === 'expenses' ? () => open('expense')
    : activeSection === 'receivables' || activeSection === 'debtors' ? () => open('receivable')
      : activeSection === 'closures' ? () => open('close') : () => open('income')
  const primaryLabel = activeSection === 'expenses' ? 'Registrar gasto'
    : activeSection === 'receivables' || activeSection === 'debtors' ? 'Crear cobro'
      : activeSection === 'closures' ? 'Cerrar período' : 'Registrar ingreso'

  return (
    <div className="club-shell">
      <main className="finance-workspace" style={themeStyle}>
        <header className="finance-hero">
          <div><span>Club Admin</span><h1>Finanzas</h1><p>{activeClub?.name ?? 'Tu club'} · {monthLabel(period.start)}</p></div>
          {data?.canManage ? <button className="finance-primary" onClick={primaryAction}>{primaryLabel}</button> : null}
        </header>

        <div className="finance-period">
          <button className={!customPeriodOpen ? 'is-active' : ''} onClick={() => { setPeriod(monthBounds()); setCustomPeriodOpen(false) }}>Este mes</button>
          <button onClick={() => { setPeriod(monthBounds(-1)); setCustomPeriodOpen(false) }}>Mes anterior</button>
          <button className={customPeriodOpen ? 'is-active' : ''} onClick={() => setCustomPeriodOpen((open) => !open)} aria-expanded={customPeriodOpen}>Personalizado</button>
          {customPeriodOpen ? <div className="finance-customPeriod">
            <label><span>Desde</span><input type="date" value={period.start} onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))} /></label>
            <label><span>Hasta</span><input type="date" value={period.end} onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))} /></label>
          </div> : null}
        </div>

        <label className="finance-mobileSection"><span>Sección</span><select value={activeSection} onChange={(event) => setActiveSection(event.target.value as Section)}>{sections.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <nav className="finance-tabs" aria-label="Secciones de Finanzas">{sections.map((item) => <button key={item.value} className={activeSection === item.value ? 'is-active' : ''} onClick={() => setActiveSection(item.value)}>{item.label}</button>)}</nav>
        {error ? <div className="finance-alert" role="alert">{error}</div> : null}
        {message ? <div className="finance-success" role="status">{message}</div> : null}

        {loading ? <div className="finance-skeleton" aria-label="Cargando finanzas">{[1, 2, 3, 4].map((item) => <span key={item} />)}</div> : null}
        {!loading && !data ? <EmptyState title="Finanzas no disponibles" detail="No hay información financiera para mostrar." /> : null}

        {!loading && data && activeSection === 'summary' ? <section className="finance-section">
          <article className="finance-result"><span>Resultado del período</span><strong>{money(summary.result)}</strong><small>Ingresos menos egresos y ajustes registrados</small></article>
          <div className="finance-metrics">
            <Metric label="Ingresos" value={money(summary.income)} tone="income" />
            <Metric label="Egresos" value={money(summary.expenses)} tone="expense" />
            <Metric label="Pendiente" value={money(summary.pendingTotal)} />
            <Metric label="Deudores" value={String(summary.pending.length)} />
          </div>
          <div className="finance-quick">
            <button onClick={() => open('income')}>+ Ingreso</button><button onClick={() => open('expense')}>− Gasto</button><button onClick={() => open('receivable')}>Crear cobro</button>
          </div>
          <div className="finance-twoColumns">
            <article className="finance-card"><header><div><span>Movimientos</span><h2>Últimos registros</h2></div><button onClick={() => setActiveSection('transactions')}>Ver todos</button></header>
              <TransactionList rows={data.transactions.slice(0, 5)} canManage={data.canManage} onVoid={(id) => open('void', id)} />
            </article>
            <article className="finance-card"><header><div><span>Cobros</span><h2>Pendientes</h2></div><button onClick={() => setActiveSection('debtors')}>Ver deuda</button></header>
              <ReceivableList rows={summary.pending.slice(0, 5)} canManage={data.canManage} onPay={(id) => open('payment', id)} />
            </article>
          </div>
        </section> : null}

        {!loading && data && activeSection === 'transactions' ? <section className="finance-section finance-card">
          <header><div><span>Libro financiero</span><h2>Movimientos</h2></div>{data.canManage ? <button className="finance-primary finance-primary--small" onClick={() => open('income')}>Nuevo</button> : null}</header>
          <div className="finance-filters">
            <input placeholder="Buscar concepto o categoría" value={filter.query} onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))} />
            <select value={filter.type} onChange={(event) => setFilter((current) => ({ ...current, type: event.target.value }))}><option value="ALL">Todos los tipos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Egresos</option><option value="ADJUSTMENT">Ajustes</option></select>
            <select value={filter.method} onChange={(event) => setFilter((current) => ({ ...current, method: event.target.value }))}><option value="ALL">Todos los métodos</option>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <TransactionList rows={visibleTransactions} canManage={data.canManage} onVoid={(id) => open('void', id)} />
        </section> : null}

        {!loading && data && activeSection === 'receivables' ? <section className="finance-section finance-card">
          <header><div><span>Gestión</span><h2>Cobros</h2></div>{data.canManage ? <button className="finance-primary finance-primary--small" onClick={() => open('receivable')}>Crear cobro</button> : null}</header>
          <ReceivableList rows={data.receivables} canManage={data.canManage} onPay={(id) => open('payment', id)} />
        </section> : null}

        {!loading && data && activeSection === 'expenses' ? <section className="finance-section finance-card">
          <header><div><span>Libro de egresos</span><h2>Gastos</h2></div>{data.canManage ? <button className="finance-primary finance-primary--small" onClick={() => open('expense')}>Registrar gasto</button> : null}</header>
          <TransactionList rows={expenses} canManage={data.canManage} onVoid={(id) => open('void', id)} />
        </section> : null}

        {!loading && data && activeSection === 'balance' ? <BalanceSection transactions={data.transactions} receivables={data.receivables} /> : null}

        {!loading && data && activeSection === 'debtors' ? <section className="finance-section finance-card">
          <header><div><span>Seguimiento</span><h2>Deudores</h2></div><StatusBadge status={debtors.some((row) => row.status === 'OVERDUE') ? 'OVERDUE' : 'PENDING'} /></header>
          <ReceivableList rows={debtors} canManage={data.canManage} onPay={(id) => open('payment', id)} showContact />
        </section> : null}

        {!loading && data && activeSection === 'closures' ? <section className="finance-section finance-card">
          <header><div><span>Control mensual</span><h2>Cierres</h2></div>{data.canManage ? <button className="finance-primary finance-primary--small" onClick={() => open('close')}>Cerrar período</button> : null}</header>
          {data.closures.length ? <div className="finance-list">{data.closures.map((closure) => <article className="finance-closure" key={closure.id}>
            <div><strong>{shortDate(closure.period_start)} — {shortDate(closure.period_end)}</strong><span>{closure.transaction_count} movimientos · cerrado {shortDate(closure.closed_at)}</span></div>
            <div><strong>{money(closure.result_total)}</strong><StatusBadge status={closure.status} /></div>
            {data.canReopen && closure.status === 'CLOSED' ? <button className="finance-link" onClick={() => open('reopen', closure.id)}>Reabrir</button> : null}
          </article>)}</div> : <EmptyState title="Sin cierres" detail="Cuando termine el período, guardá una fotografía auditada de sus totales." />}
        </section> : null}
      </main>

      {sheet ? <FinanceSheet title={sheetTitle(sheet)} saving={saving} onClose={() => !saving && setSheet(null)}>
        <FinanceForm sheet={sheet} entityId={selectedId} period={period} tournaments={data?.tournaments ?? []} receivable={selectedReceivable} closure={selectedClosure}
          onSubmit={(action, payload) => void mutate(action, payload)} saving={saving} />
      </FinanceSheet> : null}
      <style jsx global>{financeCss}</style>
    </div>
  )
}

function TransactionList({ rows, canManage, onVoid }: { rows: Transaction[]; canManage: boolean; onVoid: (id: string) => void }) {
  if (!rows.length) return <EmptyState title="Sin movimientos" detail="Los ingresos, gastos y ajustes del período aparecerán acá." />
  return <div className="finance-list">{rows.map((row) => <article className="finance-transaction" key={row.id}>
    <span className={`finance-type finance-type--${row.transaction_type.toLowerCase()}`}>{row.transaction_type === 'INCOME' ? '+' : row.transaction_type === 'EXPENSE' ? '−' : '±'}</span>
    <div><strong>{row.concept}</strong><span>{row.category} · {methodLabels[row.payment_method] ?? row.payment_method} · {shortDate(row.occurred_at)}</span></div>
    <div className="finance-amount"><strong>{row.transaction_type === 'EXPENSE' ? '−' : '+'}{money(row.amount, row.currency_code)}</strong><StatusBadge status={row.status} /></div>
    {canManage && row.status === 'POSTED' && row.reference_type !== 'RECEIVABLE' ? <button className="finance-more" aria-label={`Anular ${row.concept}`} onClick={() => onVoid(row.id)}>•••</button> : null}
  </article>)}</div>
}

function ReceivableList({ rows, canManage, onPay, showContact = false }: { rows: Receivable[]; canManage: boolean; onPay: (id: string) => void; showContact?: boolean }) {
  if (!rows.length) return <EmptyState title="Sin cobros pendientes" detail="No hay saldos para mostrar en esta sección." />
  return <div className="finance-list">{rows.map((row) => {
    const pending = amount(row.total_amount) - amount(row.paid_amount) - amount(row.waived_amount)
    return <article className="finance-receivable" key={row.id}>
      <div><strong>{row.debtor_name}</strong><span>{row.concept}{showContact && row.contact ? ` · ${row.contact}` : ''}</span></div>
      <div><strong>{money(pending, row.currency_code)}</strong><span>{row.due_date ? `Vence ${shortDate(row.due_date)}` : 'Sin vencimiento'}</span></div>
      <StatusBadge status={row.status} />
      {canManage && pending > 0 && !['VOIDED', 'WAIVED'].includes(row.status) ? <button className="finance-link" onClick={() => onPay(row.id)}>Registrar pago</button> : null}
    </article>
  })}</div>
}

function BalanceSection({ transactions, receivables }: { transactions: Transaction[]; receivables: Receivable[] }) {
  const categories = useMemo(() => {
    const totals = new Map<string, number>()
    transactions.filter((row) => row.status === 'POSTED' && row.transaction_type === 'EXPENSE').forEach((row) => totals.set(row.category, (totals.get(row.category) ?? 0) + amount(row.amount)))
    return Array.from(totals, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [transactions])
  const income = transactions.filter((row) => row.status === 'POSTED' && row.transaction_type === 'INCOME').reduce((total, row) => total + amount(row.amount), 0)
  const expense = transactions.filter((row) => row.status === 'POSTED' && row.transaction_type === 'EXPENSE').reduce((total, row) => total + amount(row.amount), 0)
  const max = Math.max(income, expense, 1)
  return <section className="finance-section finance-balance">
    <article className="finance-card"><header><div><span>Período</span><h2>Ingresos versus egresos</h2></div></header>
      <div className="finance-bars"><label><span>Ingresos</span><i style={{ width: `${income / max * 100}%` }} /><strong>{money(income)}</strong></label><label><span>Egresos</span><i style={{ width: `${expense / max * 100}%` }} /><strong>{money(expense)}</strong></label></div>
      <p className="finance-chartSummary">El resultado registrado es {money(income - expense)}. Hay {receivables.filter((row) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(row.status)).length} cobros con saldo pendiente.</p>
    </article>
    <article className="finance-card"><header><div><span>Distribución</span><h2>Principales gastos</h2></div></header>
      {categories.length ? <div className="finance-categoryList">{categories.map((row) => <div key={row.label}><span>{row.label}</span><strong>{money(row.value)}</strong></div>)}</div> : <EmptyState title="Sin gastos" detail="Todavía no hay categorías para comparar." />}
    </article>
  </section>
}

function FinanceSheet({ title, children, saving, onClose }: { title: string; children: React.ReactNode; saving: boolean; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose, saving])
  return <div className="finance-backdrop" onMouseDown={onClose}><section className="finance-sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span>Finanzas</span><h2>{title}</h2></div><button onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></header>{children}
  </section></div>
}

function FinanceForm({ sheet, entityId, period, tournaments, receivable, closure, saving, onSubmit }: {
  sheet: Exclude<Sheet, null>; entityId: string | null; period: { start: string; end: string }; tournaments: Tournament[]
  receivable: Receivable | null; closure: Closure | null; saving: boolean
  onSubmit: (action: string, payload: Record<string, unknown>) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())
    if (sheet === 'income') onSubmit('transaction.create', { ...values, type: 'INCOME', occurredAt: `${values.date}T12:00:00` })
    if (sheet === 'expense') onSubmit('expense.create', { ...values, occurredAt: `${values.date}T12:00:00` })
    if (sheet === 'receivable') onSubmit('receivable.create', values)
    if (sheet === 'payment') onSubmit('receivable.pay', { ...values, receivableId: receivable?.id })
    if (sheet === 'void') onSubmit('transaction.void', { ...values, transactionId: entityId })
    if (sheet === 'close') onSubmit('period.close', { periodStart: values.periodStart, periodEnd: values.periodEnd, notes: values.notes })
    if (sheet === 'reopen') onSubmit('period.reopen', { closureId: closure?.id, reason: values.reason })
  }
  const today = new Date().toISOString().slice(0, 10)
  if (sheet === 'payment') return <form className="finance-form" onSubmit={submit}><p className="finance-formIntro">Saldo de <strong>{receivable?.debtor_name}</strong>: {money(amount(receivable?.total_amount) - amount(receivable?.paid_amount) - amount(receivable?.waived_amount))}</p><MoneyField /><MethodField /><label>Fecha<input name="paidAt" type="datetime-local" defaultValue={`${today}T12:00`} required /></label><label>Observaciones<textarea name="notes" rows={2} /></label><Submit saving={saving}>Registrar pago</Submit></form>
  if (sheet === 'void') return <form className="finance-form" onSubmit={submit}><p className="finance-formIntro">El movimiento quedará anulado, pero seguirá visible para auditoría.</p><label>Motivo<textarea name="reason" minLength={4} rows={3} required /></label><Submit saving={saving}>Confirmar anulación</Submit></form>
  if (sheet === 'close') return <form className="finance-form" onSubmit={submit}><p className="finance-formIntro">Se guardará una fotografía inmutable de los totales. Los cambios posteriores requerirán reapertura o ajustes.</p><div className="finance-formGrid"><label>Desde<input name="periodStart" type="date" defaultValue={period.start} required /></label><label>Hasta<input name="periodEnd" type="date" defaultValue={period.end} required /></label></div><label>Observaciones<textarea name="notes" rows={3} /></label><Submit saving={saving}>Cerrar período</Submit></form>
  if (sheet === 'reopen') return <form className="finance-form" onSubmit={submit}><p className="finance-formIntro">Solo el OWNER puede reabrir. El motivo quedará auditado.</p><label>Motivo<textarea name="reason" minLength={4} rows={3} required /></label><Submit saving={saving}>Reabrir cierre</Submit></form>
  if (sheet === 'receivable') return <form className="finance-form" onSubmit={submit}><div className="finance-formGrid"><label>Jugador, pareja o entidad<input name="debtorName" minLength={2} required /></label><label>Contacto<input name="contact" /></label></div><label>Concepto<input name="concept" minLength={2} required /></label><div className="finance-formGrid"><MoneyField name="totalAmount" /><label>Vencimiento<input name="dueDate" type="date" /></label></div><label>Torneo<select name="tournamentId"><option value="">Sin torneo</option>{tournaments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Observaciones<textarea name="notes" rows={2} /></label><Submit saving={saving}>Crear cobro</Submit></form>
  return <form className="finance-form" onSubmit={submit}><label>Concepto<input name="concept" minLength={2} required /></label><div className="finance-formGrid"><MoneyField /><label>Fecha<input name="date" type="date" defaultValue={today} required /></label></div><div className="finance-formGrid"><label>Categoría{sheet === 'expense' ? <select name="category" required>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select> : <input name="category" defaultValue="Ingresos varios" required />}</label><MethodField /></div>{sheet === 'expense' ? <label>Proveedor<input name="supplier" /></label> : null}<label>Torneo<select name="tournamentId"><option value="">Sin torneo</option>{tournaments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><details><summary>Más detalles</summary><label>Observaciones<textarea name="notes" rows={2} /></label></details><Submit saving={saving}>{sheet === 'expense' ? 'Registrar gasto' : 'Registrar ingreso'}</Submit></form>
}

function MoneyField({ name = 'amount' }: { name?: string }) { return <label>Importe<input name={name} type="number" min="0.01" step="0.01" inputMode="decimal" required /></label> }
function MethodField() { return <label>Método<select name="paymentMethod" required>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> }
function Submit({ saving, children }: { saving: boolean; children: React.ReactNode }) { return <button className="finance-primary" disabled={saving}>{saving ? 'Guardando…' : children}</button> }
function sheetTitle(sheet: Exclude<Sheet, null>) {
  return ({ income: 'Registrar ingreso', expense: 'Registrar gasto', receivable: 'Crear cobro', payment: 'Registrar pago', void: 'Anular movimiento', close: 'Cerrar período', reopen: 'Reabrir cierre' })[sheet]
}

const financeCss = `
.finance-workspace{--ink:#071b38;--muted:#64748b;background:#f6f8fb;border:1px solid rgba(15,23,42,.08);border-radius:20px;box-shadow:0 20px 55px rgba(15,23,42,.07);margin:0 auto;max-width:1180px;min-width:0;overflow:visible;padding:16px;position:relative}
.finance-workspace:before{background:linear-gradient(90deg,var(--finance-accent),var(--finance-accent-2));content:"";height:3px;left:0;position:absolute;right:0;top:0}
.finance-hero{align-items:center;background:linear-gradient(135deg,#fff,var(--finance-soft));border:1px solid rgba(15,23,42,.07);border-radius:16px;display:flex;gap:12px;justify-content:space-between;padding:15px}
.finance-hero span,.finance-card header span{color:var(--finance-accent);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}.finance-hero h1{color:var(--ink);font-size:24px;font-weight:600;line-height:1.05;margin:3px 0}.finance-hero p{color:var(--muted);font-size:12.5px;margin:0;text-transform:capitalize}
.finance-primary{background:var(--ink);border:1px solid color-mix(in srgb,var(--finance-accent) 36%,transparent);border-radius:11px;color:#fff;cursor:pointer;font-size:12.5px;font-weight:600;min-height:42px;padding:8px 14px}.finance-primary--small{min-height:36px}.finance-primary:disabled{cursor:not-allowed;opacity:.55}
.finance-period{align-items:end;display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.finance-period button{background:#fff;border:1px solid rgba(15,23,42,.1);border-radius:9px;color:#475569;cursor:pointer;font-size:11.5px;font-weight:500;height:36px;padding:5px 10px}.finance-period button.is-active{border-color:var(--finance-accent);color:var(--ink)}.finance-customPeriod{align-items:end;display:flex;gap:6px}.finance-period label{display:grid;gap:2px}.finance-period label span{color:var(--muted);font-size:9px}.finance-period input{background:#fff;border:1px solid rgba(15,23,42,.1);border-radius:9px;color:var(--ink);font-size:11px;height:36px;padding:5px 8px}
.finance-tabs{background:#edf1f5;border-radius:11px;display:flex;gap:3px;padding:3px;width:max-content}.finance-tabs button{background:transparent;border:0;border-radius:8px;color:#64748b;cursor:pointer;font-size:11.5px;font-weight:500;height:36px;padding:5px 12px}.finance-tabs button.is-active{background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(15,23,42,.07)}.finance-mobileSection{display:none}
.finance-section{display:grid;gap:10px;margin-top:10px;min-width:0}.finance-result{background:var(--ink);border-radius:15px;color:#fff;display:grid;gap:3px;padding:14px}.finance-result span{font-size:11px;opacity:.72}.finance-result strong{font-size:27px;font-weight:600}.finance-result small{font-size:10.5px;opacity:.65}
.finance-metrics{display:grid;gap:8px;grid-template-columns:repeat(4,minmax(0,1fr))}.finance-metric{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:13px;display:grid;gap:3px;padding:11px}.finance-metric span{color:var(--muted);font-size:10.5px}.finance-metric strong{color:var(--ink);font-size:17px;font-weight:600}.finance-metric--income{border-left:3px solid #16a34a}.finance-metric--expense{border-left:3px solid #e11d48}
.finance-quick{display:flex;flex-wrap:wrap;gap:7px}.finance-quick button,.finance-link,.finance-card header button{background:#fff;border:1px solid color-mix(in srgb,var(--finance-accent) 28%,transparent);border-radius:9px;color:var(--ink);cursor:pointer;font-size:11.5px;font-weight:500;min-height:34px;padding:5px 10px}.finance-twoColumns,.finance-balance{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
.finance-card{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:15px;box-shadow:0 8px 22px rgba(15,23,42,.035);min-width:0;padding:13px}.finance-card>header{align-items:center;display:flex;gap:10px;justify-content:space-between;margin-bottom:10px}.finance-card h2{color:var(--ink);font-size:17px;font-weight:600;margin:2px 0 0}
.finance-list{display:grid;gap:7px}.finance-transaction{align-items:center;border-top:1px solid rgba(15,23,42,.07);display:grid;gap:8px;grid-template-columns:32px minmax(0,1fr) auto auto;padding:9px 0}.finance-list>:first-child{border-top:0}.finance-type{align-items:center;background:#eef2f6;border-radius:9px;display:flex;font-size:17px;font-weight:600;height:32px;justify-content:center;width:32px}.finance-type--income{color:#15803d}.finance-type--expense{color:#be123c}.finance-transaction>div,.finance-receivable>div{display:grid;gap:2px;min-width:0}.finance-transaction strong,.finance-receivable strong,.finance-closure strong{color:var(--ink);font-size:12.5px;font-weight:600}.finance-transaction span,.finance-receivable span,.finance-closure span{color:var(--muted);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.finance-amount{justify-items:end}.finance-more{background:transparent;border:0;color:#64748b;cursor:pointer;font-weight:600;height:32px;width:32px}
.finance-status{align-items:center;background:#f1f5f9;border-radius:999px;color:#475569;display:inline-flex;font-size:9.5px;font-weight:600;height:21px;padding:3px 7px;width:max-content}.finance-status--posted,.finance-status--paid,.finance-status--closed{background:#ecfdf3;color:#166534}.finance-status--pending,.finance-status--partial,.finance-status--overdue{background:#fff7df;color:#92400e}.finance-status--voided{background:#fff1f2;color:#9f1239}
.finance-receivable{align-items:center;border-top:1px solid rgba(15,23,42,.07);display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto auto auto;padding:9px 0}.finance-closure{align-items:center;border-top:1px solid rgba(15,23,42,.07);display:grid;gap:8px;grid-template-columns:minmax(0,1fr) auto auto;padding:10px 0}.finance-closure>div{display:grid;gap:3px}.finance-closure>div:nth-child(2){justify-items:end}
.finance-filters{display:grid;gap:7px;grid-template-columns:minmax(180px,1fr) 160px 170px}.finance-filters input,.finance-filters select,.finance-mobileSection select{background:#fff;border:1px solid rgba(15,23,42,.11);border-radius:9px;color:var(--ink);font-size:12px;height:39px;padding:7px 10px}
.finance-empty{align-items:start;background:#f8fafc;border:1px dashed rgba(15,23,42,.16);border-radius:12px;display:grid;gap:3px;padding:11px}.finance-empty strong{color:var(--ink);font-size:12.5px;font-weight:600}.finance-empty span{color:var(--muted);font-size:11px}.finance-alert,.finance-success{border-radius:11px;font-size:12px;margin-top:9px;padding:10px 12px}.finance-alert{background:#fff1f2;color:#9f1239}.finance-success{background:#ecfdf3;color:#166534}
.finance-skeleton{display:grid;gap:8px;margin-top:10px}.finance-skeleton span{animation:finance-pulse 1.1s ease-in-out infinite alternate;background:#e7ebf0;border-radius:13px;height:72px}@keyframes finance-pulse{to{opacity:.5}}
.finance-bars{display:grid;gap:12px}.finance-bars label{display:grid;gap:4px;grid-template-columns:75px minmax(0,1fr) 90px}.finance-bars span{color:var(--muted);font-size:11px}.finance-bars i{background:linear-gradient(90deg,var(--finance-accent),var(--finance-accent-2));border-radius:999px;display:block;height:8px;min-width:2px}.finance-bars strong{color:var(--ink);font-size:11px;text-align:right}.finance-chartSummary{color:var(--muted);font-size:11.5px;line-height:1.4;margin:12px 0 0}.finance-categoryList{display:grid;gap:7px}.finance-categoryList div{border-bottom:1px solid rgba(15,23,42,.07);display:flex;justify-content:space-between;padding:6px 0}.finance-categoryList span{color:#475569;font-size:11.5px}.finance-categoryList strong{color:var(--ink);font-size:11.5px;font-weight:600}
.finance-backdrop{align-items:flex-end;background:rgba(3,12,27,.55);display:flex;inset:0;justify-content:center;padding:16px;position:fixed;z-index:100}.finance-sheet{background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);max-height:min(88vh,720px);max-width:560px;overflow:auto;padding:14px;width:100%}.finance-sheet>header{align-items:center;border-bottom:1px solid rgba(15,23,42,.08);display:flex;justify-content:space-between;margin-bottom:12px;padding-bottom:10px}.finance-sheet header span{color:var(--finance-accent);font-size:10px;font-weight:600;text-transform:uppercase}.finance-sheet h2{color:var(--ink);font-size:19px;font-weight:600;margin:2px 0 0}.finance-sheet header button{background:#f1f5f9;border:0;border-radius:999px;color:var(--ink);cursor:pointer;font-size:19px;height:34px;width:34px}
.finance-form{display:grid;gap:10px}.finance-form label{color:#334155;display:grid;font-size:11px;font-weight:500;gap:4px}.finance-form input,.finance-form select,.finance-form textarea{background:#fff;border:1px solid rgba(15,23,42,.13);border-radius:9px;color:var(--ink);font:inherit;font-size:13px;min-height:40px;padding:8px 10px}.finance-form textarea{resize:vertical}.finance-formGrid{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.finance-formIntro{background:#f8fafc;border-radius:10px;color:#475569;font-size:11.5px;line-height:1.4;margin:0;padding:10px}.finance-form details{border:1px solid rgba(15,23,42,.08);border-radius:10px;padding:9px}.finance-form summary{color:#475569;cursor:pointer;font-size:11.5px;font-weight:500}.finance-form details label{margin-top:8px}
@media(max-width:720px){.finance-workspace{background:transparent;border:0;border-radius:0;box-shadow:none;padding:0}.finance-workspace:before{display:none}.finance-hero{align-items:flex-start;padding:12px}.finance-hero h1{font-size:21px}.finance-hero .finance-primary{min-height:38px;padding-inline:10px}.finance-period{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.finance-customPeriod{display:grid;grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.finance-period button,.finance-period label{min-width:0}.finance-period input{width:100%}.finance-tabs{display:none}.finance-mobileSection{display:grid;gap:4px;margin:9px 0}.finance-mobileSection span{color:var(--muted);font-size:10px}.finance-mobileSection select{height:42px;width:100%}.finance-section{gap:9px;margin-top:9px}.finance-result{padding:12px}.finance-result strong{font-size:24px}.finance-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.finance-metric{padding:10px}.finance-twoColumns,.finance-balance{grid-template-columns:1fr}.finance-card{padding:12px}.finance-transaction{grid-template-columns:30px minmax(0,1fr) auto}.finance-transaction>.finance-more{display:none}.finance-amount .finance-status{display:none}.finance-receivable{align-items:start;grid-template-columns:minmax(0,1fr) auto}.finance-receivable>.finance-status{grid-column:1}.finance-receivable>.finance-link{grid-column:2;grid-row:2}.finance-filters{grid-template-columns:1fr}.finance-closure{grid-template-columns:minmax(0,1fr) auto}.finance-closure>.finance-link{grid-column:1/-1;justify-self:end}.finance-backdrop{padding:0}.finance-sheet{border-radius:18px 18px 0 0;max-height:92vh;padding:12px}.finance-formGrid{grid-template-columns:1fr}.finance-bars label{grid-template-columns:65px minmax(0,1fr) 78px}}
@media(max-width:340px){.finance-hero{display:grid}.finance-hero .finance-primary{width:100%}.finance-quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.finance-quick button:last-child{grid-column:1/-1}.finance-transaction{grid-template-columns:28px minmax(0,1fr)}.finance-amount{grid-column:2;justify-items:start}}
@media(min-width:721px){.finance-backdrop{align-items:center}.finance-sheet{border-radius:18px}}
@media(prefers-reduced-motion:reduce){.finance-skeleton span{animation:none}}
.finance-primary:focus-visible,.finance-link:focus-visible,.finance-tabs button:focus-visible,.finance-period button:focus-visible,.finance-sheet button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid color-mix(in srgb,var(--finance-accent) 35%,transparent);outline-offset:2px}
`
