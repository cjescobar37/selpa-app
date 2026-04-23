'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

type TWithClub = TournamentView & { club_name: string | null }

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'; const dp = d.includes('T') ? d.split('T')[0] : d; const [y,m,dd] = dp.split('-'); return `${dd}/${m}/${y}`
}

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }

export default function TorneosCalendarioPage() {
  const [torneos, setTorneos] = useState<TWithClub[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tournaments').select(TOURNAMENT_SELECT + ', club:club_id(name)').order('created_at', { ascending: false })
    const tvs: TWithClub[] = ((data ?? []) as any[]).map(r => {
      const tv = toTournamentView(r)
      if (!tv) return null
      const c = Array.isArray(r.club) ? r.club[0] : r.club
      return { ...tv, club_name: c?.name ?? null }
    }).filter(Boolean) as TWithClub[]
    setTorneos(tvs)
    setLoading(false)
  }

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1) }

  const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`
  const torneosDelMes = torneos.filter(t => {
    const s = t.startDate?.split('T')[0] ?? ''
    const e = t.endDate?.split('T')[0] ?? ''
    return s.startsWith(monthStr) || e.startsWith(monthStr) || (s < monthStr+'-01' && e > monthStr+'-31')
  }).sort((a,b) => (a.startDate??'').localeCompare(b.startDate??''))

  // Próximos 3 meses: torneos abiertos
  const proximos = torneos.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').sort((a,b) => (a.startDate??'').localeCompare(b.startDate??'')).slice(0,6)

  return (
    <div style={{ maxWidth:1120, margin:'0 auto', padding:'24px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="px-h1">Calendario de torneos</h1>
          <p className="px-muted" style={{ marginTop:6 }}>Agenda pública de todos los torneos del circuito</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Link href="/torneos" className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>← Torneos</Link>
          <Link href="/torneos/reglamento" className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>📄 Reglamento</Link>
        </div>
      </div>

      {/* Próximos a inscribirse */}
      {proximos.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div className="px-sepRow" style={{ marginBottom:12 }}>🔥 Próximos — inscripciones abiertas</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
            {proximos.map(t => (
              <Link key={t.id} href={`/torneos/${t.id}`} style={{ textDecoration:'none', color:'inherit' }}>
                <div className="px-card px-card--flat" style={{ padding:'14px 16px', borderLeft:`3px solid ${STATUS_COLOR[t.status]??'#9ca3af'}`, height:'100%' }}>
                  <div style={{ fontWeight:900, fontSize:15 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>{t.club_name??'—'}</div>
                  <div style={{ fontSize:12, marginTop:8, fontWeight:700 }}>📅 {fmtDate(t.startDate)} → {fmtDate(t.endDate)}</div>
                  <div style={{ fontSize:12, color:'#f59e0b', marginTop:2 }}>⏰ Inscr. hasta: {fmtDate(t.registrationDeadline)}</div>
                  <div style={{ marginTop:10, display:'flex', gap:6 }}>
                    <span style={{ background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'2px 8px', borderRadius:999, fontWeight:900, fontSize:10 }}>{t.status}</span>
                    <span className="px-pill" style={{ fontSize:10, padding:'2px 8px' }}>${t.pricePerPlayer??0}/jug.</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Navegador por mes */}
      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={prevMonth} className="px-btn px-btn--ghost" style={{ height:34, padding:'0 12px', fontSize:16 }}>‹</button>
          <div style={{ fontWeight:900, fontSize:18 }}>{MONTHS_ES[viewMonth]} {viewYear}</div>
          <button onClick={nextMonth} className="px-btn px-btn--ghost" style={{ height:34, padding:'0 12px', fontSize:16 }}>›</button>
        </div>

        {loading ? (
          <div className="px-help" style={{ padding:'24px 18px' }}>Cargando torneos…</div>
        ) : torneosDelMes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 18px' }}>
            <div style={{ fontSize:32 }}>📅</div>
            <div className="px-help" style={{ marginTop:10 }}>No hay torneos programados para {MONTHS_ES[viewMonth]} {viewYear}.</div>
          </div>
        ) : (
          <div>
            {torneosDelMes.map((t, i) => (
              <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:14, alignItems:'center', padding:'14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', borderLeft:`4px solid ${STATUS_COLOR[t.status]??'#9ca3af'}` }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:15 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:3, display:'flex', gap:12, flexWrap:'wrap' }}>
                    <span>📍 {t.club_name??'—'}</span>
                    <span>📅 {fmtDate(t.startDate)} → {fmtDate(t.endDate)}</span>
                    <span>⏰ Cierre inscr.: {fmtDate(t.registrationDeadline)}</span>
                    <span>💰 ${t.pricePerPlayer??0}/jug.</span>
                    <span>⭐ {t.pointsTotal??0} pts</span>
                  </div>
                </div>
                <span style={{ background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'4px 12px', borderRadius:999, fontWeight:900, fontSize:11, whiteSpace:'nowrap' }}>{t.status}</span>
                <div style={{ display:'flex', gap:8 }}>
                  <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ height:32, padding:'0 12px', fontSize:12 }}>Ver</Link>
                  {t.status === 'OPEN' && <Link href={`/torneos/${t.id}/inscripcion`} className="px-btn px-btn--magenta" style={{ height:32, padding:'0 12px', fontSize:12 }}>Inscribirse</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
