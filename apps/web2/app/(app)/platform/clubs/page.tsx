'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type ClubRow = {
  id: string
  name: string
  city: string | null
  is_active: boolean | null
  created_at: string
  logo_url: string | null
  owner_name: string
  owner_email: string | null
  approved_members_count: number
  pending_members_count: number
  tournaments_count: number
}

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return value
  }
}

function shortPersonName(value: string) {
  const clean = (value || '').trim().replace(/\s+/g, ' ')
  if (!clean) return 'Sin responsable'
  if (clean.includes('@')) return clean.split('@')[0]
  const parts = clean.split(' ')
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1]}`
}

export default function PlatformClubsPage() {
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<AlertState>(null)
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clubs.filter((club) => {
      const byStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
            ? club.is_active !== false
            : club.is_active === false

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
    active: clubs.filter((club) => club.is_active !== false).length,
    inactive: clubs.filter((club) => club.is_active === false).length,
    pending: clubs.reduce((acc, club) => acc + (club.pending_members_count || 0), 0),
  }

  async function toggleClubStatus(club: ClubRow) {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    setBusyId(club.id)
    const res = await fetch('/api/platform/clubs-admin', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clubId: club.id, is_active: club.is_active === false }),
    })
    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude actualizar el club', message: json?.error ?? 'Error inesperado.' })
      return
    }

    setAlert({
      variant: 'success',
      title: club.is_active === false ? 'Club reactivado' : 'Club suspendido',
      message: `${club.name} quedó ${club.is_active === false ? 'activo nuevamente' : 'marcado como inactivo'}.`,
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
          <div className="px-platformMetricCard"><span>Total clubes</span><strong>{summary.total}</strong></div>
          <div className="px-platformMetricCard"><span>Activos</span><strong>{summary.active}</strong></div>
          <div className="px-platformMetricCard"><span>Inactivos</span><strong>{summary.inactive}</strong></div>
          <div className="px-platformMetricCard"><span>Solicitudes jugadores</span><strong>{summary.pending}</strong></div>
        </div>

        {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}
        {error ? <div style={{ marginTop: 14 }}><AuthAlert variant="error" title="No pude traer clubes" message={error} /></div> : null}

        <div className="px-platformAdminLayout px-platformAdminLayout--compact">
          <section className="px-platformCard px-platformAdminMain">
            <div className="px-platformFilters px-platformFilters--clubsCompact">
              <label className="px-platformFilterField">
                <span>Buscar club</span>
                <input className="px-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Club, ciudad o responsable" />
              </label>
              <label className="px-platformFilterField px-platformFilterField--sm">
                <span>Estado</span>
                <select className="px-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </label>
            </div>

            <div className="px-adminList">
              <div className="px-adminListHead px-adminClubRowGrid">
                <span>Club</span>
                <span>Responsable</span>
                <span>Miembros</span>
                <span>Torneos</span>
                <span>Estado</span>
                <span>Acciones</span>
              </div>

              {loading ? <div className="px-empty">Cargando clubes…</div> : null}
              {!loading && !filtered.length ? <div className="px-empty">No encontré clubes con esos filtros.</div> : null}

              {!loading && filtered.map((club) => {
                const isSelected = selectedClub?.id === club.id
                const isBusy = busyId === club.id
                return (
                  <button
                    key={club.id}
                    type="button"
                    className={`px-adminListRow px-adminClubRowGrid ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedId(club.id)}
                  >
                    <div className="px-adminPrimaryCell">
                      <div className="px-platformEntityLogo px-platformEntityLogo--mini">
                        {club.logo_url ? <img src={club.logo_url} alt={club.name} /> : <span>{club.name.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="px-adminPrimaryCopy">
                        <strong title={club.name}>{club.name}</strong>
                        <span>{formatDate(club.created_at)}</span>
                      </div>
                    </div>

                    <div className="px-adminTextCell" title={club.owner_name}>{shortPersonName(club.owner_name)}</div>
                    <div className="px-adminMiniCell">{club.approved_members_count} / {club.pending_members_count}</div>
                    <div className="px-adminMiniCell">{club.tournaments_count}</div>
                    <div><span className={`px-statusBadge ${club.is_active === false ? 'is-danger' : 'is-success'}`}>{club.is_active === false ? 'Inactivo' : 'Activo'}</span></div>
                    <div className="px-adminActionRow" onClick={(e) => e.stopPropagation()}>
                      <button className="px-btn px-btn--ghost px-btn--icon" type="button" onClick={() => setSelectedId(club.id)} title="Ver club">Ver</button>
                      <button className={`px-btn ${club.is_active === false ? 'px-btn--soft' : 'px-btn--danger'} px-btn--icon`} type="button" disabled={isBusy} onClick={() => toggleClubStatus(club)} title={club.is_active === false ? 'Reactivar club' : 'Suspender club'}>
                        {club.is_active === false ? 'On' : 'Off'}
                      </button>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="px-platformAsideStack">
            <div className="px-platformCard px-platformDetailCard px-platformDetailCard--compact">
              <div className="px-sectionTitle">Ficha del club</div>
              {selectedClub ? (
                <>
                  <div className="px-platformDetailHero px-platformDetailHero--compact">
                    <div className="px-platformEntityLogo px-platformEntityLogo--lg">
                      {selectedClub.logo_url ? <img src={selectedClub.logo_url} alt={selectedClub.name} /> : <span>{selectedClub.name.slice(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="px-platformDetailHeroCopy">
                      <div className="px-platformDetailTitle" title={selectedClub.name}>{selectedClub.name}</div>
                      <div className="px-platformDetailSub" title={selectedClub.city || 'Sin ciudad'}>{selectedClub.city || 'Sin ciudad'}</div>
                    </div>
                  </div>

                  <div className="px-platformFactsGrid">
                    <div><span>Responsable</span><strong title={selectedClub.owner_name}>{shortPersonName(selectedClub.owner_name)}</strong></div>
                    <div><span>Email</span><strong title={selectedClub.owner_email || '—'}>{selectedClub.owner_email || '—'}</strong></div>
                    <div><span>Jugadores</span><strong>{selectedClub.approved_members_count}</strong></div>
                    <div><span>Pendientes</span><strong>{selectedClub.pending_members_count}</strong></div>
                    <div><span>Torneos</span><strong>{selectedClub.tournaments_count}</strong></div>
                    <div><span>Estado</span><strong>{selectedClub.is_active === false ? 'Inactivo' : 'Operativo'}</strong></div>
                  </div>

                  <div className="px-platformFutureActions px-platformFutureActions--compact">
                    <button className="px-btn px-btn--ghost" type="button">Visualizar detalle</button>
                    <button className="px-btn px-btn--ghost" type="button">Estadísticas</button>
                    <button className="px-btn px-btn--ghost" type="button">Pagos</button>
                    <button className="px-btn px-btn--danger" type="button" disabled={busyId === selectedClub.id} onClick={() => toggleClubStatus(selectedClub)}>
                      {selectedClub.is_active === false ? 'Reactivar club' : 'Suspender club'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="px-empty">Seleccioná un club para ver su ficha.</div>
              )}
            </div>

            <div className="px-platformCard">
              <div className="px-sectionTitle">Visión de plataforma</div>
              <div className="px-platformChecklist">
                <div>Este panel prioriza lectura compacta, decisiones rápidas y cero scroll horizontal.</div>
                <div>La tabla queda lista para sumar módulos como pagos, métricas, bloqueos y auditoría.</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
