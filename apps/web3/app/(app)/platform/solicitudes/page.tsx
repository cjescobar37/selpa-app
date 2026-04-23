'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type ClubRequestRow = {
  id: string
  created_at: string
  club_name: string
  brand_name: string | null
  legal_name: string | null
  cuit: string | null
  contact_email: string | null
  phone: string | null
  website: string | null
  instagram: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  opening_hours: string | null
  courts_count: number | null
  courts_surface: string | null
  logo_url: string | null
  rules_pdf_url: string | null
  notes: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function VisualCard({ row, onClose }: { row: ClubRequestRow; onClose: () => void }) {
  return (
    <div className="px-modalOverlay" onClick={onClose}>
      <div className="px-modalCard px-platformRequestModal" onClick={(e) => e.stopPropagation()}>
        <div className="px-modalHead">
          <div>
            <div className="px-platformMiniTag">Solicitud de alta</div>
            <h2 className="px-modalTitle">{row.club_name}</h2>
            <div className="px-modalSub">Creada el {formatDate(row.created_at)}</div>
          </div>
          <button className="px-btn px-btn--ghost" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div className="px-platformRequestHero">
          <div className="px-platformRequestLogo">
            {row.logo_url ? <img src={row.logo_url} alt="Logo club" /> : <span>{row.club_name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="px-platformRequestHeroText">
            <div className="px-platformRequestName">{row.brand_name || row.club_name}</div>
            <div className="px-platformRequestSub">{[row.city, row.province, row.country].filter(Boolean).join(' · ') || 'Ubicación sin completar'}</div>
          </div>
        </div>

        <div className="px-platformRequestGrid">
          <section className="px-platformInfoCard">
            <h3>Datos del club</h3>
            <div className="px-platformInfoRows">
              <div><span>Nombre comercial</span><strong>{row.brand_name || '—'}</strong></div>
              <div><span>Razón social</span><strong>{row.legal_name || '—'}</strong></div>
              <div><span>CUIT</span><strong>{row.cuit || '—'}</strong></div>
              <div><span>Email contacto</span><strong>{row.contact_email || '—'}</strong></div>
              <div><span>Teléfono</span><strong>{row.phone || '—'}</strong></div>
              <div><span>Dirección</span><strong>{row.address || '—'}</strong></div>
              <div><span>Horarios</span><strong>{row.opening_hours || '—'}</strong></div>
              <div><span>Canchas</span><strong>{row.courts_count ?? '—'}</strong></div>
              <div><span>Superficie</span><strong>{row.courts_surface || '—'}</strong></div>
              <div><span>Instagram</span><strong>{row.instagram || '—'}</strong></div>
              <div><span>Website</span><strong>{row.website || '—'}</strong></div>
              <div><span>Reglamento</span><strong>{row.rules_pdf_url ? 'Cargado' : 'No cargado'}</strong></div>
            </div>
          </section>

          <section className="px-platformInfoCard">
            <h3>Responsable</h3>
            <div className="px-platformInfoRows">
              <div><span>Nombre</span><strong>{row.owner_name || '—'}</strong></div>
              <div><span>Email</span><strong>{row.owner_email || '—'}</strong></div>
              <div><span>Teléfono</span><strong>{row.owner_phone || '—'}</strong></div>
            </div>

            <h3 style={{ marginTop: 16 }}>Notas</h3>
            <div className="px-platformNoteBox">{row.notes || 'Sin observaciones.'}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function PlatformSolicitudesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ClubRequestRow[]>([])
  const [alert, setAlert] = useState<AlertState>(null)
  const [selected, setSelected] = useState<ClubRequestRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  async function load() {
    setLoading(true)
    setAlert(null)

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      setLoading(false)
      return
    }

    const res = await fetch('/api/club-requests', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude leer las solicitudes', message: json?.error ?? 'Error' })
      setLoading(false)
      return
    }

    const nextRows = (json?.rows ?? []) as ClubRequestRow[]
    setRows(nextRows)

    const focused = focusId ? nextRows.find((row) => row.id === focusId) ?? null : null
    if (focused) setSelected(focused)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const pendingCount = rows.length
  const latestThree = rows.slice(0, 3)

  async function applyAction(row: ClubRequestRow, action: 'approve' | 'reject') {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
      return
    }

    if (action === 'reject' && !rejectionReason.trim()) {
      setAlert({ variant: 'warning', title: 'Falta el motivo', message: 'Escribí el motivo del rechazo.' })
      return
    }

    setBusyId(row.id)
    const res = await fetch(`/api/club-requests/${row.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, rejectionReason: rejectionReason.trim() || undefined }),
    })

    const json = await res.json().catch(() => ({}))
    setBusyId(null)

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude procesar la solicitud', message: json?.error ?? 'Error' })
      return
    }

    setAlert({
      variant: 'success',
      title: action === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      message: action === 'approve'
        ? 'El club ya quedó habilitado y el responsable recibió una notificación.'
        : 'Se rechazó la solicitud y se notificó al responsable.',
    })
    setSelected(null)
    setRejectionReason('')
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="platform-panel">
        <div className="px-platform">
          <div className="px-platformHead">
            <div>
              <h1 className="px-platformTitle">Solicitudes de alta de clubes</h1>
              <div className="px-platformSub">Revisá, visualizá y aprobá o denegá cada alta pendiente.</div>
            </div>
            <div className="px-toolbar">
              <span className="px-pill">{pendingCount} pendientes</span>
              <button className="px-btn px-btn--ghost" type="button" onClick={load}>Recargar</button>
            </div>
          </div>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

          <div className="px-platformGrid" style={{ marginTop: 16 }}>
            <div className="px-platformCard">
              <div className="px-sectionTitle">Pendientes</div>

              {loading ? (
                <div className="px-empty">Cargando solicitudes…</div>
              ) : rows.length === 0 ? (
                <div className="px-empty">No hay solicitudes pendientes.</div>
              ) : (
                <div className="px-platformRequestList">
                  {rows.map((row) => {
                    const isBusy = busyId === row.id
                    return (
                      <article key={row.id} className={`px-platformRequestItem ${focusId === row.id ? 'is-focused' : ''}`}>
                        <div className="px-platformRequestItemHead">
                          <div>
                            <div className="px-platformRequestTitle">{row.club_name}</div>
                            <div className="px-platformRequestMeta">{[row.city, row.province].filter(Boolean).join(' · ') || 'Ubicación sin completar'} · {formatDate(row.created_at)}</div>
                          </div>
                          <span className="px-platformRequestBadge">Alta club</span>
                        </div>

                        <div className="px-platformRequestOwner">Responsable: <strong>{row.owner_name || row.owner_email || '—'}</strong></div>
                        <div className="px-platformRequestText">{row.contact_email || 'Sin email de contacto'} · {row.phone || 'Sin teléfono'}</div>

                        <div className="px-platformRequestActions">
                          <button className="px-btn px-btn--ghost" type="button" onClick={() => setSelected(row)}>
                            Visualizar
                          </button>
                          <button className="px-btn px-btn--soft" type="button" disabled={isBusy} onClick={() => applyAction(row, 'approve')}>
                            {isBusy ? 'Procesando…' : 'Aceptar'}
                          </button>
                          <button className="px-btn px-btn--danger" type="button" onClick={() => setSelected(row)}>
                            Denegar
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-platformAsideStack">
              <div className="px-platformCard">
                <div className="px-sectionTitle">Últimas 3 solicitudes</div>
                <div className="px-platformMiniStack">
                  {latestThree.length === 0 ? (
                    <div className="px-empty">Sin movimientos recientes.</div>
                  ) : latestThree.map((row) => (
                    <button key={row.id} className="px-platformMiniItem" type="button" onClick={() => setSelected(row)}>
                      <strong>{row.club_name}</strong>
                      <span>{row.owner_name || row.owner_email || 'Sin responsable'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-platformCard">
                <div className="px-sectionTitle">Tips de revisión</div>
                <div className="px-platformChecklist">
                  <div>Validá datos del responsable.</div>
                  <div>Chequeá branding, contacto y CUIT.</div>
                  <div>Aprobá solo cuando el club esté listo para operar.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <VisualCard
          row={selected}
          onClose={() => {
            setSelected(null)
            setRejectionReason('')
          }}
        />
      ) : null}

      {selected ? (
        <div className="px-platformDecisionBar">
          <textarea
            className="px-input"
            rows={3}
            placeholder="Motivo del rechazo (solo si vas a denegar)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <div className="px-platformDecisionActions">
            <button className="px-btn px-btn--soft" type="button" disabled={busyId === selected.id} onClick={() => applyAction(selected, 'approve')}>
              Aprobar club
            </button>
            <button className="px-btn px-btn--danger" type="button" disabled={busyId === selected.id} onClick={() => applyAction(selected, 'reject')}>
              Denegar club
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
