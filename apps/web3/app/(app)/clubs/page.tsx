'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'

type Club = {
  id: string
  name: string
  city: string | null
  province: string | null
  logo_url: string | null
  membership_status: string | null
  membership_role: string | null
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
    <div style={{ maxWidth: 1120, color: '#10213f' }}>
      <section
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98))',
          border: '1px solid rgba(22,40,74,.08)',
          borderRadius: 28,
          padding: '24px clamp(18px, 3vw, 32px)',
          boxShadow: '0 18px 44px rgba(16,24,40,.08)',
        }}
      >
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ maxWidth: 680 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  borderRadius: 999,
                  background: 'rgba(53,88,165,.10)',
                  color: '#3558a5',
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                }}
              >
                Jugadores · Clubes
              </span>

              <h1 style={{ fontSize: 'clamp(30px, 4vw, 40px)', fontWeight: 900, margin: '14px 0 8px', color: '#112347' }}>
                Clubes activos
              </h1>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#52627e' }}>
                Explorá los clubes activos de PAMPRAX, revisá tu estado actual y solicitá el alta como jugador en el club que quieras.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 12, minWidth: 250, width: 'min(100%, 320px)' }}>
              <Link href="/seleccionar-club" style={heroPrimaryLink}>
                <span style={{ fontSize: 15, fontWeight: 900 }}>Seleccionar club</span>
                <span style={{ fontSize: 13, opacity: 0.92 }}>Elegí tu club activo y seguí con el contexto correcto.</span>
              </Link>
              <Link href="/unir-mi-club" style={heroSecondaryLink}>
                <span style={{ fontSize: 15, fontWeight: 900 }}>Dar de alta mi club</span>
                <span style={{ fontSize: 13, color: '#61708c' }}>Creá una solicitud para sumar tu club a PAMPRAX.</span>
              </Link>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
            }}
          >
            <div style={statCard}>
              <div style={statLabel}>Clubes visibles</div>
              <div style={statValue}>{ordered.length}</div>
            </div>
            <div style={statCard}>
              <div style={statLabel}>Aprobados</div>
              <div style={statValue}>{ordered.filter((club) => club.membership_status === 'APPROVED').length}</div>
            </div>
            <div style={statCard}>
              <div style={statLabel}>Pendientes</div>
              <div style={statValue}>{ordered.filter((club) => club.membership_status === 'PENDING').length}</div>
            </div>
          </div>
        </div>
      </section>

      {msg ? (
        <div
          style={{
            marginTop: 16,
            padding: '14px 16px',
            borderRadius: 18,
            border: '1px solid rgba(105,223,227,.32)',
            background: 'linear-gradient(180deg, rgba(105,223,227,.14), rgba(105,223,227,.08))',
            color: '#163b58',
            fontWeight: 700,
            boxShadow: '0 12px 28px rgba(105,223,227,.10)',
          }}
        >
          {msg}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 20, color: '#4d5c77', fontWeight: 700 }}>Cargando clubes…</div> : null}

      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: 16,
        }}
      >
        {ordered.map((club) => {
          const status = club.membership_status
          const canRequest = !status || status === 'REJECTED'
          const isPending = status === 'PENDING'
          const isApproved = status === 'APPROVED'
          const isBusy = requestingId === club.id

          return (
            <article
              key={club.id}
              style={{
                padding: 18,
                borderRadius: 24,
                border: '1px solid rgba(22,40,74,.09)',
                background: 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(246,248,252,.96))',
                display: 'grid',
                gap: 14,
                boxShadow: '0 16px 34px rgba(16,24,40,.07)',
              }}
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    overflow: 'hidden',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(53,88,165,.12), rgba(105,223,227,.12))',
                    border: '1px solid rgba(53,88,165,.10)',
                    color: '#28457f',
                    fontWeight: 900,
                    fontSize: 16,
                    flex: '0 0 auto',
                  }}
                >
                  {club.logo_url ? (
                    <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{getClubInitials(club.name)}</span>
                  )}
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1, color: '#10213f' }}>{club.name}</div>
                  <div style={{ marginTop: 4, color: '#5b6a85', fontSize: 14 }}>
                    {[club.city, club.province].filter(Boolean).join(' · ') || 'Sin ubicación cargada'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <span style={statusChip(status)}>{statusLabel(status)}</span>
                {club.membership_role ? <span style={roleChip}>Rol {club.membership_role}</span> : null}
              </div>

              <div
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(22,40,74,.08)',
                  background: 'rgba(244,247,251,.92)',
                  padding: '14px 15px',
                  color: '#495a78',
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                {isApproved
                  ? 'Ya pertenecés a este club. Podés activarlo y seguir usando la app con ese contexto.'
                  : isPending
                    ? 'Tu solicitud está pendiente. Cuando el club la apruebe vas a recibir una notificación.'
                    : 'Todavía no tenés una solicitud activa para este club.'}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {canRequest ? (
                  <button
                    type="button"
                    onClick={() => requestJoin(club.id)}
                    disabled={isBusy}
                    style={primaryBtn}
                  >
                    {isBusy ? 'Enviando…' : status === 'REJECTED' ? 'Volver a solicitar' : 'Solicitar ingreso'}
                  </button>
                ) : null}

                {isPending ? <span style={softPill}>Pendiente de aprobación</span> : null}

                {isApproved ? (
                  <Link href="/seleccionar-club" style={secondaryLinkBtn}>
                    Ir a activarlo
                  </Link>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {!loading && ordered.length === 0 ? (
        <div style={{ marginTop: 20, color: '#667085' }}>Todavía no hay clubes cargados.</div>
      ) : null}
    </div>
  )
}

const statCard: CSSProperties = {
  borderRadius: 20,
  padding: '16px 18px',
  border: '1px solid rgba(22,40,74,.08)',
  background: 'rgba(250,252,255,.98)',
}

const statLabel: CSSProperties = {
  fontSize: 12,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: '#6e7b94',
  fontWeight: 800,
}

const statValue: CSSProperties = {
  marginTop: 6,
  fontSize: 28,
  lineHeight: 1,
  fontWeight: 900,
  color: '#10213f',
}

const heroPrimaryLink: CSSProperties = {
  display: 'grid',
  gap: 4,
  textDecoration: 'none',
  padding: '14px 16px',
  borderRadius: 18,
  border: '1px solid rgba(53,88,165,.14)',
  background: 'linear-gradient(135deg, #3558a5, #28457f)',
  color: 'white',
  boxShadow: '0 14px 28px rgba(53,88,165,.20)',
}

const heroSecondaryLink: CSSProperties = {
  display: 'grid',
  gap: 4,
  textDecoration: 'none',
  padding: '14px 16px',
  borderRadius: 18,
  border: '1px solid rgba(22,40,74,.10)',
  background: 'rgba(255,255,255,.98)',
  color: '#10213f',
}

const primaryBtn: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 14,
  border: '1px solid rgba(53,88,165,.16)',
  background: 'linear-gradient(135deg, #3558a5, #28457f)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
  boxShadow: '0 12px 26px rgba(53,88,165,.18)',
}

