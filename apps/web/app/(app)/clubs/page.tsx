'use client'

import { useEffect, useMemo, useState } from 'react'
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
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 6 }}>Clubes activos</h1>
          <p style={{ opacity: 0.8 }}>
            Explorá todos los clubes activos de PAMPRAX y solicitá tu alta como jugador en el que quieras.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/seleccionar-club" style={linkBtn}>Seleccionar club</Link>
          <Link href="/clubs/nuevo" style={linkBtn}>Dar de alta mi club</Link>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 14,
            border: '1px solid rgba(105,223,227,.25)',
            background: 'rgba(105,223,227,.08)',
          }}
        >
          {msg}
        </div>
      ) : null}

      {loading ? <div style={{ marginTop: 18 }}>Cargando clubes…</div> : null}

      <div
        style={{
          marginTop: 18,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {ordered.map((club) => {
          const status = club.membership_status
          const canRequest = !status || status === 'REJECTED'
          const isPending = status === 'PENDING'
          const isApproved = club.membership_approved
          const isBusy = requestingId === club.id

          return (
            <div
              key={club.id}
              style={{
                padding: 16,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    overflow: 'hidden',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(105,223,227,.12)',
                    fontWeight: 900,
                  }}
                >
                  {club.logo_url ? (
                    <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{getClubInitials(club.name)}</span>
                  )}
                </span>

                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{club.name}</div>
                  <div style={{ opacity: 0.78, fontSize: 13 }}>
                    {[club.city, club.province].filter(Boolean).join(', ') || 'Sin ubicación'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, opacity: 0.78 }}>
                Estado actual:{' '}
                <b>
                  {status ?? 'SIN SOLICITUD'}
                </b>
                {club.membership_role ? <> · Rol: <b>{club.membership_role}</b></> : null}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {canRequest ? (
                  <button
                    type="button"
                    onClick={() => requestJoin(club.id)}
                    disabled={isBusy}
                    style={primaryBtn}
                  >
                    {isBusy ? 'Enviando…' : status === 'REJECTED' ? 'Volver a solicitar' : 'Solicitar unirme'}
                  </button>
                ) : null}

                {isPending ? (
                  <span style={pill('warning')}>Pendiente de aprobación</span>
                ) : null}

                {isApproved ? (
                  <Link href="/seleccionar-club" style={{ ...linkBtn, display: 'inline-flex' }}>
                    Ir a activarlo
                  </Link>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {!loading && ordered.length === 0 ? (
        <div style={{ marginTop: 18, opacity: 0.8 }}>Todavía no hay clubes cargados.</div>
      ) : null}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(105,223,227,.35)',
  background: 'rgba(105,223,227,.12)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}

const linkBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.15)',
  background: 'rgba(255,255,255,.05)',
  color: 'white',
  textDecoration: 'none',
  fontWeight: 700,
}

function pill(kind: 'warning' | 'success'): React.CSSProperties {
  if (kind === 'success') {
    return {
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid rgba(84,214,120,.28)',
      background: 'rgba(84,214,120,.12)',
      color: 'white',
      fontSize: 13,
      fontWeight: 700,
    }
  }

  return {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,196,0,.28)',
    background: 'rgba(255,196,0,.12)',
    color: 'white',
    fontSize: 13,
    fontWeight: 700,
  }
}
