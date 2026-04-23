'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

type TournamentStats = TournamentView & { teamCount: number; approvedCount: number; revenue: number }

function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }

export default function ClubReportesPage() {
  const { activeClub } = useSession()
  const [stats, setStats] = useState<TournamentStats[]>([])
  const [playerCats, setPlayerCats] = useState<{ cat: number; count: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)
    const [tourRes, teamsRes, playersRes] = await Promise.all([
      supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('club_id', activeClub!.id),
      supabase.from('tournament_teams').select('tournament_id, status, tournament:tournament_id(price_per_player)').eq('club_id', activeClub!.id),
      supabase.from('club_players').select('category').eq('club_id', activeClub!.id),
    ])

    const tvs = ((tourRes.data ?? []).map(toTournamentView).filter(Boolean)) as TournamentView[]

    const teamsByTournament: Record<string, { total: number; approved: number; revenue: number }> = {}
    for (const team of (teamsRes.data ?? []) as any[]) {
      const tid = team.tournament_id
      if (!teamsByTournament[tid]) teamsByTournament[tid] = { total:0, approved:0, revenue:0 }
      teamsByTournament[tid].total++
      if (team.status === 'APPROVED') {
        teamsByTournament[tid].approved++
        const t = Array.isArray(team.tournament) ? team.tournament[0] : team.tournament
        teamsByTournament[tid].revenue += (t?.price_per_player ?? 0) * 2
      }
    }

    const enriched: TournamentStats[] = tvs.map(t => ({
      ...t,
      teamCount: teamsByTournament[t.id]?.total ?? 0,
      approvedCount: teamsByTournament[t.id]?.approved ?? 0,
      revenue: teamsByTournament[t.id]?.revenue ?? 0,
    }))
    setStats(enriched)

    const catMap: Record<number, number> = {}
    for (const p of (playersRes.data ?? []) as any[]) {
      const c = p.category ?? 0
      catMap[c] = (catMap[c] ?? 0) + 1
    }
    const cats = Object.entries(catMap).map(([cat,count]) => ({ cat: Number(cat), count })).sort((a,b) => a.cat - b.cat)
    setPlayerCats(cats)
    setLoading(false)
  }

  const totalRevenue = stats.reduce((a,s) => a+s.revenue, 0)
  const totalTeams = stats.reduce((a,s) => a+s.teamCount, 0)
  const totalPlayers = playerCats.reduce((a,c) => a+c.count, 0)

  const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
  const maxCat = Math.max(1, ...playerCats.map(c => c.count))

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Reportes</h1>
            <p className="club-sub">Participación, ingresos por torneo y distribución de jugadores</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>

        {loading ? (
          <div className="px-help" style={{ marginTop:20 }}>Generando reporte…</div>
        ) : (
          <>
            {/* KPIs generales */}
            <div className="club-kpis" style={{ marginTop:16 }}>
              {[
                { label:'Torneos totales', value: stats.length },
                { label:'Equipos inscriptos', value: totalTeams },
                { label:'Jugadores en club', value: totalPlayers },
                { label:'Ingresos confirmados', value: fmtARS(totalRevenue) },
              ].map(s => (
                <div key={s.label} className="club-kpi">
                  <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
                  <div style={{ fontSize: typeof s.value === 'string' ? 18 : 28, fontWeight:900, color:'var(--navy)', marginTop:4, lineHeight:1.1 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Distribución por categoría */}
            {playerCats.length > 0 && (
              <div className="club-card" style={{ marginTop:14 }}>
                <div style={{ fontWeight:900, marginBottom:14 }}>Jugadores por categoría</div>
                <div style={{ display:'grid', gap:8 }}>
                  {playerCats.map(c => (
                    <div key={c.cat} style={{ display:'grid', gridTemplateColumns:'60px 1fr 40px', alignItems:'center', gap:10 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{CAT_LABELS[c.cat] ?? `Cat ${c.cat}`}</div>
                      <div style={{ background:'rgba(23,37,63,.08)', borderRadius:999, height:10, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:999, background:'var(--navy)', width:`${(c.count/maxCat)*100}%`, transition:'width .4s' }} />
                      </div>
                      <div style={{ fontWeight:900, fontSize:13, textAlign:'right', color:'var(--navy)' }}>{c.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabla por torneo */}
            <div style={{ marginTop:14 }}>
              <div className="px-sepRow" style={{ marginBottom:8 }}>Detalle por torneo</div>
              {stats.length === 0 ? (
                <div className="px-card px-card--flat" style={{ textAlign:'center', padding:32 }}>
                  <div style={{ fontSize:32 }}>📊</div>
                  <div className="px-help" style={{ marginTop:8 }}>No hay torneos para reportar.</div>
                </div>
              ) : (
                <div style={{ display:'grid', gap:6 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 110px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)' }}>
                    <div>Torneo</div><div style={{ textAlign:'center' }}>Estado</div><div style={{ textAlign:'center' }}>Equipos</div><div style={{ textAlign:'center' }}>Aprob.</div><div style={{ textAlign:'right' }}>Ingresos</div>
                  </div>
                  {stats.map(s => (
                    <div key={s.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 110px', gap:8, alignItems:'center', padding:'12px 14px', borderLeft:`3px solid ${STATUS_COLOR[s.status]??'#9ca3af'}` }}>
                      <div>
                        <div style={{ fontWeight:700 }}>{s.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(s.startDate)} · Cat {s.category ?? '—'}</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <span style={{ fontSize:11, fontWeight:900, padding:'2px 8px', borderRadius:999, background:(STATUS_COLOR[s.status]??'#9ca3af')+'22', color:STATUS_COLOR[s.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[s.status]??'#9ca3af')}44` }}>{s.status}</span>
                      </div>
                      <div style={{ textAlign:'center', fontWeight:700 }}>{s.teamCount}</div>
                      <div style={{ textAlign:'center', fontWeight:700, color:'#10b981' }}>{s.approvedCount}</div>
                      <div style={{ textAlign:'right', fontWeight:900, color:'var(--navy)' }}>{fmtARS(s.revenue)}</div>
                    </div>
                  ))}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 110px', gap:8, padding:'12px 14px', borderRadius:12, background:'rgba(46,84,147,.06)', border:'1px solid rgba(46,84,147,.12)', fontWeight:900 }}>
                    <div>Total</div><div /><div style={{ textAlign:'center', color:'var(--navy)' }}>{totalTeams}</div><div style={{ textAlign:'center', color:'#10b981' }}>{stats.reduce((a,s)=>a+s.approvedCount,0)}</div><div style={{ textAlign:'right', color:'var(--navy)', fontSize:15 }}>{fmtARS(totalRevenue)}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
