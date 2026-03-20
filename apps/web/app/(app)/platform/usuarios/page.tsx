'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type MembershipRow = {
  id: string
  club_id: string
  user_id: string
  role: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | string
  created_at: string
  approved_at: string | null
  rejection_reason: string | null
  club_name: string
  club_city: string | null
  club_is_active: boolean | null
  user_name: string
  user_email: string | null
  avatar_url: string | null
}

type ClubsFilter = { id: string; name: string }

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

function formatDate(value: string | null) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

export default function PlatformUsuariosPage() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MembershipRow[]>([])
  const [clubs, setClubs] = useState<ClubsFilter[]>([])
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 })
  const [clubFilter, setClubFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  async function load() {
    setLoading(true)
    setError(null)

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setError('Sesión expirada.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/platform/users-admin', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(json?.error ?? 'No pude traer usuarios.')
      setLoading(false)
      return
    }

    const nextRows = (json?.rows ?? []) as MembershipRow[]
    setRows(nextRows)
    setClubs((json?.clubs ?? []).map((club: any) => ({ id: club.id, name: club.name })))
    setSummary(json?.summary ?? { total: 0, approved: 0, pending: 0, rejected: 0 })
    setSelectedId((current) => current ?? nextRows[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const byClub = clubFilter === 'all' || row.club_id === clubFilter
      const byStatus = statusFilter === 'all' || row.status === statusFilter
      const byQuery =
        !q ||
        row.user_name.toLowerCase().includes(q) ||
        (row.user_email ?? '').toLowerCase().includes(q) ||
        row.club_name.toLowerCase().includes(q)
      return byClub && byStatus && byQuery
    })
  }, [rows, clubFilter, statusFilter, query])

  const selected = filtered.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? filtered[0] ?? null

  async function handleAction(row: MembershipRow, action: 'approve' | 'reject') {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    if (action === 'reject' && !rejectionReason.trim()) {
      setAlert({ variant: 'warning', title: 'Falta un motivo', message: 'Escribí un motivo antes de rechazar.' })
      return
    }

    setBusyId(row.id)
    const res = await fetch('/api/platform/users-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ membershipId: row.id, action, rejectionReason: rejectionReason.trim() || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude procesar la acción', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({
      variant: 'success',
      title: action === 'approve' ? 'Usuario aprobado' : 'Usuario rechazado',
      message: action === 'approve'
        ? 'La membresía quedó activa y se notificó al usuario.'
        : 'La solicitud quedó rechazada y se notificó al usuario.',
    })
    setRejectionReason('')
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--users">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Administración global de usuarios</h1>
            <div className="px-platformSub">Supervisá altas por club, membresías pendientes y acciones transversales desde plataforma.</div>
          </div>
          <div className="px-toolbar">
            <button className="px-btn px-btn--ghost" type="button" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
          <div className="px-platformMetricCard"><span>Total membresías</span><strong>{summary.total}</strong></div>
          <div className="px-platformMetricCard"><span>Aprobadas</span><strong>{summary.approved}</strong></div>
          <div className="px-platformMetricCard"><span>Pendientes</span><strong>{summary.pending}</strong></div>
          <div className="px-platformMetricCard"><span>Rechazadas</span><strong>{summary.rejected}</strong></div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer usuarios" message={error} /></div> : null}

        <div className="px-platformAdminLayout">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters">
              <label className="px-platformFilterField">
                <span>Buscar usuario</span>
                <input className="px-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, mail o club" />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Club</span>
                <select className="px-input" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
                  <option value="all">Todos</option>
                  {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                </select>
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Estado</span>
                <select className="px-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Todos</option>
                  <option value="APPROVED">Aprobados</option>
                  <option value="PENDING">Pendientes</option>
                  <option value="REJECTED">Rechazados</option>
                </select>
              </label>
            </div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando usuarios…</div>
              ) : filtered.length ? (
                <table className="px-table px-table--platform">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Club</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Alta</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const isSelected = selected?.id === row.id
                      const isBusy = busyId === row.id
                      return (
                        <tr key={row.id} className={isSelected ? 'is-selected' : ''} onClick={() => setSelectedId(row.id)}>
                          <td>
                            <div className="px-platformEntityCell">
                              <div className="px-platformEntityLogo">
                                {row.avatar_url ? <img src={row.avatar_url} alt={row.user_name} /> : <span>{row.user_name.slice(0, 1).toUpperCase()}</span>}
                              </div>
                              <div>
                                <strong>{row.user_name}</strong>
                                <span>{row.user_email || 'Sin email'}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="px-platformStackCell">
                              <strong>{row.club_name}</strong>
                              <span>{row.club_city || 'Ciudad sin definir'}</span>
                            </div>
                          </td>
                          <td>{row.role}</td>
                          <td><span className={`px-statusBadge ${row.status === 'APPROVED' ? 'is-success' : row.status === 'PENDING' ? 'is-warning' : 'is-danger'}`}>{row.status}</span></td>
                          <td>{formatDate(row.created_at)}</td>
                          <td>
                            <div className="px-rowActions" onClick={(e) => e.stopPropagation()}>
                              <button className="px-btn px-btn--ghost px-btn--xs" type="button" onClick={() => setSelectedId(row.id)}>Ver</button>
                              {row.status === 'PENDING' ? (
                                <>
                                  <button className="px-btn px-btn--soft px-btn--xs" type="button" disabled={isBusy} onClick={() => handleAction(row, 'approve')}>Aprobar</button>
                                  <button className="px-btn px-btn--danger px-btn--xs" type="button" disabled={isBusy} onClick={() => setSelectedId(row.id)}>Rechazar</button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-empty">No encontré usuarios con esos filtros.</div>
              )}
            </div>
          </section>

          <aside className="px-platformAsideStack">
            <div className="px-platformCard px-platformDetailCard">
              <div className="px-sectionTitle">Ficha del usuario</div>
              {selected ? (
                <>
                  <div className="px-platformDetailHero">
                    <div className="px-platformEntityLogo px-platformEntityLogo--lg">
                      {selected.avatar_url ? <img src={selected.avatar_url} alt={selected.user_name} /> : <span>{selected.user_name.slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div>
                      <div className="px-platformDetailTitle">{selected.user_name}</div>
                      <div className="px-platformDetailSub">{selected.user_email || 'Sin email'} · {selected.club_name}</div>
                    </div>
                  </div>

                  <div className="px-platformDetailFacts">
                    <div><span>Club</span><strong>{selected.club_name}</strong></div>
                    <div><span>Rol solicitado</span><strong>{selected.role}</strong></div>
                    <div><span>Estado</span><strong>{selected.status}</strong></div>
                    <div><span>Fecha de alta</span><strong>{formatDate(selected.created_at)}</strong></div>
                    <div><span>Aprobado el</span><strong>{formatDate(selected.approved_at)}</strong></div>
                    <div><span>Motivo rechazo</span><strong>{selected.rejection_reason || '—'}</strong></div>
                  </div>

                  {selected.status === 'PENDING' ? (
                    <>
                      <label className="px-platformFilterField" style={{ marginTop: 14 }}>
                        <span>Motivo de rechazo</span>
                        <textarea className="px-input" rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explicá brevemente por qué se rechaza la solicitud..." />
                      </label>
                      <div className="px-platformFutureActions">
                        <button className="px-btn px-btn--soft" type="button" disabled={busyId === selected.id} onClick={() => handleAction(selected, 'approve')}>Aprobar usuario</button>
                        <button className="px-btn px-btn--danger" type="button" disabled={busyId === selected.id} onClick={() => handleAction(selected, 'reject')}>Rechazar con motivo</button>
                      </div>
                    </>
                  ) : (
                    <div className="px-platformChecklist" style={{ marginTop: 14 }}>
                      <div>El panel ya está preparado para futuras acciones globales por usuario.</div>
                      <div>Podés sumar suspensión, auditoría o reasignación sin tocar el flujo actual.</div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-empty">Seleccioná una membresía para ver su ficha.</div>
              )}
            </div>

            <div className="px-platformCard">
              <div className="px-sectionTitle">Criterio de plataforma</div>
              <div className="px-platformChecklist">
                <div>El superadmin puede intervenir cuando un club demora o necesita soporte.</div>
                <div>Las aprobaciones mantienen el mismo flujo de notificaciones que ya dejaste funcionando.</div>
                <div>El objetivo acá es administrar a escala sin romper el contexto del club ni el navbar.</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
