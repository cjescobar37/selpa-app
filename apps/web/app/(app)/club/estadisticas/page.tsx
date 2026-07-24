'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import styles from './estadisticas.module.css'

type Section = 'summary' | 'players' | 'tournaments' | 'activity' | 'finance' | 'content'
type Preset = 'month' | 'previous_month' | '3m' | '6m' | 'year' | 'previous_year' | 'custom'
type Comparison = { value: number | null; label: string }
type Analytics = {
  generatedAt: string
  period: { from: string; to: string; timezone: string; timezoneSource: string }
  permissions: { finance: boolean; content: boolean }
  summary: {
    activePlayers: number; newPlayers: number; pendingRequests: number; tournaments: number; completedTournaments: number
    cancelledTournaments: number; registrations: number; occupancyRate: number | null; playedMatches: number
    comparisons: { newPlayers: Comparison; tournaments: Comparison; registrations: Comparison }
  }
  players: {
    active: number; new: number; pending: number; competitive: number; inactive: number; averageTournaments: number
    categories: Array<{ label: string; value: number }>; genders: Array<{ label: string; value: number }>
    top: Array<{ userId: string; name: string; category: number | null; tournaments: number; matches: number }>
  }
  tournaments: {
    created: number; published: number; completed: number; cancelled: number; registrations: number
    cancelledRegistrations: number; occupied: number; capacity: number; occupancyRate: number | null
    performance: Array<{ id: string; name: string; date: string | null; status: string; registrations: number; capacity: number; occupancy: number | null; projectedRevenue: number }>
  }
  activity: { played: number; pending: number; cancelled: number; byDay: Array<{ day: number; count: number }>; byHourBand: Array<{ band: number; count: number }> }
  finance: null | { available: boolean; currencies: Record<string, { income: number; expenses: number; adjustments: number; net: number }>; receivables: Record<string, { pending: number; overdue: number }>; closuresPending: boolean }
  content: null | {
    newsPublished: number | null; activeSponsors: number; expiringSponsors: number; activeCampaigns: number; impressions: number; clicks: number
    campaignPerformance: Array<{ id: string; name: string; sponsor: string; impressions: number; clicks: number; ctr: number; endsAt: string | null }>
  }
  insights: Array<{ tone: string; title: string; detail: string; section: Section }>
  warnings: string[]
}

const sections: Array<{ id: Section; label: string }> = [
  { id: 'summary', label: 'Resumen' }, { id: 'players', label: 'Jugadores' }, { id: 'tournaments', label: 'Torneos' },
  { id: 'activity', label: 'Actividad' }, { id: 'finance', label: 'Finanzas' }, { id: 'content', label: 'Contenido' },
]
const presets: Array<{ id: Preset; label: string }> = [
  { id: 'month', label: 'Este mes' }, { id: 'previous_month', label: 'Mes anterior' }, { id: '3m', label: 'Últimos 3 meses' },
  { id: '6m', label: 'Últimos 6 meses' }, { id: 'year', label: 'Este año' }, { id: 'previous_year', label: 'Año anterior' },
  { id: 'custom', label: 'Rango personalizado' },
]
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const hourLabels = ['00–06', '06–12', '12–18', '18–24']

function datesForPreset(preset: Preset) {
  const now = new Date()
  let from = new Date(now.getFullYear(), now.getMonth(), 1)
  let to = now
  if (preset === 'previous_month') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) }
  if (preset === '3m' || preset === '6m') from = new Date(now.getFullYear(), now.getMonth() - (preset === '3m' ? 2 : 5), 1)
  if (preset === 'year') from = new Date(now.getFullYear(), 0, 1)
  if (preset === 'previous_year') { from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59) }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}
