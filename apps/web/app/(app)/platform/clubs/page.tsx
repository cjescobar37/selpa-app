'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { clubStatusBadgeClass, clubStatusLabel } from '@/lib/platformStatus'

type ClubRow = {
  id: string
  name: string
  city: string | null
  is_active: boolean | null
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  created_at: string
  logo_url: string | null
  owner_name: string
  owner_email: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  correction_requested_at: string | null
  correction_reason: string | null
  suspended_at: string | null
  suspension_reason: string | null
  approved_members_count: number
  pending_members_count: number
  tournaments_count: number
}

type ClubStatusFilter = 'all' | ClubRow['status']
type ClubAction = 'approve' | 'reject' | 'request_changes' | 'suspend'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return value
  }
}

export default function PlatformClubsPage() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClubStatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setError('Sesión expirada.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/platform/clubs-admin', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(json?.error ?? 'No pude traer clubes.')
      setLoading(false)
      return
    }

    const rows = (json?.rows ?? []) as ClubRow[]
    setClubs(rows)
    setSelectedId((current) => current ?? rows[0]?.id ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      load()
    }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clubs.filter((club) => {
      const byStatus =
        statusFilter === 'all'
          ? true
          : club.status === statusFilter

      const byQuery =
        !q ||
        club.name.toLowerCase().includes(q) ||
        (club.city ?? '').toLowerCase().includes(q) ||
        (club.owner_name ?? '').toLowerCase().includes(q)

      return byStatus && byQuery
    })
  }, [clubs, query, statusFilter])

  const selectedClub = filtered.find((club) => club.id === selectedId) ?? clubs.find((club) => club.id === selectedId) ?? filtered[0] ?? null

  const summary = {
    total: clubs.length,
    active: clubs.filter((club) => club.status === 'ACTIVE').length,
    pendingApproval: clubs.filter((club) => club.status === 'PENDING_APPROVAL').length,
    rejected: clubs.filter((club) => club.status === 'REJECTED').length,
    suspended: clubs.filter((club) => club.status === 'SUSPENDED').length,
    pending: clubs.reduce((acc, club) => acc + (club.pending_members_count || 0), 0),
  }

  function latestReviewReason(club: ClubRow) {
    if (club.status === 'REJECTED') return club.rejection_reason
    if (club.status === 'SUSPENDED') return club.suspension_reason
    return club.correction_reason
  }

  function getClubStatusLabel(club: ClubRow) {
    return clubStatusLabel(club.status, { correctionRequested: Boolean(club.correction_requested_at) })
  }

  function getClubStatusBadgeClass(club: ClubRow) {
    return clubStatusBadgeClass(club.status, { correctionRequested: Boolean(club.correction_requested_at) })
  }

  async function applyClubAction(club: ClubRow, action: ClubAction) {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    let reason = ''
    if (action === 'reject' || action === 'request_changes' || action === 'suspend') {
      const label =
        action === 'reject'
          ? 'rechazo'
          : action === 'request_changes'
            ? 'correcciones'
            : 'suspensión'
      reason = window.prompt(`Motivo de ${label} para ${club.name}`)?.trim() ?? ''
      if (!reason) {
        setAlert({ variant: 'warning', title: 'Falta motivo', message: 'Indicá un motivo para registrar la acción.' })
        return
      }
    }

    setBusyId(club.id)
    const res = await fetch('/api/platform/clubs-admin', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clubId: club.id, action, reason }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude actualizar el club', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({
      variant: 'success',
      title: 'Estado actualizado',
      message: `${club.name} quedó como ${clubStatusLabel(json?.club?.status ?? club.status)}.`,
    })
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--clubs">
        <div className="px-platformHead">
          <div>
            <h1 className="px-platformTitle">Administración de clubes</h1>
            <div className="px-platformSub">Gestioná el padrón de clubes activos, estados operativos y próximos módulos de plataforma.</div>
          </div>
          <div className="px-toolbar">
            <Link className="px-btn" href="/platform/clubs/nuevo">Alta de club</Link>
            <button className="px-btn px-btn--ghost" type="button" onClick={load} disabled={loading}>
              {loading ? (<><span className="px-spinner" /> Recargando…</>) : 'Recargar'}
            </button>
          </div>
        </div>

        <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
          <div className="px-platformMetricCard">
            <span>Total clubes</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="px-platformMetricCard">
            <span>Activos</span>
            <strong>{summary.active}</strong>
          </div>
          <div className="px-platformMetricCard">
            <span>Suspendidos</span>
            <strong>{summary.suspended}</strong>
          </div>
          <div className="px-platformMetricCard">
            <span>Pendientes revisión</span>
            <strong>{summary.pendingApproval}</strong>
          </div>
          <div className="px-platformMetricCard">
            <span>Rechazados</span>
            <strong>{summary.rejected}</strong>
          </div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer clubes" message={error} /></div> : null}

        <div className="px-platformAdminLayout">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters">
              <label className="px-platformFilterField">
                <span>Buscar club</span>
                <input className="px-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Club, ciudad o responsable" />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Estado</span>
                <select className="px-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ClubStatusFilter)}>
                  <option value="all">Todos</option>
                  <option value="PENDING_APPROVAL">Pendientes</option>
                  <option value="ACTIVE">Activos</option>
                  <option value="REJECTED">Rechazados</option>
                  <option value="SUSPENDED">Suspendidos</option>
                </select>
              </label>
            </div>

            <div className="px-platformTableWrap">
              {loading ? (
                <div className="px-empty">Cargando clubes…</div>
              ) : filtered.length ? (
                <>
                  <div className="px-platformClubsDesktop" role="region" aria-label="Listado de clubes">
                    <table className="px-table px-table--platform">
                      <thead>
                        <tr>
                          <th>Club</th>
                          <th>Ciudad</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((club) => {
                          const isSelected = selectedClub?.id === club.id
                          return (
                            <tr
                              key={club.id}
                              className={isSelected ? 'is-selected' : ''}
                              onClick={() => setSelectedId(club.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setSelectedId(club.id)
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-pressed={isSelected}
                            >
                              <td>
                                <div className="px-platformEntityCell">
                                  <div className="px-platformEntityLogo">
                                    {club.logo_url ? <img src={club.logo_url} alt={club.name} /> : <span>{club.name.slice(0, 2).toUpperCase()}</span>}
                                  </div>
                                  <div className="px-platformClubMeta">
                                    <strong>{club.name}</strong>
                                    <span>Alta {formatDate(club.created_at)}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="px-platformCityCell">
                                  <span className="px-platformCityValue">{club.city || 'Ciudad sin definir'}</span>
                                </span>
                              </td>
                              <td>
                                <div className="px-platformStatusCell">
                                  <span className={`px-statusBadge ${getClubStatusBadgeClass(club)}`}>
                                    {getClubStatusLabel(club)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-platformClubsMobile" aria-label="Listado compacto de clubes">
                    {filtered.map((club) => {
                      const isSelected = selectedClub?.id === club.id
                      return (
                        <button
                          key={club.id}
                          type="button"
                          className={`px-platformClubCard${isSelected ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(club.id)}
                        >
                          <div className="px-platformClubCardTop">
                            <div className="px-platformEntityCell">
                              <div className="px-platformEntityLogo">
                                {club.logo_url ? <img src={club.logo_url} alt={club.name} /> : <span>{club.name.slice(0, 2).toUpperCase()}</span>}
                              </div>
                              <div className="px-platformClubMeta">
                                <strong>{club.name}</strong>
                                <span>{club.city || 'Ciudad sin definir'}</span>
                              </div>
                            </div>
                            <span className={`px-statusBadge ${getClubStatusBadgeClass(club)}`}>
                              {getClubStatusLabel(club)}
                            </span>
                          </div>
                          <div className="px-platformClubCardFoot">Alta {formatDate(club.created_at)}</div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="px-empty">No encontré clubes con esos filtros.</div>
              )}
            </div>
          </section>

          <aside className="px-platformAsideStack">
            <div className="px-platformCard px-platformDetailCard">
              <div className="px-sectionTitle">Ficha del club</div>
              {selectedClub ? (
                <>
                  <div className="px-platformDetailHero">
                    <div className="px-platformEntityLogo px-platformEntityLogo--lg">
                      {selectedClub.logo_url ? <img src={selectedClub.logo_url} alt={selectedClub.name} /> : <span>{selectedClub.name.slice(0, 2).toUpperCase()}</span>}
                    </div>
                    <div>
                      <div className="px-platformDetailTitle">{selectedClub.name}</div>
                      <div className="px-platformDetailSub">
                        {selectedClub.city || 'Ciudad sin definir'}
                        <span className={`px-statusBadge ${getClubStatusBadgeClass(selectedClub)}`} style={{ marginLeft: 10 }}>
                          {getClubStatusLabel(selectedClub)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-platformDetailFacts">
                    <div><span>Responsable</span><strong>{selectedClub.owner_name}</strong></div>
                    <div><span>Email</span><strong>{selectedClub.owner_email || 'No informado'}</strong></div>
                    <div><span>Jugadores activos</span><strong>{selectedClub.approved_members_count}</strong></div>
                    <div><span>Solicitudes pendientes</span><strong>{selectedClub.pending_members_count}</strong></div>
                    <div><span>Torneos registrados</span><strong>{selectedClub.tournaments_count}</strong></div>
                    <div><span>Estado actual</span><strong>{getClubStatusLabel(selectedClub)}</strong></div>
                    <div><span>Motivo / corrección</span><strong>{latestReviewReason(selectedClub) || 'Sin observaciones'}</strong></div>
                  </div>

                  <div className="px-platformFutureActions">
                    {selectedClub.status !== 'ACTIVE' ? (
                      <button className="px-btn px-btn--soft" type="button" disabled={busyId === selectedClub.id} onClick={() => applyClubAction(selectedClub, 'approve')}>
                        Aprobar club
                      </button>
                    ) : null}
                    {selectedClub.status === 'PENDING_APPROVAL' ? (
                      <button className="px-btn px-btn--ghost" type="button" disabled={busyId === selectedClub.id} onClick={() => applyClubAction(selectedClub, 'request_changes')}>
                        Pedir correcciones
                      </button>
                    ) : null}
                    {selectedClub.status === 'PENDING_APPROVAL' ? (
                      <button className="px-btn px-btn--danger" type="button" disabled={busyId === selectedClub.id} onClick={() => applyClubAction(selectedClub, 'reject')}>
                        Rechazar
                      </button>
                    ) : null}
                    {selectedClub.status === 'ACTIVE' ? (
                      <button className="px-btn px-btn--danger" type="button" disabled={busyId === selectedClub.id} onClick={() => applyClubAction(selectedClub, 'suspend')}>
                        Suspender club
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="px-empty">Seleccioná un club para ver su ficha.</div>
              )}
            </div>

            <div className="px-platformCard">
              <div className="px-sectionTitle">Visión de plataforma</div>
              <div className="px-platformChecklist">
                <div>Centralizá aquí acciones sensibles antes de abrir módulos más avanzados.</div>
                <div>La suspensión no elimina datos: solo corta la operación visible del club.</div>
                <div>Más adelante este panel puede sumar pagos, auditoría y métricas por sede.</div>
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

        .px-kpis--platformAdmin {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }

        .px-platformMetricCard {
          min-width: 0;
          padding: 14px 16px;
        }

        .px-platformMetricCard span,
        .px-platformMetricCard strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .px-platformDetailCard,
        .px-platformAdminMain {
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

        .px-platformClubsDesktop {
          display: block;
          overflow: hidden;
        }

        .px-platformClubsDesktop :global(.px-table) {
          width: 100%;
          table-layout: fixed;
        }

        .px-platformClubsDesktop :global(th:nth-child(1)),
        .px-platformClubsDesktop :global(td:nth-child(1)) {
          width: 50%;
        }

        .px-platformClubsDesktop :global(th:nth-child(2)),
        .px-platformClubsDesktop :global(td:nth-child(2)) {
          width: 28%;
        }

        .px-platformClubsDesktop :global(th:nth-child(3)),
        .px-platformClubsDesktop :global(td:nth-child(3)) {
          width: 22%;
        }

        .px-platformClubsDesktop :global(tbody tr) {
          cursor: pointer;
          transition: background-color 0.18s ease, box-shadow 0.18s ease;
        }

        .px-platformClubsDesktop :global(tbody tr:hover),
        .px-platformClubsDesktop :global(tbody tr:focus-visible) {
          background: rgba(15, 23, 42, 0.04);
          outline: none;
        }

        .px-platformClubsDesktop :global(td),
        .px-platformClubsDesktop :global(th) {
          vertical-align: middle;
        }

        .px-platformClubsDesktop :global(tbody tr.is-selected) {
          background: rgba(14, 116, 144, 0.08);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformEntityCell {
          min-width: 0;
          gap: 12px;
        }

        .px-platformClubMeta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .px-platformClubMeta strong,
        .px-platformCityValue {
          color: #0f172a;
          font-size: 0.96rem;
        }

        .px-platformCityCell {
          display: block;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }

        .px-platformClubMeta strong,
        .px-platformClubMeta span,
        .px-platformCityValue {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .px-platformCityValue {
          display: block;
          width: 100%;
          min-width: 0;
          max-width: 100%;
        }

        .px-platformStatusCell {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .px-platformClubMeta span {
          color: #64748b;
          font-size: 0.88rem;
        }

        .px-platformClubsMobile {
          display: none;
        }

        .px-platformClubCard {
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

        .px-platformClubCard:hover,
        .px-platformClubCard:focus-visible {
          border-color: rgba(14, 116, 144, 0.45);
          background: rgba(248, 250, 252, 0.96);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          outline: none;
        }

        .px-platformClubCard.is-selected {
          border-color: rgba(14, 116, 144, 0.72);
          background: rgba(14, 116, 144, 0.06);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformClubCardTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .px-platformClubCardTop :global(.px-platformEntityCell) {
          min-width: 0;
          flex: 1;
        }

        .px-platformClubCardFoot {
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

        :global(.px-statusBadge.is-neutral) {
          background: rgba(71, 85, 105, 0.14);
          color: #334155;
          border-color: rgba(71, 85, 105, 0.16);
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

        .px-platformAsideStack {
          width: 100%;
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
          .px-kpis--platformAdmin {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .px-platformHead {
            align-items: flex-start;
          }

          .px-platformClubsDesktop {
            display: none;
          }

          .px-platformClubsMobile {
            display: grid;
            gap: 10px;
          }

          .px-platformAdminLayout {
            grid-template-columns: minmax(0, 1fr);
          }

          .px-platformAdminMain,
          .px-platformDetailCard {
            padding: 16px;
          }
        }

        @media (max-width: 640px) {
          .px-kpis--platformAdmin {
            grid-template-columns: minmax(0, 1fr);
          }

          .px-platformClubCardTop {
            align-items: stretch;
            flex-direction: column;
          }

          .px-platformClubCardTop :global(.px-statusBadge) {
            align-self: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
