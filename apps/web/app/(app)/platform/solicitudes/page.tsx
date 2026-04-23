'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { clubStatusBadgeClass, clubStatusLabel } from '@/lib/platformStatus'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type PendingClubRow = {
  id: string
  created_at: string
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  name: string
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

function VisualCard({ row, onClose }: { row: PendingClubRow; onClose: () => void }) {
  return (
    <div className="px-modalOverlay" onClick={onClose}>
      <div className="px-modalCard px-platformRequestModal" onClick={(e) => e.stopPropagation()}>
        <div className="px-modalHead">
          <div>
            <div className="px-platformMiniTag">Solicitud de alta</div>
            <h2 className="px-modalTitle">{row.name}</h2>
            <div className="px-modalSub">Creada el {formatDate(row.created_at)}</div>
          </div>
          <button className="px-btn px-btn--ghost" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div className="px-platformRequestHero">
          <div className="px-platformRequestLogo">
            {row.logo_url ? <img src={row.logo_url} alt="Logo club" /> : <span>{row.name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="px-platformRequestHeroText">
            <div className="px-platformRequestName">{row.brand_name || row.name}</div>
            <div className="px-platformRequestSub">{[row.city, row.province, row.country].filter(Boolean).join(' · ') || 'Ubicación sin completar'}</div>
            <div>
              <span className={`px-statusBadge ${clubStatusBadgeClass(row.status)}`}>
                {clubStatusLabel(row.status)}
              </span>
            </div>
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
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<PendingClubRow[]>([])
  const [alert, setAlert] = useState<AlertState>(null)
  const [selected, setSelected] = useState<PendingClubRow | null>(null)
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

    const res = await fetch('/api/platform/clubs-admin?status=PENDING_APPROVAL', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setAlert({ variant: 'error', title: 'No pude leer las solicitudes', message: json?.error ?? 'Error' })
      setLoading(false)
      return
    }

    const nextRows = (json?.rows ?? []) as PendingClubRow[]
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
  const selectedId = selected?.id ?? focusId

  async function applyAction(row: PendingClubRow, action: 'approve' | 'reject') {
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
    const res = await fetch('/api/platform/clubs-admin', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        clubId: row.id,
        action,
        reason: action === 'reject' ? rejectionReason.trim() || undefined : undefined,
      }),
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
        ? 'El club ya quedó habilitado y visible para la operación pública.'
        : 'Se rechazó la solicitud del club y se actualizó su estado.',
    })
    setSelected(null)
    setRejectionReason('')
    await load()
  }

  return (
    <div className="platform-shell">
      <div className="platform-panel">
        <div className="px-platform px-platform--requests">
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

          <div className="px-kpis px-kpis--platformAdmin" style={{ marginTop: 16 }}>
            <div className="px-platformMetricCard"><span>Pendientes</span><strong>{pendingCount}</strong></div>
            <div className="px-platformMetricCard"><span>Últimas ingresadas</span><strong>{latestThree.length}</strong></div>
            <div className="px-platformMetricCard"><span>Modalidad</span><strong>Alta club</strong></div>
            <div className="px-platformMetricCard"><span>Acción sugerida</span><strong>Revisar hoy</strong></div>
          </div>

          {alert ? <div style={{ marginTop: 14 }}><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /></div> : null}

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
                    const isSelected = selectedId === row.id
                    return (
                      <article key={row.id} className={`px-platformRequestItem ${isSelected ? 'is-focused' : ''}`}>
                        <div className="px-platformRequestItemHead">
                          <div>
                            <div className="px-platformRequestTitle">{row.name}</div>
                            <div className="px-platformRequestMeta">{[row.city, row.province].filter(Boolean).join(' · ') || 'Ubicación sin completar'} · {formatDate(row.created_at)}</div>
                          </div>
                          <span className={`px-statusBadge ${clubStatusBadgeClass(row.status)}`}>
                            {clubStatusLabel(row.status)}
                          </span>
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
                    <button
                      key={row.id}
                      className={`px-platformMiniItem${selectedId === row.id ? ' is-selected' : ''}`}
                      type="button"
                      onClick={() => setSelected(row)}
                    >
                      <strong>{row.name}</strong>
                      <span>{row.owner_name || row.owner_email || 'Sin responsable'}</span>
                      <span>{[row.city, row.province].filter(Boolean).join(' · ') || 'Ubicación sin completar'}</span>
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

      <style jsx>{`
        .px-platformHead,
        .px-platformChecklist,
        .px-platformMiniStack {
          gap: 14px;
        }

        .px-platformGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }

        .px-platformGrid > *,
        .px-platformAsideStack,
        .px-platformCard {
          min-width: 0;
        }

        .px-platformCard {
          border-radius: 8px;
          padding: 18px;
        }

        .px-sectionTitle {
          margin-bottom: 14px;
        }

        .px-platformRequestList {
          display: grid;
          gap: 12px;
        }

        .px-platformRequestItem {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 8px;
          padding: 14px;
          background: #fff;
          display: grid;
          gap: 10px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
        }

        .px-platformRequestItem:hover {
          border-color: rgba(14, 116, 144, 0.34);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
        }

        .px-platformRequestItem.is-focused {
          border-color: rgba(14, 116, 144, 0.62);
          background: rgba(14, 116, 144, 0.04);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformRequestItemHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .px-platformRequestItemHead > div {
          min-width: 0;
          flex: 1;
        }

        .px-platformRequestTitle,
        .px-platformRequestMeta,
        .px-platformRequestOwner,
        .px-platformRequestText,
        .px-platformMiniItem strong,
        .px-platformMiniItem span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .px-platformRequestTitle {
          color: #0f172a;
          font-size: 1rem;
          font-weight: 800;
        }

        .px-platformRequestMeta,
        .px-platformRequestText,
        .px-platformMiniItem span {
          color: #64748b;
          font-size: 0.88rem;
        }

        .px-platformRequestOwner {
          color: #334155;
          font-size: 0.92rem;
        }

        .px-platformRequestOwner strong {
          color: #0f172a;
        }

        :global(.px-statusBadge) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        :global(.px-statusBadge.is-success) {
          background: rgba(22, 163, 74, 0.12);
          color: #166534;
          border-color: rgba(22, 163, 74, 0.18);
        }

        :global(.px-statusBadge.is-warning) {
          background: rgba(245, 158, 11, 0.14);
          color: #92400e;
          border-color: rgba(245, 158, 11, 0.2);
        }

        :global(.px-statusBadge.is-danger) {
          background: rgba(239, 68, 68, 0.12);
          color: #b91c1c;
          border-color: rgba(239, 68, 68, 0.18);
        }

        :global(.px-statusBadge.is-neutral) {
          background: rgba(71, 85, 105, 0.14);
          color: #334155;
          border-color: rgba(71, 85, 105, 0.16);
        }

        .px-platformRequestActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .px-platformMiniStack {
          display: grid;
        }

        .px-platformMiniItem {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          background: #fff;
          text-align: left;
          padding: 12px;
          display: grid;
          gap: 4px;
          transition: border-color 0.18s ease, background-color 0.18s ease;
        }

        .px-platformMiniItem:hover,
        .px-platformMiniItem:focus-visible {
          border-color: rgba(14, 116, 144, 0.34);
          background: rgba(248, 250, 252, 0.96);
          outline: none;
        }

        .px-platformMiniItem.is-selected {
          border-color: rgba(14, 116, 144, 0.62);
          background: rgba(14, 116, 144, 0.04);
          box-shadow: inset 3px 0 0 rgba(14, 116, 144, 0.85);
        }

        .px-platformMiniItem strong {
          color: #0f172a;
          font-size: 0.94rem;
        }

        .px-platformRequestModal {
          width: min(980px, calc(100vw - 24px));
          max-height: calc(100vh - 24px);
          overflow: auto;
          border-radius: 8px;
        }

        .px-platformRequestHero {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 18px 0;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          background: rgba(248, 250, 252, 0.92);
        }

        .px-platformRequestLogo {
          width: 64px;
          height: 64px;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.06);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          color: #0f172a;
          font-weight: 800;
        }

        .px-platformRequestLogo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .px-platformRequestHeroText {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .px-platformRequestName,
        .px-platformRequestSub {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .px-platformRequestName {
          color: #0f172a;
          font-size: 1.08rem;
          font-weight: 800;
        }

        .px-platformRequestSub {
          color: #64748b;
          font-size: 0.92rem;
        }

        .px-platformRequestGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .px-platformInfoCard {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          padding: 16px;
          background: #fff;
          min-width: 0;
        }

        .px-platformInfoCard h3 {
          margin: 0 0 12px;
          color: #0f172a;
          font-size: 0.96rem;
          font-weight: 800;
        }

        .px-platformInfoRows {
          display: grid;
        }

        .px-platformInfoRows > div {
          display: grid;
          gap: 4px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .px-platformInfoRows > div:last-child {
          border-bottom: 0;
        }

        .px-platformInfoRows span {
          color: #64748b;
          font-size: 0.82rem;
        }

        .px-platformInfoRows strong {
          color: #0f172a;
          font-size: 0.94rem;
          line-height: 1.35;
          word-break: break-word;
        }

        .px-platformNoteBox {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          padding: 12px;
          background: rgba(248, 250, 252, 0.92);
          color: #334155;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .px-platformMiniTag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          padding: 0 9px;
          border-radius: 999px;
          font-size: 0.76rem;
          font-weight: 700;
          background: rgba(14, 116, 144, 0.1);
          color: #155e75;
          border: 1px solid rgba(14, 116, 144, 0.16);
          margin-bottom: 8px;
        }

        .px-platformDecisionBar {
          position: sticky;
          bottom: 12px;
          z-index: 10;
          width: min(1040px, calc(100vw - 24px));
          margin: 16px auto 0;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
          display: grid;
          gap: 12px;
        }

        .px-platformDecisionActions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        @media (max-width: 960px) {
          .px-platformGrid {
            grid-template-columns: minmax(0, 1fr);
          }

          .px-platformRequestGrid {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @media (max-width: 640px) {
          .px-platformCard {
            padding: 16px;
          }

          .px-platformRequestItemHead,
          .px-platformRequestHero,
          .px-platformDecisionActions {
            align-items: stretch;
            flex-direction: column;
          }

          .px-platformRequestBadge,
          .px-platformMiniTag {
            align-self: flex-start;
          }

          .px-platformRequestName,
          .px-platformRequestSub,
          .px-platformRequestTitle,
          .px-platformRequestMeta,
          .px-platformRequestOwner,
          .px-platformRequestText,
          .px-platformMiniItem strong,
          .px-platformMiniItem span {
            white-space: normal;
          }

          .px-platformDecisionBar {
            width: calc(100vw - 24px);
            bottom: 8px;
          }
        }
      `}</style>
    </div>
  )
}
