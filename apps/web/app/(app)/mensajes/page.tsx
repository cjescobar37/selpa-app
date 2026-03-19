'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getClubInitials } from '@/lib/clubAssets'

type Contact = {
  user_id: string
  name: string
  email: string | null
  avatar_url: string | null
  kind: 'club_admin' | 'player' | 'platform_admin'
}

type MessageRow = {
  id: string
  sender_user_id: string
  recipient_user_id: string
  subject: string
  body: string
  kind: string
  read: boolean
  created_at: string
  sender_profile: any
  recipient_profile: any
}

type MailTab = 'inbox' | 'sent'

function fullName(profile: any) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Usuario'
  )
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

function previewText(text: string, max = 120) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

function contactLabel(c: Contact) {
  return c.email ? `${c.name} · ${c.email}` : c.name
}

export default function MensajesPage() {
  const searchParams = useSearchParams()
  const prefTo = searchParams.get('to')

  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [recipientUserId, setRecipientUserId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [recipientQuery, setRecipientQuery] = useState('')
  const [tab, setTab] = useState<MailTab>('inbox')
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false)

  async function load(markRead = true) {
    setLoading(true)
    setMsg('')

    const [{ data: sess }, { data: userData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ])

    const token = sess?.session?.access_token
    const me = userData?.user

    if (!token || !me) {
      setMsg('Sesión inválida.')
      setLoading(false)
      return
    }

    setCurrentUserId(me.id)

    if (markRead) {
      await supabase.from('messages').update({ read: true }).eq('recipient_user_id', me.id).eq('read', false)
    }

    const res = await fetch('/api/messages', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMsg(json?.error ?? 'No pude cargar mensajes.')
      setLoading(false)
      return
    }

    const loadedContacts = (json?.contacts ?? []) as Contact[]
    const loadedMessages = (json?.messages ?? []) as MessageRow[]

    setContacts(loadedContacts)
    setMessages(loadedMessages)

    if (prefTo && loadedContacts.length > 0 && !recipientUserId) {
      const found = prefTo === 'club'
        ? loadedContacts.find((c) => c.kind === 'club_admin')
        : loadedContacts.find((c) => c.kind === 'platform_admin')
      if (found) {
        setRecipientUserId(found.user_id)
        setRecipientQuery(contactLabel(found))
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefTo])

  const orderedContacts = useMemo(() => {
    const usage = new Map<string, number>()
    for (const m of messages) {
      const otherId = m.sender_user_id === currentUserId ? m.recipient_user_id : m.sender_user_id
      if (!otherId) continue
      usage.set(otherId, (usage.get(otherId) ?? 0) + 1)
    }
    const priority = { club_admin: 1, platform_admin: 2, player: 3 }
    return [...contacts].sort((a, b) => {
      const useDiff = (usage.get(b.user_id) ?? 0) - (usage.get(a.user_id) ?? 0)
      if (useDiff !== 0) return useDiff
      const kindDiff = priority[a.kind] - priority[b.kind]
      if (kindDiff !== 0) return kindDiff
      return a.name.localeCompare(b.name)
    })
  }, [contacts, messages, currentUserId])

  const frequentContacts = useMemo(() => orderedContacts.slice(0, 5), [orderedContacts])

  const filteredRecipientOptions = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase()
    if (!q) return orderedContacts.slice(0, 8)
    return orderedContacts.filter((c) => [c.name, c.email ?? '', c.kind].join(' ').toLowerCase().includes(q))
  }, [orderedContacts, recipientQuery])

  const inboxMessages = useMemo(() => messages.filter((m) => m.recipient_user_id === currentUserId), [messages, currentUserId])
  const sentMessages = useMemo(() => messages.filter((m) => m.sender_user_id === currentUserId), [messages, currentUserId])
  const visibleMessages = tab === 'inbox' ? inboxMessages : sentMessages
  const selectedMessage = visibleMessages.find((m) => m.id === selectedMessageId) ?? null

  useEffect(() => {
    if (!visibleMessages.length) {
      setSelectedMessageId('')
      setDetailOpen(false)
      return
    }
    if (!visibleMessages.some((m) => m.id === selectedMessageId)) {
      setSelectedMessageId(visibleMessages[0].id)
    }
  }, [visibleMessages, selectedMessageId])

  const recipient = useMemo(() => contacts.find((c) => c.user_id === recipientUserId) ?? null, [contacts, recipientUserId])

  async function sendMessage() {
    setSending(true)
    setMsg('')

    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    if (!token) {
      setMsg('Sesión inválida.')
      setSending(false)
      return
    }

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipientUserId,
        subject,
        message: body,
        kind: prefTo === 'platform' ? 'issue' : 'direct',
      }),
    })

    const json = await res.json().catch(() => ({}))
    setSending(false)

    if (!res.ok) {
      setMsg(json?.error ?? 'No pude enviar el mensaje.')
      return
    }

    setMsg('Mensaje enviado.')
    setSubject('')
    setBody('')
    await load(false)
    setTab('sent')
    setDetailOpen(false)
  }

  function pickRecipient(c: Contact) {
    setRecipientUserId(c.user_id)
    setRecipientQuery(contactLabel(c))
    setRecipientDropdownOpen(false)
  }

  function openMessage(id: string) {
    setSelectedMessageId(id)
    setDetailOpen(true)
  }

  return (
    <div className="px-wrap">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Mensajes</h1>
        <p className="px-pageSub">Comunicación entre jugadores, clubes y administración.</p>
      </div>

      {msg ? <div className="px-card px-card--flat" style={{ marginBottom: 14 }}>{msg}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
        <div className="px-card px-card--flat" style={{ display: 'grid', gap: 12 }}>
          <div className="px-h2">Contactos frecuentes</div>
          {frequentContacts.length === 0 ? (
            <div className="px-help">Todavía no hay contactos frecuentes.</div>
          ) : (
            frequentContacts.map((c) => (
              <button
                key={c.user_id}
                type="button"
                onClick={() => pickRecipient(c)}
                style={{
                  textAlign: 'left', padding: 12, borderRadius: 14,
                  border: c.user_id === recipientUserId ? '1px solid rgba(83,199,217,.45)' : '1px solid rgba(23,37,63,.10)',
                  background: c.user_id === recipientUserId ? 'rgba(83,199,217,.10)' : 'rgba(255,255,255,.70)',
                  color: '#17253f', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer'
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 12, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(23,37,63,.08)', fontWeight: 900, color: '#17253f', flex: '0 0 auto' }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{getClubInitials(c.name)}</span>}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'rgba(23,37,63,.68)' }}>{c.kind}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div className="px-card px-card--flat" style={{ display: 'grid', gap: 12 }}>
            <div className="px-h2">Nuevo mensaje</div>
            <div className="px-field" style={{ marginTop: 0, position: 'relative' }}>
              <div className="px-label">Destinatario</div>
              <input
                className="px-input"
                value={recipientQuery}
                onChange={(e) => {
                  setRecipientQuery(e.target.value)
                  setRecipientUserId('')
                  setRecipientDropdownOpen(true)
                }}
                onFocus={() => setRecipientDropdownOpen(true)}
                placeholder="Buscá por nombre o mail..."
                autoComplete="off"
              />
              {recipientDropdownOpen && filteredRecipientOptions.length > 0 ? (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, background: '#ffffff', border: '1px solid rgba(23,37,63,.10)', borderRadius: 14, boxShadow: '0 16px 34px rgba(17,24,39,.12)', overflow: 'hidden' }}>
                  {filteredRecipientOptions.map((c) => (
                    <button key={c.user_id} type="button" onClick={() => pickRecipient(c)} style={{ width: '100%', textAlign: 'left', padding: 12, border: 'none', borderBottom: '1px solid rgba(23,37,63,.06)', background: 'white', cursor: 'pointer', color: '#17253f' }}>
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(23,37,63,.66)' }}>{c.email || 'Sin mail'} · {c.kind}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="px-field" style={{ marginTop: 0 }}>
              <div className="px-label">Asunto</div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="px-input" />
            </div>
            <div className="px-field" style={{ marginTop: 0 }}>
              <div className="px-label">Mensaje</div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="px-input" placeholder={recipient ? `Escribile a ${recipient.name}...` : 'Escribí tu mensaje...'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div className="px-help">{recipient ? `Destinatario: ${recipient.name}` : 'Seleccioná un destinatario.'}</div>
              <button type="button" onClick={sendMessage} disabled={sending || !recipientUserId} className="px-btn">{sending ? 'Enviando…' : 'Enviar mensaje'}</button>
            </div>
          </div>

          <div className="px-card px-card--flat" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="px-h2" style={{ marginRight: 'auto' }}>{detailOpen && selectedMessage ? 'Detalle del mensaje' : 'Bandejas'}</div>
              {detailOpen && selectedMessage ? (
                <button type="button" className="px-btn px-btn--ghost" onClick={() => setDetailOpen(false)}>Volver a mensajes</button>
              ) : (
                <>
                  <button type="button" onClick={() => { setTab('inbox'); setDetailOpen(false) }} className={tab === 'inbox' ? 'px-btn' : 'px-btn px-btn--ghost'} style={{ height: 40 }}>Bandeja de entrada</button>
                  <button type="button" onClick={() => { setTab('sent'); setDetailOpen(false) }} className={tab === 'sent' ? 'px-btn' : 'px-btn px-btn--ghost'} style={{ height: 40 }}>Bandeja de salida</button>
                </>
              )}
            </div>

            {loading ? (
              <div className="px-help">Cargando mensajes…</div>
            ) : visibleMessages.length === 0 ? (
              <div className="px-help">{tab === 'inbox' ? 'No tenés mensajes recibidos.' : 'No tenés mensajes enviados.'}</div>
            ) : detailOpen && selectedMessage ? (
              <div className="px-card px-card--flat" style={{ background: 'rgba(255,255,255,.82)', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: '#17253f' }}>{selectedMessage.subject || '(Sin asunto)'}</div>
                    <div style={{ fontSize: 14, color: 'rgba(23,37,63,.72)', marginTop: 6 }}>
                      <b>{selectedMessage.recipient_user_id === currentUserId ? 'De' : 'Para'}:</b>{' '}
                      {selectedMessage.recipient_user_id === currentUserId ? fullName(selectedMessage.sender_profile) : fullName(selectedMessage.recipient_profile)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(23,37,63,.62)' }}>{formatDate(selectedMessage.created_at)}</div>
                </div>
                <div style={{ borderTop: '1px solid rgba(23,37,63,.08)', paddingTop: 14, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#17253f', fontSize: 16, minHeight: 220 }}>
                  {selectedMessage.body}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="px-btn px-btn--ghost" onClick={() => setDetailOpen(false)}>Cerrar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {visibleMessages.map((m) => {
                  const incoming = m.recipient_user_id === currentUserId
                  const counterpart = incoming ? fullName(m.sender_profile) : fullName(m.recipient_profile)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openMessage(m.id)}
                      style={{ width: '100%', textAlign: 'left', padding: 16, border: '1px solid rgba(23,37,63,.08)', borderRadius: 16, background: incoming && !m.read ? 'rgba(83,199,217,.08)' : 'rgba(255,255,255,.72)', cursor: 'pointer', color: '#17253f' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 21, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(Sin asunto)'}</div>
                          <div style={{ fontSize: 13, color: 'rgba(23,37,63,.72)', marginTop: 4 }}>{incoming ? 'De' : 'Para'}: {counterpart}</div>
                          <div style={{ fontSize: 14, color: 'rgba(23,37,63,.66)', marginTop: 8 }}>{previewText(m.body)}</div>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(23,37,63,.60)', flex: '0 0 auto' }}>{formatDate(m.created_at)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