function money(value: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}
function periodLabel(from: string, to: string) {
  const format = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${format.format(new Date(`${from}T12:00:00`))} — ${format.format(new Date(`${to}T12:00:00`))}`
}

export default function ClubAnalyticsPage() {
  const { activeClub } = useSession()
  const [section, setSection] = useState<Section>('summary')
  const [preset, setPreset] = useState<Preset>('month')
  const initialDates = useMemo(() => datesForPreset('month'), [])
  const [from, setFrom] = useState(initialDates.from)
  const [to, setTo] = useState(initialDates.to)
  const [filterOpen, setFilterOpen] = useState(false)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const clubId = activeClub?.id

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!clubId) return
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      setLoading(true); setError('')
      const response = await fetch(`/api/clubs/${clubId}/analytics?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No pudimos cargar las estadísticas.')
      setData(json)
    } catch (loadError) {
      if ((loadError as { name?: string }).name !== 'AbortError') setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar las estadísticas.')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [clubId, from, to])

  useEffect(() => {
    const stored = window.sessionStorage.getItem('selpa-club-analytics-period')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { preset?: Preset; from?: string; to?: string }
        window.setTimeout(() => {
          if (parsed.preset) setPreset(parsed.preset)
          if (parsed.from) setFrom(parsed.from)
          if (parsed.to) setTo(parsed.to)
        }, 0)
      } catch { /* ignore invalid session data */ }
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void load(controller.signal) }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [load])
  useEffect(() => {
    window.sessionStorage.setItem('selpa-club-analytics-period', JSON.stringify({ preset, from, to }))
  }, [preset, from, to])

  function selectPreset(next: Preset) {
    setPreset(next)
    if (next !== 'custom') {
      const dates = datesForPreset(next); setFrom(dates.from); setTo(dates.to); setFilterOpen(false)
    }
  }
  const visibleSections = sections.filter((item) => (item.id !== 'finance' || data?.permissions.finance) && (item.id !== 'content' || data?.permissions.content))
  const updated = data ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt)) : null

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span>CLUB ADMIN</span><h1>Estadísticas</h1><p>{data ? periodLabel(from, to) : 'Información operativa del club'}</p></div>
      <button className={styles.filterButton} onClick={() => setFilterOpen(true)}><CalendarRange size={17} /><span>{presets.find((item) => item.id === preset)?.label}</span><ChevronDown size={15} /></button>
      {updated ? <small>Actualizado {updated}</small> : null}
    </header>
    <div className={styles.selector}>
      <label htmlFor="analytics-section">Sección</label>
      <select id="analytics-section" value={section} onChange={(event) => setSection(event.target.value as Section)}>
        {visibleSections.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
      </select>
      <nav aria-label="Secciones de estadísticas">{visibleSections.map((item) => <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>
    </div>
    {data?.warnings.length ? <div className={styles.warnings}>{data.warnings.map((warning) => <p key={warning}><AlertTriangle size={15} />{warning}</p>)}</div> : null}
    {loading && !data ? <AnalyticsState title="Preparando estadísticas" detail="Agregando la actividad real del período…" /> : null}
    {error ? <AnalyticsState title="No pudimos cargar esta información" detail={error} action={<button onClick={() => void load()}>Reintentar</button>} /> : null}
    {data && !error ? <>
      {section === 'summary' ? <Summary data={data} onSection={setSection} /> : null}
      {section === 'players' ? <Players data={data} /> : null}
      {section === 'tournaments' ? <Tournaments data={data} /> : null}
      {section === 'activity' ? <Activity data={data} /> : null}
      {section === 'finance' ? <Finance data={data} /> : null}
      {section === 'content' ? <Content data={data} /> : null}
    </> : null}
    {filterOpen ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterOpen(false) }}><section className={styles.filterSheet} role="dialog" aria-modal="true" aria-label="Seleccionar período"><header><h2>Período</h2><button onClick={() => setFilterOpen(false)}>Cerrar</button></header><div>{presets.map((item) => <button key={item.id} aria-pressed={preset === item.id} onClick={() => selectPreset(item.id)}>{item.label}</button>)}</div>{preset === 'custom' ? <fieldset><label>Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button onClick={() => setFilterOpen(false)} disabled={!from || !to || from > to}>Aplicar rango</button></fieldset> : null}</section></div> : null}
  </main>
}

