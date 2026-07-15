'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'
import { BRAND } from '@/lib/branding'

type Club = {
  id: string
  name: string
  city: string | null
  province: string | null
  logo_url: string | null
  membership_status: string | null
  membership_role: string | null
  membership_approved: boolean
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [requestingId, setRequestingId] = useState<string | null>(null)

  async function loadClubs() {
    setLoading(true)
    setMsg('')

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token ?? ''

    const res = await fetch('/api/clubs/available', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMsg(json?.error ?? 'No pude cargar los clubes.')
      setLoading(false)
      return
    }

    setClubs(json?.clubs ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadClubs()
  }, [])

  const ordered = useMemo(() => {
    return [...clubs].sort((a, b) => a.name.localeCompare(b.name))
  }, [clubs])

  async function requestJoin(clubId: string) {
    setRequestingId(clubId)
    setMsg('')

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token

    if (!token) {
      setMsg('Tenés que iniciar sesión para solicitar ingreso.')
      setRequestingId(null)
      return
    }

    const res = await fetch('/api/clubs/request-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accessToken: token, clubId }),
    })

    const json = await res.json().catch(() => ({}))
    setRequestingId(null)

    if (!res.ok) {
      setMsg(json?.error ?? 'No pude generar la solicitud.')
      return
    }

    setMsg(json?.message ?? 'Solicitud enviada.')
    await loadClubs()
  }

  return (
    <div className="px-playerFlow px-playerFlow--wide">
      <div className="px-playerFlowCard">
        <div className="px-authTop">
          <div className="px-playerSectionHead">
            <div className="px-playerFlowIntro">
              <span className="px-playerFlowKicker">Comunidad jugador</span>
              <h1 className="px-authTitle">Clubes activos</h1>
              <p className="px-authSub">
                Explorá clubes de {BRAND.name} y solicitá tu alta para jugar desde tu perfil.
              </p>
            </div>

            <div className="px-playerFlowActions" style={{ borderTop: 0, paddingTop: 0 }}>
              <Link href="/seleccionar-club" className="px-btn px-btn--ghost">Seleccionar club</Link>
              <Link href="/clubs/nuevo" className="px-btn">Dar de alta mi club</Link>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          {msg ? (
            <div className="px-playerFlowNotice">
              {msg}
            </div>
          ) : null}

          {loading ? <div className="px-playerFlowPanel">Cargando clubes...</div> : null}

          <div className="px-playerClubGrid">
            {ordered.map((club) => {
              const status = club.membership_status
              const canRequest = !status || status === 'REJECTED'
              const isPending = status === 'PENDING'
              const isApproved = club.membership_approved
              const isRejected = status === 'REJECTED'
              const isBusy = requestingId === club.id

              return (
                <article
                  key={club.id}
                  className={`px-playerClubCard ${isApproved ? 'is-active' : ''}`}
                >
                  <div className="px-playerClubMain">
                    <span className="px-playerClubLogo">
                      {club.logo_url ? (
                        <img src={club.logo_url} alt="" />
                      ) : (
                        <span>{getClubInitials(club.name)}</span>
                      )}
                    </span>

                    <div>
                      <h2 className="px-playerClubName">{club.name}</h2>
                      <div className="px-playerClubMeta">
                        {[club.city, club.province].filter(Boolean).join(', ') || 'Sin ubicación'}
                      </div>
                    </div>
                  </div>

                  <div className="px-playerClubFoot">
                    <span className={`px-playerStatus ${statusClass(status, isApproved)}`}>
                      {statusLabel(status, isApproved)}
                    </span>

                    {canRequest ? (
                      <button
                        type="button"
                        onClick={() => requestJoin(club.id)}
                        disabled={isBusy}
                        className="px-playerClubCta"
                      >
                        {isBusy ? 'Enviando...' : isRejected ? 'Volver a solicitar' : 'Solicitar unirme'}
                      </button>
                    ) : null}

                    {isPending ? (
                      <span className="px-playerClubCta px-playerClubCta--soft">En revisión</span>
                    ) : null}

                    {isApproved ? (
                      <Link href="/seleccionar-club" className="px-playerClubCta">
                        Ir a activarlo
                      </Link>
                    ) : null}
                  </div>

                  {club.membership_role ? (
                    <div className="px-playerClubMeta">Rol: <b>{club.membership_role}</b></div>
                  ) : null}
                </article>
              )
            })}
          </div>

          {!loading && ordered.length === 0 ? (
            <div className="px-playerFlowPanel">
              <strong>Todavía no hay clubes cargados.</strong>
              <span className="px-help">Podés volver más tarde o dar de alta tu club para empezar.</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function statusLabel(status: string | null, approved: boolean) {
  if (approved) return 'Aprobado'
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'REJECTED') return 'Rechazado'
  return 'Sin solicitud'
}

function statusClass(status: string | null, approved: boolean) {
  if (approved) return 'px-playerStatus--approved'
  if (status === 'PENDING') return 'px-playerStatus--pending'
  if (status === 'REJECTED') return 'px-playerStatus--rejected'
  return ''
}
