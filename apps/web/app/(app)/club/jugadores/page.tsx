'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubInitials } from '@/lib/clubAssets'

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
  if (gender === 'M') return 'Masculino'
  if (gender === 'F') return 'Femenino'
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
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [players, setPlayers] = useState<ClubPlayer[]>([])
  const [requests, setRequests] = useState<PlayerRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<PlayerRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const activeTab = searchParams.get('tab') === 'solicitudes' ? 'requests' : 'players'

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

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadPlayers() {
    if (!activeClub?.id) {
      setPlayers([])
      setRequests([])
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
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar jugadores.')
      setLoading(false)
      return
    }

    setPlayers((json?.players ?? []) as ClubPlayer[])
    setRequests((json?.requests ?? []) as PlayerRequest[])
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadPlayers())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    setPage(1)
  }, [accountFilter, categoryFilter, pageSize, playerSearch, statusFilter])

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
      <div className="club-panel club-players">
        <div className="club-playersHead">
          <div>
            <h1 className="club-title">Jugadores</h1>
            <p className="club-sub">Comunidad deportiva, padrón de jugadores y solicitudes de ingreso de {activeClub?.name ?? 'tu club'}.</p>
          </div>
          <div className="club-playersStats">
            <span><b>{playerStats.active}</b> activos</span>
            <span><b>{playerStats.manual}</b> manuales</span>
            <span><b>{playerStats.pending}</b> pendientes</span>
            <span><b>{playerStats.categories}</b> categorías</span>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="px-empty">Cargando jugadores...</div>
        ) : (
          <>
            <div className="club-playerTabs">
              <Link className={`club-playerTab ${activeTab === 'players' ? 'is-active' : ''}`} href="/club/jugadores">
                Gestión
              </Link>
              <Link className={`club-playerTab ${activeTab === 'requests' ? 'is-active' : ''}`} href="/club/jugadores?tab=solicitudes">
                Solicitudes <span>{requests.length}</span>
              </Link>
              <Link className="club-playerTab" href="/club/ranking">
                Ranking
              </Link>
            </div>

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
                          disabled={savingId === request.id}
                          onClick={() => applyAction(request, 'approve')}
                        >
                          {savingId === request.id ? '...' : 'Aprobar'}
                        </button>
                        <button
                          type="button"
                          className="club-btn club-btn--danger"
                          disabled={savingId === request.id}
                          onClick={() => {
                            setSelectedRequest(request)
                            setRejectionReason('')
                          }}
                        >
                          Rechazar
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
                  <input className="px-input" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Nombre o email" />
                </label>
                <label>
                  <span>Categoría</span>
                  <select className="px-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="all">Todas</option>
                    {categories.map((category) => (
                      <option key={category} value={String(category)}>{category}ta</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Estado</span>
                  <select className="px-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">Todos</option>
                    <option value="approved">Aprobados</option>
                    <option value="pending">Pendientes</option>
                  </select>
                </label>
                <label>
                  <span>Tipo</span>
                  <select className="px-input" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                    <option value="all">Todos</option>
                    <option value="account">Con cuenta</option>
                    <option value="manual">Manual / sin cuenta</option>
                  </select>
                </label>
              </div>

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
                      <select className="px-input" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
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
                        <div key={player.id} className="club-playerTableRow" role="row">
                          <div className="club-playerIdentity">
                            <div className="club-person club-person--compact">
                              <span className="club-avatar club-avatar--sm">
                                {player.profile?.avatar_url ? <img src={player.profile.avatar_url} alt="" /> : getClubInitials(player.full_name)}
                              </span>
                              <div className="club-personMain">
                                <strong>{player.full_name}</strong>
                                <span>{emailOf(player.profile)}</span>
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
                            <span className={`club-statusPill ${player.approved_at ? 'club-statusPill--ok' : 'club-statusPill--pending'}`}>
                              {playerStatusLabel(player)}
                            </span>
                          </span>
                          <span data-label="Alta">{formatDate(player.approved_at ?? player.created_at)}</span>
                          <span data-label="Perfil">
                            <Link className="club-profileLink" href={`/club/jugadores/${player.user_id ?? player.id}`}>
                              Ver
                            </Link>
                          </span>
                        </div>
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
        .club-players { overflow: hidden; }
        .club-playersHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
        .club-playersStats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-playersStats span { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-playersStats b { color: #17253f; }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; border-radius: 12px; color: #164e63; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-playerTabs { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: flex; flex-wrap: wrap; gap: 4px; margin-top: 14px; padding: 4px; }
        .club-playerTab { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 9px; color: #64748b; display: inline-flex; font-size: 12px; font-weight: 950; gap: 7px; min-height: 34px; padding: 7px 10px; text-decoration: none; }
        .club-playerTab span { background: rgba(100,116,139,.10); border-radius: 999px; font-size: 11px; min-width: 22px; padding: 2px 6px; text-align: center; }
        .club-playerTab.is-active { background: #fff; border-color: rgba(83,199,217,.42); box-shadow: 0 8px 18px rgba(15,23,42,.06); color: #0f8ea0; }
        .club-playersGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 14px; }
        .club-cardHead { align-items: flex-start; display: flex; justify-content: space-between; gap: 10px; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 5px 0 0; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-playerFilters { align-items: end; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; display: grid; gap: 8px; grid-template-columns: minmax(220px,1.3fr) repeat(3,minmax(130px,.7fr)); padding: 10px; }
        .club-playerFilters label { color: #17253f; display: grid; font-size: 12px; font-weight: 900; gap: 5px; min-width: 0; }
        .club-playerFilters label > span { color: #64748b; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .club-playerListToolbar, .club-playerPagination { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; }
        .club-playerListToolbar > span, .club-playerPagination > span { color: #475569; font-size: 12px; font-weight: 850; }
        .club-playerListToolbar label { align-items: center; color: #64748b; display: inline-flex; font-size: 11px; font-weight: 950; gap: 6px; text-transform: uppercase; }
        .club-list { display: grid; gap: 8px; min-width: 0; }
        .club-requestRow { align-items: center; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 10px; min-width: 0; padding: 10px; }
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
        .club-btn { border: 1px solid transparent; border-radius: 8px; cursor: pointer; font-weight: 900; min-height: 34px; padding: 8px 10px; }
        .club-btn:disabled { cursor: not-allowed; opacity: .65; }
        .club-btn--ok { background: #ecfdf3; border-color: #b7ebc6; color: #166534; }
        .club-btn--danger { background: #fff0f5; border-color: rgba(190,24,93,.22); color: #9d174d; }
        .club-btn--ghost { background: #fff; border-color: rgba(83,199,217,.34); color: #0f8ea0; }
        .club-statusPill { border-radius: 999px; font-size: 11px; font-weight: 950; padding: 5px 7px; text-align: center; white-space: nowrap; width: fit-content; }
        .club-statusPill--ok { background: #ecfdf3; color: #166534; }
        .club-statusPill--pending { background: #fff7df; color: #854d0e; }
        .club-statusPill--muted { background: #f1f5f9; color: #475569; }
        .club-playerTable { display: grid; gap: 6px; min-width: 0; width: 100%; }
        .club-playerTableHead, .club-playerTableRow { align-items: center; display: grid; gap: 10px; grid-template-columns: minmax(220px,1.8fr) 78px 88px 88px 112px 108px 64px; min-width: 0; }
        .club-playerTableHead { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-playerTableRow { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #334155; font-size: 13px; padding: 8px; }
        .club-playerTableRow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-profileLink { align-items: center; background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 9px; color: #0e7490; display: inline-flex; font-size: 12px; font-weight: 950; justify-content: center; min-height: 30px; padding: 6px 10px; text-decoration: none; }
        .club-playerIdentity { align-items: center; display: flex; gap: 8px; min-width: 0; }
        .club-playerIdentity .club-person { flex: 1 1 auto; min-width: 0; }
        .club-playerPagination { justify-content: flex-end; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.38); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-modal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.22); display: grid; gap: 12px; max-width: 520px; padding: 16px; width: min(100%, 520px); }
        .club-modal h2 { color: #17253f; font-size: 20px; line-height: 1.15; margin: 2px 0; }
        .club-modal p { color: #64748b; margin: 0; }
        .club-modalActions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        @media (min-width: 980px) {
          .club-playersGrid { grid-template-columns: minmax(320px, .85fr) minmax(0, 1.15fr); }
          .club-requestRow { grid-template-columns: minmax(0, 1fr) auto; }
          .club-rowActions { justify-content: flex-end; }
        }
        @media (max-width: 760px) {
          .club-playersHead { display: grid; }
          .club-playersStats { justify-content: flex-start; }
          .club-playerTabs { align-items: stretch; flex-direction: column; }
          .club-playerTab { justify-content: space-between; width: 100%; }
          .club-playerFilters { grid-template-columns: 1fr; }
          .club-playerListToolbar, .club-playerPagination { align-items: stretch; display: grid; justify-content: stretch; }
          .club-playerTableHead { display: none; }
          .club-playerTableRow { grid-template-columns: 1fr; }
          .club-playerTableRow > span { background: #f8fafc; border: 1px solid rgba(15,23,42,.06); border-radius: 9px; color: #64748b; display: grid; gap: 2px; padding: 7px; white-space: normal; }
          .club-playerTableRow > span::before { color: #64748b; content: attr(data-label); font-size: 10px; font-weight: 950; text-transform: uppercase; }
          .club-playerIdentity { align-items: flex-start; display: grid; }
        }
      `}</style>
    </div>
  )
}