function Summary({ data, onSection }: { data: Analytics; onSection: (section: Section) => void }) {
  const financial = data.finance?.available ? Object.entries(data.finance.currencies)[0] : null
  return <div className={styles.section}>
    <div className={styles.kpis}>
      <Kpi label="Jugadores activos" value={data.summary.activePlayers} />
      <Kpi label="Nuevos jugadores" value={data.summary.newPlayers} comparison={data.summary.comparisons.newPlayers} />
      <Kpi label="Torneos creados" value={data.summary.tournaments} comparison={data.summary.comparisons.tournaments} />
      <Kpi label="Inscripciones" value={data.summary.registrations} comparison={data.summary.comparisons.registrations} />
      <Kpi label="Ocupación" value={data.summary.occupancyRate === null ? 'No aplica' : `${data.summary.occupancyRate}%`} />
      <Kpi label="Partidos disputados" value={data.summary.playedMatches} />
      {financial ? <><Kpi label={`Ingresos · ${financial[0]}`} value={money(financial[1].income, financial[0])} /><Kpi label={`Resultado · ${financial[0]}`} value={money(financial[1].net, financial[0])} /></> : null}
    </div>
    <section className={styles.insights}><div className={styles.title}><div><span>LECTURA RÁPIDA</span><h2>Qué está pasando</h2></div></div>
      {data.insights.length ? <div>{data.insights.map((insight) => <button data-tone={insight.tone} key={`${insight.title}-${insight.section}`} onClick={() => onSection(insight.section)}><b>{insight.title}</b><span>{insight.detail}</span></button>)}</div> : <p className={styles.empty}>Todavía no hay variaciones relevantes en este período.</p>}
    </section>
    <BarPanel title="Participación por categoría" unit="jugadores" values={data.players.categories} />
  </div>
}
function Players({ data }: { data: Analytics }) {
  return <div className={styles.section}><div className={styles.kpis}><Kpi label="Activos" value={data.players.active} /><Kpi label="Nuevos" value={data.players.new} /><Kpi label="Con actividad" value={data.players.competitive} /><Kpi label="Sin actividad" value={data.players.inactive} /><Kpi label="Solicitudes pendientes" value={data.players.pending} /><Kpi label="Promedio de torneos" value={data.players.averageTournaments} /></div><div className={styles.twoColumns}><BarPanel title="Distribución por categoría" unit="jugadores" values={data.players.categories} /><BarPanel title="Distribución por género" unit="jugadores" values={data.players.genders} /></div><ListPanel title="Jugadores con mayor actividad">{data.players.top.length ? data.players.top.map((player) => <Link className={styles.playerRow} href={`/jugadores/${player.userId}`} key={player.userId}><span><b>{player.name}</b><small>{player.category ? `${player.category}ta` : 'Sin categoría'}</small></span><em>{player.tournaments} torneos · {player.matches} partidos</em></Link>) : <p className={styles.empty}>No hubo actividad competitiva en el período.</p>}</ListPanel></div>
}
function Tournaments({ data }: { data: Analytics }) {
  return <div className={styles.section}><div className={styles.kpis}><Kpi label="Creados" value={data.tournaments.created} /><Kpi label="Publicados" value={data.tournaments.published} /><Kpi label="Completados" value={data.tournaments.completed} /><Kpi label="Cancelados" value={data.tournaments.cancelled} /><Kpi label="Inscripciones" value={data.tournaments.registrations} /><Kpi label="Ocupación" value={data.tournaments.occupancyRate === null ? 'Sin datos' : `${data.tournaments.occupancyRate}%`} /></div><ListPanel title="Rendimiento por torneo">{data.tournaments.performance.length ? data.tournaments.performance.map((tournament) => <Link href={`/club/torneos/${tournament.id}`} className={styles.tournamentRow} key={tournament.id}><span><b>{tournament.name}</b><small>{tournament.date ? new Date(`${tournament.date}T12:00:00`).toLocaleDateString('es-AR') : 'Sin fecha'} · {tournament.status}</small></span><span><strong>{tournament.occupancy === null ? '—' : `${tournament.occupancy}%`}</strong><small>{tournament.registrations}/{tournament.capacity || '—'} parejas</small></span></Link>) : <p className={styles.empty}>No se crearon torneos en este período.</p>}</ListPanel></div>
}
function Activity({ data }: { data: Analytics }) {
  return <div className={styles.section}><div className={styles.kpis}><Kpi label="Disputados" value={data.activity.played} /><Kpi label="Pendientes" value={data.activity.pending} /><Kpi label="Cancelados" value={data.activity.cancelled} /></div><div className={styles.twoColumns}><BarPanel title="Actividad por día" unit="partidos" values={data.activity.byDay.map((row) => ({ label: dayLabels[row.day], value: row.count }))} /><BarPanel title="Actividad por franja horaria" unit="partidos" values={data.activity.byHourBand.map((row) => ({ label: hourLabels[row.band], value: row.count }))} /></div><p className={styles.note}>Las franjas usan el horario configurado para Argentina. El club todavía no posee timezone propio configurable.</p></div>
}
function Finance({ data }: { data: Analytics }) {
  if (!data.permissions.finance) return <AnalyticsState title="Sin acceso financiero" detail="Tu rol no posee finance:view." />
  if (!data.finance?.available) return <AnalyticsState title="Finanzas todavía no disponible" detail="Aplicá la migración del módulo Finanzas para habilitar estas métricas." />
  const currencies = Object.entries(data.finance.currencies)
  return <div className={styles.section}>{currencies.length ? currencies.map(([currency, row]) => <section className={styles.currency} key={currency}><div className={styles.title}><div><span>MONEDA</span><h2>{currency}</h2></div><Link href="/club/contabilidad">Ver Finanzas</Link></div><div className={styles.kpis}><Kpi label="Ingresos" value={money(row.income, currency)} /><Kpi label="Gastos" value={money(row.expenses, currency)} /><Kpi label="Ajustes" value={money(row.adjustments, currency)} /><Kpi label="Resultado neto" value={money(row.net, currency)} /></div>{data.finance?.receivables[currency] ? <div className={styles.debt}><span>Por cobrar <b>{money(data.finance.receivables[currency].pending, currency)}</b></span><span>Vencido <b>{money(data.finance.receivables[currency].overdue, currency)}</b></span></div> : null}</section>) : <AnalyticsState title="Sin movimientos" detail="No hubo movimientos financieros en el período seleccionado." />}</div>
}
function Content({ data }: { data: Analytics }) {
  if (!data.permissions.content) return <AnalyticsState title="Sin acceso a contenido" detail="Tu rol no posee permisos de contenido o publicidad." />
  if (!data.content) return <AnalyticsState title="Métricas comerciales no disponibles" detail="Aplicá la migración de Sponsors y publicidad." />
  const ctr = data.content.impressions ? Math.round((data.content.clicks / data.content.impressions) * 1000) / 10 : 0
  return <div className={styles.section}><div className={styles.kpis}><Kpi label="Noticias publicadas" value={data.content.newsPublished ?? 'Sin tracking'} /><Kpi label="Sponsors activos" value={data.content.activeSponsors} /><Kpi label="Campañas activas" value={data.content.activeCampaigns} /><Kpi label="Impresiones" value={data.content.impressions} /><Kpi label="Clics" value={data.content.clicks} /><Kpi label="CTR" value={`${ctr}%`} /></div><ListPanel title="Campañas con mejor rendimiento">{data.content.campaignPerformance.length ? data.content.campaignPerformance.map((campaign) => <div className={styles.campaignRow} key={campaign.id}><span><b>{campaign.name}</b><small>{campaign.sponsor}</small></span><em>{campaign.impressions} imp. · {campaign.clicks} clics · <strong>{campaign.ctr}%</strong></em></div>) : <p className={styles.empty}>Todavía no hay eventos publicitarios en el período.</p>}</ListPanel></div>
}
function Kpi({ label, value, comparison }: { label: string; value: string | number; comparison?: Comparison }) {
  return <article className={styles.kpi}><span>{label}</span><strong>{value}</strong>{comparison ? <small data-up={comparison.value !== null && comparison.value > 0}>{comparison.label}</small> : null}</article>
}
function BarPanel({ title, unit, values }: { title: string; unit: string; values: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...values.map((item) => item.value))
  return <section className={styles.panel}><div className={styles.title}><div><span>{unit.toUpperCase()}</span><h2>{title}</h2></div></div>{values.length ? <div className={styles.bars}>{values.map((item) => <div key={item.label}><label><span>{item.label}</span><b>{item.value}</b></label><i><span style={{ width: `${(item.value / max) * 100}%` }} /></i></div>)}</div> : <p className={styles.empty}>Sin datos para este período.</p>}</section>
}
function ListPanel({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.title}><div><span>DETALLE</span><h2>{title}</h2></div></div><div className={styles.rows}>{children}</div></section>
}
function AnalyticsState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className={styles.state}><BarChart3 size={25} /><strong>{title}</strong><p>{detail}</p>{action}</div>
}
