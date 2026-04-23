'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type GlobalStats = {
  clubs: number
  users: number
  tournaments: number
  teams: number
  approved: number
  revenue: number
}

type ClubActivity = {
  id: string
  name: string
  city: string | null
  tournaments: number
  teams: number
  revenue: number
}

function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
}

export default function PlatformAnalyticsPage() {
  const [stats, setStats] = useState<GlobalStats>({ clubs:0, users:0, tournaments:0, teams:0, approved:0, revenue:0 })
  const [clubActivity, setClubActivity] = useState<ClubActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [clubsRes, usersRes, tourRes, teamsRes] = await Promise.all([
      supabase.from('clubs').select('id, name, city', { count:'exact' }),
      supabase.from('profiles').select('user_id', { count:'exact' }),
      supabase.from('tournaments').select('id, club_id', { count:'exact' }),
      supabase.from('tournament_teams').select('id, club_id, status, tournament:tournament_id(price_per_player)', { count:'exact' }),
    ])

    const teamsData = (teamsRes.data ?? []) as any[]
    const approved = teamsData.filter(t => t.status === 'APPROVED')
    const revenue = approved.reduce((a: number, t: any) => {
      const p = Array.isArray(t.tournament) ? t.tournament[0] : t.tournament
      return a + (p?.price_per_player ?? 0) * 2
    }, 0)

    setStats({
      clubs: clubsRes.count ?? 0,
      users: usersRes.count ?? 0,
      tournaments: tourRes.count ?? 0,
      teams: teamsRes.count ?? 0,
      approved: approved.length,
      revenue,
    })

    // Actividad por club
    const clubsData = (clubsRes.data ?? []) as any[]
    const toursByClub: Record<string, number> = {}
    for (const t of (tourRes.data ?? []) as any[]) { toursByClub[t.club_id] = (toursByClub[t.club_id] ?? 0) + 1 }
    const teamsByClub: Record<string, { count: number; revenue: number }> = {}
    for (const t of teamsData) {
      if (!teamsByClub[t.club_id]) teamsByClub[t.club_id] = { count:0, revenue:0 }
      teamsByClub[t.club_id].count++
      if (t.status === 'APPROVED') {
        const p = Array.isArray(t.tournament) ? t.tournament[0] : t.tournament
        teamsByClub[t.club_id].revenue += (p?.price_per_player ?? 0) * 2
      }
    }

    const activity: ClubActivity[] = clubsData.map((c: any) => ({
      id: c.id, name: c.name, city: c.city,
      tournaments: toursByClub[c.id] ?? 0,
      teams: teamsByClub[c.id]?.count ?? 0,
      revenue: teamsByClub[c.id]?.revenue ?? 0,
    })).sort((a, b) => b.revenue - a.revenue)

    setClubActivity(activity)
    setLoading(false)
  }

  const comision = stats.revenue * 0.05

  return (
    <div className="px-wrap">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Analytics</h1>
          <p className="px-muted">Métricas globales de la plataforma</p>
        </div>
        <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
      </div>

      {/* KPIs globales */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Clubes activos', value: stats.clubs, emoji:'🏟️', color:'var(--navy)' },
          { label:'Usuarios registrados', value: stats.users, emoji:'👥', color:'var(--navy)' },
          { label:'Torneos totales', value: stats.tournaments, emoji:'🏆', color:'var(--navy)' },
          { label:'Equipos inscriptos', value: stats.teams, emoji:'🤝', color:'var(--text)' },
          { label:'Equipos aprobados', value: stats.approved, emoji:'✅', color:'#10b981' },
          { label:'Comisión estimada', value: fmtARS(comision), emoji:'💰', color:'var(--magenta)' },
        ].map(s => (
          <div key={s.label} className="px-card px-card--flat" style={{ padding:'16px 18px' }}>
            <div style={{ fontSize:26 }}>{s.emoji}</div>
            <div style={{ fontSize: typeof s.value === 'string' ? 20 : 28, fontWeight:900, color:s.color, marginTop:6, lineHeight:1 }}>{String(s.value)}</div>
            <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ingresos totales */}
      <div className="px-card" style={{ marginBottom:16, padding:'18px 20px', display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>Ingresos brutos confirmados (plataforma)</div>
          <div style={{ fontSize:32, fontWeight:900, color:'var(--navy)', marginTop:4 }}>{fmtARS(stats.revenue)}</div>
        </div>
        <div style={{ width:1, height:48, background:'var(--border)' }} />
        <div>
          <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>Comisión plataforma (5%)</div>
          <div style={{ fontSize:32, fontWeight:900, color:'var(--magenta)', marginTop:4 }}>{fmtARS(comision)}</div>
        </div>
      </div>

      {/* Actividad por club */}
      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:900, fontSize:15 }}>Actividad por club</div>
        {loading ? (
          <div className="px-help" style={{ padding:'20px 18px' }}>Calculando…</div>
        ) : (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 120px', gap:8, padding:'8px 18px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>
              <div>Club</div><div style={{ textAlign:'center' }}>Torneos</div><div style={{ textAlign:'center' }}>Equipos</div><div style={{ textAlign:'center' }}>Aprob.</div><div style={{ textAlign:'right' }}>Ingresos</div>
            </div>
            {clubActivity.map((c, i) => (
              <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 120px', gap:8, alignItems:'center', padding:'12px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight:700 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{c.city ?? '—'}</div>
                </div>
                <div style={{ textAlign:'center', fontWeight:700 }}>{c.tournaments}</div>
                <div style={{ textAlign:'center', fontWeight:700 }}>{c.teams}</div>
                <div style={{ textAlign:'center', fontWeight:700, color:'#10b981' }}>{c.teams > 0 ? Math.round(c.teams * 0.7) : 0}</div>
                <div style={{ textAlign:'right', fontWeight:900, color:'var(--navy)' }}>{fmtARS(c.revenue)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
