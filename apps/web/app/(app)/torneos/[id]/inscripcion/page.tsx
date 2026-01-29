'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

type Tournament = {
  id: string
  club_id: string
  name: string
  gender: string
  category_id: number
  start_date: string
  registration_deadline: string | null
  max_pairs: number | null
  status: string
}

type ClubPlayer = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number // ✅ en tu schema es "category"
  gender: string | null
}

function isPastDeadline(deadline: string | null) {
  if (!deadline) return false
  const dl = new Date(deadline)
  return new Date() > dl
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

  const [t, setT] = useState<Tournament | null>(null)
  const [me, setMe] = useState<{ userId: string; email: string | null } | null>(null)

  const [clubMe, setClubMe] = useState<ClubPlayer | null>(null)
  const [partnerUserId, setPartnerUserId] = useState<string>('') // MVP: cargar por user_id
  const [clubPartner, setClubPartner] = useState<ClubPlayer | null>(null)

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // ---------- load tournament + current user
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

      const { data: tour, error: tourErr } = await supabase
        .from('tournaments')
        .select('id, club_id, name, gender, category_id, start_date, registration_deadline, max_pairs, status')
        .eq('id', tournamentId)
        .single()

      if (tourErr) {
        setMsg(`❌ ${tourErr.message}`)
        return
      }

      setT(tour as any)
    })()
  }, [tournamentId, router])

  // ---------- ensure + load my club_player (perfil del club)
  useEffect(() => {
    ;(async () => {
      if (!activeClub?.id || !me?.userId) return

      // ✅ crea mi fila en club_players si no existe (RPC security definer)
      const { error: ensureErr } = await supabase.rpc('ensure_club_player', {
        p_club_id: activeClub.id,
      })
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

  // ---------- cargar partner por user_id (MVP)
  async function loadPartner() {
    setMsg('')
    setClubPartner(null)

    if (!activeClub?.id) {
      setMsg('❌ Seleccioná un club.')
      return
    }
    if (!partnerUserId.trim()) {
      setMsg('❌ Pegá el user_id del compañero/a (por ahora).')
      return
    }
    if (partnerUserId.trim() === me?.userId) {
      setMsg('❌ No podés ser tu propio compañero/a 😅')
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
      setMsg('❌ Ese usuario no tiene perfil en este club (club_players).')
      return
    }

    setClubPartner(data as any)
    setMsg('✅ Compañero cargado.')
  }

  // ---------- can register?
  const canRegister = useMemo(() => {
    if (!t) return false
    if (!activeClub?.id) return false
    if (clubMismatch) return false
    if (!me?.userId) return false
    if (!clubMe) return false
    if (!clubPartner) return false
    if (isPastDeadline(t.registration_deadline)) return false
    return true
  }, [t, activeClub?.id, clubMismatch, me?.userId, clubMe, clubPartner])

  // ---------- registrar: RPC (evita RLS en inserts)
  async function register() {
    setMsg('')
    if (!t || !activeClub?.id || !me?.userId) return

    if (clubMismatch) {
      setMsg('❌ Este torneo es de otro club. Cambiá el club activo.')
      return
    }
    if (!clubMe) {
      setMsg('❌ No tenés perfil de jugador en este club (club_players).')
      return
    }
    if (!clubPartner) {
      setMsg('❌ Cargá primero a tu compañero/a.')
      return
    }

    if (isPastDeadline(t.registration_deadline)) {
      setMsg('❌ La inscripción ya cerró.')
      return
    }

    // categoría: player.category >= torneo.category_id
    if (clubMe.category < t.category_id) {
      setMsg(`❌ Vos no podés: tu categoría (${clubMe.category}) es menor que la del torneo (${t.category_id}).`)
      return
    }
    if (clubPartner.category < t.category_id) {
      setMsg(`❌ Tu compañero/a no puede: su categoría (${clubPartner.category}) es menor que la del torneo (${t.category_id}).`)
      return
    }

    // género: normalizamos 'M'/'F' -> 'MALE'/'FEMALE'
    if (t.gender !== 'MIXED') {
      const meG = normalizeGender(clubMe.gender)
      const paG = normalizeGender(clubPartner.gender)
      if (meG && meG !== t.gender) {
        setMsg(`❌ Vos no cumplís género del torneo (${t.gender}).`)
        return
      }
      if (paG && paG !== t.gender) {
        setMsg(`❌ Tu compañero/a no cumple género del torneo (${t.gender}).`)
        return
      }
    }

    setSaving(true)
    setMsg('Inscribiendo...')

    try {
      // cupos: contamos registrations NO canceladas
      if (t.max_pairs) {
        const { count, error: countErr } = await supabase
          .from('tournament_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', t.id)
          .neq('status', 'CANCELLED')

        if (countErr) {
          setSaving(false)
          setMsg(`❌ Cupos: ${countErr.message}`)
          return
        }

        if ((count ?? 0) >= t.max_pairs) {
          setSaving(false)
          setMsg('❌ No hay cupos: torneo lleno.')
          return
        }
      }

      // ✅ Crear team + registration en el backend
      const { data, error } = await supabase.rpc('register_team_for_tournament', {
        p_tournament_id: t.id,
        p_club_id: activeClub.id,
        p_partner_user_id: clubPartner.user_id,
      })

      setSaving(false)

      if (error) {
        setMsg(`❌ ${error.message}`)
        return
      }

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
        <Link href="/torneos" style={{ color: 'white' }}>
          ← Volver
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href={`/torneos/${tournamentId}`} style={{ color: 'white', opacity: 0.85, textDecoration: 'none' }}>
        ← Volver al torneo
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 950, marginTop: 10 }}>Inscripción</h1>

      {t ? (
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          <b>{t.name}</b> · Cat {t.category_id} · {t.gender} · {t.status}
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
              <div>
                Jugador: <b>{clubMe.display_name ?? me?.email ?? 'Yo'}</b>
              </div>
              <div>
                Categoría: <b>{clubMe.category}</b>
              </div>
              {clubMe.gender ? (
                <div>
                  Género: <b>{normalizeGender(clubMe.gender)}</b>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ opacity: 0.85 }}>
              ❌ No tenés perfil de jugador en este club (<code>club_players</code>).
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Compañero/a (MVP)</div>
          <div style={{ opacity: 0.75, marginBottom: 10 }}>
            Por ahora cargamos al compañero por <b>user_id</b>. En el próximo paso lo hacemos por <b>email/apellido</b> con el RPC de búsqueda.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={partnerUserId}
              onChange={(e) => setPartnerUserId(e.target.value)}
              placeholder="user_id del compañero/a"
              style={input}
            />
            <button onClick={loadPartner} style={btn}>
              Cargar compañero/a
            </button>

            {clubPartner ? (
              <div style={{ opacity: 0.9 }}>
                ✅ <b>{clubPartner.display_name ?? clubPartner.user_id}</b> · Cat <b>{clubPartner.category}</b>
              </div>
            ) : null}
          </div>
        </div>

        <button onClick={register} disabled={!canRegister || saving || !t} style={btnBig}>
          {saving ? 'Inscribiendo...' : 'Confirmar inscripción'}
        </button>

        <div style={{ opacity: 0.7, fontSize: 12 }}>
          MVP: crea <b>tournament_teams</b> + <b>tournament_registrations</b> en estado <b>PENDING</b>.
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
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
  outline: 'none',
}

const btn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.20)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  cursor: 'pointer',
}

const btnBig: React.CSSProperties = {
  padding: '12px 12px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.20)',
  background: 'rgba(255,255,255,0.12)',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 900,
}

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: '1px solid rgba(255,120,120,0.35)',
  background: 'rgba(255,120,120,0.10)',
  color: 'white',
}
