'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type ClubOption = { id: string; name: string; status: string }

type SettlementRow = {
  id: string
  club_id: string
  club_name: string
  status: 'pending' | 'approved' | 'paid' | 'failed' | 'cancelled' | string
  period_start: string
  period_end: string
  gross_amount: number
  commission_amount: number
  net_amount: number
  currency: string
  payments_count: number
  generated_at: string
  approved_at: string | null
  paid_at: string | null
}

function money(value: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function statusClass(status: string) {
  if (status === 'paid') return 'is-success'
  if (status === 'approved') return 'is-neutral'
  if (status === 'pending') return 'is-warning'
  return 'is-danger'
}

function currentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fmt = (date: Date) => date.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

export default function PlatformLiquidacionesPage() {
  const month = currentMonthRange()
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [error, setError] = useState<string | null>(null)
  const [financeReady, setFinanceReady] = useState(true)
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [clubId, setClubId] = useState('')
  const [periodStart, setPeriodStart] = useState(month.start)
  const [periodEnd, setPeriodEnd] = useState(month.end)

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function load() {
    setLoading(true)
    setError(null)
    const accessToken = await token()
    if (!accessToken) {
      setError('Sesión expirada.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/platform/finance/settlements?limit=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))
    if (json?.code === 'FINANCE_NOT_INITIALIZED') {
      setRows([])
      setClubs([])
      setSelectedId(null)
      setClubId('')
      setFinanceReady(false)
      setLoading(false)
      return
    }
    if (!res.ok) {
      setError(json?.error ?? 'No pude traer liquidaciones.')
      setLoading(false)
      return
    }

    setFinanceReady(true)
    const nextRows = (json?.rows ?? []) as SettlementRow[]
    const nextClubs = (json?.clubs ?? []) as ClubOption[]
    setRows(nextRows)
    setClubs(nextClubs)
    setClubId((current) => current || nextClubs[0]?.id || '')
    setSelectedId((current) => current ?? nextRows[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return rows.filter((row) => statusFilter === 'all' || row.status === statusFilter)
  }, [rows, statusFilter])

  const selected = filtered.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? filtered[0] ?? null
  const totals = {
    pending: rows.filter((row) => row.status === 'pending').length,
    approved: rows.filter((row) => row.status === 'approved').length,
    paid: rows.filter((row) => row.status === 'paid').length,
    net: rows.filter((row) => row.status !== 'cancelled').reduce((acc, row) => acc + Number(row.net_amount || 0), 0),
  }

  async function generate() {
    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }
    if (!clubId || !periodStart || !periodEnd) {
      setAlert({ variant: 'warning', title: 'Faltan datos', message: 'Elegí club y período.' })
      return
    }

    setBusyId('generate')
    const res = await fetch('/api/platform/finance/settlements/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ club_id: clubId, period_start: periodStart, period_end: periodEnd }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude generar', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({ variant: 'success', title: json.generated ? 'Liquidación generada' : 'Liquidación existente', message: 'La liquidación quedó lista para revisión.' })
    await load()
  }

  async function action(row: SettlementRow, next: 'approve' | 'mark-paid') {
    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId(row.id)
    const res = await fetch(`/api/platform/finance/settlements/${row.id}/${next}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude actualizar', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({
      variant: 'success',
      title: next === 'approve' ? 'Liquidación aprobada' : 'Liquidación pagada',
      message: 'El cambio quedó registrado y auditado.',
    })
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--finance">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Liquidaciones</h1>
            <div className="px-platformSub">Generá y seguí liquidaciones por club con totales claros.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn px-btn--ghost" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
          <div className="px-platformMetricCard"><span>Pendientes</span><strong>{totals.pending}</strong></div>
          <div className="px-platformMetricCard"><span>Aprobadas</span><strong>{totals.approved}</strong></div>
          <div className="px-platformMetricCard"><span>Pagadas</span><strong>{totals.paid}</strong></div>
          <div className="px-platformMetricCard"><span>Neto total</span><strong>{money(totals.net)}</strong></div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {!financeReady ? (
          <div style={{ marginTop: 14 }}>
            <AuthAlert
              variant="info"
              title="Finanzas aún no inicializadas"
              message="Aplicá la migración financiera en Supabase y recargá esta pantalla para operar liquidaciones."
            />
          </div>
        ) : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer liquidaciones" message={error} /></div> : null}

        <div className="px-platformAdminLayout">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters">
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Estado</span>
                <select className="px-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">Todas</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando liquidaciones…</div>
              ) : filtered.length ? (
                <table className="px-table px-table--platform">
                  <thead>
                    <tr>
                      <th>Club</th>
                      <th>Período</th>
                      <th>Neto</th>
                      <th>Pagos</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : ''} onClick={() => setSelectedId(row.id)}>
                        <td><strong>{row.club_name}</strong><small>{money(row.gross_amount, row.currency)} bruto</small></td>
                        <td>{formatDate(row.period_start)} - {formatDate(row.period_end)}</td>
                        <td><strong>{money(row.net_amount, row.currency)}</strong></td>
                        <td>{row.payments_count}</td>
                        <td><span className={`px-statusBadge ${statusClass(row.status)}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-empty">No hay liquidaciones para este filtro.</div>
              )}
            </div>
          </section>

          <aside className="px-platformAsideStack">
            <div className="px-platformCard">
              <div className="px-sectionTitle">Generar liquidación</div>
              <div className="px-financeForm">
                <label><span>Club</span><select className="px-input" value={clubId} onChange={(event) => setClubId(event.target.value)}>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
                <label><span>Desde</span><input className="px-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
                <label><span>Hasta</span><input className="px-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
                <button className="px-btn" onClick={generate} disabled={!financeReady || busyId === 'generate'}>
                  {busyId === 'generate' ? 'Generando…' : 'Generar'}
                </button>
              </div>
            </div>

            <div className="px-platformCard">
              {selected ? (
                <>
                  <div className="px-sectionTitle">Detalle</div>
                  <div className="px-platformDetailHero">
                    <strong>{money(selected.net_amount, selected.currency)}</strong>
                    <span className={`px-statusBadge ${statusClass(selected.status)}`}>{selected.status}</span>
                  </div>
                  <div className="px-platformDetailGrid">
                    <div><span>Club</span><strong>{selected.club_name}</strong></div>
                    <div><span>Período</span><strong>{formatDate(selected.period_start)} - {formatDate(selected.period_end)}</strong></div>
                    <div><span>Gross</span><strong>{money(selected.gross_amount, selected.currency)}</strong></div>
                    <div><span>Comisión</span><strong>{money(selected.commission_amount, selected.currency)}</strong></div>
                    <div><span>Neto</span><strong>{money(selected.net_amount, selected.currency)}</strong></div>
                    <div><span>Pagos</span><strong>{selected.payments_count}</strong></div>
                  </div>
                  <div className="px-platformActionsStack">
                    {selected.status === 'pending' ? <button className="px-btn" disabled={busyId === selected.id} onClick={() => action(selected, 'approve')}>Aprobar</button> : null}
                    {selected.status === 'approved' ? <button className="px-btn" disabled={busyId === selected.id} onClick={() => action(selected, 'mark-paid')}>Marcar pagada</button> : null}
                  </div>
                </>
              ) : (
                <div className="px-empty">Seleccioná una liquidación.</div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
