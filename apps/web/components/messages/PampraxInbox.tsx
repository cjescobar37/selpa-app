'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Send, MessageSquareText, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'
import SelpaLoader from '@/components/SelpaLoader'

type InboxScope = 'player' | 'club' | 'platform'

type ThreadSummary = {
  id: string
  club_id: string
  tournament_id: string | null
  player_user_id: string
  subject: string
  status: string
  updated_at: string
  player: { name: string; email: string | null; avatar_url: string | null } | null
  club: { name: string; logo_url: string | null; city: string | null; province: string | null } | null
  latest_message: { body: string; created_at: string; sender_name: string } | null
  unread_count: number
}

type ThreadMessage = {
  id: string
  sender_user_id: string
  recipient_user_id: string
  body: string
  created_at: string
  sender_name: string
}

type ClubOption = {
  id: string
  name: string
  theme_key?: string | null
}

type PlayerOption = {
  user_id: string
  full_name: string
  avatar_url?: string | null
  category?: number | null
  gender?: string | null
}

type PampraxInboxProps = {
  scope: InboxScope
  title: string
  subtitle: string
  /** Opens the existing composer with a recipient supplied by the calling context. */
  lockedRecipient?: { clubId: string; userId: string; fullName: string }
  /** Renders only the composer sheet; used from contextual administrative screens. */
  composerOnly?: boolean
  onComposerClose?: () => void
  onMessageSent?: () => void
}

