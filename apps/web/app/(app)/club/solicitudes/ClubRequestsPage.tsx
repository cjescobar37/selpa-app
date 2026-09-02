'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'

type RequestTab = 'todas' | 'altas' | 'bajas' | 'pagos'
type MembershipRequest = { id: string; name: string; email: string | null; created_at: string }
type CancellationRequest = { id: string; tournament_id: string; registration_id: string; team_name: string; tournament_name: string; reason: string | null; refund_percent: number | null; refund_policy_label: string | null; created_at: string }
type PaymentRequest = { id: string; tournament_id: string | null; registration_id: string; team_name: string; tournament_name: string; amount: number | null; method: string | null; requested_at: string | null; created_at: string }

function dateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function paymentMethodLabel(value?: string | null) {
  const method = String(value ?? '').toUpperCase()
  if (method === 'CASH_ON_SITE_REQUEST') return 'Pago en club'
  if (method === 'TRANSFER') return 'Transferencia'
  return method.replaceAll('_', ' ') || 'Pago'
}

export default function ClubRequestsPage() {
  const { activeClub } = useSession()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const focusRequestId = searchParams.get('requestId')
  const [tab, setTab] = useState<RequestTab>(requestedTab === 'altas' || requestedTab === 'bajas' || requestedTab === 'pagos' ? requestedTab : 'todas')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [memberships, setMemberships] = useState<MembershipRequest[]>([])
  const [cancellations, setCancellations] = useState<CancellationRequest[]>([])
  const [payments, setPayments] = useState<PaymentRequest[]>([])

  async function load() {
    if (!activeClub?.id) return
    setLoading(true)
    setMessage('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { setMessage('Sesión inválida.'); setLoading(false); return }
    const response = await fetch(`/api/clubs/${activeClub.id}/requests`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) { setMessage(json.error ?? 'No pude cargar las solicitudes.'); setLoading(false); return }
    setMemberships(json.memberships ?? [])
    setCancellations(json.cancellations ?? [])
    setPayments(json.payments ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    if (requestedTab === 'altas' || requestedTab === 'bajas' || requestedTab === 'pagos') setTab(requestedTab)
  }, [requestedTab])

  useEffect(() => {
    if (!focusRequestId || loading) return
    window.requestAnimationFrame(() => document.getElementById(`request-${focusRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focusRequestId, loading])

  async function resolveCancellation(request: CancellationRequest, status: 'APPROVED' | 'REJECTED') {
    if (!activeClub?.id) return
    setSavingId(request.id)
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { setMessage('Sesión inválida.'); setSavingId(null); return }
    const response = await fetch(`/api/clubs/${activeClub.id}/registration-change-requests/${request.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    const json = await response.json().catch(() => ({}))
    setSavingId(null)
    if (!response.ok) { setMessage(json.error ?? 'No pude resolver la baja.'); return }
    setMessage(status === 'APPROVED' ? 'Baja aprobada y notificada.' : 'Baja rechazada y notificada.')
    setCancellations((current) => current.filter((item) => item.id !== request.id))
  }

  async function resolvePayment(request: PaymentRequest, status: 'APPROVED' | 'REJECTED') {
    if (!activeClub?.id) return
    setSavingId(request.id)
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { setMessage('Sesión inválida.'); setSavingId(null); return }
    const response = await fetch(`/api/clubs/${activeClub.id}/payments/${request.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    const json = await response.json().catch(() => ({}))
    setSavingId(null)
    if (!response.ok) { setMessage(json.error ?? 'No pude resolver el pago.'); return }
    setMessage(status === 'APPROVED' ? 'Pago aprobado y notificado.' : 'Pago rechazado y notificado.')
    setPayments((current) => current.filter((item) => item.id !== request.id))
  }

  const total = memberships.length + cancellations.length + payments.length
  const visible = useMemo(() => ({
    memberships: tab === 'todas' || tab === 'altas' ? memberships : [],
    cancellations: tab === 'todas' || tab === 'bajas' ? cancellations : [],
    payments: tab === 'todas' || tab === 'pagos' ? payments : [],
  }), [cancellations, memberships, payments, tab])

  const tabs: Array<{ id: RequestTab; label: string; count: number }> = [
    { id: 'todas', label: 'Todas', count: total },
    { id: 'altas', label: 'Altas', count: memberships.length },
    { id: 'bajas', label: 'Bajas', count: cancellations.length },
    { id: 'pagos', label: 'Pagos', count: payments.length },
  ]

  return <main className="club-requestsPage">
    <header className="club-requestsHero">
      <span>Centro operativo</span>
      <h1>Solicitudes</h1>
      <p>Todo lo que necesita una decisión, reunido en una sola bandeja.</p>
    </header>

    <nav className="club-requestsTabs" aria-label="Filtrar solicitudes">
      {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}><span>{item.label}</span><b>{item.count}</b></button>)}
    </nav>

    {message ? <p className="club-requestsMessage">{message}</p> : null}
    {loading ? <div className="club-requestsEmpty">Cargando solicitudes...</div> : null}
    {!loading && total === 0 ? <div className="club-requestsEmpty"><strong>Todo al día</strong><span>No hay solicitudes pendientes para resolver.</span></div> : null}

    {!loading && visible.memberships.length > 0 ? <section className="club-requestsSection">
      <div className="club-requestsSectionHead"><div><span>Altas al club</span><h2>Personas que quieren sumarse</h2></div><b>{visible.memberships.length}</b></div>
      {visible.memberships.map((request) => <article key={request.id} id={`request-${request.id}`} className="club-requestItem">
        <div><strong>{request.name}</strong><span>{request.email ?? 'Sin email'} · {dateTime(request.created_at)}</span></div>
        <Link href="/club/jugadores?tab=solicitudes">Revisar</Link>
      </article>)}
    </section> : null}

    {!loading && visible.cancellations.length > 0 ? <section className="club-requestsSection club-requestsSection--cancellations">
      <div className="club-requestsSectionHead"><div><span>Bajas de torneo</span><h2>Parejas que solicitaron baja</h2></div><b>{visible.cancellations.length}</b></div>
      {visible.cancellations.map((request) => <article key={request.id} id={`request-${request.id}`} className={`club-requestItem club-requestItem--decision ${focusRequestId === request.id ? 'is-focused' : ''}`}>
        <div><strong>{request.team_name}</strong><span>{request.tournament_name} · {dateTime(request.created_at)}</span>{request.reason ? <small>Motivo: {request.reason}</small> : null}<em>Reintegro estimado: {request.refund_percent ?? 'A definir'}%</em></div>
        <div className="club-requestActions"><button type="button" disabled={savingId === request.id} onClick={() => resolveCancellation(request, 'REJECTED')}>Rechazar</button><button type="button" disabled={savingId === request.id} onClick={() => resolveCancellation(request, 'APPROVED')}>Aprobar baja</button></div>
      </article>)}
    </section> : null}

    {!loading && visible.payments.length > 0 ? <section className="club-requestsSection">
      <div className="club-requestsSectionHead"><div><span>Pagos</span><h2>Pagos por revisar</h2></div><b>{visible.payments.length}</b></div>
      {visible.payments.map((request) => <article key={request.id} id={`request-${request.id}`} className="club-requestItem">
        <div><strong>{request.team_name}</strong><span>{request.tournament_name} · {dateTime(request.requested_at ?? request.created_at)}</span><em>{paymentMethodLabel(request.method)}{request.amount !== null ? ` · $${request.amount.toLocaleString('es-AR')}` : ''}</em></div>
        <div className="club-requestActions"><button type="button" disabled={savingId === request.id} onClick={() => resolvePayment(request, 'REJECTED')}>Rechazar</button><button type="button" disabled={savingId === request.id} onClick={() => resolvePayment(request, 'APPROVED')}>Aprobar</button></div>
      </article>)}
    </section> : null}

    {!loading && total > 0 && !visible.memberships.length && !visible.cancellations.length && !visible.payments.length ? <div className="club-requestsEmpty">No hay solicitudes de este tipo.</div> : null}

    <style jsx>{`
      .club-requestsPage { display:grid; gap:14px; margin:0 auto; max-width:900px; padding:18px 16px 42px; }
      .club-requestsHero { background:linear-gradient(135deg,#061b3a,#123764); border-radius:18px; color:#fff; display:grid; gap:4px; padding:17px; }
      .club-requestsHero span,.club-requestsSectionHead span { color:#57d8ee; font-size:10px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
      .club-requestsHero h1 { font-size:26px; line-height:1; margin:0; } .club-requestsHero p { color:#dbeafe; font-size:13px; margin:0; }
      .club-requestsTabs { display:grid; gap:7px; grid-template-columns:repeat(4,minmax(0,1fr)); } .club-requestsTabs button { align-items:center; background:#fff; border:1px solid #dce5ef; border-radius:999px; color:#51647e; cursor:pointer; display:flex; font-size:12px; font-weight:750; gap:5px; justify-content:center; min-height:38px; min-width:0; padding:7px 8px; } .club-requestsTabs button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .club-requestsTabs button b,.club-requestsSectionHead > b { align-items:center; background:#edf2f7; border-radius:999px; color:#17253f; display:inline-flex; flex:0 0 auto; font-size:10px; justify-content:center; min-width:20px; padding:3px 6px; } .club-requestsTabs button.is-active { background:#061b3a; border-color:#061b3a; color:#fff; } .club-requestsTabs button.is-active b { background:#fff; color:#061b3a; }
      .club-requestsSection { background:#fff; border:1px solid #e2e8f0; border-radius:15px; display:grid; gap:5px; overflow:hidden; padding:10px; } .club-requestsSection--cancellations { border-color:#f7c8df; }
      .club-requestsSectionHead { align-items:center; display:flex; justify-content:space-between; padding:2px 2px 7px; } .club-requestsSectionHead h2 { color:#102340; font-size:17px; line-height:1.1; margin:2px 0 0; }
      .club-requestItem { align-items:center; border-top:1px solid #edf2f7; display:grid; gap:10px; grid-template-columns:minmax(0,1fr) auto; min-width:0; padding:9px 2px; } .club-requestItem > div:first-child { display:grid; gap:2px; min-width:0; } .club-requestItem strong { color:#102340; font-size:13px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .club-requestItem span,.club-requestItem small,.club-requestItem em { color:#667991; font-size:11px; font-style:normal; line-height:1.25; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .club-requestItem em { color:#9d174d; font-weight:750; }
      .club-requestItem > a,.club-requestActions button { background:#fff; border:1px solid #bfd8b2; border-radius:9px; color:#356d1b; font-size:11px; font-weight:800; min-height:32px; padding:7px 9px; text-decoration:none; white-space:nowrap; } .club-requestActions { display:flex; gap:6px; } .club-requestActions button:first-child { border-color:#f4c6d7; color:#b42357; } .club-requestActions button:last-child { background:#061b3a; border-color:#061b3a; color:#fff; }
      .club-requestItem.is-focused { background:#fff7fb; box-shadow:inset 3px 0 #ec4899; margin-inline:-4px; padding-inline:6px; } .club-requestsEmpty,.club-requestsMessage { background:#fff; border:1px dashed #cad6e2; border-radius:14px; color:#667991; display:grid; gap:3px; padding:16px; text-align:center; } .club-requestsEmpty strong { color:#102340; }
      @media (max-width:560px) { .club-requestsPage { gap:11px; padding:12px 14px 34px; } .club-requestsHero { border-radius:15px; padding:14px; } .club-requestsHero h1 { font-size:23px; } .club-requestsHero p { font-size:12px; } .club-requestsTabs { gap:5px; } .club-requestsTabs button { font-size:10px; gap:3px; min-height:34px; padding:5px 4px; } .club-requestsTabs button b { font-size:9px; min-width:17px; padding:3px 5px; } .club-requestsSection { border-radius:13px; padding:9px; } .club-requestItem { gap:7px; padding:8px 1px; } .club-requestItem strong { font-size:12px; } .club-requestActions { display:flex; } .club-requestActions button { min-height:29px; padding:5px 7px; } }
    `}</style>
  </main>
}
