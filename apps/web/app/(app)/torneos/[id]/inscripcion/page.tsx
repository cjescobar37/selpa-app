'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

type ClubPlayer = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number
  gender: string | null
  user_status?: string
}

type ActivePartnership = {
  id: string
  player1_club_player_id: string
  player2_club_player_id: string
  status: string
  player1?: ActivePartnerPlayer | null
  player2?: ActivePartnerPlayer | null
}

type ActivePartnerPlayer = {
  id: string
  user_id: string
  full_name: string
  avatar_url: string | null
}

function isPastDeadline(deadline: string | null) {
  if (!deadline) return false
  return new Date() > new Date(deadline)
}

function normalizeGender(g: string | null) {
  if (!g) return null
  const x = g.toUpperCase()
  if (x === 'M' || x === 'MALE' || x === 'MASCULINO') return 'MALE'
  if (x === 'F' || x === 'FEMALE' || x === 'FEMENINO') return 'FEMALE'
  if (x === 'MIXED' || x === 'MIXTO') return 'MIXED'
  return x
}

async function getGlobalUserStatus(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('status') && (message.includes('profiles') || message.includes('schema cache') || message.includes('column'))) {
      return 'ACTIVE'
    }
    throw error
  }

  return String((data as any)?.status || 'ACTIVE')
}

