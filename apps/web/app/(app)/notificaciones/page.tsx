'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import { PLATFORM_NOTIFICATION_TYPES } from '@/lib/notificationScope'
import { platformNotificationBadgeClass, platformNotificationTypeLabel } from '@/lib/platformStatus'
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
  const { role } = useSession()
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

    let notificationsQuery = supabase
      .from('notifications')
      .select('id, type, title, message, read, link, created_at, metadata')
      .eq('user_id', me.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(100)

    if (role === 'platform') {
      notificationsQuery = notificationsQuery.in('type', PLATFORM_NOTIFICATION_TYPES as unknown as string[])
    }

    const { data, error } = await notificationsQuery

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
    let markAllQuery = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', currentUserId)
      .eq('read', false)
      .neq('type', 'message')

    if (role === 'platform') {
      markAllQuery = markAllQuery.in('type', PLATFORM_NOTIFICATION_TYPES as unknown as string[])
    }

    await markAllQuery
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
  }, [role])

  const unread = rows.filter((r) => !r.read).length
  const pageTitle = role === 'platform' ? 'Notificaciones platform' : 'Notificaciones'
  const pageSub = role === 'platform'
    ? 'Altas de clubes, revisiones pendientes y alertas administrativas globales.'
    : 'Aprobaciones, rechazos, avisos del sistema y novedades generales.'

  return (
    <div className="platform-shell">
      <div className="px-platform px-platform--notifications">
      <div className="px-platformHead">
        <div>
          <h1 className="px-platformTitle">{pageTitle}</h1>
          <div className="px-platformSub">{pageSub}</div>
        </div>

        <div className="px-toolbar">
          <span className="px-pill">{unread} sin leer</span>
          <button type="button" onClick={markAllRead} className="px-btn px-btn--ghost">
            Marcar todo leído
          </button>
        </div>
      </div>

      {msg ? (
        <div className="px-help" style={{ marginTop: 14 }}>
          {msg}
        </div>
      ) : null}

      <div className="px-platformNotificationList">
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
              className={`px-platformNotificationCard${n.read ? '' : ' is-unread'}`}
            >
              <div className="px-platformNotificationHead">
                <div className="px-platformNotificationMain">
                  <div className="px-platformNotificationMeta">
                    <span className={`px-statusBadge ${platformNotificationBadgeClass(n.type)}`}>
                      {platformNotificationTypeLabel(n.type)}
                    </span>
                    <span className="px-platformNotificationDate">{formatDate(n.created_at)}</span>
                  </div>
                  <div className="px-platformNotificationTitle">{n.title}</div>
                  <div className="px-platformNotificationText">{previewText(n.message)}</div>
                </div>
                <div className="px-platformNotificationAside">
                  {!n.read ? <span className="px-platformUnreadDot" /> : null}
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

      <style jsx>{`
        .px-platformHead {
          gap: 14px;
        }

        .px-platformNotificationList {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }

        .px-platformNotificationCard {
          width: 100%;
          text-align: left;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          cursor: pointer;
          color: #17253f;
          transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
        }

        .px-platformNotificationCard:hover,
        .px-platformNotificationCard:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          border-color: rgba(14, 116, 144, 0.32);
          outline: none;
        }

        .px-platformNotificationCard.is-unread {
          background: rgba(248, 250, 252, 0.98);
          border-color: rgba(14, 116, 144, 0.22);
        }

        .px-platformNotificationHead {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .px-platformNotificationMain,
        .px-platformNotificationAside {
          min-width: 0;
        }

        .px-platformNotificationMain {
          display: grid;
          gap: 8px;
          flex: 1;
        }

        .px-platformNotificationMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .px-platformNotificationDate {
          color: #64748b;
          font-size: 0.82rem;
        }

        .px-platformNotificationTitle {
          color: #0f172a;
          font-size: 1rem;
          font-weight: 800;
          line-height: 1.2;
        }

        .px-platformNotificationText {
          color: #475569;
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .px-platformNotificationAside {
          display: flex;
          justify-content: flex-end;
          flex: 0 0 auto;
          padding-top: 4px;
        }

        .px-platformUnreadDot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #e11d48;
          display: inline-block;
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

        @media (max-width: 640px) {
          .px-platformNotificationHead {
            flex-direction: column;
          }

          .px-platformNotificationAside {
            justify-content: flex-start;
            padding-top: 0;
          }
        }
      `}</style>
      </div>
    </div>
  )
}
