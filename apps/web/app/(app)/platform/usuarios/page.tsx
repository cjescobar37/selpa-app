'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { membershipStatusBadgeClass, membershipStatusLabel } from '@/lib/platformStatus'

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
  user_status: 'ACTIVE' | 'SUSPENDED' | string
  suspended_at: string | null
  suspended_by: string | null
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

function isUserSuspended(row: MembershipRow | null) {
  return row?.user_status === 'SUSPENDED'
}

export default function PlatformUsuariosPage() {
  const pageSizeOptions = [30, 50]
  const defaultPageSize = pageSizeOptions[0]
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MembershipRow[]>([])
  const [clubs, setClubs] = useState<ClubsFilter[]>([])
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, rejected: 0, suspended: 0 })
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
    setSummary(json?.summary ?? { total: 0, approved: 0, pending: 0, rejected: 0, suspended: 0 })
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
      const byStatus =
        statusFilter === 'all'
          || (statusFilter === 'SUSPENDED' ? row.user_status === 'SUSPENDED' : row.status === statusFilter)
      const byQuery =
        !q ||
        row.user_name.toLowerCase().includes(q) ||
        (row.user_email ?? '').toLowerCase().includes(q) ||
        row.club_name.toLowerCase().includes(q)
      return byClub && byStatus && byQuery
    })
  }, [rows, clubFilter, statusFilter, query])

  const selected = filtered.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? filtered[0] ?? null
  const paginationSummary = `Mostrando ${Math.min(filtered.length, defaultPageSize)} de ${filtered.length} usuarios`

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

  async function handleUserStatus(row: MembershipRow, action: 'suspend_user' | 'reactivate_user') {
    if (action === 'suspend_user' && !window.confirm(`Vas a suspender globalmente a ${row.user_name}.`)) return

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId(`user:${row.user_id}`)
    const res = await fetch('/api/platform/users-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId: row.user_id, action }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude actualizar el estado global', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({
      variant: 'success',
      title: action === 'suspend_user' ? 'Usuario suspendido' : 'Usuario reactivado',
      message: action === 'suspend_user'
        ? 'El usuario mantiene su cuenta, pero queda bloqueado para acciones de jugador.'
        : 'El usuario vuelve a quedar habilitado globalmente.',
    })
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
          <div className="px-platformMetricCard"><span>Suspendidos</span><strong>{summary.suspended}</strong></div>
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
                  <option value="SUSPENDED">Suspendidos</option>
                </select>
              </label>
            </div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando usuarios…</div>
              ) : filtered.length ? (
                <>
                  <div className="px-platformUsersDesktop" role="region" aria-label="Listado de usuarios">
                    <table className="px-table px-table--platform">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Club</th>
                          <th>Rol</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => {
                          const isSelected = selected?.id === row.id
                          return (
                            <tr
                              key={row.id}
                              className={isSelected ? 'is-selected' : ''}
                              onClick={() => setSelectedId(row.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setSelectedId(row.id)
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-pressed={isSelected}
                            >
                              <td>
                                <div className="px-platformEntityCell">
                                  <div className="px-platformEntityLogo">
                                    {row.avatar_url ? <img src={row.avatar_url} alt={row.user_name} /> : <span>{row.user_name.slice(0, 1).toUpperCase()}</span>}
                                  </div>
                                  <div className="px-platformUserMeta">
                                    <strong>{row.user_name}</strong>
                                    <span>{row.user_email || 'Sin email'}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className="px-platformUserMeta">
                                  <strong>{row.club_name}</strong>
                                  <span>{row.club_city || 'Ciudad sin definir'}</span>
                                </div>
                              </td>
                              <td>
                                <span className="px-platformRoleValue">{row.role}</span>
                              </td>
                              <td>
                                <div className="px-platformUserStatusCell">
                                  {isUserSuspended(row) ? (
                                    <span className="px-statusBadge is-danger">Suspendido</span>
                                  ) : (
                                    <span className={`px-statusBadge ${membershipStatusBadgeClass(row.status)}`}>{membershipStatusLabel(row.status)}</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-platformUsersMobile" aria-label="Listado compacto de usuarios">
                    {filtered.map((row) => {
                      const isSelected = selected?.id === row.id
                      return (
                        <button
                          key={row.id}
                          type="button"
                          className={`px-platformUserCard${isSelected ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <div className="px-platformUserCardTop">
                            <div className="px-platformEntityCell">
                              <div className="px-platformEntityLogo">
                                {row.avatar_url ? <img src={row.avatar_url} alt={row.user_name} /> : <span>{row.user_name.slice(0, 1).toUpperCase()}</span>}
                              </div>
                              <div className="px-platformUserMeta">
                                <strong>{row.user_name}</strong>
                                <span>{row.club_name}</span>
                              </div>
                            </div>
                            {isUserSuspended(row) ? (
                              <span className="px-statusBadge is-danger">Suspendido</span>
                            ) : (
                              <span className={`px-statusBadge ${membershipStatusBadgeClass(row.status)}`}>{membershipStatusLabel(row.status)}</span>
                            )}
                          </div>
                          <div className="px-platformUserCardFoot">
                            <span>{row.role}</span>
                            <span>{formatDate(row.created_at)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="px-empty">No encontré usuarios con esos filtros.</div>
              )}
            </div>

            <div className="px-platformPaginationStub" aria-label="Paginación prevista">
              <div className="px-platformPaginationSummary">{paginationSummary}</div>
              <div className="px-platformPaginationControls">
                <div className="px-platformPageSize">
                  <span>Filas por página</span>
                  <div className="px-platformPageSizeValue">{defaultPageSize}</div>
                </div>
                <div className="px-platformPageButtons" aria-hidden="true">
                  <button className="px-btn px-btn--ghost" type="button" disabled>Anterior</button>
                  <button className="px-btn px-btn--ghost" type="button" disabled>Siguiente</button>
                </div>
              </div>
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
                      <div className="px-platformDetailSub">
                        {selected.user_email || 'Sin email'} · {selected.club_name}
                        <span className={`px-statusBadge ${isUserSuspended(selected) ? 'is-danger' : membershipStatusBadgeClass(selected.status)}`} style={{ marginLeft: 10 }}>
                          {isUserSuspended(selected) ? 'Suspendido' : membershipStatusLabel(selected.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-platformDetailFacts">
                    <div><span>Club</span><strong>{selected.club_name}</strong></div>
                    <div><span>Ciudad</span><strong>{selected.club_city || 'Sin definir'}</strong></div>
                    <div><span>Rol solicitado</span><strong>{selected.role}</strong></div>
                    <div><span>Estado membresía</span><strong>{membershipStatusLabel(selected.status)}</strong></div>
                    <div><span>Estado global</span><strong>{isUserSuspended(selected) ? 'Suspendido' : 'Activo'}</strong></div>
                    <div><span>Fecha de alta</span><strong>{formatDate(selected.created_at)}</strong></div>
                    <div><span>Aprobado el</span><strong>{formatDate(selected.approved_at)}</strong></div>
                    <div><span>Suspendido el</span><strong>{formatDate(selected.suspended_at)}</strong></div>
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
                  ) : null}

                  <div className="px-platformFutureActions">
                    {isUserSuspended(selected) ? (
                      <button className="px-btn px-btn--soft" type="button" disabled={busyId === `user:${selected.user_id}`} onClick={() => handleUserStatus(selected, 'reactivate_user')}>Reactivar usuario</button>
                    ) : (
                      <button className="px-btn px-btn--danger" type="button" disabled={busyId === `user:${selected.user_id}`} onClick={() => handleUserStatus(selected, 'suspend_user')}>Suspender usuario</button>
                    )}
                  </div>
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

      <style jsx>{`
        .px-platformHead,
        .px-platformFilters,
        .px-platformDetailFacts,
        .px-platformChecklist {
          gap: 14px;
        }

        .px-platformCard {
          border-radius: 8px;
        }

        .px-platformAdminMain {
          gap: 14px;
        }

        .px-platformAdminMain,
        .px-platformDetailCard {
          padding: 18px;
        }

        .px-sectionTitle {
          margin-bottom: 14px;
        }

        .px-platformTableWrap {
          overflow: hidden;
          min-width: 0;
          border-radius: 8px;
        }

        .px-platformAdminLayout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 16px;
          align-items: start;
        }

        .px-platformAdminMain,
        .px-platformAsideStack,
        .px-platformCard {
          min-width: 0;
        }

        .px-platformUsersDesktop {
          display: block;
          overflow: hidden;
        }

        .px-platformUsersDesktop :global(.px-table) {
          width: 100%;
          table-layout: fixed;
        }

        .px-platformUsersDesktop :global(th:nth-child(1)),
        .px-platformUsersDesktop :global(td:nth-child(1)) {
          width: 36%;
        }

        .px-platformUsersDesktop :global(th:nth-child(2)),
        .px-platformUsersDesktop :global(td:nth-child(2)) {
          width: 28%;
        }

        .px-platformUsersDesktop :global(th:nth-child(3)),
        .px-platformUsersDesktop :global(td:nth-child(3)) {
          width: 14%;
        }

        .px-platformUsersDesktop :global(th:nth-child(4)),
        .px-platformUsersDesktop :global(td:nth-child(4)) {
          width: 22%;
        }

        .px-platformUsersDesktop :global(tbody tr) {
          cursor: pointer;
          transition: background-color 0.18s ease, box-shadow 0.18s ease;
        }

        .px-platformUsersDesktop :global(tbody tr:hover),
        .px-platformUsersDesktop :global(tbody tr:focus-visible) {
          background: rgba(15, 23, 42, 0.04);
          outline: none;
        }

        .px-platformUsersDesktop :global(td),
        .px-platformUsersDesktop :global(th) {
          vertical-align: middle;
        }

        .px-platformUsersDesktop :global(tbody tr.is-selected) {
          background: rgba(14, 116, 144, 0.08);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformUsersDesktop :global(td),
        .px-platformUsersDesktop :global(th) {
          padding-top: 10px;
          padding-bottom: 10px;
        }

        .px-platformUsersDesktop :global(th) {
          font-size: 0.72rem;
        }

        .px-platformEntityCell {
          min-width: 0;
          gap: 10px;
        }

        .px-platformUserMeta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .px-platformUserMeta strong,
        .px-platformUserMeta span,
        .px-platformRoleValue {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .px-platformUserMeta strong,
        .px-platformRoleValue {
          color: #0f172a;
          font-size: 0.9rem;
          line-height: 1.2;
        }

        .px-platformRoleValue {
          display: block;
          width: 100%;
          min-width: 0;
          font-size: 0.84rem;
        }

        .px-platformUserStatusCell {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-width: 0;
          width: 100%;
          overflow: visible;
        }

        .px-platformUserMeta span {
          color: #64748b;
          font-size: 0.78rem;
          line-height: 1.2;
        }

        .px-platformEntityLogo {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          flex: 0 0 34px;
        }

        .px-platformUsersDesktop :global(.px-statusBadge) {
          min-height: 24px;
          padding: 0 8px;
          font-size: 0.72rem;
        }

        .px-platformPaginationStub {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.18);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .px-platformPaginationSummary {
          color: #64748b;
          font-size: 0.82rem;
        }

        .px-platformPaginationControls,
        .px-platformPageButtons,
        .px-platformPageSize {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .px-platformPageSize {
          color: #64748b;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .px-platformPageSizeValue {
          min-width: 42px;
          height: 30px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(248, 250, 252, 0.96);
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .px-platformUsersMobile {
          display: none;
        }

        .px-platformUserCard {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 8px;
          background: #fff;
          padding: 14px;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
        }

        .px-platformUserCard:hover,
        .px-platformUserCard:focus-visible {
          border-color: rgba(14, 116, 144, 0.45);
          background: rgba(248, 250, 252, 0.96);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          outline: none;
        }

        .px-platformUserCard.is-selected {
          border-color: rgba(14, 116, 144, 0.72);
          background: rgba(14, 116, 144, 0.06);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformUserCardTop,
        .px-platformUserCardFoot {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .px-platformUserCardTop :global(.px-platformEntityCell) {
          min-width: 0;
          flex: 1;
        }

        .px-platformUserCardFoot {
          color: #64748b;
          font-size: 0.85rem;
        }

        :global(.px-statusBadge) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        :global(.px-statusBadge.is-success) {
          background: rgba(22, 163, 74, 0.12);
          color: #166534;
          border-color: rgba(22, 163, 74, 0.18);
        }

        :global(.px-statusBadge.is-warning) {
          background: rgba(245, 158, 11, 0.14);
          color: #92400e;
          border-color: rgba(245, 158, 11, 0.2);
        }

        :global(.px-statusBadge.is-danger) {
          background: rgba(239, 68, 68, 0.12);
          color: #b91c1c;
          border-color: rgba(239, 68, 68, 0.18);
        }

        .px-platformDetailHero {
          gap: 14px;
          margin-bottom: 16px;
        }

        .px-platformDetailTitle {
          color: #0f172a;
          font-size: 1.1rem;
          font-weight: 800;
        }

        .px-platformDetailSub {
          color: #64748b;
          font-size: 0.92rem;
          line-height: 1.35;
          word-break: break-word;
        }

        .px-platformDetailFacts > div {
          gap: 6px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .px-platformDetailFacts > div:last-child {
          border-bottom: 0;
        }

        .px-platformDetailFacts span {
          color: #64748b;
          font-size: 0.82rem;
        }

        .px-platformDetailFacts strong {
          color: #0f172a;
          font-size: 0.94rem;
          line-height: 1.35;
          word-break: break-word;
        }

        .px-platformFutureActions {
          margin-top: 16px;
          gap: 10px;
        }

        @media (max-width: 900px) {
          .px-platformHead {
            align-items: flex-start;
          }

          .px-platformAdminLayout {
            grid-template-columns: minmax(0, 1fr);
          }

          .px-platformUsersDesktop {
            display: none;
          }

          .px-platformUsersMobile {
            display: grid;
            gap: 10px;
          }

          .px-platformAdminMain,
          .px-platformDetailCard {
            padding: 16px;
          }

          .px-platformPaginationStub {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 640px) {
          .px-platformUserCardTop,
          .px-platformUserCardFoot {
            align-items: stretch;
            flex-direction: column;
          }

          .px-platformUserCardTop :global(.px-statusBadge) {
            align-self: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
