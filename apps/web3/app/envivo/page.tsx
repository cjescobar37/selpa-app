'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

type TWithClub = TournamentView & { club_name: string | null; team_count: number }

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'; const dp = d.includes('T') ? d.split('T')[0] : d; const [y,m,dd] = dp.split('-'); return `${dd}/${m}/${y}`
}

export default function EnVivoPage() {
  const { role } = useSession()
  const [activos, setActivos] = useState<TWithClub[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    load()
    const interval = setInterval(() => { load(); setLastUpdate(new Date()) }, 30000)
    return () => clearInterval(interval)
  }, [])

  async function load() {
    setLoading(true)
    const { data: tourData } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_SELECT + ', club:club_id(name)')
      .in('status', ['IN_PROGRESS', 'OPEN'])
      .order('created_at', { ascending: false })

    const ids = ((tourData ?? []) as any[]).map(r => r.id)
    let teamCounts: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: teamsData } = await supabase.from('tournament_teams').select('tournament_id').in('tournament_id', ids).eq('status', 'APPROVED')
      for (const t of (teamsData ?? []) as any[]) {
        teamCounts[t.tournament_id] = (teamCounts[t.tournament_id] ?? 0) + 1
      }
    }

    const tvs: TWithClub[] = ((tourData ?? []) as any[]).map(r => {
      const tv = toTournamentView(r)
      if (!tv) return null
      const c = Array.isArray(r.club) ? r.club[0] : r.club
      return { ...tv, club_name: c?.name ?? null, team_count: teamCounts[r.id] ?? 0 }
    }).filter(Boolean) as TWithClub[]

    setActivos(tvs)
    setLoading(false)
  }

  const enCurso = activos.filter(t => t.status === 'IN_PROGRESS')
  const proximos = activos.filter(t => t.status === 'OPEN')

  return (
    <div style={{ maxWidth:1120, margin:'0 auto', padding:'24px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <h1 className="px-h1">En vivo</h1>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:999, background:'rgba(239,68,68,.12)', border:'1px solid rgba(239,68,68,.3)' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444', animation:'pulse 1.5s infinite' }} />
              <span style={{ fontSize:11, fontWeight:900, color:'#ef4444' }}>LIVE</span>
            </div>
          </div>
          <p className="px-muted" style={{ marginTop:6 }}>Torneos activos y próximos · Actualización automática cada 30s</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Última actualización: {lastUpdate.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
          <button onClick={() => { load(); setLastUpdate(new Date()) }} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻</button>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {role === 'guest' && (
        <div className="px-card px-card--flat" style={{ marginBottom:20, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap', background:'rgba(46,84,147,.06)', border:'1px solid rgba(46,84,147,.2)' }}>
          <div>
            <div style={{ fontWeight:800 }}>Iniciá sesión para recibir notificaciones en tiempo real</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>Los jugadores registrados pueden seguir sus partidos y ver resultados detallados.</div>
          </div>
          <Link href="/login" className="px-btn" style={{ height:36, padding:'0 16px', fontSize:13 }}>Ingresar</Link>
        </div>
      )}

      {loading ? (
        <div className="px-help" style={{ textAlign:'center', padding:48 }}>Cargando torneos activos…</div>
      ) : activos.length === 0 ? (
        <div className="px-card" style={{ textAlign:'center', padding:72 }}>
          <div style={{ fontSize:56 }}>🎾</div>
          <div style={{ fontWeight:900, fontSize:22, marginTop:16 }}>No hay torneos en este momento</div>
          <div className="px-help" style={{ marginTop:10 }}>Los torneos activos y próximos aparecerán acá automáticamente.</div>
          <Link href="/torneos" className="px-btn" style={{ marginTop:20, display:'inline-flex' }}>Ver todos los torneos</Link>
        </div>
      ) : (
        <>
          {enCurso.length > 0 && (
            <div style={{ marginBottom:28 }}>
              <div className="px-sepRow" style={{ marginBottom:14 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:'#3b82f6', display:'inline-block' }} />
                  Torneos en curso ({enCurso.length})
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
                {enCurso.map(t => <EnVivoCard key={t.id} t={t} />)}
              </div>
            </div>
          )}
          {proximos.length > 0 && (
            <div>
              <div className="px-sepRow" style={{ marginBottom:14 }}>📋 Con inscripciones abiertas ({proximos.length})</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
                {proximos.map(t => <EnVivoCard key={t.id} t={t} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EnVivoCard({ t }: { t: TWithClub }) {
  function fmtDate(d: string | null | undefined) {
    if (!d) return '—'; const dp = d.includes('T') ? d.split('T')[0] : d; const [y,m,dd] = dp.split('-'); return `${dd}/${m}/${y}`
  }
  const isLive = t.status === 'IN_PROGRESS'
  return (
    <div className="px-card" style={{ padding:0, overflow:'hidden', borderTop:`4px solid ${isLive?'#3b82f6':'#10b981'}` }}>
      <div style={{ padding:'16px 18px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isLive ? (
              <span style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.3)', padding:'3px 10px', borderRadius:999, fontWeight:900, fontSize:11, color:'#3b82f6' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#3b82f6', display:'inline-block', animation:'pulse 1.5s infinite' }} />
                EN CURSO
              </span>
            ) : (
              <span style={{ background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.3)', padding:'3px 10px', borderRadius:999, fontWeight:900, fontSize:11, color:'#10b981' }}>
                INSCRIPCIONES ABIERTAS
              </span>
            )}
          </div>
          {t.club_name && <span style={{ fontSize:11, color:'var(--muted)', fontWeight:700 }}>📍 {t.club_name}</span>}
        </div>
        <div style={{ fontWeight:900, fontSize:17 }}>{t.name}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
          {[
            { k:'Inicio', v: fmtDate(t.startDate) },
            { k:'Fin', v: fmtDate(t.endDate) },
            { k:'Equipos inscriptos', v: t.team_count },
            { k:'Puntos en juego', v: `${t.pointsTotal??0} pts` },
          ].map(({ k, v }) => (
            <div key={k}>
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{k}</div>
              <div style={{ fontWeight:700, fontSize:14, marginTop:2 }}>{String(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ flex:1, height:34, fontSize:13 }}>Ver detalles</Link>
          {t.status === 'OPEN' && <Link href={`/torneos/${t.id}/inscripcion`} className="px-btn px-btn--magenta" style={{ flex:1, height:34, fontSize:13 }}>Inscribirse</Link>}
        </div>
      </div>
    </div>
  )
}