function formatDate(value?: string | null) {
  if (!value) return ''
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

function previewText(value?: string | null, max = 94) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function initials(name?: string | null) {
  const parts = String(name ?? 'SELPA').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SE'
}

function composerFailureMessage(payload: unknown) {
  const text = typeof payload === 'object' && payload && 'error' in payload
    ? String((payload as { error?: unknown }).error ?? '')
    : ''
  if (/permiso|forbidden|unauthorized/i.test(text)) return 'No tenés permisos para enviar mensajes a este jugador.'
  if (/sesión|session/i.test(text)) return 'Tu sesión ya no es válida. Volvé a ingresar para enviar el mensaje.'
  return 'No pudimos enviar el mensaje. Revisá los datos e intentá nuevamente.'
}

function counterpartLabel(scope: InboxScope, thread: ThreadSummary) {
  if (scope === 'player') return thread.club?.name ?? 'Club'
  if (scope === 'club') return thread.player?.name ?? 'Jugador'
  return `${thread.club?.name ?? 'Club'} · ${thread.player?.name ?? 'Jugador'}`
}

export default function PampraxInbox({
  scope,
  title,
  subtitle,
  lockedRecipient,
  composerOnly = false,
  onComposerClose,
  onMessageSent,
}: PampraxInboxProps) {
  const session = useSession()
  const searchParams = useSearchParams()
  const requestedThreadId = searchParams.get('thread')
  const requestedPlayerId = searchParams.get('playerId')
  const requestedComposer = searchParams.get('compose') === '1'
  const handledRequestedComposer = useRef(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerSubject, setComposerSubject] = useState('')
  const [composerMessage, setComposerMessage] = useState('')
  const [composerClubId, setComposerClubId] = useState('')
  const [composerPlayerUserId, setComposerPlayerUserId] = useState('')
  const [composerPlayerSearch, setComposerPlayerSearch] = useState('')
  const [clubOptions, setClubOptions] = useState<ClubOption[]>([])
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([])
  const [composerError, setComposerError] = useState('')
  const [composerSending, setComposerSending] = useState(false)
  const [loadingPlayers, setLoadingPlayers] = useState(false)

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads]
  )
  const theme = useMemo(() => getClubTheme(scope === 'platform' ? null : themeKey), [scope, themeKey])
  const themeStyle = useMemo(
    () => ({
      '--px-inbox-accent': theme.vars.accent,
      '--px-inbox-accent-2': theme.vars.accent2,
      '--px-inbox-soft': theme.vars.soft,
      '--px-inbox-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme]
  )
  const filteredPlayers = useMemo(() => {
    const q = composerPlayerSearch.trim().toLowerCase()
    if (!q) return playerOptions
    return playerOptions.filter((player) => player.full_name.toLowerCase().includes(q))
  }, [composerPlayerSearch, playerOptions])
  const canCreateMessage = scope !== 'platform'

  async function getToken() {
    const [{ data: sessionData }, { data: userData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ])
    setCurrentUserId(userData.user?.id ?? '')
    return sessionData.session?.access_token ?? null
  }

  async function loadThemeAndComposerOptions() {
    const clubsFromSession = (session.clubs ?? []).map((club) => ({
      id: club.id,
      name: club.name,
      theme_key: null,
    }))
    setClubOptions(clubsFromSession)

    const activeClubId = session.activeClub?.id ?? clubsFromSession[0]?.id ?? ''
    if (activeClubId) {
      setComposerClubId((current) => current || activeClubId)
      const { data } = await supabase
        .from('clubs')
        .select('theme_key')
        .eq('id', activeClubId)
        .maybeSingle()
      setThemeKey((data?.theme_key as string | null) ?? null)
    } else {
      setThemeKey(null)
    }
  }

  async function loadClubPlayers(clubId: string) {
    if (!clubId || scope !== 'club') return
    setLoadingPlayers(true)
    setComposerError('')

    const token = await getToken()
    if (!token) {
      setComposerError('Sesión inválida.')
      setLoadingPlayers(false)
      return
    }

    const response = await fetch(`/api/clubs/${clubId}/players`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setComposerError(payload?.error ?? 'No pude cargar jugadores del club.')
      setLoadingPlayers(false)
      return
    }

    setPlayerOptions(((payload?.players ?? []) as Array<{ user_id?: string; full_name?: string; display_name?: string; profile?: { avatar_url?: string | null } | null; category?: number | null; gender?: string | null }>).map((player) => ({
      user_id: String(player.user_id),
      full_name: String(player.full_name ?? player.display_name ?? 'Jugador'),
      avatar_url: player.profile?.avatar_url ?? null,
      category: player.category ?? null,
      gender: player.gender ?? null,
    })))
    setLoadingPlayers(false)
  }

  function openComposer() {
    setComposerOpen(true)
    setComposerError('')
    setNotice('')
    setComposerSubject('')
    setComposerMessage('')
    setComposerPlayerUserId(lockedRecipient?.userId ?? '')
    setComposerPlayerSearch('')
    const initialClubId = lockedRecipient?.clubId ?? session.activeClub?.id ?? clubOptions[0]?.id ?? ''
    setComposerClubId(initialClubId)
    if (scope === 'club' && initialClubId && !lockedRecipient) {
      loadClubPlayers(initialClubId)
    }
  }

  function closeComposer() {
    if (composerSending) return
    setComposerOpen(false)
    if (composerOnly) onComposerClose?.()
  }

  async function sendNewMessage() {
    if (composerSending || scope === 'platform') return
    const subject = composerSubject.replace(/\s+/g, ' ').trim()
    const message = composerMessage.trim()
    if (subject.length < 3) {
      setComposerError('Escribí un asunto.')
      return
    }
    if (message.length < 4) {
      setComposerError('Escribí un mensaje.')
      return
    }
    if (!composerClubId) {
      setComposerError('Seleccioná un club.')
      return
    }
    if (scope === 'club' && !composerPlayerUserId) {
      setComposerError('Seleccioná un jugador.')
      return
    }

    setComposerSending(true)
    setComposerError('')

    const token = await getToken()
    if (!token) {
      setComposerError('Sesión inválida.')
      setComposerSending(false)
      return
    }

    const response = await fetch('/api/message-threads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope,
        clubId: composerClubId,
        playerUserId: scope === 'club' ? composerPlayerUserId : undefined,
        subject,
        message,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setComposerError(composerFailureMessage(payload))
      setComposerSending(false)
      return
    }

    setComposerOpen(false)
    setComposerSubject('')
    setComposerMessage('')
    setComposerPlayerUserId('')
    setNotice('Mensaje enviado.')
    if (!composerOnly) await loadThreads(payload?.threadId ?? null)
    onMessageSent?.()
    setComposerSending(false)
  }

  async function loadThreads(preferredThreadId?: string | null) {
    setLoading(true)
    setError('')

    const token = await getToken()
    if (!token) {
      setError('Sesión inválida.')
      setLoading(false)
      return
    }

    const response = await fetch(`/api/message-threads?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload?.error ?? 'No pude cargar mensajes.')
      setLoading(false)
      return
    }

    const loadedThreads = (payload?.threads ?? []) as ThreadSummary[]
    setThreads(loadedThreads)
    const requestedId = preferredThreadId ?? requestedThreadId ?? selectedThreadId
    const nextThreadId = loadedThreads.some((thread) => thread.id === requestedId) ? requestedId : loadedThreads[0]?.id ?? null
    setSelectedThreadId(nextThreadId)
    if (!nextThreadId) setMessages([])
    setLoading(false)
    if (nextThreadId) await loadMessages(nextThreadId)
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true)
    setError('')

    const token = await getToken()
    if (!token) {
      setError('Sesión inválida.')
      setLoadingMessages(false)
      return
    }

    const response = await fetch(`/api/message-threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload?.error ?? 'No pude abrir la conversación.')
      setLoadingMessages(false)
      return
    }

    setMessages((payload?.messages ?? []) as ThreadMessage[])
    setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, unread_count: 0 } : thread))
    setLoadingMessages(false)
  }

  async function sendReply() {
    if (!selectedThreadId || reply.trim().length < 4 || sending) return
    setSending(true)
    setError('')

    const token = await getToken()
    if (!token) {
      setError('Sesión inválida.')
      setSending(false)
      return
    }

    const response = await fetch(`/api/message-threads/${selectedThreadId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: reply.trim() }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload?.error ?? 'No pude enviar el mensaje.')
      setSending(false)
      return
    }

    setReply('')
    try {
      await loadThreads(selectedThreadId)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (composerOnly) return
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedThreadId, scope, composerOnly])

  useEffect(() => {
    queueMicrotask(() => { void loadThemeAndComposerOptions() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.activeClub?.id, session.clubs.length, scope])

  useEffect(() => {
    if (!composerOnly || !lockedRecipient || handledRequestedComposer.current) return
    handledRequestedComposer.current = true
    queueMicrotask(() => {
      setComposerOpen(true)
      setComposerClubId(lockedRecipient.clubId)
      setComposerPlayerUserId(lockedRecipient.userId)
      setComposerError('')
    })
  }, [composerOnly, lockedRecipient])

  useEffect(() => {
    if (scope !== 'club' || !requestedComposer || !requestedPlayerId || handledRequestedComposer.current) return
    const clubId = session.activeClub?.id ?? clubOptions[0]?.id ?? ''
    if (!clubId) return
    handledRequestedComposer.current = true
    queueMicrotask(() => {
      setComposerOpen(true)
      setComposerClubId(clubId)
      setComposerPlayerUserId(requestedPlayerId)
      void loadClubPlayers(clubId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, requestedComposer, requestedPlayerId, session.activeClub?.id, clubOptions.length])

  return (
    <main className={`px-inboxShell${composerOnly ? ' is-composerOnly' : ''}`} style={themeStyle}>
      <section className="px-inboxHero">
        <div className="px-inboxHero__copy">
          <span>Mensajes</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button
          type="button"
          className="px-newMessageBtn"
          onClick={openComposer}
          disabled={!canCreateMessage}
          title={canCreateMessage ? 'Crear mensaje' : 'No tenés permisos para crear mensajes'}
        >
          <Plus size={17} />
          Nuevo mensaje
        </button>
      </section>

      {error ? <div className="px-inboxAlert">{error}</div> : null}
      {notice ? <div className="px-inboxNotice">{notice}</div> : null}

      <section className={`px-inboxGrid${!loading && threads.length === 0 ? ' is-empty' : ''}`}>
        <aside className="px-threadPanel" aria-label="Conversaciones">
          <div className="px-threadPanel__head">
            <strong>Conversaciones</strong>
            <span>{threads.length}</span>
          </div>
          {loading ? (
            <div className="px-inboxLoading">
              <SelpaLoader title="Cargando mensajes" subtitle="Buscando tus conversaciones" />
            </div>
          ) : threads.length === 0 ? (
            <div className="px-inboxEmpty px-inboxEmpty--cta">
              <MessageSquareText size={28} />
              <strong>No tenés mensajes todavía</strong>
              <p>{scope === 'player' ? 'Abrí una consulta con tu club activo.' : scope === 'club' ? 'Enviá un mensaje a un jugador aprobado del club.' : 'Los mensajes administrativos aparecerán acá.'}</p>
              <button type="button" onClick={openComposer} disabled={!canCreateMessage}>
                {scope === 'player' ? 'Escribile al club' : scope === 'club' ? 'Enviar mensaje a jugador' : 'Crear mensaje administrativo'}
              </button>
            </div>
          ) : (
            <div className="px-threadList">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`px-threadItem ${thread.id === selectedThreadId ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedThreadId(thread.id)
                    loadMessages(thread.id)
                  }}
                >
                  <span className="px-threadAvatar">{initials(counterpartLabel(scope, thread))}</span>
                  <span className="px-threadBody">
                    <b>{counterpartLabel(scope, thread)}</b>
                    <strong>{thread.subject}</strong>
                    <small>{previewText(thread.latest_message?.body ?? 'Sin mensajes todavía.')}</small>
                  </span>
                  <span className="px-threadMeta">
                    <em>{formatDate(thread.latest_message?.created_at ?? thread.updated_at)}</em>
                    {thread.unread_count > 0 ? <i>{thread.unread_count}</i> : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="px-conversationPanel" aria-label="Conversación">
          {selectedThread ? (
            <>
              <div className="px-conversationHead">
                <div>
                  <span>{counterpartLabel(scope, selectedThread)}</span>
                  <h2>{selectedThread.subject}</h2>
                  {selectedThread.club ? <p>{selectedThread.club.city || selectedThread.club.province ? [selectedThread.club.city, selectedThread.club.province].filter(Boolean).join(', ') : selectedThread.club.name}</p> : null}
                </div>
                <MessageSquareText size={22} />
              </div>

              <div className="px-messageStream">
                {loadingMessages ? (
                  <div className="px-inboxEmpty">Abriendo conversación...</div>
                ) : messages.length === 0 ? (
                  <div className="px-inboxEmpty">Sin mensajes en esta conversación.</div>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_user_id === currentUserId
                    return (
                      <article key={message.id} className={`px-messageBubble ${mine ? 'is-mine' : ''}`}>
                        <div>
                          <strong>{mine ? 'Vos' : message.sender_name}</strong>
                          <span>{formatDate(message.created_at)}</span>
                        </div>
                        <p>{message.body}</p>
                      </article>
                    )
                  })
                )}
              </div>

              <div className="px-replyBox">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Escribí tu respuesta..."
                  rows={3}
                />
                <button type="button" disabled={reply.trim().length < 4 || sending} onClick={sendReply}>
                  {sending ? 'Enviando...' : 'Enviar'}
                  <Send size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="px-conversationEmpty">
              <MessageSquareText size={32} />
              <h2>Seleccioná una conversación</h2>
              <p>Acá vas a poder leer y responder mensajes vinculados a clubes y torneos.</p>
            </div>
          )}
        </section>
      </section>

      {composerOpen ? (
        <div className="px-composerOverlay" onClick={closeComposer}>
          <div className="px-composerModal" onClick={(event) => event.stopPropagation()}>
            <div className="px-composerHead">
              <div>
                <span>Nuevo mensaje</span>
                <h2>{scope === 'player' ? 'Escribile al club' : 'Enviar mensaje a jugador'}</h2>
              </div>
              <button type="button" onClick={closeComposer} disabled={composerSending} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="px-composerBody">
              {scope === 'player' ? (
                <label className="px-composeField">
                  <span>Destino</span>
                  <select
                    value={composerClubId}
                    onChange={(event) => setComposerClubId(event.target.value)}
                    disabled={clubOptions.length <= 1}
                  >
                    {clubOptions.map((club) => (
                      <option key={club.id} value={club.id}>{club.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {scope === 'club' && lockedRecipient ? (
                <div className="px-composeField">
                  <span>Destinatario</span>
                  <div className="px-lockedRecipient" aria-label={`Destinatario: ${lockedRecipient.fullName}`}>
                    <span>{initials(lockedRecipient.fullName)}</span>
                    <strong>{lockedRecipient.fullName}</strong>
                  </div>
                </div>
              ) : scope === 'club' ? (
                <div className="px-composeField">
                  <span>Jugador del club</span>
                  <input
                    value={composerPlayerSearch}
                    onChange={(event) => setComposerPlayerSearch(event.target.value)}
                    placeholder="Buscar jugador..."
                  />
                  <div className="px-playerPicker">
                    {loadingPlayers ? (
                      <div className="px-playerPicker__empty">Cargando jugadores...</div>
                    ) : filteredPlayers.length === 0 ? (
                      <div className="px-playerPicker__empty">No se encontraron jugadores.</div>
                    ) : (
                      filteredPlayers.slice(0, 8).map((player) => (
                        <button
                          key={player.user_id}
                          type="button"
                          className={player.user_id === composerPlayerUserId ? 'is-selected' : ''}
                          onClick={() => setComposerPlayerUserId(player.user_id)}
                        >
                          <span>{initials(player.full_name)}</span>
                          <strong>{player.full_name}</strong>
                          <small>{player.category ? `${player.category}ta` : 'Categoría'} · {player.gender === 'F' ? 'Damas' : 'Caballeros'}</small>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <label className="px-composeField">
                <span>Asunto</span>
                <input value={composerSubject} onChange={(event) => setComposerSubject(event.target.value)} placeholder="Ej: Consulta sobre inscripción" />
              </label>

              <label className="px-composeField">
                <span>Mensaje</span>
                <textarea value={composerMessage} onChange={(event) => setComposerMessage(event.target.value)} rows={5} placeholder="Escribí tu mensaje..." />
              </label>

              {composerError ? <div className="px-composerError">{composerError}</div> : null}
            </div>

            <div className="px-composerActions">
              <button type="button" className="px-composeCancel" onClick={closeComposer} disabled={composerSending}>Cancelar</button>
              <button type="button" className="px-composeSubmit" onClick={sendNewMessage} disabled={composerSending}>
                {composerSending ? 'Enviando...' : 'Enviar mensaje'}
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .px-inboxShell { display: grid; gap: 14px; margin: 0 auto; max-width: 1180px; min-width: 0; padding: 18px clamp(14px, 3vw, 24px) 36px; width: 100%; }
        .px-inboxShell.is-composerOnly { display: contents; padding: 0; }
        .px-inboxShell.is-composerOnly > .px-inboxHero, .px-inboxShell.is-composerOnly > .px-inboxAlert, .px-inboxShell.is-composerOnly > .px-inboxNotice, .px-inboxShell.is-composerOnly > .px-inboxGrid { display: none; }
        .px-inboxHero { align-items: center; background: linear-gradient(135deg, rgba(255,255,255,.98), var(--px-inbox-soft)); border: 1px solid rgba(15,23,42,.08); border-radius: 20px; box-shadow: 0 16px 38px rgba(15,23,42,.08); color: #061b3a; display: flex; gap: 14px; justify-content: space-between; min-width: 0; overflow: hidden; padding: 16px 18px; position: relative; }
        .px-inboxHero::before { background: linear-gradient(90deg, var(--px-inbox-accent) 0%, var(--px-inbox-accent-2) 100%); content: ""; height: 4px; left: 0; position: absolute; right: 0; top: 0; }
        .px-inboxHero::after { background: radial-gradient(circle, var(--px-inbox-glow), transparent 64%); content: ""; height: 150px; pointer-events: none; position: absolute; right: -42px; top: -72px; width: 220px; }
        .px-inboxHero__copy { display: grid; gap: 7px; min-width: 0; position: relative; }
        .px-inboxHero span { color: #0e7490; font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .px-inboxHero h1 { color: #061b3a; font-size: clamp(26px, 3.4vw, 40px); font-weight: 950; line-height: .98; margin: 0; position: relative; }
        .px-inboxHero p { color: #64748b; font-size: 13px; font-weight: 780; margin: 0; max-width: 660px; position: relative; }
        .px-newMessageBtn { align-items: center; background: #061b3a; border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 54%, transparent); border-radius: 999px; box-shadow: 0 12px 26px var(--px-inbox-glow); color: #fff; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; gap: 8px; min-height: 40px; padding: 0 15px; position: relative; transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease; }
        .px-newMessageBtn:hover:not(:disabled) { box-shadow: 0 20px 42px var(--px-inbox-glow); transform: translateY(-1px); }
        .px-newMessageBtn:disabled { cursor: not-allowed; opacity: .52; }
        .px-inboxAlert { background: #fff7df; border: 1px solid rgba(217,119,6,.22); border-radius: 14px; color: #854d0e; font-size: 13px; font-weight: 850; padding: 12px 14px; }
        .px-inboxNotice { background: color-mix(in srgb, var(--px-inbox-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 28%, transparent); border-radius: 14px; color: #075985; font-size: 13px; font-weight: 900; padding: 12px 14px; }
        .px-inboxGrid { display: grid; gap: 14px; grid-template-columns: minmax(300px, .78fr) minmax(0, 1.55fr); min-width: 0; }
        .px-threadPanel, .px-conversationPanel { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 20px; box-shadow: 0 18px 42px rgba(15,23,42,.07); min-width: 0; overflow: hidden; }
        .px-threadPanel { display: grid; grid-template-rows: auto minmax(0, 1fr); }
        .px-threadPanel__head { align-items: center; background: linear-gradient(135deg, rgba(248,250,252,.98), rgba(238,251,255,.58)); border-bottom: 1px solid rgba(15,23,42,.08); display: flex; justify-content: space-between; padding: 14px; }
        .px-threadPanel__head strong { color: #061b3a; font-size: 14px; font-weight: 950; }
        .px-threadPanel__head span { background: color-mix(in srgb, var(--px-inbox-accent) 11%, white); border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 20%, transparent); border-radius: 999px; color: #0e7490; font-size: 12px; font-weight: 950; padding: 4px 9px; }
        .px-inboxLoading { display: grid; padding: 14px; place-items: center; }
        .px-inboxLoading .px-loginLoading { max-width: 360px; width: 100%; }
        .px-threadList { align-content: flex-start; align-items: stretch; display: flex; flex-direction: column; gap: 8px; justify-content: flex-start; max-height: 620px; min-height: 0; min-width: 0; overflow: auto; padding: 10px; }
        .px-threadItem { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 16px; color: #061b3a; cursor: pointer; display: grid; gap: 10px; grid-template-columns: auto minmax(0, 1fr) auto; min-width: 0; padding: 10px; text-align: left; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background-color .18s ease; }
        .px-threadItem:hover, .px-threadItem.is-active { background: linear-gradient(135deg, #fff, var(--px-inbox-soft)); border-color: color-mix(in srgb, var(--px-inbox-accent) 34%, transparent); box-shadow: 0 12px 28px var(--px-inbox-glow); transform: translateY(-1px); }
        .px-threadAvatar { align-items: center; background: linear-gradient(135deg, #061b3a, var(--px-inbox-accent)); border: 1px solid color-mix(in srgb, var(--px-inbox-accent-2) 28%, transparent); border-radius: 999px; box-shadow: 0 10px 22px var(--px-inbox-glow); color: #fff; display: inline-flex; font-size: 12px; font-weight: 950; height: 42px; justify-content: center; width: 42px; }
        .px-threadBody { display: grid; gap: 2px; min-width: 0; }
        .px-threadBody b { color: #0e7490; font-size: 11px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-threadBody strong { color: #061b3a; font-size: 13px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-threadBody small { color: #64748b; font-size: 11px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-threadMeta { align-items: end; display: grid; gap: 6px; justify-items: end; }
        .px-threadMeta em { color: #94a3b8; font-size: 10px; font-style: normal; font-weight: 800; white-space: nowrap; }
        .px-threadMeta i { align-items: center; background: #e11d48; border-radius: 999px; box-shadow: 0 0 0 5px rgba(225,29,72,.10); color: #fff; display: inline-flex; font-size: 10px; font-style: normal; font-weight: 950; height: 20px; justify-content: center; min-width: 20px; padding: 0 6px; }
        .px-conversationPanel { display: grid; grid-template-rows: auto minmax(260px, 1fr) auto; min-height: 640px; }
        .px-conversationHead { align-items: center; background: linear-gradient(135deg, rgba(248,250,252,.98), rgba(238,251,255,.70)); border-bottom: 1px solid rgba(15,23,42,.08); color: #061b3a; display: flex; justify-content: space-between; gap: 12px; padding: 16px; }
        .px-conversationHead span { color: var(--px-inbox-accent); font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .px-conversationHead h2 { font-size: clamp(20px, 2.5vw, 28px); font-weight: 950; line-height: 1.05; margin: 2px 0; overflow-wrap: anywhere; }
        .px-conversationHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 0; }
        .px-messageStream { align-content: start; background: linear-gradient(180deg, rgba(248,250,252,.72), rgba(255,255,255,.96)); display: grid; gap: 10px; max-height: 540px; min-width: 0; overflow: auto; padding: 14px; }
        .px-messageBubble { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; color: #061b3a; justify-self: start; max-width: min(78%, 560px); min-width: 0; padding: 10px 12px; }
        .px-messageBubble.is-mine { background: linear-gradient(135deg, #061b3a, var(--px-inbox-accent)); color: #fff; justify-self: end; }
        .px-messageBubble div { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 5px; }
        .px-messageBubble strong { font-size: 11px; font-weight: 950; }
        .px-messageBubble span { font-size: 10px; font-weight: 800; opacity: .72; }
        .px-messageBubble p { font-size: 13px; font-weight: 760; line-height: 1.45; margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
        .px-replyBox { align-items: end; border-top: 1px solid rgba(15,23,42,.08); display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto; padding: 12px; }
        .px-replyBox textarea { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 14px; color: #061b3a; font-size: 13px; font-weight: 760; min-width: 0; outline: none; padding: 10px 12px; resize: vertical; width: 100%; }
        .px-replyBox textarea:focus { border-color: color-mix(in srgb, var(--px-inbox-accent) 48%, transparent); box-shadow: 0 0 0 3px var(--px-inbox-glow); }
        .px-replyBox button { align-items: center; background: #061b3a; border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 32%, transparent); border-radius: 999px; box-shadow: 0 12px 26px var(--px-inbox-glow); color: #fff; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; gap: 7px; min-height: 42px; padding: 0 16px; transition: transform .18s ease, box-shadow .18s ease; }
        .px-replyBox button:hover:not(:disabled) { box-shadow: 0 16px 32px var(--px-inbox-glow); transform: translateY(-1px); }
        .px-replyBox button:disabled { cursor: not-allowed; opacity: .5; }
        .px-inboxEmpty, .px-conversationEmpty { color: #64748b; font-size: 13px; font-weight: 820; padding: 18px; text-align: center; }
        .px-inboxEmpty--cta { align-content: center; display: grid; gap: 8px; justify-items: center; min-height: 220px; }
        .px-inboxEmpty--cta strong { color: #061b3a; font-size: 16px; font-weight: 950; }
        .px-inboxEmpty--cta p { margin: 0; max-width: 260px; }
        .px-inboxEmpty--cta button { background: #061b3a; border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 32%, transparent); border-radius: 999px; box-shadow: 0 12px 26px var(--px-inbox-glow); color: #fff; cursor: pointer; font-size: 12px; font-weight: 950; min-height: 38px; padding: 0 14px; transition: transform .18s ease, box-shadow .18s ease; }
        .px-inboxEmpty--cta button:hover:not(:disabled) { box-shadow: 0 16px 32px var(--px-inbox-glow); transform: translateY(-1px); }
        .px-inboxEmpty--cta button:disabled { cursor: not-allowed; opacity: .52; }
        .px-conversationEmpty { align-content: center; display: grid; gap: 8px; justify-items: center; min-height: 420px; }
        .px-conversationEmpty h2 { color: #061b3a; font-size: 24px; font-weight: 950; margin: 0; }
        .px-conversationEmpty p { margin: 0; max-width: 380px; }
        .px-composerOverlay { align-items: center; background: rgba(2,6,23,.42); display: grid; inset: 0; justify-items: center; padding: 18px; position: fixed; z-index: 120; }
        .px-composerModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 24px; box-shadow: 0 34px 90px rgba(15,23,42,.28); max-height: min(760px, calc(100vh - 28px)); max-width: 620px; min-width: 0; overflow: auto; width: min(620px, calc(100vw - 24px)); }
        .px-composerHead { align-items: center; background: linear-gradient(135deg, rgba(248,250,252,.98), var(--px-inbox-soft)); border-bottom: 1px solid rgba(15,23,42,.08); display: flex; justify-content: space-between; gap: 12px; padding: 18px; position: relative; }
        .px-composerHead::before { background: linear-gradient(90deg, var(--px-inbox-accent), var(--px-inbox-accent-2)); content: ""; height: 4px; left: 0; position: absolute; right: 0; top: 0; }
        .px-composerHead span { color: var(--px-inbox-accent); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .px-composerHead h2 { color: #061b3a; font-size: 26px; font-weight: 950; line-height: 1; margin: 4px 0 0; }
        .px-composerHead button { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 999px; color: #061b3a; cursor: pointer; display: inline-flex; height: 38px; justify-content: center; width: 38px; }
        .px-composerBody { display: grid; gap: 12px; padding: 18px; }
        .px-composeField { display: grid; gap: 7px; min-width: 0; }
        .px-composeField > span { color: #475569; font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .px-composeField input, .px-composeField select, .px-composeField textarea { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 15px; color: #061b3a; font-size: 13px; font-weight: 780; min-height: 44px; min-width: 0; outline: none; padding: 10px 12px; width: 100%; }
        .px-composeField textarea { line-height: 1.45; resize: vertical; }
        .px-lockedRecipient { align-items: center; background: var(--px-inbox-soft); border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 28%, transparent); border-radius: 14px; color: #061b3a; display: flex; gap: 9px; min-height: 44px; padding: 8px 10px; }
        .px-lockedRecipient > span { align-items: center; background: #fff; border-radius: 999px; color: var(--px-inbox-accent); display: inline-flex; font-size: 11px; font-weight: 950; height: 28px; justify-content: center; letter-spacing: 0; text-transform: none; width: 28px; }
        .px-lockedRecipient strong { font-size: 13px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-composeField input:focus, .px-composeField select:focus, .px-composeField textarea:focus { border-color: color-mix(in srgb, var(--px-inbox-accent) 48%, transparent); box-shadow: 0 0 0 3px var(--px-inbox-glow); }
        .px-playerPicker { border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 6px; max-height: 240px; overflow: auto; padding: 8px; }
        .px-playerPicker button { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; color: #061b3a; cursor: pointer; display: grid; gap: 4px 10px; grid-template-columns: auto minmax(0, 1fr); padding: 9px; text-align: left; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .px-playerPicker button:hover, .px-playerPicker button.is-selected { border-color: color-mix(in srgb, var(--px-inbox-accent) 38%, transparent); box-shadow: 0 10px 22px var(--px-inbox-glow); transform: translateY(-1px); }
        .px-playerPicker button span { align-items: center; background: linear-gradient(135deg, #061b3a, var(--px-inbox-accent)); border-radius: 999px; color: #fff; display: inline-flex; font-size: 11px; font-weight: 950; grid-row: span 2; height: 34px; justify-content: center; width: 34px; }
        .px-playerPicker button strong { font-size: 13px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-playerPicker button small { color: #64748b; font-size: 11px; font-weight: 800; }
        .px-playerPicker__empty { color: #64748b; font-size: 12px; font-weight: 820; padding: 12px; text-align: center; }
        .px-composerError { background: #fff7df; border: 1px solid rgba(217,119,6,.22); border-radius: 14px; color: #854d0e; font-size: 13px; font-weight: 850; padding: 10px 12px; }
        .px-composerActions { align-items: center; border-top: 1px solid rgba(15,23,42,.08); display: flex; gap: 10px; justify-content: flex-end; padding: 14px 18px 18px; }
        .px-composeCancel, .px-composeSubmit { align-items: center; border-radius: 999px; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; gap: 7px; min-height: 40px; padding: 0 15px; transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease; }
        .px-composeCancel { background: #fff; border: 1px solid rgba(15,23,42,.12); color: #061b3a; }
        .px-composeSubmit { background: #061b3a; border: 1px solid color-mix(in srgb, var(--px-inbox-accent) 34%, transparent); box-shadow: 0 12px 26px var(--px-inbox-glow); color: #fff; }
        .px-composeSubmit:hover:not(:disabled), .px-composeCancel:hover:not(:disabled) { transform: translateY(-1px); }
        .px-composeSubmit:hover:not(:disabled) { box-shadow: 0 16px 32px var(--px-inbox-glow); }
        .px-composeCancel:disabled, .px-composeSubmit:disabled { cursor: not-allowed; opacity: .55; }
        @media (max-width: 860px) {
          .px-inboxHero { align-items: flex-start; flex-direction: column; }
          .px-newMessageBtn { justify-content: center; width: 100%; }
          .px-inboxGrid { grid-template-columns: 1fr; }
          .px-conversationPanel { min-height: 520px; }
          .px-threadList { max-height: 360px; }
          .px-inboxGrid.is-empty .px-conversationPanel { display: none; }
        }
        @media (max-width: 560px) {
          .px-inboxShell { gap: 10px; padding: 8px 0 24px; }
          .px-inboxHero { border-radius: 16px; gap: 9px; padding: 13px; }
          .px-inboxHero::before { height: 2px; }
          .px-inboxHero__copy { gap: 4px; }
          .px-inboxHero span { font-size: 10px; letter-spacing: .05em; }
          .px-inboxHero h1 { font-size: clamp(24px, 9vw, 34px); }
          .px-inboxHero p { font-size: 12px; line-height: 1.25; }
          .px-newMessageBtn { min-height: 44px; padding: 0 12px; }
          .px-threadPanel, .px-conversationPanel { border-radius: 16px; box-shadow: 0 10px 26px rgba(15,23,42,.055); }
          .px-conversationPanel { grid-template-rows: auto minmax(0, 1fr) auto; min-height: calc(100dvh - 92px); }
          .px-threadPanel__head, .px-conversationHead { padding: 12px; }
          .px-conversationHead h2 { font-size: 19px; }
          .px-messageStream { gap: 8px; max-height: none; min-height: 0; overscroll-behavior: contain; padding: 10px; }
          .px-threadItem { border-radius: 13px; grid-template-columns: auto minmax(0, 1fr); padding: 10px; }
          .px-threadBody strong { display: -webkit-box; line-height: 1.2; overflow: hidden; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
          .px-threadMeta { grid-column: 2; justify-items: start; }
          .px-threadAvatar { height: 38px; width: 38px; }
          .px-messageBubble { border-radius: 13px; max-width: 94%; padding: 9px 10px; }
          .px-messageBubble p { font-size: 12px; line-height: 1.38; }
          .px-replyBox {
            align-items: end;
            backdrop-filter: blur(14px);
            background: rgba(255,255,255,.94);
            bottom: env(safe-area-inset-bottom, 0px);
            gap: 7px;
            grid-template-columns: minmax(0, 1fr) 44px;
            padding: 8px;
            position: sticky;
            z-index: 3;
          }
          .px-replyBox textarea {
            border-radius: 13px;
            font-size: 16px;
            line-height: 1.25;
            max-height: 82px;
            min-height: 44px;
            padding: 9px 10px;
            resize: none;
          }
          .px-replyBox button {
            font-size: 0;
            gap: 0;
            height: 44px;
            justify-content: center;
            min-height: 44px;
            padding: 0;
            width: 44px;
          }
          .px-replyBox button svg { height: 17px; width: 17px; }
          .px-composerOverlay { align-items: end; padding: 10px 10px max(10px, env(safe-area-inset-bottom)); }
          .px-composerModal { border-radius: 20px 20px 0 0; max-height: min(82dvh, 640px); width: 100%; }
          .px-composerActions { align-items: stretch; flex-direction: column-reverse; }
          .px-composerHead { padding: 13px 14px 11px; }
          .px-composerBody { gap: 9px; padding: 12px 14px; }
          .px-composerActions { padding: 10px 14px 14px; }
          .px-composerHead h2 { font-size: 22px; }
          .px-composerHead button { height: 44px; width: 44px; }
          .px-composeField { gap: 5px; }
          .px-composeField input, .px-composeField select, .px-composeField textarea {
            border-radius: 12px;
            font-size: 16px;
            min-height: 44px;
            padding: 8px 10px;
          }
          .px-composeField textarea {
            max-height: 118px;
            min-height: 84px;
          }
          .px-composeCancel, .px-composeSubmit { justify-content: center; min-height: 44px; width: 100%; }
        }
      `}</style>
    </main>
  )
}
