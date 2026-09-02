'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import TournamentPublicCard, { type TournamentPublicCardData } from '@/components/public/TournamentPublicCard'

function parseCalendarDate(value?: string | null) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function calendarKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
}

export default function CommunityTournamentCalendar({ tournaments }: { tournaments: TournamentPublicCardData[] }) {
  const [monthOverride, setMonthOverride] = useState<Date | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const events = useMemo(() => tournaments
    .map((tournament) => ({ tournament, date: parseCalendarDate(tournament.startDate) }))
    .filter((item): item is { tournament: TournamentPublicCardData; date: Date } => Boolean(item.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [tournaments])
  const eventsByDay = useMemo(() => {
    const next = new Map<string, TournamentPublicCardData[]>()
    for (const item of events) {
      const key = calendarKey(item.date)
      next.set(key, [...(next.get(key) ?? []), item.tournament])
    }
    return next
  }, [events])
  const month = useMemo(() => {
    if (monthOverride) return monthOverride
    const today = new Date()
    const nextEvent = events.find((item) => item.date >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) ?? events[0]
    return nextEvent ? new Date(nextEvent.date.getFullYear(), nextEvent.date.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1)
  }, [events, monthOverride])
  const dates = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return Array.from({ length: offset + count }, (_, index) => index < offset ? null : new Date(month.getFullYear(), month.getMonth(), index - offset + 1))
  }, [month])
  const selectedEvents = useMemo(() => {
    const firstInMonth = events.find((item) => item.date.getFullYear() === month.getFullYear() && item.date.getMonth() === month.getMonth())
    return eventsByDay.get(selectedDay ?? (firstInMonth ? calendarKey(firstInMonth.date) : '')) ?? []
  }, [events, eventsByDay, month, selectedDay])

  return (
    <section className="communityTournamentCalendar" aria-label="Calendario de torneos de SELPA">
      <header className="communityTournamentCalendar__sectionHead">
        <div><span>Calendario SELPA</span><h2>Nuestro calendario</h2></div>
        <div className="communityTournamentCalendar__controls"><button type="button" onClick={() => { setMonthOverride(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setSelectedDay(null) }} aria-label="Mes anterior"><ChevronLeft size={18} /></button><button type="button" onClick={() => { setMonthOverride(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setSelectedDay(null) }} aria-label="Mes siguiente"><ChevronRight size={18} /></button></div>
      </header>
      <div className="communityTournamentCalendar__content">
        <div className="communityTournamentCalendar__month"><strong>{formatMonth(month)}</strong><div className="communityTournamentCalendar__grid" role="grid" aria-label={formatMonth(month)}>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}{dates.map((date, index) => date ? (() => { const key = calendarKey(date); const dayEvents = eventsByDay.get(key) ?? []; const selected = selectedDay === key || (!selectedDay && selectedEvents.some((event) => calendarKey(parseCalendarDate(event.startDate)!) === key)); return <button key={key} type="button" className={`${dayEvents.length ? 'has-events' : ''}${selected ? ' is-selected' : ''}`} disabled={!dayEvents.length} onClick={() => dayEvents.length ? setSelectedDay(key) : undefined}><b>{date.getDate()}</b>{dayEvents.length ? <i>{dayEvents.length}</i> : null}</button> })() : <span className="communityTournamentCalendar__blank" key={`blank-${index}`} />)}</div></div>
        <div className="communityTournamentCalendar__agenda"><div><strong>{selectedEvents.length ? 'Torneos del día' : 'Sin torneos este día'}</strong><span>{selectedEvents.length ? `${selectedEvents.length} torneo${selectedEvents.length === 1 ? '' : 's'}` : 'Elegí otro día'}</span></div>{selectedEvents.length ? <div className="clubPublicTournamentGrid">{selectedEvents.map((tournament) => <TournamentPublicCard key={tournament.id} compactAgenda showClub tournament={tournament} />)}</div> : <p><CalendarDays size={18} /> No hay torneos públicos programados para esta fecha.</p>}</div>
      </div>
      <style>{`
        .communityTournamentCalendar{background:#fff;border:1px solid #dce6ef;border-radius:20px;box-shadow:0 16px 38px rgba(15,23,42,.07);color:#061b3a;display:grid;gap:13px;margin:0 auto 16px;max-width:1180px;padding:14px;}
        .communityTournamentCalendar__sectionHead{align-items:center !important}.communityTournamentCalendar__sectionHead>div:first-child{padding-left:10px;position:relative}.communityTournamentCalendar__sectionHead>div:first-child::before{background:linear-gradient(180deg,#22d3ee,#ec4899);border-radius:999px;content:"";height:42px;left:0;position:absolute;top:1px;width:4px}.communityTournamentCalendar__sectionHead h2{font-size:26px;font-weight:950;letter-spacing:-.045em;line-height:.98}.communityTournamentCalendar__sectionHead+ .communityTournamentCalendar__content{margin-top:2px}
        .communityTournamentCalendar>header{align-items:start;display:flex;gap:12px;justify-content:space-between}.communityTournamentCalendar header span{color:#0891b2;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.communityTournamentCalendar h2{font-size:22px;letter-spacing:-.035em;line-height:1;margin:3px 0}.communityTournamentCalendar header p{color:#64748b;font-size:12px;font-weight:750;margin:0}.communityTournamentCalendar__controls{display:flex;gap:7px}.communityTournamentCalendar__controls button{align-items:center;background:#fff;border:1px solid #b8d9bd;border-radius:11px;color:#65a30d;display:flex;height:38px;justify-content:center;width:38px}.communityTournamentCalendar__content{display:grid;gap:13px;grid-template-columns:minmax(280px,.88fr) minmax(0,1.12fr)}.communityTournamentCalendar__month{display:grid;gap:8px}.communityTournamentCalendar__month>strong{font-size:17px;text-transform:capitalize}.communityTournamentCalendar__grid{display:grid;gap:5px;grid-template-columns:repeat(7,minmax(0,1fr))}.communityTournamentCalendar__grid>span{color:#64748b;font-size:9px;font-weight:900;text-align:center;text-transform:uppercase}.communityTournamentCalendar__grid button{background:#f8fafc;border:1px solid #dbe5ef;border-radius:9px;color:#64748b;min-height:42px;position:relative}.communityTournamentCalendar__grid button.has-events{background:linear-gradient(135deg,#84cc16,#22d3ee);border-color:#38bdf8;color:#fff}.communityTournamentCalendar__grid button.is-selected{box-shadow:0 0 0 3px rgba(8,145,178,.18)}.communityTournamentCalendar__grid button:disabled{opacity:1}.communityTournamentCalendar__grid button i{align-items:center;background:#fff;border-radius:999px;color:#0891b2;display:flex;font-size:9px;font-style:normal;font-weight:950;height:17px;justify-content:center;position:absolute;right:3px;top:3px;width:17px}.communityTournamentCalendar__agenda{border-left:1px solid #e2e8f0;display:grid;gap:10px;padding-left:13px}.communityTournamentCalendar__agenda>div:first-child{align-items:center;display:flex;justify-content:space-between}.communityTournamentCalendar__agenda strong{font-size:14px}.communityTournamentCalendar__agenda span{color:#64748b;font-size:11px;font-weight:800}.communityTournamentCalendar__agenda>p{align-items:center;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b;display:flex;font-size:13px;font-weight:750;gap:8px;margin:0;padding:16px}@media(max-width:680px){.communityTournamentCalendar{border-radius:18px;margin:0 0 14px;padding:12px}.communityTournamentCalendar h2{font-size:24px}.communityTournamentCalendar__content{grid-template-columns:1fr}.communityTournamentCalendar__agenda{border-left:0;border-top:1px solid #e2e8f0;padding:11px 0 0}.communityTournamentCalendar__grid button{min-height:40px}.communityTournamentCalendar__agenda .clubPublicTournamentGrid{display:grid;gap:8px}}.communityTournamentCalendar__sectionHead h2{font-size:26px;font-weight:950;letter-spacing:-.045em;line-height:.98}@media(max-width:680px){.communityTournamentCalendar__sectionHead h2{font-size:24px}}
      `}</style>
    </section>
  )
}
