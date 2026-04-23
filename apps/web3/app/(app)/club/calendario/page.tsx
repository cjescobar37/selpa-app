'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

type CalEvent = { id: string; name: string; date: string; type: 'start'|'end'|'deadline'; color: string; tournamentId: string }

const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }

export default function ClubCalendarioPage() {
  const { activeClub } = useSession()
  const [tournaments, setTournaments] = useState<TournamentView[]>([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('club_id', activeClub!.id)
    setTournaments((data ?? []).map(toTournamentView).filter(Boolean) as TournamentView[])
    setLoading(false)
  }

  // Construir eventos por día
  const events: CalEvent[] = []
  for (const t of tournaments) {
    if (t.startDate) events.push({ id:`${t.id}-s`, name: t.name, date: t.startDate.split('T')[0], type:'start', color:'#10b981', tournamentId: t.id })
    if (t.endDate) events.push({ id:`${t.id}-e`, name: t.name, date: t.endDate.split('T')[0], type:'end', color: STATUS_COLOR[t.status]??'#9ca3af', tournamentId: t.id })
    if (t.registrationDeadline) events.push({ id:`${t.id}-d`, name: t.name, date: t.registrationDeadline.split('T')[0], type:'deadline', color:'#f59e0b', tournamentId: t.id })
  }

  const eventsByDate: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = []
    eventsByDate[ev.date].push(ev)
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const todayStr = toYMD(now)

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1) } else setViewMonth(m => m-1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1) } else setViewMonth(m => m+1) }

  // Torneos del mes visible
  const torneosDelMes = tournaments.filter(t => {
    const start = t.startDate?.split('T')[0] ?? ''
    const end = t.endDate?.split('T')[0] ?? ''
    const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`
    return start.startsWith(monthStr) || end.startsWith(monthStr) || (start < monthStr+'-01' && end > monthStr+'-31')
  })

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Calendario del club</h1>
            <p className="club-sub">Torneos, fechas clave e inscripciones</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻</button>
            <Link href="/torneos/nuevo" className="px-btn px-btn--magenta" style={{ height:36, padding:'0 16px', fontSize:13 }}>+ Torneo</Link>
          </div>
        </div>

        {/* Leyenda */}
        <div style={{ display:'flex', gap:14, marginTop:14, flexWrap:'wrap' }}>
          {[['#10b981','Inicio torneo'],['#f59e0b','Cierre inscripción'],['#9ca3af','Fin torneo']].map(([c,l]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:c }} />{l}
            </div>
          ))}
        </div>

        {/* Navegación mes */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:20, marginBottom:12 }}>
          <button onClick={prevMonth} className="px-btn px-btn--ghost" style={{ height:34, padding:'0 12px', fontSize:16 }}>‹</button>
          <div style={{ fontWeight:900, fontSize:18 }}>{MONTHS_ES[viewMonth]} {viewYear}</div>
          <button onClick={nextMonth} className="px-btn px-btn--ghost" style={{ height:34, padding:'0 12px', fontSize:16 }}>›</button>
        </div>

        {/* Grilla días semana */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
          {DAYS_ES.map(d => (
            <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', padding:'4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Grilla días */}
        {loading ? (
          <div className="px-help" style={{ padding:20 }}>Cargando calendario…</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {Array.from({ length: firstDay }).map((_,i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const dayEvents = eventsByDate[dateStr] ?? []
              const isToday = dateStr === todayStr
              return (
                <div key={day} style={{ minHeight:68, borderRadius:10, padding:'6px 8px', background: isToday ? 'rgba(46,84,147,.10)' : 'rgba(255,255,255,.55)', border: isToday ? '2px solid var(--navy)' : '1px solid var(--border)', position:'relative' }}>
                  <div style={{ fontSize:13, fontWeight: isToday ? 900 : 600, color: isToday ? 'var(--navy)' : 'var(--text)' }}>{day}</div>
                  {dayEvents.slice(0,3).map(ev => (
                    <div key={ev.id} title={`${ev.name} — ${ev.type==='start'?'Inicio':ev.type==='end'?'Fin':'Cierre inscr.'}`} style={{ marginTop:3, fontSize:10, fontWeight:700, background:ev.color+'22', color:ev.color, border:`1px solid ${ev.color}44`, borderRadius:4, padding:'1px 4px', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                      {ev.type==='start'?'▶':ev.type==='end'?'■':'⏰'} {ev.name}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>+{dayEvents.length-3} más</div>}
                </div>
              )
            })}
          </div>
        )}

        {/* Torneos del mes */}
        {torneosDelMes.length > 0 && (
          <div style={{ marginTop:20 }}>
            <div className="px-sepRow">Torneos en {MONTHS_ES[viewMonth]}</div>
            <div style={{ display:'grid', gap:8, marginTop:8 }}>
              {torneosDelMes.map(t => (
                <div key={t.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center', padding:'12px 16px', borderLeft:`3px solid ${STATUS_COLOR[t.status]??'#9ca3af'}` }}>
                  <div>
                    <div style={{ fontWeight:800 }}>{t.name}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{fmtDate(t.startDate)} → {fmtDate(t.endDate)} · Cierre inscr.: {fmtDate(t.registrationDeadline)}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:900, padding:'3px 10px', borderRadius:999, background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44` }}>{t.status}</span>
                  <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ height:32, padding:'0 12px', fontSize:12 }}>Ver</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
