'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type PaymentRow = {
  id: string
  user_id: string
  club_id: string
  tournament_id: string | null
  registration_id: string | null
  source_type: string
  status: 'pending' | 'paid' | 'failed' | 'refunded' | string
  amount: number
  refunded_amount: number
  currency: string
  provider: string | null
  provider_payment_id: string | null
  paid_at: string | null
  failed_at: string | null
  refunded_at: string | null
  created_at: string
  club_name: string
  user_name: string
  user_email: string | null
  tournament_name: string | null
  refund_reason: string | null
  failure_reason: string | null
}

type ManualUserOption = {
  id: string
  label: string
  email: string | null
}

type ManualClubOption = {
  id: string
  name: string
  city: string | null
}

type CommissionResult = {
  paymentId: string
  created: boolean
  baseAmount: number
  commissionRateBps: number
  commissionAmount: number
  clubNetAmount: number
  currency: string
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
  if (status === 'pending') return 'is-warning'
  if (status === 'refunded') return 'is-neutral'
  return 'is-danger'
}

export default function PlatformPagosPage() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [error, setError] = useState<string | null>(null)
  const [financeReady, setFinanceReady] = useState(true)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualLoading, setManualLoading] = useState(false)
  const [manualUsers, setManualUsers] = useState<ManualUserOption[]>([])
  const [manualClubs, setManualClubs] = useState<ManualClubOption[]>([])
  const [manualUserId, setManualUserId] = useState('')
  const [manualClubId, setManualClubId] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [commissionRateBps, setCommissionRateBps] = useState('1000')
  const [commissionResult, setCommissionResult] = useState<CommissionResult | null>(null)

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

    const res = await fetch('/api/platform/finance/payments?limit=100', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))
    if (json?.code === 'FINANCE_NOT_INITIALIZED') {
      setRows([])
      setSelectedId(null)
      setFinanceReady(false)
      setLoading(false)
      return
    }
    if (!res.ok) {
      setError(json?.error ?? 'No pude traer pagos.')
      setLoading(false)
      return
    }

    setFinanceReady(true)
    const nextRows = (json?.rows ?? []) as PaymentRow[]
    setRows(nextRows)
    setSelectedId((current) => current ?? nextRows[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const byStatus = statusFilter === 'all' || row.status === statusFilter
      const byQuery =
        !q ||
        row.user_name.toLowerCase().includes(q) ||
        (row.user_email ?? '').toLowerCase().includes(q) ||
        row.club_name.toLowerCase().includes(q) ||
        (row.tournament_name ?? '').toLowerCase().includes(q) ||
        (row.provider_payment_id ?? '').toLowerCase().includes(q)
      return byStatus && byQuery
    })
  }, [rows, query, statusFilter])

  const selected = filtered.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? filtered[0] ?? null
  const totals = {
    paid: rows.filter((row) => row.status === 'paid').reduce((acc, row) => acc + Number(row.amount || 0), 0),
    pending: rows.filter((row) => row.status === 'pending').length,
    refunded: rows.filter((row) => row.status === 'refunded').length,
  }

  async function loadManualOptions() {
    if (manualUsers.length && manualClubs.length) return

    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setManualLoading(true)
    const [usersRes, clubsRes] = await Promise.all([
      fetch('/api/platform/users-admin', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }),
      fetch('/api/platform/clubs-admin', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }),
    ])
    const [usersJson, clubsJson] = await Promise.all([
      usersRes.json().catch(() => ({})),
      clubsRes.json().catch(() => ({})),
    ])
    setManualLoading(false)

    if (!usersRes.ok || !clubsRes.ok) {
      setAlert({
        variant: 'error',
        title: 'No pude preparar el pago manual',
        message: usersJson?.error || clubsJson?.error || 'No pude cargar usuarios y clubes.',
      })
      return
    }

    const usersMap = new Map<string, ManualUserOption>()
    for (const row of usersJson?.rows ?? []) {
      if (!row?.user_id || usersMap.has(row.user_id)) continue
      usersMap.set(row.user_id, {
        id: row.user_id,
        label: row.user_name || row.user_email || 'Usuario',
        email: row.user_email ?? null,
      })
    }

    const nextUsers = Array.from(usersMap.values()).sort((a, b) => a.label.localeCompare(b.label))
    const nextClubs = ((clubsJson?.rows ?? []) as any[])
      .filter((club) => club?.id)
      .map((club) => ({
        id: club.id,
        name: club.name || club.brand_name || 'Club',
        city: club.city ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    setManualUsers(nextUsers)
    setManualClubs(nextClubs)
    setManualUserId((current) => current || nextUsers[0]?.id || '')
    setManualClubId((current) => current || nextClubs[0]?.id || '')
  }

  async function openManualModal() {
    setManualOpen(true)
    await loadManualOptions()
  }

  async function createManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(manualAmount.replace(',', '.'))
    if (!manualUserId || !manualClubId || !Number.isFinite(amount) || amount <= 0) {
      setAlert({ variant: 'warning', title: 'Revisá el pago manual', message: 'Elegí usuario, club y un monto mayor a cero.' })
      return
    }

    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId('manual-payment')
    const res = await fetch('/api/platform/finance/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        user_id: manualUserId,
        club_id: manualClubId,
        amount,
        source_type: 'manual',
        status: 'paid',
        paid_at: new Date().toISOString(),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude crear el pago', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setManualOpen(false)
    setManualAmount('')
    setAlert({ variant: 'success', title: 'Pago manual creado', message: 'Quedó registrado como cobro manual de prueba.' })
    await load()
    if (json?.payment?.id) setSelectedId(json.payment.id)
  }

  async function calculateCommission(row: PaymentRow) {
    const rate = Number(commissionRateBps)
    if (!Number.isInteger(rate) || rate < 0 || rate > 10000) {
      setAlert({ variant: 'warning', title: 'Tasa inválida', message: 'Usá basis points entre 0 y 10000. Ej: 1000 = 10%.' })
      return
    }

    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId(`commission-${row.id}`)
    const res = await fetch('/api/platform/finance/commissions/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        payment_id: row.id,
        commission_rate_bps: rate,
        rule_snapshot: { source: 'platform_manual_ui', rate_bps: rate },
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude calcular la comisión', message: json?.error ?? 'Error inesperado.' })
      return
    }

    const commission = json?.commission
    setCommissionResult({
      paymentId: row.id,
      created: Boolean(json?.created),
      baseAmount: Number(commission?.base_amount ?? row.amount),
      commissionRateBps: Number(commission?.commission_rate_bps ?? rate),
      commissionAmount: Number(commission?.commission_amount ?? 0),
      clubNetAmount: Number(commission?.club_net_amount ?? 0),
      currency: commission?.currency ?? row.currency,
    })
    setAlert({
      variant: 'success',
      title: json?.created ? 'Comisión calculada' : 'Comisión existente',
      message: json?.created ? 'La comisión quedó registrada para este pago.' : 'Este pago ya tenía comisión calculada.',
    })
  }

  async function refund(row: PaymentRow) {
    const reason = window.prompt(`Motivo del reembolso para ${row.user_name}`)?.trim()
    if (!reason) {
      setAlert({ variant: 'warning', title: 'Falta motivo', message: 'Indicá un motivo para registrar el refund.' })
      return
    }

    const accessToken = await token()
    if (!accessToken) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId(row.id)
    const res = await fetch(`/api/platform/finance/payments/${row.id}/refund`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ refund_reason: reason }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude reembolsar', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({ variant: 'success', title: 'Pago reembolsado', message: 'El refund quedó registrado y auditado.' })
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--finance">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Pagos</h1>
            <div className="px-platformSub">Monitoreo compacto de cobros, estados y reembolsos operativos.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn" onClick={openManualModal} disabled={!financeReady || loading}>
              Pago manual
            </button>
            <button className="px-btn px-btn--ghost" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
          <div className="px-platformMetricCard"><span>Total pagos</span><strong>{rows.length}</strong></div>
          <div className="px-platformMetricCard"><span>Cobrado</span><strong>{money(totals.paid)}</strong></div>
          <div className="px-platformMetricCard"><span>Pendientes</span><strong>{totals.pending}</strong></div>
          <div className="px-platformMetricCard"><span>Reembolsados</span><strong>{totals.refunded}</strong></div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {!financeReady ? (
          <div style={{ marginTop: 14 }}>
            <AuthAlert
              variant="info"
              title="Finanzas aún no inicializadas"
              message="Aplicá la migración financiera en Supabase y recargá esta pantalla para ver pagos reales."
            />
          </div>
        ) : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer pagos" message={error} /></div> : null}

        <div className="px-platformAdminLayout">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters">
              <label className="px-platformFilterField">
                <span>Buscar</span>
                <input className="px-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Usuario, club, torneo o provider id" />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Estado</span>
                <select className="px-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </label>
            </div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando pagos…</div>
              ) : filtered.length ? (
                <table className="px-table px-table--platform">
                  <thead>
                    <tr>
                      <th>Pago</th>
                      <th>Club</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : ''} onClick={() => setSelectedId(row.id)}>
                        <td>
                          <strong>{row.user_name}</strong>
                          <small>{row.tournament_name || row.user_email || row.source_type}</small>
                        </td>
                        <td>{row.club_name}</td>
                        <td><strong>{money(row.amount, row.currency)}</strong></td>
                        <td><span className={`px-statusBadge ${statusClass(row.status)}`}>{row.status}</span></td>
                        <td>{formatDate(row.paid_at || row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-empty">No hay pagos para este filtro.</div>
              )}
            </div>
          </section>

          <aside className="px-platformCard px-platformAdminAside">
            {selected ? (
              <>
                <div className="px-sectionTitle">Detalle del pago</div>
                <div className="px-platformDetailHero">
                  <strong>{money(selected.amount, selected.currency)}</strong>
                  <span className={`px-statusBadge ${statusClass(selected.status)}`}>{selected.status}</span>
                </div>
                <div className="px-platformDetailGrid">
                  <div><span>Usuario</span><strong>{selected.user_name}</strong></div>
                  <div><span>Club</span><strong>{selected.club_name}</strong></div>
                  <div><span>Torneo</span><strong>{selected.tournament_name || '—'}</strong></div>
                  <div><span>Provider</span><strong>{selected.provider || '—'}</strong></div>
                  <div><span>Provider ID</span><strong>{selected.provider_payment_id || '—'}</strong></div>
                  <div><span>Refund</span><strong>{money(selected.refunded_amount || 0, selected.currency)}</strong></div>
                </div>
                <div className="px-financeCommissionBox">
                  <label>
                    <span>Tasa comisión</span>
                    <input
                      className="px-input"
                      inputMode="numeric"
                      value={commissionRateBps}
                      onChange={(event) => setCommissionRateBps(event.target.value)}
                      placeholder="1000"
                    />
                    <small>Basis points. 1000 = 10%</small>
                  </label>
                  {commissionResult?.paymentId === selected.id ? (
                    <div className="px-financeCommissionResult">
                      <div><span>Base</span><strong>{money(commissionResult.baseAmount, commissionResult.currency)}</strong></div>
                      <div><span>Comisión</span><strong>{money(commissionResult.commissionAmount, commissionResult.currency)}</strong></div>
                      <div><span>Neto club</span><strong>{money(commissionResult.clubNetAmount, commissionResult.currency)}</strong></div>
                    </div>
                  ) : null}
                </div>
                <div className="px-platformActionsStack">
                  <button
                    className="px-btn"
                    onClick={() => calculateCommission(selected)}
                    disabled={busyId === `commission-${selected.id}`}
                  >
                    {busyId === `commission-${selected.id}` ? 'Calculando…' : 'Calcular comisión'}
                  </button>
                  {selected.status === 'paid' ? (
                    <button className="px-btn px-btn--danger" onClick={() => refund(selected)} disabled={busyId === selected.id}>
                      {busyId === selected.id ? 'Procesando…' : 'Registrar refund'}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="px-empty">Seleccioná un pago.</div>
            )}
          </aside>
        </div>

        {manualOpen ? (
          <div className="px-financeModalOverlay" role="dialog" aria-modal="true" aria-labelledby="manual-payment-title">
            <form className="px-financeModal" onSubmit={createManualPayment}>
              <div className="px-financeModalHead">
                <div>
                  <h2 id="manual-payment-title">Pago manual de prueba</h2>
                  <p>Creá un cobro manual sin depender de torneos.</p>
                </div>
                <button type="button" className="px-btn px-btn--ghost" onClick={() => setManualOpen(false)}>
                  Cerrar
                </button>
              </div>

              <div className="px-financeForm">
                <label>
                  <span>Usuario</span>
                  <select className="px-input" value={manualUserId} onChange={(event) => setManualUserId(event.target.value)} disabled={manualLoading}>
                    {manualUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.label}{user.email ? ` · ${user.email}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Club</span>
                  <select className="px-input" value={manualClubId} onChange={(event) => setManualClubId(event.target.value)} disabled={manualLoading}>
                    {manualClubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}{club.city ? ` · ${club.city}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Monto</span>
                  <input
                    className="px-input"
                    inputMode="decimal"
                    placeholder="Ej: 15000"
                    value={manualAmount}
                    onChange={(event) => setManualAmount(event.target.value)}
                  />
                </label>
              </div>

              <div className="px-financeModalActions">
                <button type="button" className="px-btn px-btn--ghost" onClick={() => setManualOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-btn"
                  disabled={manualLoading || busyId === 'manual-payment' || !manualUsers.length || !manualClubs.length}
                >
                  {busyId === 'manual-payment' ? 'Creando…' : 'Crear pago'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
