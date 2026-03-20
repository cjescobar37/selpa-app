'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type NotificationRow = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  link: string | null
  created_at: string
  metadata?: Record<string, any> | null
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

function previewText(value: string, max = 120) {
  const clean = (value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

export default function NotificacionesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [msg, setMsg] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [selected, setSelected] = useState<NotificationRow | null>(null)

  async function load() {
    setLoading(true)
    setMsg('')

    const { data: userData } = await supabase.auth.getUser()
    const me = userData?.user
    if (!me) {
      setMsg('Sesión inválida.')
      setLoading(false)
      return
    }

    setCurrentUserId(me.id)

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, message, read, link, created_at, metadata')
      .eq('user_id', me.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setMsg(error.message)
      setLoading(false)
      return
    }

    setRows((data ?? []) as NotificationRow[])
    setLoading(false)
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setRows((cur) => cur.map((row) => (row.id === id ? { ...row, read: true } : row)))
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', currentUserId).eq('read', false).neq('type', 'message')
    setRows((cur) => cur.map((row) => ({ ...row, read: true })))
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read) {
      await markRead(n.id)
    }

    if (n.link) {
      router.push(n.link)
      return
    }

    setSelected(n)
  }

  useEffect(() => {
    load()
  }, [])

  const unread = rows.filter((r) => !r.read).length

  return (
    <div className="px-wrap">
      <div className="px-pageHead" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 className="px-pageTitle">Notificaciones</h1>
          <p className="px-pageSub">Aprobaciones, rechazos, avisos del sistema y novedades generales.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="px-pill">{unread} sin leer</span>
          <button type="button" onClick={markAllRead} className="px-btn px-btn--ghost">
            Marcar todo leído
          </button>
        </div>
      </div>

      {msg ? (
        <div className="px-card px-card--flat" style={{ marginBottom: 14 }}>
          {msg}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {loading ? (
          <div className="px-help">Cargando notificaciones…</div>
        ) : rows.length === 0 ? (
          <div className="px-help">No tenés notificaciones todavía.</div>
        ) : (
          rows.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 16,
                border: '1px solid rgba(23,37,63,.08)',
                borderRadius: 16,
                background: n.read ? 'rgba(255,255,255,.96)' : 'rgba(235,239,245,.98)',
                cursor: 'pointer',
                color: '#17253f',
                transition: 'transform .16s ease, box-shadow .16s ease, background .16s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 8px 22px rgba(17,24,39,.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 21, lineHeight: 1.1 }}>{n.title}</div>
                  <div style={{ fontSize: 14, color: 'rgba(23,37,63,.72)', marginTop: 8 }}>{previewText(n.message)}</div>
                </div>
                <div style={{ display: 'grid', justifyItems: 'end', gap: 8, flex: '0 0 auto' }}>
                  <div style={{ fontSize: 12, color: 'rgba(23,37,63,.60)' }}>{formatDate(n.created_at)}</div>
                  {!n.read ? <span style={{ width: 10, height: 10, borderRadius: 999, background: '#ff4e72', display: 'inline-block' }} /> : null}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {selected ? (
        <div className="px-overlay" onClick={() => setSelected(null)}>
          <div className="px-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{selected.title}</h3>
                <div className="px-modalSub">{formatDate(selected.created_at)}</div>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setSelected(null)}>Cerrar</button>
            </div>
            <div className="px-modalBodyText">{selected.message}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