export default function TorneoInscripcionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const tournamentId = params?.id

  const { activeClub, loading: clubLoading } = useActiveClub()

  const [t, setT] = useState<TournamentView | null>(null)
  const [me, setMe] = useState<{ userId: string; email: string | null; status: string } | null>(null)
  const [clubMe, setClubMe] = useState<ClubPlayer | null>(null)
  const [partnerUserId, setPartnerUserId] = useState<string>('')
  const [clubPartner, setClubPartner] = useState<ClubPlayer | null>(null)
  const [activePartner, setActivePartner] = useState<ActivePartnerPlayer | null>(null)
  const [loadingActivePartner, setLoadingActivePartner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      setMsg('')
      if (!tournamentId) return

      const { data: userData } = await supabase.auth.getUser()
      const u = userData?.user
      if (!u) {
        router.replace('/login')
        return
      }
      const userStatus = await getGlobalUserStatus(u.id)
      setMe({ userId: u.id, email: u.email ?? null, status: userStatus })
      if (userStatus === 'SUSPENDED') {
        setMsg('❌ Tu usuario está suspendido y no puede interactuar como jugador.')
      }

      const { data: tour, error: tourErr } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('id', tournamentId).single()
      if (tourErr) {
        setMsg(`❌ ${tourErr.message}`)
        return
      }

      setT(toTournamentView(tour as any))
    })()
  }, [tournamentId, router])

  useEffect(() => {
    ;(async () => {
      if (!activeClub?.id || !me?.userId) return

      const { error: ensureErr } = await supabase.rpc('ensure_club_player', { p_club_id: activeClub.id })
      if (ensureErr) {
        setMsg(`❌ ensure_club_player: ${ensureErr.message}`)
        return
      }

      const { data, error } = await supabase
        .from('club_players')
        .select('id, club_id, user_id, display_name, category, gender')
        .eq('club_id', activeClub.id)
        .eq('user_id', me.userId)
        .maybeSingle()

      if (error) {
        setMsg(`❌ ${error.message}`)
        return
      }

      setClubMe(data ? { ...(data as any), user_status: me.status } : null)
    })()
  }, [activeClub?.id, me?.userId, me?.status])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setActivePartner(null)
      if (!activeClub?.id || !clubMe?.id) return

      setLoadingActivePartner(true)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return

        const res = await fetch(`/api/clubs/${activeClub.id}/active-partnerships`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? 'No pude leer tu pareja activa.')

        const partnerships = (json?.partnerships ?? []) as ActivePartnership[]
        const ownPartnership = partnerships.find((partnership) => (
          partnership.status === 'ACTIVE' &&
          (partnership.player1_club_player_id === clubMe.id || partnership.player2_club_player_id === clubMe.id)
        ))
        const partner = ownPartnership?.player1_club_player_id === clubMe.id
          ? ownPartnership?.player2
          : ownPartnership?.player1

        if (!cancelled) setActivePartner(partner?.user_id ? partner : null)
      } catch {
        if (!cancelled) setActivePartner(null)
      } finally {
        if (!cancelled) setLoadingActivePartner(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeClub?.id, clubMe?.id])

  const clubMismatch = useMemo(() => {
    if (!t || !activeClub) return false
    return t.club_id !== activeClub.id
  }, [t, activeClub])

  async function loadPartnerByUserId(userId: string, successMessage = '✅ Compañero cargado.') {
    setMsg('')
    setClubPartner(null)

    if (!activeClub?.id) {
      setMsg('❌ Seleccioná un club.')
      return
    }
    if (me?.status === 'SUSPENDED') {
      setMsg('❌ Tu usuario está suspendido y no puede interactuar como jugador.')
      return
    }
    if (!userId.trim()) {
      setMsg('❌ Pegá el user_id del compañero/a.')
      return
    }
    if (userId.trim() === me?.userId) {
      setMsg('❌ No podés ser tu propio compañero/a.')
      return
    }

    const { data, error } = await supabase
      .from('club_players')
      .select('id, club_id, user_id, display_name, category, gender')
      .eq('club_id', activeClub.id)
      .eq('user_id', userId.trim())
      .maybeSingle()

    if (error) {
      setMsg(`❌ ${error.message}`)
      return
    }
    if (!data) {
      setMsg('❌ Ese usuario no tiene perfil en este club.')
      return
    }

    let partnerStatus = 'ACTIVE'
    try {
      partnerStatus = await getGlobalUserStatus(userId.trim())
    } catch (statusError: any) {
      setMsg(`❌ ${statusError?.message ?? 'No pude validar el estado global del compañero.'}`)
      return
    }
    if (partnerStatus === 'SUSPENDED') {
      setMsg('❌ Ese usuario está suspendido y no puede interactuar como jugador.')
      return
    }

    setClubPartner({ ...(data as any), user_status: partnerStatus })
    setMsg(successMessage)
  }

  async function loadPartner() {
    await loadPartnerByUserId(partnerUserId)
  }

  async function useActivePartner() {
    if (!activePartner?.user_id) return
    setPartnerUserId(activePartner.user_id)
    await loadPartnerByUserId(activePartner.user_id, '✅ Pareja activa cargada como compañero/a.')
  }

  const canRegister = useMemo(() => {
    if (!t || !activeClub?.id || clubMismatch || !me?.userId || !clubMe || !clubPartner) return false
    if (me.status === 'SUSPENDED' || clubMe.user_status === 'SUSPENDED' || clubPartner.user_status === 'SUSPENDED') return false
    if (isPastDeadline(t.registrationDeadline)) return false
    return true
  }, [t, activeClub?.id, clubMismatch, me?.userId, me?.status, clubMe, clubPartner])

  const activePartnerMismatch = Boolean(activePartner && clubPartner && clubPartner.id !== activePartner.id)

  async function register() {
    setMsg('')
    if (!t || !activeClub?.id || !me?.userId) return

    if (clubMismatch) return setMsg('❌ Este torneo es de otro club. Cambiá el club activo.')
    if (me.status === 'SUSPENDED') return setMsg('❌ Tu usuario está suspendido y no puede inscribirse a torneos.')
    if (!clubMe) return setMsg('❌ No tenés perfil de jugador en este club.')
    if (!clubPartner) return setMsg('❌ Cargá primero a tu compañero/a.')
    if (clubPartner.user_status === 'SUSPENDED') return setMsg('❌ Tu compañero/a está suspendido y no puede participar.')
    if (isPastDeadline(t.registrationDeadline)) return setMsg('❌ La inscripción ya cerró.')

    const tournamentCategory = t.category ?? 0
    if (clubMe.category < tournamentCategory) return setMsg(`❌ Tu categoría (${clubMe.category}) es menor que la del torneo (${tournamentCategory}).`)
    if (clubPartner.category < tournamentCategory) return setMsg(`❌ La categoría de tu compañero/a (${clubPartner.category}) es menor que la del torneo (${tournamentCategory}).`)

    if (t.gender !== 'MIXED') {
      const meG = normalizeGender(clubMe.gender)
      const paG = normalizeGender(clubPartner.gender)
      if (meG && meG !== t.gender) return setMsg(`❌ Vos no cumplís con el género del torneo (${t.gender}).`)
      if (paG && paG !== t.gender) return setMsg(`❌ Tu compañero/a no cumple con el género del torneo (${t.gender}).`)
    }

    setSaving(true)
    setMsg('Inscribiendo...')

    try {
      if (t.maxPairs) {
        const { count, error: countErr } = await supabase
          .from('tournament_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', t.id)
          .neq('status', 'CANCELLED')

        if (countErr) {
          setSaving(false)
          return setMsg(`❌ Cupos: ${countErr.message}`)
        }
        if ((count ?? 0) >= t.maxPairs) {
          setSaving(false)
          return setMsg('❌ No hay cupos: torneo lleno.')
        }
      }

      const { data, error } = await supabase.rpc('register_team_for_tournament', {
        p_tournament_id: t.id,
        p_club_id: activeClub.id,
        p_partner_user_id: clubPartner.user_id,
      })

      setSaving(false)
      if (error) return setMsg(`❌ ${error.message}`)

      const row = Array.isArray(data) ? data[0] : data
      setMsg(`✅ Inscripción creada (PENDING).${row?.team_id ? ` team=${row.team_id}` : ''}`)
      router.replace(`/torneos/${t.id}`)
    } catch (e: any) {
      setSaving(false)
      setMsg(`❌ Exception: ${e?.message ?? String(e)}`)
    }
  }

  if (clubLoading) return <div>Cargando...</div>

  if (!activeClub?.id) {
    return (
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>Inscripción</h1>
        <p style={{ opacity: 0.8 }}>Seleccioná un club activo primero.</p>
        <Link href="/torneos" style={{ color: 'white' }}>← Volver</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href={`/torneos/${tournamentId}`} style={{ color: 'white', opacity: 0.85, textDecoration: 'none' }}>← Volver al torneo</Link>
      <h1 style={{ fontSize: 28, fontWeight: 950, marginTop: 10 }}>Inscripción</h1>

      {t ? (
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          <b>{t.name}</b> · Cat {t.category ?? '—'} · {t.gender} · {t.status}
        </div>
      ) : (
        <div style={{ opacity: 0.8, marginTop: 6 }}>Cargando torneo…</div>
      )}

      {clubMismatch ? <div style={warnBox}>⚠️ Este torneo es de otro club. Cambiá el club activo arriba.</div> : null}
      {msg ? <div style={{ marginTop: 12, color: msg.startsWith('✅') ? 'white' : '#ff6b6b' }}>{msg}</div> : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Tu perfil en este club</div>
          {clubMe ? (
            <div style={{ opacity: 0.9 }}>
              <div>Jugador: <b>{clubMe.display_name ?? me?.email ?? 'Yo'}</b></div>
              <div>Categoría: <b>{clubMe.category}</b></div>
              {clubMe.gender ? <div>Género: <b>{normalizeGender(clubMe.gender)}</b></div> : null}
            </div>
          ) : (
            <div style={{ opacity: 0.8 }}>Cargando perfil del club…</div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Compañero/a</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {activePartner ? (
              <div style={activePartnerBox}>
                <div style={activePartnerAvatar}>
                  {activePartner.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activePartner.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getInitials(activePartner.full_name)
                  )}
                </div>
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#6ee7f9', textTransform: 'uppercase' }}>Pareja activa detectada</div>
                  <div style={{ fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activePartner.full_name}</div>
                </div>
                <button style={activePartnerButton} type="button" onClick={useActivePartner}>Usar pareja activa</button>
              </div>
            ) : loadingActivePartner ? (
              <div style={activePartnerLoading}>Buscando pareja activa…</div>
            ) : null}

            <input
              value={partnerUserId}
              onChange={(e) => {
                setPartnerUserId(e.target.value)
                setClubPartner(null)
              }}
              placeholder="Pegá el user_id del compañero/a"
              style={input}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn} type="button" onClick={loadPartner}>Validar compañero/a</button>
              <button style={btnGhost} type="button" onClick={() => { setPartnerUserId(''); setClubPartner(null); }}>Limpiar</button>
            </div>
            {activePartnerMismatch ? (
              <div style={activePartnerWarning}>No coincide con tu pareja activa.</div>
            ) : null}
            {clubPartner ? (
              <div style={{ opacity: 0.9 }}>
                <div>Jugador: <b>{clubPartner.display_name ?? clubPartner.user_id}</b></div>
                <div>Categoría: <b>{clubPartner.category}</b></div>
                {clubPartner.gender ? <div>Género: <b>{normalizeGender(clubPartner.gender)}</b></div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Confirmación</div>
          <div style={{ opacity: 0.85, marginBottom: 12 }}>
            El registro usa la función <b>register_team_for_tournament()</b>, así evitamos inserts inconsistentes.
          </div>
          <button style={canRegister && !saving ? btn : btnGhostDisabled} type="button" onClick={register} disabled={!canRegister || saving}>
            {saving ? 'Inscribiendo…' : 'Confirmar inscripción'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? 'P') + (parts[1]?.[0] ?? '')
}

const card: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 16,
  padding: 14,
}
const input: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: 'white',
}
const btn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.20)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent' }
const btnGhostDisabled: React.CSSProperties = { ...btnGhost, opacity: 0.45, cursor: 'not-allowed' }
const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: '1px solid rgba(255,120,120,0.35)',
  background: 'rgba(255,120,120,0.10)',
  color: 'white',
}
const activePartnerBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
  padding: 10,
  borderRadius: 16,
  border: '1px solid rgba(103,232,249,0.28)',
  background: 'linear-gradient(135deg, rgba(34,211,238,0.13), rgba(236,72,153,0.08))',
  boxShadow: '0 14px 34px rgba(8,145,178,0.10)',
}
const activePartnerAvatar: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  overflow: 'hidden',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid rgba(255,255,255,0.35)',
  background: 'rgba(8,47,73,0.82)',
  color: 'white',
  fontWeight: 950,
  fontSize: 13,
}
const activePartnerButton: React.CSSProperties = {
  ...btn,
  marginLeft: 'auto',
  padding: '9px 11px',
  borderColor: 'rgba(103,232,249,0.45)',
  background: 'rgba(34,211,238,0.16)',
  color: '#e0faff',
}
const activePartnerLoading: React.CSSProperties = {
  padding: 10,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.72)',
  fontWeight: 700,
}
const activePartnerWarning: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 12,
  border: '1px solid rgba(251,191,36,0.32)',
  background: 'rgba(251,191,36,0.10)',
  color: '#fde68a',
  fontWeight: 800,
  fontSize: 13,
}
