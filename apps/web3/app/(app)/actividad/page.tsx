'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'
import { useSession } from '@/components/session/SessionProvider'

type Inscripcion = {
  id: string
  tournament_name: string
  partner_name: string
  status: string
  points_awarded: number | null
  created_at: string
  start_date: string | null
  category: number | null
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = { PENDING:'Pendiente', APPROVED:'Aprobado', REJECTED:'Rechazado', WAITLIST:'Lista espera' }
const STATUS_COLOR: Record<string, string> = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444', WAITLIST:'#8b5cf6' }
const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}

export default function ActividadPage() {
  const { user, activeClub } = useSession()
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
  const [loading, setLoading] = useState(true)
  const [playerData, setPlayerData] = useState<{ points: number; matches_played: number; matches_won: number; category: number | null } | null>(null)

  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    load()
  }, [user?.id, activeClub?.id])

  async function load() {
    setLoading(true)

    const [teamRes, playerRes] = await Promise.all([
      supabase.from('tournament_teams').select(`
        id, status, created_at,
        player1_id, player2_id,
        player1_id,
        player2_id,
        tournament:tournament_id ( name, starts_on, start_date, category, price_per_player )
      `)
      .or(`player1_id.eq.${user!.id},player2_id.eq.${user!.id}`)
      .order('created_at', { ascending: false }),

      activeClub?.id ? supabase.from('club_players').select('points, matches_played, matches_won, category').eq('user_id', user!.id).eq('club_id', activeClub.id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const teamData = (teamRes.data ?? []) as any[]
    const partnerIds = teamData.map((r: any) => r.player1_id === user!.id ? r.player2_id : r.player1_id).filter(Boolean)
    const profileMap = await resolveProfiles(partnerIds)
    const insc: Inscripcion[] = teamData.map(r => {
      const partnerId = r.player1_id === user!.id ? r.player2_id : r.player1_id
      const t = Array.isArray(r.tournament) ? r.tournament[0] : r.tournament
      return {
        id: r.id,
        tournament_name: t?.name ?? '—',
        partner_name: playerName(profileMap[partnerId]) || 'Compañero',
        status: r.status ?? 'PENDING',
        points_awarded: null,
        created_at: r.created_at,
        start_date: t?.starts_on ?? t?.start_date ?? null,
        category: t?.category ?? null,
      }
    })
    setInscripciones(insc)

    if (playerRes.data) {
      setPlayerData({ points: playerRes.data.points ?? 0, matches_played: playerRes.data.matches_played ?? 0, matches_won: playerRes.data.matches_won ?? 0, category: playerRes.data.category ?? null })
    }

    setLoading(false)
  }

  const winRate = playerData && playerData.matches_played > 0
    ? `${((playerData.matches_won / playerData.matches_played) * 100).toFixed(0)}%`
    : '—'

  return (
    <div className="px-wrap">
      <h1 className="px-h1" style={{ marginBottom:4 }}>Mi actividad</h1>
      <p className="px-muted" style={{ marginBottom:20 }}>Historial de inscripciones y estadísticas personales</p>

      {/* Stats jugador */}
      {playerData && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Puntos', value: playerData.points.toLocaleString('es-AR'), color:'var(--navy)' },
            { label:'Categoría', value: CAT_LABELS[playerData.category ?? 0] ?? `Cat ${playerData.category}`, color:'var(--text)' },
            { label:'Partidos jugados', value: playerData.matches_played, color:'var(--text)' },
            { label:'% Victorias', value: winRate, color:'#10b981' },
          ].map(s => (
            <div key={s.label} className="px-card px-card--flat">
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize:24, fontWeight:900, color:s.color, marginTop:4 }}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista inscripciones */}
      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:900, fontSize:16 }}>Mis inscripciones</div>
          <div className="px-pill">{inscripciones.length} torneos</div>
        </div>

        {loading ? (
          <div className="px-help" style={{ padding:'20px 18px' }}>Cargando actividad…</div>
        ) : inscripciones.length === 0 ? (
          <div style={{ textAlign:'center', padding:48 }}>
            <div style={{ fontSize:40 }}>🏓</div>
            <div style={{ fontWeight:900, fontSize:16, marginTop:12 }}>Aún no te inscribiste en ningún torneo</div>
            <div className="px-help" style={{ marginTop:6 }}>Explorá los torneos disponibles en tu club.</div>
            <Link href="/torneos" className="px-btn" style={{ marginTop:16, display:'inline-flex' }}>Ver torneos</Link>
          </div>
        ) : (
          <div style={{ display:'grid', gap:0 }}>
            {inscripciones.map((ins, i) => (
              <div key={ins.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:14, alignItems:'center', padding:'14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:15 }}>{ins.tournament_name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:3, display:'flex', gap:10, flexWrap:'wrap' }}>
                    <span>🤝 Con {ins.partner_name}</span>
                    {ins.category && <span>🏷️ {CAT_LABELS[ins.category] ?? `Cat ${ins.category}`}</span>}
                    <span>📅 {fmtDate(ins.start_date || ins.created_at)}</span>
                  </div>
                </div>
                <span style={{ background:(STATUS_COLOR[ins.status]??'#9ca3af')+'22', color:STATUS_COLOR[ins.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[ins.status]??'#9ca3af')}44`, padding:'5px 12px', borderRadius:999, fontWeight:900, fontSize:12, whiteSpace:'nowrap' }}>
                  {STATUS_LABEL[ins.status] ?? ins.status}
                </span>
                {ins.points_awarded != null && (
                  <div style={{ fontWeight:900, color:'var(--navy)', fontSize:14 }}>+{ins.points_awarded} pts</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Links rápidos */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:20 }}>
        <Link href="/torneos" className="px-card px-card--flat" style={{ padding:'16px 18px', textDecoration:'none', display:'block' }}>
          <div style={{ fontSize:24 }}>🏆</div>
          <div style={{ fontWeight:900, marginTop:8 }}>Ver torneos</div>
          <div className="px-help" style={{ marginTop:4 }}>Explorá los próximos torneos de tu club</div>
        </Link>
        <Link href="/club/ranking" className="px-card px-card--flat" style={{ padding:'16px 18px', textDecoration:'none', display:'block' }}>
          <div style={{ fontSize:24 }}>📊</div>
          <div style={{ fontWeight:900, marginTop:8 }}>Ranking del club</div>
          <div className="px-help" style={{ marginTop:4 }}>Tu posición y la de tus compañeros</div>
        </Link>
      </div>
    </div>
  )
}
