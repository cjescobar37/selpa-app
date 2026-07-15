'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'

type NotificationRow = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  link: string | null
  href?: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
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

function relativeDate(value: string) {
  try {
    const diff = Date.now() - new Date(value).getTime()
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return 'Ahora'
    if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`
    if (diff < day) return `Hace ${Math.floor(diff / hour)} h`
    if (diff < day * 7) return `Hace ${Math.floor(diff / day)} d`
    return formatDate(value)
  } catch {
    return formatDate(value)
  }
}

function previewText(value: string, max = 120) {
  const clean = (value || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || message.includes('column') || message.includes('schema cache')
}

function notificationIconLabel(type: string) {
  const key = String(type ?? '').toLowerCase()
  if (key.includes('payment') || key.includes('pago')) return '$'
  if (key.includes('message') || key.includes('mensaje')) return 'M'
  if (key.includes('registration') || key.includes('inscrip')) return 'I'
  if (key.includes('cancel') || key.includes('baja')) return 'B'
  if (key.includes('club')) return 'C'
  return 'P'
}

export default function NotificacionesPage() {
  const router = useRouter()
  const { role, activeClub } = useSession()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [msg, setMsg] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [selected, setSelected] = useState<NotificationRow | null>(null)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const theme = useMemo(() => getClubTheme(role === 'platform' ? null : themeKey), [role, themeKey])
  const themeStyle = useMemo(
    () => ({
      '--px-notifications-accent': theme.vars.accent,
      '--px-notifications-accent-2': theme.vars.accent2,
      '--px-notifications-soft': theme.vars.soft,
      '--px-notifications-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme]
  )

  async function load() {
    setLoading(true)
    setMsg('')

    const { data: userData } = await supabase.auth.getUser()
    const me = userData?.user
    if (!me) {
      setMsg('No pudimos validar tu sesión. Volvé a ingresar para ver tus notificaciones.')
      setLoading(false)
      return
    }

    setCurrentUserId(me.id)

    const buildNotificationsQuery = (select: string) => supabase
      .from('notifications')
      .select(select)
      .eq('user_id', me.id)
      .neq('type', 'message')
      .order('created_at', { ascending: false })
      .limit(100)

    let { data, error } = await buildNotificationsQuery('id, type, title, message, read, link, href, created_at, metadata')
    if (error && isMissingColumnError(error)) {
      const legacyRes = await buildNotificationsQuery('id, type, title, message, read, link, created_at, metadata')
      data = legacyRes.data
      error = legacyRes.error
    }

    if (error) {
      setMsg('No pudimos cargar tus notificaciones. Revisá tu conexión e intentá nuevamente.')
      setLoading(false)
      return
    }

    setRows((data ?? []) as unknown as NotificationRow[])
    setLoading(false)
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setRows((cur) => cur.map((row) => (row.id === id ? { ...row, read: true } : row)))
  }

  async function markAllRead() {
    const markAllQuery = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', currentUserId)
      .eq('read', false)
      .neq('type', 'message')

    await markAllQuery
    setRows((cur) => cur.map((row) => ({ ...row, read: true })))
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read) {
      await markRead(n.id)
    }

    const destination = n.href || n.link
    if (destination) {
      router.push(destination)
      return
    }

    setSelected(n)
  }

  useEffect(() => {
    load()
  }, [role])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!activeClub?.id || role === 'platform') {
        setThemeKey(null)
        return
      }
      const { data } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', activeClub.id)
        .maybeSingle()
      if (alive) setThemeKey((data?.theme_key as string | null) ?? null)
    })()
    return () => {
      alive = false
    }
  }, [activeClub?.id, role])

  const unread = rows.filter((r) => !r.read).length
  const pageTitle = role === 'platform' ? 'Notificaciones platform' : 'Notificaciones'
  const pageSub = role === 'platform'
    ? 'Altas de clubes, revisiones pendientes y alertas administrativas globales.'
    : 'Aprobaciones, rechazos, avisos del sistema y novedades generales.'

  return (
    <main className="px-notificationsPage" style={themeStyle}>
      <section className="px-notificationsCard">
      <div className="px-notificationsHead">
        <div>
          <span>Centro de novedades</span>
          <h1>{pageTitle}</h1>
          <p>{pageSub}</p>
        </div>

        <div className="px-notificationsActions">
          <span>{unread} sin leer</span>
          <button type="button" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck size={16} />
            Marcar todo leído
          </button>
        </div>
      </div>

      <div className="px-notificationsList">
        {msg ? (
          <PlayerStatePanel kind="error" title="No pudimos abrir tus notificaciones" message={msg} onRetry={load} compact />
        ) : loading ? (
          <PlayerStatePanel kind="loading" title="Cargando notificaciones" message="Buscando tus novedades más recientes" compact />
        ) : rows.length === 0 ? (
          <PlayerStatePanel
            kind="empty"
            title="No tenés notificaciones todavía"
            message="Cuando haya novedades de torneos, pagos, clubes o mensajes, van a aparecer acá."
            compact
          />
        ) : (
          rows.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openNotification(n)}
              className={`px-notificationRow${n.read ? '' : ' is-unread'}`}
            >
              <span className="px-notificationIcon" aria-hidden="true">{notificationIconLabel(n.type)}</span>
              <div className="px-notificationMain">
                <div className="px-notificationMeta">
                  <strong>{n.title}</strong>
                  <span>{relativeDate(n.created_at)}</span>
                </div>
                <p>{previewText(n.message, 170)}</p>
              </div>
              {!n.read ? <span className="px-notificationUnread" aria-label="No leída" /> : null}
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
        .px-notificationsPage {
          display: grid;
          margin: 0 auto;
          max-width: 1040px;
          min-width: 0;
          padding: 24px clamp(12px, 3vw, 28px) 44px;
          width: 100%;
        }

        .px-notificationsCard {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          position: relative;
        }

        .px-notificationsCard::before {
          background: linear-gradient(90deg, var(--px-notifications-accent) 0%, var(--px-notifications-accent-2) 100%);
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }

        .px-notificationsHead {
          align-items: center;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--px-notifications-soft));
          border-bottom: 1px solid rgba(15,23,42,.08);
          display: flex;
          gap: 16px;
          justify-content: space-between;
          min-width: 0;
          padding: 24px;
        }

        .px-notificationsHead span {
          color: #0e7490;
          display: inline-block;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          margin-bottom: 5px;
          text-transform: uppercase;
        }

        .px-notificationsHead h1 {
          color: #061b3a;
          font-size: clamp(30px, 4vw, 46px);
          font-weight: 950;
          line-height: .98;
          margin: 0;
        }

        .px-notificationsHead p {
          color: #64748b;
          font-size: 14px;
          font-weight: 780;
          margin: 8px 0 0;
          max-width: 620px;
        }

        .px-notificationsActions {
          align-items: end;
          display: grid;
          gap: 8px;
          justify-items: end;
          flex: 0 0 auto;
        }

        .px-notificationsActions > span {
          background: color-mix(in srgb, var(--px-notifications-accent) 12%, white);
          border: 1px solid color-mix(in srgb, var(--px-notifications-accent) 20%, transparent);
          border-radius: 999px;
          color: #0e7490;
          font-size: 12px;
          font-weight: 950;
          margin: 0;
          padding: 6px 10px;
          text-transform: none;
          letter-spacing: 0;
        }

        .px-notificationsActions button {
          align-items: center;
          background: #061b3a;
          border: 1px solid color-mix(in srgb, var(--px-notifications-accent) 28%, transparent);
          border-radius: 999px;
          box-shadow: 0 12px 28px var(--px-notifications-glow);
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          gap: 8px;
          min-height: 44px;
          padding: 0 14px;
          transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease;
        }

        .px-notificationsActions button:hover:not(:disabled) {
          box-shadow: 0 16px 34px var(--px-notifications-glow);
          transform: translateY(-1px);
        }

        .px-notificationsActions button:disabled {
          cursor: not-allowed;
          opacity: .48;
        }

        .px-notificationsList {
          display: grid;
          gap: 10px;
          padding: 18px;
        }

        .px-notificationRow {
          align-items: center;
          display: grid;
          gap: 12px;
          grid-template-columns: auto minmax(0, 1fr) auto;
          width: 100%;
          text-align: left;
          padding: 14px;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 18px;
          background: #fff;
          cursor: pointer;
          color: #061b3a;
          transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
        }

        .px-notificationRow:hover,
        .px-notificationRow:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px var(--px-notifications-glow);
          border-color: color-mix(in srgb, var(--px-notifications-accent) 28%, transparent);
          outline: none;
        }

        .px-notificationRow.is-unread {
          background: linear-gradient(135deg, rgba(255,255,255,.98), var(--px-notifications-soft));
          border-color: color-mix(in srgb, var(--px-notifications-accent) 24%, transparent);
        }

        .px-notificationIcon {
          align-items: center;
          background: linear-gradient(135deg, #061b3a, var(--px-notifications-accent));
          border: 1px solid color-mix(in srgb, var(--px-notifications-accent-2) 28%, transparent);
          border-radius: 999px;
          box-shadow: 0 10px 24px var(--px-notifications-glow);
          color: #fff;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          height: 42px;
          justify-content: center;
          width: 42px;
        }

        .px-notificationMain {
          min-width: 0;
        }

        .px-notificationMeta {
          align-items: baseline;
          display: flex;
          gap: 10px;
          justify-content: space-between;
          min-width: 0;
        }

        .px-notificationMeta strong {
          color: #061b3a;
          font-size: 15px;
          font-weight: 950;
          line-height: 1.18;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .px-notificationMeta span {
          color: #94a3b8;
          flex: 0 0 auto;
          font-size: 12px;
          font-weight: 850;
        }

        .px-notificationMain p {
          color: #64748b;
          font-size: 13px;
          font-weight: 760;
          line-height: 1.42;
          margin: 5px 0 0;
          overflow-wrap: anywhere;
        }

        .px-notificationUnread {
          background: #e11d48;
          border-radius: 999px;
          box-shadow: 0 0 0 5px rgba(225,29,72,.10);
          height: 10px;
          width: 10px;
        }

        @media (max-width: 640px) {
          .px-notificationsHead {
            align-items: flex-start;
            flex-direction: column;
          }

          .px-notificationsActions {
            align-items: start;
            justify-items: start;
          }

          .px-notificationRow {
            align-items: start;
            grid-template-columns: auto minmax(0, 1fr);
          }

          .px-notificationUnread {
            grid-column: 2;
          }
        }
      `}</style>
    </section>
    </main>
  )
}
