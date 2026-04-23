'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'
import { useSession } from '@/components/session/SessionProvider'

type PlayerStats = {
  points: number
  matches_played: number
  matches_won: number
  category: number | null
  gender: string | null
}

type RecentInscripcion = {
  id: string
  tournament_name: string
  partner_name: string
  status: string
  created_at: string
}

type AvailTournament = {
  id: string
  name: string
  status: string
  start_date: string | null
  registration_deadline: string | null
  price_per_player: number | null
  category: number | null
}

const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
const STATUS_COLOR: Record<string, string> = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444' }
const STATUS_LABEL: Record<string, string> = { PENDING:'Pendiente', APPROVED:'Aprobado', REJECTED:'Rechazado' }

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

export default function PlayerHomePage() {
  const { user, profile, activeClub } = useSession()
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [inscripciones, setInscripciones] = useState<RecentInscripcion[]>([])
  const [torneos, setTorneos] = useState<AvailTournament[]>([])
  const [loading, setLoading] = useState(true)
  const [rankPos, setRankPos] = useState<number | null>(null)

  const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Jugador'

  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    load()
  }, [user?.id, activeClub?.id])

  async function load() {
    setLoading(true)
    const results = await Promise.all([
      // Stats del jugador en el club activo
      activeClub?.id
        ? supabase.from('club_players').select('points, matches_played, matches_won, category, gender').eq('user_id', user!.id).eq('club_id', activeClub.id).maybeSingle()
        : Promise.resolve({ data: null }),

      // Últimas inscripciones del jugador
      supabase.from('tournament_teams').select(`
        id, status, created_at,
        player1_id, player2_id,
        player1_id,
        player2_id,
        tournament:tournament_id ( name )
      `)
      .or(`player1_id.eq.${user!.id},player2_id.eq.${user!.id}`)
      .order('created_at', { ascending: false })
      .limit(4),

      // Torneos disponibles del club
      activeClub?.id
        ? supabase.from('tournaments').select('id, name, status, starts_on, start_date, registration_deadline, signup_deadline, price_per_player, category').eq('club_id', activeClub.id).in('status', ['OPEN', 'DRAFT']).order('created_at', { ascending: false }).limit(4)
        : Promise.resolve({ data: [] }),
    ])

    const [playerRes, teamsRes, torneosRes] = results

    if (playerRes.data) {
      setStats({ points: playerRes.data.points ?? 0, matches_played: playerRes.data.matches_played ?? 0, matches_won: playerRes.data.matches_won ?? 0, category: playerRes.data.category ?? null, gender: playerRes.data.gender ?? null })

      // Calcular posición en ranking del club
      if (activeClub?.id) {
        const { data: allPlayers } = await supabase.from('club_players').select('user_id, points').eq('club_id', activeClub.id).order('points', { ascending: false })
        const pos = (allPlayers ?? []).findIndex((p: any) => p.user_id === user!.id)
        setRankPos(pos >= 0 ? pos + 1 : null)
      }
    }

    const teamData = (teamsRes.data ?? []) as any[]
    const partnerIds = teamData.map((r: any) => r.player1_id === user!.id ? r.player2_id : r.player1_id).filter(Boolean)
    const profileMap = await resolveProfiles(partnerIds)
    const insc: RecentInscripcion[] = teamData.map(r => {
      const partnerId = r.player1_id === user!.id ? r.player2_id : r.player1_id
      const t = Array.isArray(r.tournament) ? r.tournament[0] : r.tournament
      return {
        id: r.id,
        tournament_name: t?.name ?? '—',
        partner_name: playerName(profileMap[partnerId]) || 'Compañero',
        status: r.status ?? 'PENDING',
        created_at: r.created_at,
      }
    })
    setInscripciones(insc)

    const ts: AvailTournament[] = ((torneosRes.data ?? []) as any[]).map(t => ({
      id: t.id, name: t.name, status: t.status,
      start_date: t.starts_on ?? t.start_date ?? null,
      registration_deadline: t.registration_deadline ?? t.signup_deadline ?? null,
      price_per_player: t.price_per_player ?? null,
      category: t.category ?? null,
    }))
    setTorneos(ts)

    setLoading(false)
  }

  const winRate = stats && stats.matches_played > 0 ? `${((stats.matches_won / stats.matches_played) * 100).toFixed(0)}%` : '—'

  return (
    <div className="px-wrap">
      {/* Saludo */}
      <div className="px-card" style={{ marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900 }}>¡Hola, {displayName.split(' ')[0]}! 👋</div>
          <div className="px-muted" style={{ marginTop:4 }}>{activeClub?.name ?? 'Seleccioná un club para ver tu actividad'}</div>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <Link href="/clubs" className="px-btn">Ver clubes</Link>
          <Link href="/torneos" className="px-btn px-btn--ghost">Explorar torneos</Link>
        </div>
      </div>

      {/* Stats personales */}
      {stats ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
          {[
            { label:'Puntos', value: stats.points.toLocaleString('es-AR'), color:'var(--navy)', emoji:'⭐' },
            { label:'Posición ranking', value: rankPos ? `#${rankPos}` : '—', color:'var(--navy)', emoji:'🏆' },
            { label:'Partidos', value: stats.matches_played, color:'var(--text)', emoji:'🎾' },
            { label:'% Victorias', value: winRate, color:'#10b981', emoji:'✅' },
          ].map(s => (
            <div key={s.label} className="px-card px-card--flat" style={{ padding:'14px 16px' }}>
              <div style={{ fontSize:20 }}>{s.emoji}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.color, marginTop:6, lineHeight:1 }}>{String(s.value)}</div>
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : !loading && activeClub && (
        <div className="px-card px-card--flat" style={{ marginBottom:16, padding:'16px 18px', display:'flex', gap:14, alignItems:'center' }}>
          <div style={{ fontSize:24 }}>ℹ️</div>
          <div>
            <div style={{ fontWeight:800 }}>No estás registrado como jugador en {activeClub.name}</div>
            <div className="px-help" style={{ marginTop:4 }}>Contactá al administrador del club para que te den de alta.</div>
          </div>
        </div>
      )}

      <div className="club-grid">
        {/* Mis inscripciones */}
        <div className="club-card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontWeight:900, fontSize:15 }}>Mis inscripciones</div>
            <Link href="/actividad" className="px-link" style={{ fontSize:13 }}>Ver todas →</Link>
          </div>
          {loading ? (
            <div className="px-help">Cargando…</div>
          ) : inscripciones.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:28 }}>🏓</div>
              <div className="px-help" style={{ marginTop:8 }}>Aún no te inscribiste en ningún torneo.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {inscripciones.map(ins => (
                <div key={ins.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:'rgba(255,255,255,.6)', border:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13 }}>{ins.tournament_name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>con {ins.partner_name}</div>
                  </div>
                  <span style={{ background:(STATUS_COLOR[ins.status]??'#9ca3af')+'22', color:STATUS_COLOR[ins.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[ins.status]??'#9ca3af')}44`, padding:'3px 10px', borderRadius:999, fontWeight:900, fontSize:11, whiteSpace:'nowrap' }}>
                    {STATUS_LABEL[ins.status] ?? ins.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Torneos disponibles */}
        <div className="club-card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontWeight:900, fontSize:15 }}>Torneos disponibles</div>
            <Link href="/torneos" className="px-link" style={{ fontSize:13 }}>Ver todos →</Link>
          </div>
          {loading ? (
            <div className="px-help">Cargando…</div>
          ) : torneos.length === 0 ? (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ fontSize:28 }}>🏆</div>
              <div className="px-help" style={{ marginTop:8 }}>No hay torneos abiertos en este momento.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {torneos.map(t => (
                <Link key={t.id} href={`/torneos/${t.id}/inscripcion`} style={{ display:'block', padding:'10px 12px', borderRadius:10, background:'rgba(255,255,255,.6)', border:'1px solid var(--border)', textDecoration:'none', color:'inherit' }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, display:'flex', gap:8 }}>
                    {t.category && <span>{CAT_LABELS[t.category] ?? `Cat ${t.category}`}</span>}
                    <span>Inicio: {fmtDate(t.start_date)}</span>
                    {t.price_per_player != null && <span>${t.price_per_player}/jug.</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