const secondaryLinkBtn: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 14,
  border: '1px solid rgba(22,40,74,.10)',
  background: '#fff',
  color: '#10213f',
  textDecoration: 'none',
  fontWeight: 800,
}

const softPill: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 999,
  border: '1px solid rgba(245, 158, 11, .22)',
  background: 'rgba(245, 158, 11, .10)',
  color: '#9a6700',
  fontWeight: 800,
  fontSize: 13,
}

const roleChip: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid rgba(53,88,165,.12)',
  background: 'rgba(53,88,165,.08)',
  color: '#28457f',
  fontWeight: 800,
  fontSize: 12,
}

function statusChip(status: string | null): CSSProperties {
  if (status === 'APPROVED') {
    return {
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid rgba(16,185,129,.18)',
      background: 'rgba(16,185,129,.10)',
      color: '#0f766e',
      fontWeight: 800,
      fontSize: 12,
    }
  }

  if (status === 'PENDING') {
    return {
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid rgba(245,158,11,.22)',
      background: 'rgba(245,158,11,.10)',
      color: '#9a6700',
      fontWeight: 800,
      fontSize: 12,
    }
  }

  if (status === 'REJECTED') {
    return {
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid rgba(239,68,68,.18)',
      background: 'rgba(239,68,68,.08)',
      color: '#b42318',
      fontWeight: 800,
      fontSize: 12,
    }
  }

  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(22,40,74,.10)',
    background: 'rgba(244,247,251,.95)',
    color: '#5b6a85',
    fontWeight: 800,
    fontSize: 12,
  }
}

function statusLabel(status: string | null) {
  if (status === 'APPROVED') return 'Aprobado'
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'REJECTED') return 'Rechazado'
  return 'Sin solicitud'
}
