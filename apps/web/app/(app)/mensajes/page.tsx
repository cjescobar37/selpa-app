'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

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
  const [selectedMessage, setSelectedMessage] = useState<MessageRow | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [recipientDropdownOpen, setRecipientDropdownOpen] = useState(false)

  async function load() {
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
    const priority = { club_admin: 1, platform_admin: 2, player: 3 }
    return [...contacts].sort((a, b) => {
      const kindDiff = priority[a.kind] - priority[b.kind]
      if (kindDiff !== 0) return kindDiff
      return a.name.localeCompare(b.name)
    })
  }, [contacts])

  const filteredRecipientOptions = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase()
    if (!q) return orderedContacts.slice(0, 8)
    return orderedContacts.filter((c) => [c.name, c.email ?? '', c.kind].join(' ').toLowerCase().includes(q))
  }, [orderedContacts, recipientQuery])

  const inboxMessages = useMemo(
    () => messages.filter((m) => m.recipient_user_id === currentUserId).slice(0, 10),
    [messages, currentUserId]
  )
  const sentMessages = useMemo(
    () => messages.filter((m) => m.sender_user_id === currentUserId).slice(0, 10),
    [messages, currentUserId]
  )
  const visibleMessages = tab === 'inbox' ? inboxMessages : sentMessages
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
    setComposeOpen(false)
    await load()
    setTab('sent')
  }

  function pickRecipient(c: Contact) {
    setRecipientUserId(c.user_id)
    setRecipientQuery(contactLabel(c))
    setRecipientDropdownOpen(false)
  }

  async function openMessage(m: MessageRow) {
    setSelectedMessage(m)
    if (m.recipient_user_id === currentUserId && !m.read) {
      await supabase.from('messages').update({ read: true }).eq('id', m.id)
      setMessages((cur) => cur.map((row) => (row.id === m.id ? { ...row, read: true } : row)))
    }
  }

  return (
    <div className="px-wrap">
      <div className="px-pageHead">
        <h1 className="px-pageTitle">Mensajes</h1>
        <p className="px-pageSub">Comunicación entre jugadores, clubes y administración.</p>
      </div>

      {msg ? <div className="px-card px-card--flat" style={{ marginBottom: 14 }}>{msg}</div> : null}

      <div className="px-card px-card--flat" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setTab('inbox')} className={tab === 'inbox' ? 'px-btn' : 'px-btn px-btn--ghost'}>
              Bandeja de entrada
            </button>
            <button type="button" onClick={() => setTab('sent')} className={tab === 'sent' ? 'px-btn' : 'px-btn px-btn--ghost'}>
              Bandeja de salida
            </button>
          </div>
          <button type="button" className="px-btn" onClick={() => setComposeOpen(true)}>Nuevo mensaje</button>
        </div>

        {loading ? (
          <div className="px-help">Cargando mensajes…</div>
        ) : visibleMessages.length === 0 ? (
          <div className="px-help">{tab === 'inbox' ? 'No tenés mensajes recibidos.' : 'No tenés mensajes enviados.'}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visibleMessages.map((m) => {
              const incoming = m.recipient_user_id === currentUserId
              const counterpart = incoming ? fullName(m.sender_profile) : fullName(m.recipient_profile)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openMessage(m)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 16,
                    border: '1px solid rgba(23,37,63,.08)',
                    borderRadius: 16,
                    background: m.read ? 'rgba(255,255,255,.96)' : 'rgba(235,239,245,.98)',
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
                      <div style={{ fontSize: 13, color: 'rgba(23,37,63,.62)', marginBottom: 4 }}>{incoming ? 'De' : 'Para'}: {counterpart}</div>
                      <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(Sin asunto)'}</div>
                      <div style={{ fontSize: 14, color: 'rgba(23,37,63,.7)', marginTop: 8 }}>{previewText(m.body)}</div>
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 8, flex: '0 0 auto' }}>
                      <div style={{ fontSize: 12, color: 'rgba(23,37,63,.60)' }}>{formatDate(m.created_at)}</div>
                      {!m.read ? <span style={{ width: 10, height: 10, borderRadius: 999, background: '#9ca3af', display: 'inline-block' }} /> : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedMessage ? (
        <div className="px-overlay" onClick={() => setSelectedMessage(null)}>
          <div className="px-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">{selectedMessage.subject || '(Sin asunto)'}</h3>
                <div className="px-modalSub">
                  {selectedMessage.recipient_user_id === currentUserId ? 'De' : 'Para'}: {selectedMessage.recipient_user_id === currentUserId ? fullName(selectedMessage.sender_profile) : fullName(selectedMessage.recipient_profile)} · {formatDate(selectedMessage.created_at)}
                </div>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setSelectedMessage(null)}>Cerrar</button>
            </div>
            <div className="px-modalBodyText" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{selectedMessage.body}</div>
          </div>
        </div>
      ) : null}

      {composeOpen ? (
        <div className="px-overlay" onClick={() => setComposeOpen(false)}>
          <div className="px-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="px-modalHead">
              <div>
                <h3 className="px-modalTitle">Nuevo mensaje</h3>
                <div className="px-modalSub">Elegí el destinatario y enviá tu mensaje.</div>
              </div>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setComposeOpen(false)}>Cerrar</button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
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
          </div>
        </div>
      ) : null}
    </div>
  )
}
