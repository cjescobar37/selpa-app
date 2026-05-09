'use client'

import { useEffect, useMemo, useState } from 'react'
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
  user_id: string
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

export default function ClubJugadoresPage() {
  const { activeClub } = useSession()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [players, setPlayers] = useState<ClubPlayer[]>([])
  const [requests, setRequests] = useState<PlayerRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<PlayerRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [players]
  )

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
            <p className="club-sub">Padrón deportivo y solicitudes de ingreso de {activeClub?.name ?? 'tu club'}.</p>
          </div>
          <div className="club-playersStats">
            <span><b>{players.length}</b> activos</span>
            <span><b>{requests.length}</b> pendientes</span>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="px-empty">Cargando jugadores...</div>
        ) : (
          <div className="club-playersGrid">
            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Solicitudes</span>
                  <h2>Jugadores pendientes</h2>
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

            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Padrón</span>
                  <h2>Jugadores activos</h2>
                </div>
              </div>

              {sortedPlayers.length === 0 ? (
                <div className="px-empty">Todavía no hay jugadores activos.</div>
              ) : (
                <div className="club-playerTable" role="table" aria-label="Jugadores activos">
                  <div className="club-playerTableHead" role="row">
                    <span>Jugador</span>
                    <span>Categoría</span>
                    <span>Género</span>
                    <span>Puntos</span>
                    <span>Alta</span>
                  </div>
                  {sortedPlayers.map((player) => (
                    <div key={player.id} className="club-playerTableRow" role="row">
                      <div className="club-person club-person--compact">
                        <span className="club-avatar club-avatar--sm">
                          {player.profile?.avatar_url ? <img src={player.profile.avatar_url} alt="" /> : getClubInitials(player.full_name)}
                        </span>
                        <div className="club-personMain">
                          <strong>{player.full_name}</strong>
                          <span>{emailOf(player.profile)}</span>
                        </div>
                      </div>
                      <span>{player.category ?? '-'}</span>
                      <span>{player.gender ?? '-'}</span>
                      <span>{player.ranking_points ?? 0} pts</span>
                      <span>{formatDate(player.approved_at ?? player.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
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
        .club-playersGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-cardHead { align-items: flex-start; display: flex; justify-content: space-between; gap: 10px; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
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
        .club-playerTable { display: grid; gap: 6px; min-width: 0; width: 100%; }
        .club-playerTableHead, .club-playerTableRow { align-items: center; display: grid; gap: 10px; grid-template-columns: minmax(0, 1.6fr) 72px 64px 80px 100px; min-width: 0; }
        .club-playerTableHead { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-playerTableRow { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #334155; font-size: 13px; padding: 8px; }
        .club-playerTableRow > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
          .club-playerTableHead { display: none; }
          .club-playerTableRow { grid-template-columns: 1fr; }
          .club-playerTableRow > span { color: #64748b; }
        }
      `}</style>
    </div>
  )
}
