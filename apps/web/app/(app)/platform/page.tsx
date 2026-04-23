'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { clubStatusBadgeClass, clubStatusLabel, type PlatformClubStatus } from '@/lib/platformStatus'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type Summary = {
  clubs: {
    total: number
    active: number
    pending: number
    rejected: number
    suspended: number
    recent: Array<{ id: string; name: string; city: string | null; status: PlatformClubStatus; created_at: string }>
  }
  users: {
    total_profiles: number
    memberships_total: number
    memberships_pending: number
    memberships_approved: number
  }
  content: {
    news_total: number
    news_published: number
    ads_active: number
    sponsors_active: number
  }
  finance: {
    available: boolean
    recent_payments: Array<{ id: string; status: string; amount: number; currency: string; created_at: string; paid_at: string | null }>
    payments_paid_count: number
    payments_total_collected: number
    commissions_total: number
    settlements_pending: number
    settlements_approved: number
    settlements_paid: number
  }
}

const emptySummary: Summary = {
  clubs: { total: 0, active: 0, pending: 0, rejected: 0, suspended: 0, recent: [] },
  users: { total_profiles: 0, memberships_total: 0, memberships_pending: 0, memberships_approved: 0 },
  content: { news_total: 0, news_published: 0, ads_active: 0, sponsors_active: 0 },
  finance: { available: true, recent_payments: [], payments_paid_count: 0, payments_total_collected: 0, commissions_total: 0, settlements_pending: 0, settlements_approved: 0, settlements_paid: 0 },
}

function money(value: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function PlatformPage() {
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState<AlertState>(null)
  const [summary, setSummary] = useState<Summary>(emptySummary)

  async function load() {
    setLoading(true)
    setAlert(null)

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      setLoading(false)
      return
    }

    const res = await fetch('/api/platform/summary', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude cargar el dashboard', message: json?.error ?? 'Error inesperado.' })
      setLoading(false)
      return
    }

    setSummary(json as Summary)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const mainMetrics = useMemo(() => [
    { label: 'Clubes activos', value: String(summary.clubs.active), hint: `${summary.clubs.pending} pendientes` },
    { label: 'Usuarios', value: String(summary.users.total_profiles), hint: `${summary.users.memberships_pending} membresías pendientes` },
    { label: 'Cobrado 30d', value: money(summary.finance.payments_total_collected), hint: `${summary.finance.payments_paid_count} pagos paid` },
    { label: 'Comisiones 30d', value: money(summary.finance.commissions_total), hint: 'Calculadas por pago' },
  ], [summary])

  return (
    <div className="platform-shell">
      <div className="px-platform">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Plataforma</h1>
            <div className="px-platformSub">Resumen operativo de clubes, usuarios, contenido y finanzas.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn px-btn--ghost" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {!summary.finance.available ? <div style={{ marginTop: 14 }}><AuthAlert variant="warning" title="Finanzas no disponible" message="Aplicá la migración financiera para ver pagos, comisiones y liquidaciones." /></div> : null}

        <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
          {mainMetrics.map((metric) => (
            <div key={metric.label} className="px-platformMetricCard">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.hint}</small>
            </div>
          ))}
        </div>

        <div className="px-platformGrid" style={{ marginTop: 14 }}>
          <section className="px-platformCard">
            <div className="px-sectionTitle">Operación</div>
            <div className="px-actions">
              <Link className="px-action" href="/platform/solicitudes">
                <div className="px-actionLeft">
                  <p className="px-actionTitle">Clubes por revisar</p>
                  <p className="px-actionSub">Altas pendientes y correcciones</p>
                </div>
                <span className="px-pill">{summary.clubs.pending}</span>
              </Link>
              <Link className="px-action" href="/platform/usuarios">
                <div className="px-actionLeft">
                  <p className="px-actionTitle">Usuarios pendientes</p>
                  <p className="px-actionSub">Membresías que requieren acción</p>
                </div>
                <span className="px-pill">{summary.users.memberships_pending}</span>
              </Link>
              <Link className="px-action" href="/platform/noticias">
                <div className="px-actionLeft">
                  <p className="px-actionTitle">Contenido publicado</p>
                  <p className="px-actionSub">Noticias, campañas y sponsors activos</p>
                </div>
                <span className="px-pill">{summary.content.news_published}</span>
              </Link>
              <Link className="px-action" href="/platform/liquidaciones">
                <div className="px-actionLeft">
                  <p className="px-actionTitle">Liquidaciones</p>
                  <p className="px-actionSub">Pendientes, aprobadas y pagadas</p>
                </div>
                <span className="px-pill">{summary.finance.settlements_pending}/{summary.finance.settlements_approved}/{summary.finance.settlements_paid}</span>
              </Link>
            </div>
          </section>

          <aside className="px-platformAsideStack">
            <div className="px-platformCard">
              <div className="px-sectionTitle">Clubes recientes</div>
              {summary.clubs.recent.length ? (
                <div className="px-actions">
                  {summary.clubs.recent.map((club) => (
                    <Link key={club.id} className="px-action" href={`/platform/clubs?focus=${club.id}`}>
                      <div className="px-actionLeft">
                        <p className="px-actionTitle">{club.name}</p>
                        <p className="px-actionSub">{club.city || 'Sin ciudad'} · {formatDate(club.created_at)}</p>
                      </div>
                      <span className={`px-statusBadge ${clubStatusBadgeClass(club.status)}`}>{clubStatusLabel(club.status)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-empty">Sin clubes recientes.</div>
              )}
            </div>

            <div className="px-platformCard">
              <div className="px-sectionTitle">Finanzas recientes</div>
              <div className="px-platformMiniStats">
                <div><span>Pending</span><strong>{summary.finance.settlements_pending}</strong></div>
                <div><span>Approved</span><strong>{summary.finance.settlements_approved}</strong></div>
                <div><span>Paid</span><strong>{summary.finance.settlements_paid}</strong></div>
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {summary.finance.recent_payments.slice(0, 4).map((payment) => (
                  <div key={payment.id} className="px-platformMiniRow">
                    <span>{formatDate(payment.paid_at || payment.created_at)}</span>
                    <strong>{money(payment.amount, payment.currency || 'ARS')}</strong>
                    <em>{payment.status}</em>
                  </div>
                ))}
                {!summary.finance.recent_payments.length ? <div className="px-empty">Sin pagos recientes.</div> : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
