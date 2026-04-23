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

type Membership = {
  id: string
  club_id: string
  user_id: string
  role: string
  status: string
  created_at: string
  approved_at: string | null
  rejection_reason?: string | null
  profiles: Profile | null | Profile[]
}

function normProfile(value: Membership['profiles']) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function fullName(m: Membership) {
  const p = normProfile(m.profiles)
  return (
    p?.display_name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
    p?.email ||
    'Usuario'
  )
}

export default function ClubUsuariosPage() {
  const { activeClub } = useSession()
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [rows, setRows] = useState<Membership[]>([])
  const [selected, setSelected] = useState<Membership | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  async function loadRows() {
    if (!activeClub?.id) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMsg('')

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token

    if (!token) {
      setMsg('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/memberships?clubId=${activeClub.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMsg(json?.error ?? 'No pude cargar las solicitudes.')
      setLoading(false)
      return
    }

    setRows((json?.memberships ?? []) as Membership[])
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [activeClub?.id])

  async function applyAction(membershipId: string, action: 'approve' | 'reject') {
    setSavingId(membershipId)
    setMsg('')

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token

    if (!token) {
      setMsg('Sesión inválida.')
      setSavingId(null)
      return
    }

    const body: any = { membershipId, action }
    if (action === 'reject') {
      body.rejectionReason = rejectionReason.trim()
    }

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
      setMsg(json?.error ?? 'No pude actualizar la solicitud.')
      return
    }

    setMsg(action === 'approve' ? 'Solicitud aprobada.' : 'Solicitud rechazada.')
    setSelected(null)
    setRejectionReason('')
    await loadRows()
  }

  const pending = useMemo(() => rows.filter((r) => r.status === 'PENDING'), [rows])
  const approved = useMemo(() => rows.filter((r) => r.status === 'APPROVED'), [rows])

  return (
    <div className="club-shell">
      <div className="club-panel">
        <h1 className="club-title">Usuarios del club</h1>
        <p className="club-sub">
          Gestioná solicitudes pendientes, aprobaciones y miembros activos.
        </p>

        {msg ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              border: '1px solid rgba(105,223,227,.24)',
              background: 'rgba(105,223,227,.08)',
              color: '#16384a',
              fontWeight: 700,
            }}
          >
            {msg}
          </div>
        ) : null}

        {!activeClub?.id ? (
          <div style={{ marginTop: 14 }} className="px-empty">
            Primero seleccioná un club activo.
          </div>
        ) : loading ? (
          <div style={{ marginTop: 14 }} className="px-empty">
            Cargando usuarios…
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 18 }}>
            <section>
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.14em', opacity: 0.72, marginBottom: 10 }}>
                Solicitudes pendientes
              </div>

              {pending.length === 0 ? (
                <div className="px-empty">No hay solicitudes pendientes.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {pending.map((row) => {
                    const profile = normProfile(row.profiles)
                    return (
                      <div
                        key={row.id}
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: '1px solid rgba(255,196,0,.24)',
                          background: 'linear-gradient(180deg, rgba(255,196,0,.10), rgba(255,196,0,.04))',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 14,
                                overflow: 'hidden',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(18,33,60,0.12)',
                                color: '#12213c',
                                fontWeight: 900,
                              }}
                            >
                              {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span>{getClubInitials(fullName(row))}</span>
                              )}
                            </span>

                            <div>
                              <div style={{ fontWeight: 900 }}>{fullName(row)}</div>
                              <div style={{ fontSize: 13, opacity: 0.86 }}>{profile?.email ?? 'Sin email'}</div>
                              <div style={{ fontSize: 13, opacity: 0.86 }}>
                                Rol solicitado: <b>{row.role}</b>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(row)
                                setRejectionReason(row.rejection_reason ?? '')
                              }}
                              style={viewBtn}
                            >
                              Ver
                            </button>

                            <button
                              type="button"
                              onClick={() => applyAction(row.id, 'approve')}
                              disabled={savingId === row.id}
                              style={approveBtn}
                            >
                              {savingId === row.id ? 'Procesando…' : 'Aprobar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelected(row)
                                setRejectionReason('')
                              }}
                              disabled={savingId === row.id}
                              style={rejectBtn}
                            >
                              Rechazar
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.14em', opacity: 0.72, marginBottom: 10 }}>
                Miembros aprobados
              </div>

              {approved.length === 0 ? (
                <div className="px-empty">No hay miembros aprobados todavía.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {approved.map((row) => {
                    const profile = normProfile(row.profiles)
                    return (
                      <div
                        key={row.id}
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: '1px solid rgba(255,255,255,.10)',
                          background: 'rgba(255,255,255,.04)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{fullName(row)}</div>
                            <div style={{ fontSize: 13, opacity: 0.78 }}>{profile?.email ?? 'Sin email'}</div>
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.86 }}>
                            Rol: <b>{row.role}</b> · Estado: <b>{row.status}</b>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {selected ? (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,.10)',
              background: 'rgba(255,255,255,.04)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Ficha del jugador</div>

            <div>
              <div><b>Nombre:</b> {fullName(selected)}</div>
              <div><b>Email:</b> {normProfile(selected.profiles)?.email ?? 'Sin email'}</div>
              <div><b>Rol solicitado:</b> {selected.role}</div>
              <div><b>Estado:</b> {selected.status}</div>
            </div>

            <div>
              <div className="px-label" style={{ marginBottom: 6 }}>Motivo del rechazo</div>
              <textarea
                className="px-input"
                rows={3}
                placeholder="Explicá por qué se rechaza la solicitud..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => applyAction(selected.id, 'approve')}
                disabled={savingId === selected.id}
                style={approveBtn}
              >
                {savingId === selected.id ? 'Procesando…' : 'Aprobar'}
              </button>

              <button
                type="button"
                onClick={() => applyAction(selected.id, 'reject')}
                disabled={savingId === selected.id}
                style={rejectBtn}
              >
                Rechazar con motivo
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setRejectionReason('')
                }}
                style={cancelBtn}
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const viewBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(92,134,255,.35)',
  background: '#294e96',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}

const approveBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(84,214,120,.35)',
  background: '#256d3e',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}

const rejectBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,107,107,.35)',
  background: '#8f2d2d',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}

const cancelBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.06)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}