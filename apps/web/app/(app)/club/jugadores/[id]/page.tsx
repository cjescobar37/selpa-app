'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
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
  city?: string | null
  birth_date?: string | null
  dominant_hand?: string | null
  cover_url?: string | null
}

type ClubPlayer = {
  id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
  approved_at: string | null
  created_at: string
  profile: Profile | null
  full_name: string
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatCategory(value?: number | null) {
  const labels: Record<number, string> = {
    1: '1ra',
    2: '2da',
    3: '3ra',
    4: '4ta',
    5: '5ta',
    6: '6ta',
    7: '7ma',
  }
  return value ? labels[value] ?? `${value}` : 'Sin categoría'
}

function formatGender(value?: string | null) {
  const cleanValue = (value ?? '').toUpperCase()
  if (cleanValue === 'M' || cleanValue === 'MALE') return 'Masculino'
  if (cleanValue === 'F' || cleanValue === 'FEMALE') return 'Femenino'
  if (cleanValue === 'MIXED') return 'Mixto'
  return 'Sin género'
}

function emailOf(profile?: Profile | null) {
  return profile?.email ?? 'Sin email'
}

function displayName(player?: ClubPlayer | null) {
  if (!player) return 'Jugador'
  return player.full_name || player.display_name || player.profile?.display_name || 'Jugador'
}

export default function ClubJugadorDetailPage() {
  const params = useParams<{ id: string }>()
  const playerId = params?.id
  const { activeClub } = useSession()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [player, setPlayer] = useState<ClubPlayer | null>(null)

  const joinedAt = useMemo(
    () => formatDate(player?.approved_at ?? player?.created_at ?? null),
    [player]
  )

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadPlayer() {
    if (!activeClub?.id || !playerId) {
      setPlayer(null)
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
      setMessage(json?.error ?? 'No pude cargar el jugador.')
      setPlayer(null)
      setLoading(false)
      return
    }

    const players = (json?.players ?? []) as ClubPlayer[]
    const currentPlayer = players.find((entry) => entry.user_id === playerId || entry.id === playerId) ?? null

    if (!currentPlayer) {
      setMessage('No encontré ese jugador en el club activo.')
      setPlayer(null)
      setLoading(false)
      return
    }

    setPlayer(currentPlayer)
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadPlayer())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, playerId])

  return (
    <div className="px-wrap">
      <div className="club-panel club-playerProfile">
        <div className="club-profileTopbar">
          <Link href="/club/jugadores" className="club-backBtn">Volver a jugadores</Link>
          <Link href="/club/torneos" className="club-secondaryBtn">Volver a torneos</Link>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="px-empty">Cargando perfil del jugador...</div>
        ) : !player ? (
          <div className="px-empty">No encontramos el perfil solicitado para este club.</div>
        ) : (
          <>
            <section className="club-profileHero">
              <div className="club-profileCover">
                <div className="club-profileGlow club-profileGlow--left" />
                <div className="club-profileGlow club-profileGlow--right" />
              </div>
              <div className="club-profileMain">
                <div className="club-profileAvatar">
                  {player.profile?.avatar_url ? (
                    <Image src={player.profile.avatar_url} alt={displayName(player)} fill sizes="96px" />
                  ) : (
                    getClubInitials(displayName(player))
                  )}
                </div>
                <div className="club-profileIdentity">
                  <span className="club-kicker">Perfil del jugador</span>
                  <h1 className="club-title">{displayName(player)}</h1>
                  <div className="club-profileBadges">
                    <span className="club-profileBadge">{formatCategory(player.category)}</span>
                    <span className="club-profileBadge">{formatGender(player.gender)}</span>
                    <span className="club-profileBadge">{activeClub.name}</span>
                  </div>
                  <p className="club-sub">
                    Base inicial del perfil deportivo del jugador dentro del club. Vamos a poder crecer desde acá con historial,
                    ranking y estadísticas reales.
                  </p>
                </div>
              </div>
            </section>

            <section className="club-profileGrid">
              <article className="club-card club-card--primary">
                <div className="club-cardHead">
                  <div>
                    <span className="club-kicker">Datos básicos</span>
                    <h2>Identidad deportiva</h2>
                  </div>
                </div>
                <div className="club-infoGrid">
                  <div className="club-infoItem">
                    <span>Nombre completo</span>
                    <strong>{displayName(player)}</strong>
                  </div>
                  <div className="club-infoItem">
                    <span>Categoría</span>
                    <strong>{formatCategory(player.category)}</strong>
                  </div>
                  <div className="club-infoItem">
                    <span>Género</span>
                    <strong>{formatGender(player.gender)}</strong>
                  </div>
                  <div className="club-infoItem">
                    <span>Club</span>
                    <strong>{activeClub.name}</strong>
                  </div>
                  <div className="club-infoItem">
                    <span>Email</span>
                    <strong>{emailOf(player.profile)}</strong>
                  </div>
                  <div className="club-infoItem">
                    <span>Alta en el club</span>
                    <strong>{joinedAt}</strong>
                  </div>
                </div>
              </article>

              <article className="club-card">
                <div className="club-cardHead">
                  <div>
                    <span className="club-kicker">Resumen</span>
                    <h2>Proyección del perfil</h2>
                  </div>
                </div>
                <div className="club-statsGrid">
                  <div className="club-statCard">
                    <span>Torneos</span>
                    <strong>Próximamente</strong>
                  </div>
                  <div className="club-statCard">
                    <span>Victorias</span>
                    <strong>Próximamente</strong>
                  </div>
                  <div className="club-statCard">
                    <span>Ranking</span>
                    <strong>Próximamente</strong>
                  </div>
                </div>
                <div className="club-placeholderBox">
                  Este perfil ya queda listo para sumar historial deportivo, estadísticas y evolución de categoría sin cambiar la navegación.
                </div>
              </article>
            </section>
          </>
        )}
      </div>

      <style>{`
        .club-playerProfile { overflow: hidden; }
        .club-profileTopbar { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-bottom: 12px; }
        .club-backBtn, .club-secondaryBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-backBtn { background: #fff1f7; border: 1px solid rgba(190,24,93,.34); color: #be185d; }
        .club-backBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.52); box-shadow: 0 8px 18px rgba(190,24,93,.14); transform: translateY(-1px); }
        .club-secondaryBtn { background: #f0fcff; border: 1px solid rgba(83,199,217,.40); color: #0f8ea0; }
        .club-secondaryBtn:hover { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; border-radius: 12px; color: #164e63; font-weight: 850; margin-bottom: 12px; padding: 10px 12px; }
        .club-profileHero { background: linear-gradient(180deg, #fbfeff 0%, #f4fbfd 100%); border: 1px solid rgba(83,199,217,.18); border-radius: 20px; display: grid; gap: 0; overflow: hidden; position: relative; }
        .club-profileCover { background: linear-gradient(135deg, rgba(105,223,227,.42) 0%, rgba(15,142,160,.24) 48%, rgba(8,47,73,.22) 100%); min-height: 174px; overflow: hidden; position: relative; }
        .club-profileGlow { border-radius: 999px; filter: blur(0); opacity: .8; position: absolute; }
        .club-profileGlow--left { background: rgba(255,255,255,.42); height: 180px; left: -24px; top: -38px; width: 180px; }
        .club-profileGlow--right { background: rgba(186,230,253,.30); height: 220px; right: -34px; top: -28px; width: 220px; }
        .club-profileMain { display: grid; gap: 20px; grid-template-columns: auto minmax(0, 1fr); margin-top: -64px; padding: 0 22px 22px; position: relative; }
        .club-profileAvatar { align-items: center; background: #fff; border: 5px solid rgba(255,255,255,.98); border-radius: 24px; box-shadow: 0 22px 46px rgba(15,23,42,.16); color: #17253f; display: inline-flex; font-size: 34px; font-weight: 950; height: 132px; justify-content: center; overflow: hidden; position: relative; width: 132px; }
        .club-profileAvatar :global(img) { object-fit: cover; }
        .club-profileIdentity { align-self: end; min-width: 0; padding-top: 58px; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-title { color: #17253f; font-size: 38px; line-height: 1.02; margin: 6px 0 10px; }
        .club-sub { color: #526277; font-size: 14px; line-height: 1.5; margin: 0; max-width: 760px; }
        .club-profileBadges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .club-profileBadge { background: rgba(255,255,255,.92); border: 1px solid rgba(15,23,42,.08); border-radius: 999px; box-shadow: 0 10px 18px rgba(15,23,42,.05); color: #334155; font-size: 12px; font-weight: 900; padding: 7px 11px; }
        .club-profileGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-card--primary { border-color: rgba(83,199,217,.20); }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-infoGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-infoItem, .club-statCard { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-infoItem span, .club-statCard span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-infoItem strong, .club-statCard strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-statsGrid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-placeholderBox { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.45; padding: 12px; }
        @media (min-width: 980px) {
          .club-profileGrid { grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); }
        }
        @media (max-width: 760px) {
          .club-profileCover { min-height: 148px; }
          .club-profileMain { grid-template-columns: 1fr; margin-top: -36px; }
          .club-profileAvatar { height: 104px; width: 104px; }
          .club-profileIdentity { padding-top: 0; }
          .club-title { font-size: 30px; }
          .club-infoGrid, .club-statsGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
