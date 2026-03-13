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

export default function TorneoInscripcionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const tournamentId = params?.id

  const { activeClub, loading: clubLoading } = useActiveClub()

  const [t, setT] = useState<TournamentView | null>(null)
  const [me, setMe] = useState<{ userId: string; email: string | null } | null>(null)
  const [clubMe, setClubMe] = useState<ClubPlayer | null>(null)
  const [partnerUserId, setPartnerUserId] = useState<string>('')
  const [clubPartner, setClubPartner] = useState<ClubPlayer | null>(null)
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
      setMe({ userId: u.id, email: u.email ?? null })

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

      setClubMe((data as any) ?? null)
    })()
  }, [activeClub?.id, me?.userId])

  const clubMismatch = useMemo(() => {
    if (!t || !activeClub) return false
    return t.club_id !== activeClub.id
  }, [t, activeClub])

  async function loadPartner() {
    setMsg('')
    setClubPartner(null)

    if (!activeClub?.id) {
      setMsg('❌ Seleccioná un club.')
      return
    }
    if (!partnerUserId.trim()) {
      setMsg('❌ Pegá el user_id del compañero/a.')
      return
    }
    if (partnerUserId.trim() === me?.userId) {
      setMsg('❌ No podés ser tu propio compañero/a.')
      return
    }

    const { data, error } = await supabase
      .from('club_players')
      .select('id, club_id, user_id, display_name, category, gender')
      .eq('club_id', activeClub.id)
      .eq('user_id', partnerUserId.trim())
      .maybeSingle()

    if (error) {
      setMsg(`❌ ${error.message}`)
      return
    }
    if (!data) {
      setMsg('❌ Ese usuario no tiene perfil en este club.')
      return
    }

    setClubPartner(data as any)
    setMsg('✅ Compañero cargado.')
  }

  const canRegister = useMemo(() => {
    if (!t || !activeClub?.id || clubMismatch || !me?.userId || !clubMe || !clubPartner) return false
    if (isPastDeadline(t.registrationDeadline)) return false
    return true
  }, [t, activeClub?.id, clubMismatch, me?.userId, clubMe, clubPartner])

  async function register() {
    setMsg('')
    if (!t || !activeClub?.id || !me?.userId) return

    if (clubMismatch) return setMsg('❌ Este torneo es de otro club. Cambiá el club activo.')
    if (!clubMe) return setMsg('❌ No tenés perfil de jugador en este club.')
    if (!clubPartner) return setMsg('❌ Cargá primero a tu compañero/a.')
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
            <input value={partnerUserId} onChange={(e) => setPartnerUserId(e.target.value)} placeholder="Pegá el user_id del compañero/a" style={input} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btn} type="button" onClick={loadPartner}>Validar compañero/a</button>
              <button style={btnGhost} type="button" onClick={() => { setPartnerUserId(''); setClubPartner(null); }}>Limpiar</button>
            </div>
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