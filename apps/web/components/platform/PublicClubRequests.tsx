'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { humanizeUiError } from '@/lib/productPresentation'
import { useWriteGuard } from '@/lib/useWriteGuard'
import styles from '@/components/product/ProductFlow.module.css'

type RequestRow = {
  id: string; club_name: string; city: string | null; province: string | null
  contact_email: string | null; owner_name: string | null; owner_email: string | null
  phone: string | null; address: string | null; courts_count: number | null; notes: string | null
}

export default function PublicClubRequests({ focusId }: { focusId?: string | null }) {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [limit, setLimit] = useState(5)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const write = useWriteGuard()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
      const res = await fetch('/api/club-requests', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(humanizeUiError(json.error, 'No pudimos leer las solicitudes de alta.'))
      const next: RequestRow[] = json.rows ?? []
      setRows(next)
      if (focusId && next.some(row => row.id === focusId)) {
        setReviewId(focusId)
        setLimit(Math.max(5, next.findIndex(row => row.id === focusId) + 1))
      }
    } catch (cause) {
      setError(humanizeUiError(cause instanceof Error ? cause.message : cause, 'No pudimos leer las solicitudes de alta. Intentá nuevamente.'))
    } finally { setLoading(false) }
  }, [focusId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (focusId && reviewId === focusId) document.getElementById(`club-request-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, reviewId, loading])

  async function decide(row: RequestRow, action: 'approve' | 'reject') {
    return write(async () => {
    if (action === 'reject' && !reason.trim()) { setError('Indicá el motivo del rechazo.'); return }
    setBusy(row.id)
    setError('')
    setNotice('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
      const res = await fetch(`/api/club-requests/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action, rejectionReason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(humanizeUiError(json.error, 'No pudimos aprobar este club.'))
      setRows(current => current.filter(item => item.id !== row.id))
      setReviewId(null)
      setReason('')
      setNotice(action === 'approve' ? `${row.club_name} quedó aprobado. Podés administrarlo desde Clubes.` : `${row.club_name}: solicitud rechazada.`)
    } catch (cause) {
      setError(humanizeUiError(cause instanceof Error ? cause.message : cause, 'No pudimos aprobar este club. Intentá nuevamente.'))
    } finally { setBusy('') }
    })
  }

  return <section className={styles.panel} aria-label="Solicitudes públicas de alta" style={{ marginTop: 12 }}>
    <div className={styles.actions}><h2>Altas desde Unir mi club</h2><button type="button" className={styles.link} disabled={loading || Boolean(busy)} onClick={load}>Actualizar altas</button></div>
    <p>Estas solicitudes todavía no son clubes. Revisá los datos del responsable antes de aprobar.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className={styles.link} onClick={load} disabled={Boolean(busy)}>Reintentar altas</button></div>}
    {loading ? <p role="status">Cargando altas…</p> : !error && rows.length === 0 ? <p>No hay nuevas solicitudes de alta.</p> : null}
    {!loading && !error && rows.slice(0, limit).map(row => <div key={row.id} id={`club-request-${row.id}`} className={styles.panel}>
      <div className={styles.actions}><strong>{row.club_name}</strong><button type="button" className={styles.link} aria-expanded={reviewId === row.id} onClick={() => setReviewId(reviewId === row.id ? null : row.id)}>Revisar alta</button></div>
      <p>{[row.city, row.province].filter(Boolean).join(' · ') || 'Ubicación sin completar'}</p>
      {reviewId === row.id && <div className={styles.grid}>
        <div><p>Responsable: {row.owner_name || 'Sin completar'}</p><p>{row.owner_email || 'Email sin completar'}</p><p>Contacto: {row.contact_email || row.phone || 'Sin completar'}</p></div>
        <div><p>{row.address || 'Dirección sin completar'} · {row.courts_count ?? 'Sin datos de'} canchas</p><p>{row.notes || 'Sin observaciones'}</p></div>
        <p>Al confirmar se creará el club con el responsable indicado. Debe tener una cuenta registrada con ese email.</p>
        <label className={styles.field}>Motivo de rechazo · sólo al rechazar<textarea rows={2} value={reason} disabled={Boolean(busy)} onChange={event => setReason(event.target.value)} /></label>
        <div className={styles.actions}><button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => decide(row, 'approve')}>{busy === row.id ? 'Procesando…' : 'Confirmar aprobación'}</button><button type="button" className={styles.link} disabled={Boolean(busy)} onClick={() => decide(row, 'reject')}>Confirmar rechazo</button></div>
      </div>}
    </div>)}
    {!error && rows.length > limit && <button type="button" className={styles.link} onClick={() => setLimit(current => current + 5)}>Ver más altas</button>}
  </section>
}
