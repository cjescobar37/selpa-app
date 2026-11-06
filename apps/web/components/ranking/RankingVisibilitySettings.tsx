'use client'

import { useEffect, useRef, useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { readPlayerProfile } from '@/lib/playerProfileRead'
import { getCurrentSession } from '@/lib/supabaseClient'
import styles from './RankingVisibilitySettings.module.css'

type Branch = { id: string; name: string; slug: string; is_active: boolean; is_visible: boolean; updated_at: string }
export default function RankingVisibilitySettings({ clubId, onChanged }: { clubId: string; onChanged: () => void }) {
  const session = useSession()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; branches: Branch[] } | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const userId = session.status === 'ready' ? session.user?.id : undefined
  const key = userId + ':' + clubId
  const allowed = session.status === 'ready' && (session.isPlatformAdmin || (session.isApprovedMember && (session.clubRole === 'OWNER' || session.clubRole === 'ADMIN')))
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!open || !userId || !allowed) return
    const controller = new AbortController()
    readPlayerProfile<{ branches: Branch[] }>('/api/clubs/' + clubId + '/ranking/visibility', userId, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setResult({ key, branches: data.branches }); setMessage('') } })
      .catch(() => { if (!controller.signal.aborted) setMessage('No pudimos cargar las ramas. Volvé a intentar.') })
    return () => controller.abort()
  }, [open, userId, clubId, key, attempt, allowed])
  async function change(branch: Branch, visible: boolean) {
    if (!userId || saving) return
    setSaving(true)
    setMessage('')
    try {
      const auth = await getCurrentSession()
      if (auth.error || auth.data.session?.user.id !== userId || !auth.data.session.access_token) throw new Error('SESSION_UNAVAILABLE')
      const response = await fetch('/api/clubs/' + clubId + '/ranking/visibility', {
        method: 'PATCH', cache: 'no-store', headers: { Authorization: 'Bearer ' + auth.data.session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: branch.id, visible, expectedUpdatedAt: branch.updated_at }),
      })
      if (!response.ok) {
        if (alive.current) setMessage(response.status === 409 ? 'La configuración cambió. Cerrá y volvé a abrir para actualizarla.' : 'No se pudo guardar. Volvé a cargar antes de reintentar.')
        return
      }
      const data = await response.json() as { branch: Branch }
      if (alive.current) { setResult(current => current?.key === key ? { key, branches: current.branches.map(b => b.id === data.branch.id ? data.branch : b) } : current); onChanged() }
    } catch {
      if (alive.current) setMessage('No se pudo confirmar el cambio. Cerrá y volvé a abrir para verificar el estado.')
    } finally {
      if (alive.current) setSaving(false)
    }
  }
  if (!allowed) return null
  const branches = result?.key === key ? result.branches : null
  return <div className={styles.settings}>
    <button type="button" className={styles.opener} aria-label="Ramas publicadas" title="Ramas publicadas" onClick={() => { dialog.current?.showModal(); setOpen(true) }}><Settings2 size={16} aria-hidden="true" /></button>
    <dialog ref={dialog} className={styles.sheet} aria-labelledby="ranking-visibility-title" onClose={() => setOpen(false)}
      onClick={event => { if (event.target !== dialog.current) return; const box = dialog.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current.close() }}>
      <header><h2 id="ranking-visibility-title">Publicación deportiva</h2><button type="button" aria-label="Cerrar configuración" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      <p>Una rama oculta también se oculta en la carrera pública. Las temporadas privadas conservan su privacidad.</p>
      {branches ? branches.map(branch => <label key={branch.id} className={styles.branch}>
        <span><strong>{branch.name}</strong><small>{!branch.is_active ? 'Desactivada en el catálogo' : branch.slug === 'mixto' ? 'Parejas según la oferta del club' : branch.is_visible ? 'Visible al público' : 'Oculta al público'}</small></span>
        <input type="checkbox" checked={branch.is_visible} disabled={!branch.is_active || saving} onChange={event => void change(branch, event.target.checked)} aria-label={'Publicar rama ' + branch.name} />
      </label>) : !message ? <p role="status">Cargando ramas…</p> : null}
      {message ? <div className={styles.message} role="alert"><p>{message}</p>{!branches ? <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button> : null}</div> : null}
      {saving ? <p role="status">Guardando…</p> : null}
    </dialog>
  </div>
}
