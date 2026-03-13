'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type NotificationRow = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  link: string | null
  created_at: string
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

export default function NotificacionesPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    setMsg('')

    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, message, read, link, created_at')
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
    await load()
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    await load()
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
          <p className="px-pageSub">Aprobaciones, rechazos, mensajes y avisos del sistema.</p>
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

      <div style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <div className="px-help">Cargando notificaciones…</div>
        ) : rows.length === 0 ? (
          <div className="px-help">No tenés notificaciones todavía.</div>
        ) : (
          rows.map((n) => (
            <div
              key={n.id}
              className="px-card px-card--flat"
              style={{
                background: n.read ? 'rgba(255,255,255,.72)' : 'rgba(83,199,217,.08)',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 900, color: '#17253f' }}>{n.title}</div>
                  <div style={{ color: 'rgba(23,37,63,.62)', fontSize: 12, marginTop: 2 }}>
                    {formatDate(n.created_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!n.read ? (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: '#ff4e72',
                        display: 'inline-block',
                      }}
                    />
                  ) : null}

                  {!n.read ? (
                    <button type="button" onClick={() => markRead(n.id)} className="px-btn px-btn--ghost" style={{ height: 36 }}>
                      Marcar leída
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ color: '#17253f', lineHeight: 1.5 }}>{n.message}</div>

              {n.link ? (
                <a href={n.link} className="px-link" style={{ width: 'fit-content' }}>
                  Abrir
                </a>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}