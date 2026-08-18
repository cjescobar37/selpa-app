'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import PlayerModuleHeader from './PlayerModuleHeader'

type Profile = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type ClubPlayer = {
  id: string
  user_id: string | null
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  approved_at: string | null
  created_at: string
  profile: Profile | null
  full_name: string
}

type PlayerRequest = {
  id: string
  user_id: string
  role: string
  status: string
  created_at: string
  rejection_reason: string | null
  profile: Profile | null
  full_name: string
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function emailOf(profile?: Profile | null) {
  return profile?.email ?? 'Sin email'
}

function genderLabel(gender?: string | null) {
  if (gender === 'M') return 'Caballeros'
  if (gender === 'F') return 'Damas'
  return gender ?? '-'
}

function hasPlayerAccount(player: ClubPlayer) {
  return Boolean(player.user_id && player.profile?.email)
}

function playerStatusLabel(player: ClubPlayer) {
  return player.approved_at ? 'Aprobado' : 'Pendiente'
}

export default function ClubJugadoresPage() {
  const { activeClub } = useSession()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [players, setPlayers] = useState<ClubPlayer[]>([])
  const [requests, setRequests] = useState<PlayerRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<PlayerRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [playerSearch, setPlayerSearch] = useState(searchParams.get('buscar') ?? '')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [requestStats, setRequestStats] = useState({ pending: 0, approved: 0, rejected: 0 })

  const activeTab = pathname === '/club/solicitudes' || searchParams.get('tab') === 'solicitudes' ? 'requests' : 'players'
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-admin-accent': theme.vars.accent,
      '--club-admin-accent-2': theme.vars.accent2,
      '--club-admin-soft': theme.vars.soft,
      '--club-admin-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme]
  )

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [players]
  )

  const categories = useMemo(() => {
    return Array.from(
      new Set(players.map((player) => player.category).filter((category): category is number => typeof category === 'number'))
    ).sort((a, b) => a - b)
  }, [players])

  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase()
    return sortedPlayers.filter((player) => {
      const matchesSearch = !query
        || player.full_name.toLowerCase().includes(query)
        || emailOf(player.profile).toLowerCase().includes(query)
      const matchesCategory = categoryFilter === 'all' || String(player.category ?? '') === categoryFilter
      const status = player.approved_at ? 'approved' : 'pending'
      const matchesStatus = statusFilter === 'all' || statusFilter === status
      const account = hasPlayerAccount(player) ? 'account' : 'manual'
      const matchesAccount = accountFilter === 'all' || accountFilter === account

      return matchesSearch && matchesCategory && matchesStatus && matchesAccount
    })
  }, [accountFilter, categoryFilter, playerSearch, sortedPlayers, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = filteredPlayers.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = Math.min(safePage * pageSize, filteredPlayers.length)

  const paginatedPlayers = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredPlayers.slice(start, start + pageSize)
  }, [filteredPlayers, pageSize, safePage])

  const playerStats = useMemo(() => {
    return {
      active: players.filter((player) => player.approved_at).length,
      manual: players.filter((player) => !hasPlayerAccount(player)).length,
      pending: players.filter((player) => !player.approved_at).length + requests.length,
      categories: new Set(players.map((player) => player.category).filter(Boolean)).size,
    }
  }, [players, requests.length])
  const activeFilterCount = [categoryFilter !== 'all', statusFilter !== 'all', accountFilter !== 'all'].filter(Boolean).length

  function resetPlayerFilters() {
    setCategoryFilter('all')
    setStatusFilter('all')
    setAccountFilter('all')
    setPage(1)
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadPlayers() {
    if (!activeClub?.id) {
      setPlayers([])
      setRequests([])
      setThemeKey(null)
      setRequestStats({ pending: 0, approved: 0, rejected: 0 })
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/players`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const [json, clubThemeResult] = await Promise.all([
      res.json().catch(() => ({})),
      supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
    ])

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar jugadores.')
      setLoading(false)
      return
    }

    setPlayers((json?.players ?? []) as ClubPlayer[])
    setRequests((json?.requests ?? []) as PlayerRequest[])
    setRequestStats(json?.requestStats ?? { pending: 0, approved: 0, rejected: 0 })
    setThemeKey((clubThemeResult.data?.theme_key as string | null) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadPlayers())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  async function applyAction(request: PlayerRequest, action: 'approve' | 'reject') {
    setSavingId(request.id)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingId(null)
      return
    }

    const body: Record<string, string> = { membershipId: request.id, action }
    if (action === 'reject') body.rejectionReason = rejectionReason.trim()

    const res = await fetch('/api/clubs/memberships', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))

    setSavingId(null)

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude actualizar la solicitud.')
      return
    }

    setMessage(action === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
    setSelectedRequest(null)
    setRejectionReason('')
    await loadPlayers()
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-players" style={themeStyle}>
        <PlayerModuleHeader kpis={activeTab === 'requests'
          ? [
              { label: 'Pendientes', value: requestStats.pending },
              { label: 'Aprobadas', value: requestStats.approved },
              { label: 'Rechazadas', value: requestStats.rejected },
            ]
          : [
              { label: 'Activos', value: playerStats.active },
              { label: 'Pendientes', value: playerStats.pending },
              { label: 'Categorías', value: playerStats.categories },
            ]}
        />

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="club-playerSkeletons" aria-busy="true" aria-label="Cargando jugadores">
            {[0, 1, 2].map((item) => <span key={item} />)}
          </div>
        ) : (
          <>
            {activeTab === 'requests' ? (
              <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Solicitudes</span>
                  <h2>Jugadores pendientes</h2>
                  <p>Personas que pidieron unirse a la comunidad deportiva del club.</p>
                </div>
              </div>

              {requests.length === 0 ? (
                <div className="px-empty">No hay solicitudes pendientes.</div>
              ) : (
                <div className="club-list">
                  {requests.map((request) => (
                    <article key={request.id} className="club-requestRow">
                      <div className="club-person">
                        <span className="club-avatar">
                          {request.profile?.avatar_url ? (
                            <img src={request.profile.avatar_url} alt="" />
                          ) : (
                            getClubInitials(request.full_name)
                          )}
                        </span>
                        <div className="club-personMain">
                          <strong>{request.full_name}</strong>
                          <span>{emailOf(request.profile)}</span>
                          <small>Solicitó ingreso el {formatDate(request.created_at)}</small>
                        </div>
                      </div>

                      <div className="club-rowActions">
                        <button
                          type="button"
                          className="club-btn club-btn--ok"
                          aria-label={`Aprobar solicitud de ${request.full_name}`}
                          title="Aprobar"
                          disabled={savingId === request.id}
                          onClick={() => applyAction(request, 'approve')}
                        >
                          {savingId === request.id ? '…' : '✓'}
                        </button>
                        <button
                          type="button"
                          className="club-btn club-btn--danger"
                          aria-label={`Rechazar solicitud de ${request.full_name}`}
                          title="Rechazar"
                          disabled={savingId === request.id}
                          onClick={() => {
                            setSelectedRequest(request)
                            setRejectionReason('')
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              </section>
            ) : (
              <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Padrón</span>
                  <h2>Gestión de jugadores</h2>
                  <p>Jugadores activos, manuales/sin cuenta y estado deportivo del club.</p>
                </div>
              </div>

              <div className="club-playerFilters">
                <label className="club-playerSearch">
                  <span>Buscar</span>
                  <input className="px-input" value={playerSearch} onChange={(event) => { setPlayerSearch(event.target.value); setPage(1) }} placeholder="Nombre o email" />
                </label>
                <label>
                  <span>Categoría</span>
                  <select className="px-input" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1) }}>
                    <option value="all">Todas</option>
                    {categories.map((category) => (
                      <option key={category} value={String(category)}>{category}ta</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Estado</span>
                  <select className="px-input" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
                    <option value="all">Todos</option>
                    <option value="approved">Aprobados</option>
                    <option value="pending">Pendientes</option>
                  </select>
                </label>
                <label>
                  <span>Tipo</span>
                  <select className="px-input" value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setPage(1) }}>
                    <option value="all">Todos</option>
                    <option value="account">Con cuenta</option>
                    <option value="manual">Manual / sin cuenta</option>
                  </select>
                </label>
              </div>

              <div className="club-playerMobileTools">
                <label className="club-playerMobileSearch">
                  <input className="px-input" aria-label="Buscar jugador" value={playerSearch} onChange={(event) => { setPlayerSearch(event.target.value); setPage(1) }} placeholder="Buscar jugador..." />
                </label>
                <button type="button" className="club-playerFilterTrigger" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
                  Filtros{activeFilterCount ? <span>{activeFilterCount}</span> : null}
                </button>
              </div>

              {filtersOpen ? (
                <div className="club-playerFilterBackdrop" role="presentation" onMouseDown={() => setFiltersOpen(false)}>
                  <section className="club-playerFilterSheet" role="dialog" aria-modal="true" aria-labelledby="player-filter-title" onMouseDown={(event) => event.stopPropagation()}>
                    <div className="club-playerFilterSheetHead"><h2 id="player-filter-title">Filtros</h2><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">×</button></div>
                    <div className="club-playerFilterSheetGrid">
                      <label><span>Categoría</span><select className="px-input" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1) }}><option value="all">Todas</option>{categories.map((category) => <option key={category} value={String(category)}>{category}ta</option>)}</select></label>
                      <label><span>Estado</span><select className="px-input" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="all">Todos</option><option value="approved">Aprobados</option><option value="pending">Pendientes</option></select></label>
                      <label><span>Tipo</span><select className="px-input" value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setPage(1) }}><option value="all">Todos</option><option value="account">Con cuenta</option><option value="manual">Manual / sin cuenta</option></select></label>
                    </div>
                    <div className="club-playerFilterSheetActions"><button type="button" className="club-btn club-btn--ghost" onClick={resetPlayerFilters}>Limpiar</button><button type="button" className="club-btn club-btn--ok" onClick={() => setFiltersOpen(false)}>Ver jugadores</button></div>
                  </section>
                </div>
              ) : null}

              {sortedPlayers.length === 0 ? (
                <div className="px-empty">Todavía no hay jugadores activos.</div>
              ) : filteredPlayers.length === 0 ? (
                <div className="px-empty">No hay jugadores que coincidan con esos filtros.</div>
              ) : (
                <>
                  <div className="club-playerListToolbar">
                    <span>Mostrando {pageStart}-{pageEnd} de {filteredPlayers.length}</span>
                    <label>
                      <span>Filas</span>
                      <select className="px-input" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>
                  </div>

                  <div className="club-playerTable" role="table" aria-label="Jugadores del club">
                    <div className="club-playerTableHead" role="row">
                      <span>Jugador</span>
                      <span>Categoría</span>
                      <span>Género</span>
                      <span>Ranking</span>
                      <span>Estado</span>
                      <span>Alta</span>
                      <span>Perfil</span>
                    </div>
                    {paginatedPlayers.map((player) => {
                      const hasAccount = hasPlayerAccount(player)
                      return (
                        <Link key={player.id} className="club-playerTableRow" role="row" href={`/club/jugadores/${player.user_id ?? player.id}/administracion`} aria-label={`Gestionar a ${player.full_name}`}>
                          <div className="club-playerIdentity">
                            <div className="club-person club-person--compact">
                              <span className="club-avatar club-avatar--sm">
                                {player.profile?.avatar_url ? <img src={player.profile.avatar_url} alt="" /> : getClubInitials(player.full_name)}
                              </span>
                              <div className="club-personMain">
                                <strong>{player.full_name}</strong>
                                <span>{emailOf(player.profile)}</span>
                                <small className="club-playerMobileMeta">{player.category ? `${player.category}ta` : 'Sin categoría'} · {genderLabel(player.gender)} · {player.ranking_points ?? 0} pts</small>
                              </div>
                            </div>
                            <span className={`club-statusPill ${hasAccount ? 'club-statusPill--ok' : 'club-statusPill--muted'}`}>
                              {hasAccount ? 'Con cuenta' : 'Manual / sin cuenta'}
                            </span>
                          </div>
                          <span data-label="Categoría">{player.category ? `${player.category}ta` : '-'}</span>
                          <span data-label="Género">{genderLabel(player.gender)}</span>
                          <span data-label="Ranking">{player.ranking_points ?? 0} pts</span>
                          <span data-label="Estado">
                            {!player.approved_at ? <span className="club-statusPill club-statusPill--pending">{playerStatusLabel(player)}</span> : null}
                          </span>
                          <span data-label="Alta">{formatDate(player.approved_at ?? player.created_at)}</span>
                          <span data-label="Perfil">
                            <span className="club-playerChevron" aria-hidden="true">›</span>
                          </span>
                        </Link>
                      )
                    })}
                  </div>

                  <div className="club-playerPagination">
                    <button type="button" className="club-btn club-btn--ghost" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                      Anterior
                    </button>
                    <span>Página {safePage} de {totalPages}</span>
                    <button type="button" className="club-btn club-btn--ghost" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                      Siguiente
                    </button>
                  </div>
                </>
              )}
              </section>
            )}
          </>
        )}

        {selectedRequest ? (
          <div className="club-modalBackdrop" role="dialog" aria-modal="true">
            <div className="club-modal">
              <div>
                <span className="club-kicker">Rechazar solicitud</span>
                <h2>{selectedRequest.full_name}</h2>
                <p>Indicá un motivo claro para dejar registro y notificar al jugador.</p>
              </div>
              <textarea
                className="px-input"
                rows={4}
                placeholder="Motivo del rechazo"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              />
              <div className="club-modalActions">
                <button
                  type="button"
                  className="club-btn club-btn--danger"
                  disabled={savingId === selectedRequest.id}
                  onClick={() => applyAction(selectedRequest, 'reject')}
                >
                  Rechazar con motivo
                </button>
                <button
                  type="button"
                  className="club-btn club-btn--ghost"
                  onClick={() => {
                    setSelectedRequest(null)
                    setRejectionReason('')
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        .club-players {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-players::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-playersHead {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-playersStats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-playersStats span { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 16%, transparent); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-playersStats b { color: #17253f; }
        .club-message { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); border-radius: 14px; color: #061b3a; font-weight: 850; margin-top: 12px; padding: 10px 12px; }
        .club-playerSkeletons { display:grid; gap:8px; margin-top:14px }
        .club-playerSkeletons span { animation:clubPlayerPulse 1.2s ease-in-out infinite alternate; background:#e8edf2; border-radius:14px; min-height:70px }
        @keyframes clubPlayerPulse { to { opacity:.48 } }
        .club-playersGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 20px; box-shadow: 0 16px 42px rgba(15,23,42,.055); display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 16px; }
        .club-cardHead { align-items: flex-start; display: flex; justify-content: space-between; gap: 10px; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 5px 0 0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-playerFilters { align-items: end; background: linear-gradient(135deg, #fff, color-mix(in srgb, var(--club-admin-accent) 4%, white)); border: 1px solid rgba(15,23,42,.07); border-radius: 16px; display: grid; gap: 8px; grid-template-columns: minmax(220px,1.3fr) repeat(3,minmax(130px,.7fr)); padding: 10px; }
        .club-playerFilters label { color: #17253f; display: grid; font-size: 12px; font-weight: 900; gap: 5px; min-width: 0; }
        .club-playerFilters label > span { color: #64748b; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .club-playerMobileTools, .club-playerFilterBackdrop, .club-playerMobileMeta { display:none; }
        .club-playerListToolbar, .club-playerPagination { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; }
        .club-playerListToolbar > span, .club-playerPagination > span { color: #475569; font-size: 12px; font-weight: 850; }
        .club-playerListToolbar label { align-items: center; color: #64748b; display: inline-flex; font-size: 11px; font-weight: 950; gap: 6px; text-transform: uppercase; }
        .club-list { display: grid; gap: 8px; min-width: 0; }
        .club-requestRow { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 16px; display: grid; gap: 10px; min-width: 0; padding: 12px; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-requestRow:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 28%, transparent); box-shadow: 0 12px 30px var(--club-admin-glow); transform: translateY(-1px); }
        .club-person { align-items: center; display: flex; gap: 10px; min-width: 0; }
        .club-person--compact { gap: 8px; }
        .club-avatar { align-items: center; background: rgba(15,23,42,.08); border-radius: 12px; color: #17253f; display: inline-flex; flex: 0 0 auto; font-weight: 950; height: 42px; justify-content: center; overflow: hidden; width: 42px; }
        .club-avatar--sm { border-radius: 10px; height: 34px; width: 34px; }
        .club-avatar img { height: 100%; object-fit: cover; width: 100%; }
        .club-personMain { display: grid; gap: 2px; min-width: 0; }
        .club-personMain strong, .club-personMain span, .club-personMain small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-personMain strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-personMain span, .club-personMain small { color: #64748b; font-size: 12px; }
        .club-rowActions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-start; }
        .club-btn { border: 1px solid transparent; border-radius: 999px; cursor: pointer; font-weight: 950; min-height: 34px; padding: 8px 12px; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .club-btn:disabled { cursor: not-allowed; opacity: .65; }
        .club-btn--ok { background: #ecfdf3; border-color: #b7ebc6; color: #166534; }
        .club-btn--danger { background: #fff0f5; border-color: rgba(190,24,93,.22); color: #9d174d; }
        .club-btn--ghost { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-btn--ghost:hover:not(:disabled) { border-color: color-mix(in srgb, var(--club-admin-accent) 48%, transparent); box-shadow: 0 10px 22px var(--club-admin-glow); }
        .club-statusPill { border-radius: 999px; font-size: 11px; font-weight: 950; padding: 5px 7px; text-align: center; white-space: nowrap; width: fit-content; }
        .club-statusPill--ok { background: #ecfdf3; color: #166534; }
        .club-statusPill--pending { background: #fff7df; color: #854d0e; }
        .club-statusPill--muted { background: #f1f5f9; color: #475569; }
        .club-playerTable { display: grid; gap: 6px; min-width: 0; width: 100%; }
        .club-playerTableHead, .club-playerTableRow { align-items: center; display: grid; gap: 10px; grid-template-columns: minmax(220px,1.8fr) 78px 88px 88px 112px 108px 64px; min-width: 0; }
        .club-playerTableHead { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-playerTableRow { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; color: #334155; font-size: 13px; padding: 9px; text-decoration:none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-playerTableRow:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 28%, transparent); box-shadow: 0 12px 28px var(--club-admin-glow); transform: translateY(-1px); }
        .club-playerTableRow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playerIdentity { align-items: center; display: flex; gap: 8px; min-width: 0; }
        .club-playerIdentity .club-person { flex: 1 1 auto; min-width: 0; }
        .club-playerPagination { justify-content: flex-end; }
        .club-playerChevron { color:var(--club-admin-accent); font-size:24px; font-weight:900; line-height:1; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.38); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-modal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 22px; box-shadow: 0 24px 70px rgba(15,23,42,.22); display: grid; gap: 12px; max-width: 520px; overflow: hidden; padding: 18px; position: relative; width: min(100%, 520px); }
        .club-modal::before { background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2)); content: ""; height: 4px; left: 0; position: absolute; right: 0; top: 0; }
        .club-modal h2 { color: #17253f; font-size: 20px; line-height: 1.15; margin: 2px 0; }
        .club-modal p { color: #64748b; margin: 0; }
        .club-modalActions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        @media (min-width: 980px) {
          .club-playersGrid { grid-template-columns: minmax(320px, .85fr) minmax(0, 1.15fr); }
          .club-requestRow { grid-template-columns: minmax(0, 1fr) auto; }
          .club-rowActions { justify-content: flex-end; }
        }
        @media (max-width: 760px) {
          .club-players { background:transparent; border:0; border-radius:0; box-shadow:none; overflow:visible; padding:0; }
          .club-players::before { display:none; }
          .club-playersHead { align-items:center; border-radius:14px; display:grid; gap:8px; padding:11px; }
          .club-playersHead .club-title { font-size:24px; }
          .club-playersHead .club-sub { display:none; }
          .club-playersStats { display:grid; gap:5px; grid-template-columns:repeat(4,minmax(0,1fr)); justify-content:stretch; }
          .club-playersStats span { border-radius:9px; display:grid; font-size:9px; gap:1px; padding:5px 3px; text-align:center; white-space:normal; }
          .club-playersStats b { font-size:14px; }
          .club-card { background:transparent; border:0; border-radius:0; box-shadow:none; gap:8px; margin-top:10px; padding:0; }
          .club-cardHead { display:none; }
          .club-playerFilters { display:none; }
          .club-playerMobileTools { display:grid; gap:8px; grid-template-columns:minmax(0,1fr) auto; }
          .club-playerMobileSearch input { box-sizing:border-box; font-size:16px; height:44px; width:100%; }
          .club-playerFilterTrigger { align-items:center; background:#fff; border:1px solid color-mix(in srgb,var(--club-admin-accent) 30%, rgba(15,23,42,.12)); border-radius:12px; color:#061b3a; display:inline-flex; font-size:13px; font-weight:900; gap:6px; min-height:44px; padding:8px 12px; }
          .club-playerFilterTrigger span { align-items:center; background:color-mix(in srgb,var(--club-admin-accent) 14%, white); border-radius:999px; display:inline-flex; font-size:10px; height:20px; justify-content:center; min-width:20px; }
          .club-playerFilterBackdrop { align-items:end; background:rgba(2,8,23,.42); display:flex; inset:0; position:fixed; z-index:80; }
          .club-playerFilterSheet { background:#fff; border-radius:20px 20px 0 0; box-shadow:0 -20px 50px rgba(2,8,23,.18); box-sizing:border-box; max-height:84dvh; overflow:auto; padding:16px 16px calc(16px + env(safe-area-inset-bottom)); width:100%; }
          .club-playerFilterSheetHead { align-items:center; display:flex; justify-content:space-between; }
          .club-playerFilterSheetHead h2 { color:#17253f; font-size:22px; margin:0; }
          .club-playerFilterSheetHead button { align-items:center; background:#f1f5f9; border:0; border-radius:999px; color:#17253f; display:flex; font-size:24px; height:40px; justify-content:center; width:40px; }
          .club-playerFilterSheetGrid { display:grid; gap:10px; margin-top:14px; }
          .club-playerFilterSheetGrid label { display:grid; gap:5px; }
          .club-playerFilterSheetGrid label > span { color:#64748b; font-size:10px; font-weight:900; text-transform:uppercase; }
          .club-playerFilterSheetGrid select { font-size:16px; min-height:46px; }
          .club-playerFilterSheetActions { display:grid; gap:8px; grid-template-columns:1fr 1.4fr; margin-top:16px; }
          .club-playerListToolbar, .club-playerPagination { align-items: stretch; display: grid; justify-content: stretch; }
          .club-playerListToolbar { align-items:center; grid-template-columns:minmax(0,1fr) auto; }
          .club-playerListToolbar label { display:none; }
          .club-playerTableHead { display: none; }
          .club-playerTable { gap:6px; }
          .club-playerTableRow { align-items:center; gap:8px; grid-template-columns:minmax(0,1fr) auto 12px; min-height:70px; padding:8px 10px; }
          .club-playerTableRow > span { display:none; }
          .club-playerTableRow > span[data-label="Estado"] { display:block; grid-column:2; }
          .club-playerTableRow > span[data-label="Perfil"] { display:block; grid-column:3; }
          .club-playerIdentity { align-items:center; display:flex; gap:8px; min-width:0; }
          .club-playerIdentity > .club-statusPill { display:none; }
          .club-avatar--sm { height:42px; width:42px; }
          .club-personMain span { display:none; }
          .club-playerMobileMeta { color:#64748b; display:block; font-size:10px; font-weight:750; }
          .club-statusPill { font-size:9px; padding:4px 6px; }
          .club-requestRow { gap:8px; grid-template-columns:minmax(0,1fr) auto; min-height:72px; padding:8px; }
          .club-requestRow .club-personMain span { display:none; }
          .club-requestRow .club-rowActions { display:flex; flex-wrap:nowrap; gap:5px; }
          .club-requestRow .club-btn { align-items:center; display:inline-flex; font-size:19px; height:36px; justify-content:center; min-height:36px; padding:0; width:36px; }
        }
        @media (prefers-reduced-motion: reduce) { .club-playerSkeletons span { animation:none } }
      `}</style>
    </div>
  )
}
