'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { defaultFlyerConfig, getTournamentFlyerSurfaceStyle, readFlyerConfigFromRules } from './_components/TournamentFlyerConfigurator'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import {
  getTournamentOperationalStatus,
  type OperationalStage,
} from '@/lib/tournamentDisplayStatus'
import { getClubTheme } from '@/lib/clubThemes'

type Tournament = {
  id: string
  name: string
  status: string
  type: string | null
  format: string | null
  gender: string | null
  category_id: number | null
  category_name: string | null
  start_date: string | null
  end_date: string | null
  registration_deadline: string | null
  min_pairs: number | null
  max_pairs: number | null
  price_per_player: number | null
  rules_json?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type TournamentListSummary = {
  operationalStage: OperationalStage
  currentPlayoffPhase?: string | null
  counts?: {
    registrations?: {
      total?: number
      pending?: number
      confirmed?: number
      cancelled?: number
    }
    groups?: number
    groupMatches?: {
      played?: number
      total?: number
    }
    playoffMatches?: number
  }
  final?: {
    status?: string | null
  } | null
  champion?: {
    team_id?: string | null
  } | null
}

const genderLabels: Record<string, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
  MIXED: 'Mixto',
}
const historyStatuses = new Set([
  'FINISHED',
  'FINALIZED',
  'FINALIZADO',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
  'CANCELED',
  'ARCHIVED',
])
type TournamentTab = 'recent' | 'drafts' | 'history'
type CalendarStatusFilter = 'all' | 'active' | 'finished' | 'drafts'

const monthLabels = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function money(value?: number | null) {
  if (!value) return 'Sin costo'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function isHistoryTournament(tournament: Tournament, operationalStage?: OperationalStage) {
  if (operationalStage === 'FINALIZADO') return true
  return historyStatuses.has(tournament.status?.toUpperCase())
}

function isUpcomingOrActive(tournament: Tournament, operationalStage?: OperationalStage) {
  const today = new Date().toISOString().slice(0, 10)
  const normalized = tournament.status?.toUpperCase()
  if (isHistoryTournament(tournament, operationalStage)) return false
  if (['ACTIVE', 'OPEN', 'PUBLISHED', 'REGISTRATION_OPEN', 'IN_PROGRESS'].includes(normalized)) return true
  if (normalized === 'DRAFT') return true
  return Boolean(tournament.start_date && tournament.start_date >= today)
}

function getTournamentDateForCalendar(tournament: Tournament) {
  return tournament.start_date ?? tournament.end_date ?? tournament.registration_deadline ?? tournament.created_at
}

function getTournamentCalendarDate(tournament: Tournament) {
  return new Date(getTournamentDateForCalendar(tournament))
}

function getMonthKey(tournament: Tournament) {
  const date = getTournamentCalendarDate(tournament)
  if (Number.isNaN(date.getTime())) return 'sin-fecha'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(tournament: Tournament) {
  const date = getTournamentCalendarDate(tournament)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return `${monthLabels[date.getMonth()]} ${date.getFullYear()}`
}

export default function ClubTorneosPage() {
  const router = useRouter()
  const { activeClub } = useSession()
  const currentYear = String(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [stagesByTournamentId, setStagesByTournamentId] = useState<Record<string, OperationalStage>>({})
  const [summariesByTournamentId, setSummariesByTournamentId] = useState<Record<string, TournamentListSummary>>({})
  const [activeTab, setActiveTab] = useState<TournamentTab>('recent')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>('all')
  const [selectedType, setSelectedType] = useState('all')
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-admin-accent': theme.vars.accent,
      '--club-admin-accent-2': theme.vars.accent2,
      '--club-admin-soft': theme.vars.soft,
      '--club-admin-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme]
  )

  const activeOrUpcoming = useMemo(
    () => tournaments.filter((tournament) => isUpcomingOrActive(tournament, stagesByTournamentId[tournament.id])).length,
    [stagesByTournamentId, tournaments]
  )
  const latestTournaments = useMemo(
    () => tournaments.slice(0, 5),
    [tournaments]
  )
  const draftTournaments = useMemo(
    () => tournaments.filter((tournament) => tournament.status?.toUpperCase() === 'DRAFT'),
    [tournaments]
  )
  const historicalTournaments = useMemo(() => {
    return tournaments.filter((tournament) => isHistoryTournament(tournament, stagesByTournamentId[tournament.id]))
  }, [stagesByTournamentId, tournaments])
  const yearOptions = useMemo(() => {
    const years = new Set<string>()
    tournaments.forEach((tournament) => {
      const date = getTournamentCalendarDate(tournament)
      if (!Number.isNaN(date.getTime())) years.add(String(date.getFullYear()))
    })
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [tournaments])
  const typeOptions = useMemo(() => {
    const values = new Set<string>()
    tournaments.forEach((tournament) => {
      if (tournament.type?.trim()) values.add(tournament.type.trim())
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'es'))
  }, [tournaments])
  const tabTournaments =
    activeTab === 'recent'
      ? latestTournaments
      : activeTab === 'drafts'
        ? draftTournaments
        : historicalTournaments
  const visibleTournaments = useMemo(() => {
    return tabTournaments.filter((tournament) => {
      const date = getTournamentCalendarDate(tournament)
      const year = Number.isNaN(date.getTime()) ? null : String(date.getFullYear())
      const month = Number.isNaN(date.getTime()) ? null : String(date.getMonth() + 1)
      const operationalStage = stagesByTournamentId[tournament.id]

      if (selectedYear !== 'all' && year !== selectedYear) return false
      if (selectedMonth !== 'all' && month !== selectedMonth) return false
      if (selectedType !== 'all' && tournament.type?.trim() !== selectedType) return false
      if (statusFilter === 'active' && !isUpcomingOrActive(tournament, operationalStage)) return false
      if (statusFilter === 'finished' && !isHistoryTournament(tournament, operationalStage)) return false
      if (statusFilter === 'drafts' && tournament.status?.toUpperCase() !== 'DRAFT') return false

      return true
    })
  }, [selectedMonth, selectedType, selectedYear, stagesByTournamentId, statusFilter, tabTournaments])
  const groupedVisibleTournaments = useMemo(() => {
    const groups = new Map<string, { label: string; tournaments: Tournament[] }>()
    visibleTournaments.forEach((tournament) => {
      const key = getMonthKey(tournament)
      const current = groups.get(key) ?? { label: getMonthLabel(tournament), tournaments: [] }
      current.tournaments.push(tournament)
      groups.set(key, current)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, group]) => group)
  }, [visibleTournaments])
  const visibleEmptyMessage =
    activeTab === 'recent'
      ? 'Todavía no hay torneos recientes.'
      : activeTab === 'drafts'
        ? 'No hay torneos en borrador.'
        : 'Todavía no hay torneos finalizados, cerrados o antiguos en el historial.'

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadTournaments() {
    if (!activeClub?.id) {
      setTournaments([])
      setStagesByTournamentId({})
      setSummariesByTournamentId({})
      setThemeKey(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoading(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const [json, clubThemeResult] = await Promise.all([
      res.json().catch(() => ({})),
      supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
    ])

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar torneos.')
      setLoading(false)
      return
    }

    const rows = (json?.tournaments ?? []) as Tournament[]
    setThemeKey((clubThemeResult.data?.theme_key as string | null) ?? null)
    setTournaments(rows)
    setLoading(false)
    void loadTournamentStages(rows, token)
  }

  async function loadTournamentStages(rows: Tournament[], token: string) {
    if (!activeClub?.id || rows.length === 0) {
      setStagesByTournamentId({})
      setSummariesByTournamentId({})
      return
    }

    const summaries = await Promise.allSettled(
      rows.map(async (tournament) => {
        const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournament.id}/summary`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.operationalStage) return null
        return [
          tournament.id,
          {
            operationalStage: json.operationalStage as OperationalStage,
            counts: json.counts,
            final: json.final,
            champion: json.champion,
            currentPlayoffPhase: json.currentPlayoffPhase ?? null,
          } satisfies TournamentListSummary,
        ] as const
      })
    )

    const nextStages: Record<string, OperationalStage> = {}
    const nextSummaries: Record<string, TournamentListSummary> = {}
    summaries.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        nextSummaries[result.value[0]] = result.value[1]
        nextStages[result.value[0]] = result.value[1].operationalStage
      }
    })
    setStagesByTournamentId(nextStages)
    setSummariesByTournamentId(nextSummaries)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTournaments())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  function getTournamentListBadge(tournament: Tournament) {
    const summary = summariesByTournamentId[tournament.id]
    const operationalStage = summary?.operationalStage ?? stagesByTournamentId[tournament.id]

    return getTournamentOperationalStatus({
      operationalStage,
      status: tournament.status,
      registrationDeadline: tournament.registration_deadline,
      counts: summary?.counts,
      final: summary?.final,
      champion: summary?.champion,
      currentPlayoffPhase: summary?.currentPlayoffPhase,
    })
  }

  function getTournamentPairsLabel(tournament: Tournament) {
    const summary = summariesByTournamentId[tournament.id]
    const confirmedPairs = summary?.counts?.registrations?.confirmed
    const confirmedLabel = typeof confirmedPairs === 'number' ? String(confirmedPairs) : '-'
    return `${confirmedLabel}${tournament.max_pairs ? `/${tournament.max_pairs}` : ''}`
  }

  function renderTournamentRow(tournament: Tournament, compact = false) {
    const isHistorical = isHistoryTournament(tournament, stagesByTournamentId[tournament.id])
    const flyerConfig = readFlyerConfigFromRules(tournament.rules_json) ?? defaultFlyerConfig
    const manualFlyerUrl = flyerConfig.mode === 'MANUAL' ? flyerConfig.manualFlyer?.publicUrl ?? flyerConfig.manualFlyer?.previewUrl ?? null : null
    const backdropStyle = manualFlyerUrl
      ? { backgroundImage: `url("${buildAssetProxyUrl(manualFlyerUrl) ?? manualFlyerUrl}")` }
      : getTournamentFlyerSurfaceStyle(flyerConfig)
    const statusBadge = getTournamentListBadge(tournament)
    return (
      <article
        key={tournament.id}
        className={`club-tournamentRow ${isHistorical ? 'club-tournamentRow--history' : 'club-tournamentRow--active'}${compact ? ' club-tournamentRow--compact' : ''}${manualFlyerUrl ? ' club-tournamentRow--manualFlyer' : ''}`}
        onClick={() => router.push(`/club/torneos/${tournament.id}`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            router.push(`/club/torneos/${tournament.id}`)
          }
        }}
        role="link"
        tabIndex={0}
      >
        <Link
          href={`/club/torneos/${tournament.id}`}
          className="club-tournamentOverlayLink"
          aria-label={`Ver detalle de ${tournament.name}`}
        />
        <div className="club-tournamentMain">
          <div className="club-titleLine">
            <strong>{tournament.name}</strong>
            <span className={`club-statusBadge club-statusBadge--${statusBadge.tone}`}>
              {statusBadge.label}
            </span>
          </div>
          <div className="club-metaLine">
            <span>{formatDate(tournament.start_date)}{tournament.end_date ? ` - ${formatDate(tournament.end_date)}` : ''}</span>
            <span>{tournament.category_name ?? 'Sin categoría'}</span>
            <span>{tournament.type ?? 'Sin tipo'}</span>
            <span>{tournament.gender ? genderLabels[tournament.gender] ?? tournament.gender : 'Sin género'}</span>
          </div>
        </div>

        <div className="club-tournamentBackdrop" style={backdropStyle}>
          <span className="club-tournamentBackdropGlow" />
        </div>

        <div className="club-tournamentDetails">
          <span>
            <small>Inscripción</small>
            <strong>{formatDate(tournament.registration_deadline)}</strong>
          </span>
          <span>
            <small>Parejas</small>
            <strong>{getTournamentPairsLabel(tournament)}</strong>
          </span>
          <span>
            <small>Precio</small>
            <strong>{money(tournament.price_per_player)}</strong>
          </span>
        </div>

        <div className="club-rowActions">
          <Link href={`/club/torneos/${tournament.id}`} className="club-secondaryBtn">Ver</Link>
        </div>
      </article>
    )
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-tournaments" style={themeStyle}>
        <div className="club-tournamentsHead">
          <div>
            <span className="club-kicker">Competencia</span>
            <h1 className="club-title">Torneos</h1>
            <p className="club-sub">Torneos creados por {activeClub?.name ?? 'tu club'} y próximos pasos operativos.</p>
          </div>
          <div className="club-headActions">
            <Link href="/club/torneos/nuevo" className="club-primaryBtn">Crear torneo</Link>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="club-loadingCards" aria-busy="true" aria-label="Cargando torneos">
            {[0, 1, 2].map((item) => <span key={item} />)}
          </div>
        ) : (
          <>
            <section className="club-metrics">
              <div className="club-metric"><span>Total</span><strong>{tournaments.length}</strong></div>
              <div className="club-metric"><span>Activos o próximos</span><strong>{activeOrUpcoming}</strong></div>
              <div className="club-metric"><span>Borradores</span><strong>{tournaments.filter((t) => t.status?.toUpperCase() === 'DRAFT').length}</strong></div>
            </section>

            <section className="club-card">
              <div className="club-cardHead club-cardHead--tabs">
                <div>
                  <span className="club-kicker">Calendario</span>
                  <h2>Torneos del club</h2>
                  <p>Vista de eventos por temporada, mes y estado operativo.</p>
                </div>
                <div className="club-tabs" role="tablist" aria-label="Filtro de torneos">
                  <button
                    type="button"
                    className={`club-tab ${activeTab === 'recent' ? 'club-tab--active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'recent'}
                    onClick={() => setActiveTab('recent')}
                  >
                    Últimos torneos
                    <span>{latestTournaments.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`club-tab ${activeTab === 'drafts' ? 'club-tab--active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'drafts'}
                    onClick={() => setActiveTab('drafts')}
                  >
                    Borradores
                    <span>{draftTournaments.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`club-tab ${activeTab === 'history' ? 'club-tab--active' : ''}`}
                    role="tab"
                    aria-selected={activeTab === 'history'}
                    onClick={() => setActiveTab('history')}
                  >
                    Historial de torneos
                    <span>{historicalTournaments.length}</span>
                  </button>
                </div>
              </div>

              <div className="club-calendarFilters" aria-label="Filtros del calendario de torneos">
                <label>
                  <span>Año</span>
                  <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                    <option value="all">Todos</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Mes</span>
                  <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                    <option value="all">Todos</option>
                    {monthLabels.map((month, index) => (
                      <option key={month} value={String(index + 1)}>{month}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Estado</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CalendarStatusFilter)}>
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="finished">Finalizados</option>
                    <option value="drafts">Borradores</option>
                  </select>
                </label>
                <label>
                  <span>Tipo</span>
                  <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                    <option value="all">Todos</option>
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>

              {tournaments.length === 0 ? (
                <div className="club-emptyAction">
                  <div className="px-empty">Todavía no hay torneos creados.</div>
                  <Link href="/club/torneos/nuevo" className="club-secondaryBtn">Crear primer torneo</Link>
                </div>
              ) : visibleTournaments.length === 0 ? (
                <div className="px-empty">{visibleEmptyMessage}</div>
              ) : (
                <div className="club-calendarGroups">
                  {groupedVisibleTournaments.map((group) => (
                    <section key={group.label} className="club-calendarMonth">
                      <div className="club-calendarMonthHead">
                        <h3>{group.label}</h3>
                        <span>{group.tournaments.length} torneo{group.tournaments.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className={`club-tournamentList ${activeTab === 'history' ? 'club-tournamentList--history' : ''}`}>
                        {group.tournaments.map((tournament) => renderTournamentRow(tournament, activeTab === 'history'))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <style>{`
        .club-tournaments {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-tournaments::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-tournamentsHead {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-headActions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-message { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); border-radius: 14px; color: #061b3a; font-weight: 850; margin-top: 12px; padding: 10px 12px; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 999px; display: inline-flex; font-weight: 950; justify-content: center; min-height: 42px; padding: 9px 15px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease; white-space: nowrap; }
        .club-primaryBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 14px 30px var(--club-admin-glow); color: #fff; }
        .club-primaryBtn:hover { box-shadow: 0 18px 38px var(--club-admin-glow); transform: translateY(-1px); }
        .club-secondaryBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 30%, transparent); color: #061b3a; }
        .club-secondaryBtn:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 48%, transparent); box-shadow: 0 12px 28px var(--club-admin-glow); transform: translateY(-1px); }
        .club-metrics { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; }
        .club-metric { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; box-shadow: 0 12px 30px rgba(15,23,42,.045); display: grid; gap: 4px; min-width: 0; padding: 14px; }
        .club-metric span { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-metric strong { color: #17253f; font-size: 24px; font-weight: 950; line-height: 1; }
        .club-card { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 20px; box-shadow: 0 16px 42px rgba(15,23,42,.055); display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 16px; }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead--tabs { align-items: center; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 12px; font-weight: 800; margin: 5px 0 0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-tabs { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: flex; flex: 0 0 auto; gap: 3px; padding: 3px; }
        .club-tab { align-items: center; background: transparent; border: 1px solid transparent; border-radius: 8px; color: #64748b; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; gap: 7px; min-height: 34px; padding: 7px 10px; transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease; white-space: nowrap; }
        .club-tab span { align-items: center; background: rgba(100,116,139,.10); border-radius: 999px; color: inherit; display: inline-flex; font-size: 11px; justify-content: center; min-width: 22px; padding: 2px 6px; }
        .club-tab:hover { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 26%, transparent); color: #061b3a; }
        .club-tab--active { background: #fff; border-color: color-mix(in srgb, var(--club-admin-accent) 42%, transparent); box-shadow: 0 8px 18px var(--club-admin-glow); color: #061b3a; }
        .club-tab--active span { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); color: #061b3a; }
        .club-calendarFilters { align-items: end; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 8px; grid-template-columns: .8fr 1fr 1fr 1fr; padding: 10px; }
        .club-calendarFilters label { display: grid; gap: 4px; min-width: 0; }
        .club-calendarFilters span { color: #64748b; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .club-calendarFilters select { appearance: none; background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 9px; color: #17253f; font: inherit; font-size: 12px; font-weight: 850; min-height: 34px; min-width: 0; padding: 7px 28px 7px 9px; }
        .club-calendarGroups { display: grid; gap: 16px; }
        .club-loadingCards { display:grid; gap:10px; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:14px }
        .club-loadingCards span { animation:clubLoadingPulse 1.2s ease-in-out infinite alternate; background:#e8edf2; border-radius:14px; min-height:92px }
        @keyframes clubLoadingPulse { to { opacity:.48 } }
        .club-calendarMonth { display: grid; gap: 9px; min-width: 0; }
        .club-calendarMonthHead { align-items: center; border-bottom: 1px solid rgba(15,23,42,.08); display: flex; gap: 10px; justify-content: space-between; padding-bottom: 7px; }
        .club-calendarMonthHead h3 { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.1; margin: 0; }
        .club-calendarMonthHead span { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 4px 8px; white-space: nowrap; }
        .club-emptyAction { display: grid; gap: 10px; justify-items: start; }
        .club-tournamentList { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
        .club-tournamentList--history { gap: 12px; }
        .club-tournamentRow { align-content: space-between; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; box-shadow: 0 8px 18px rgba(15,23,42,.04); cursor: pointer; display: grid; gap: 12px; min-height: 178px; min-width: 0; overflow: hidden; padding: 14px; position: relative; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .club-tournamentRow:focus-visible { outline: 2px solid var(--club-admin-accent); outline-offset: 2px; }
        .club-tournamentRow::before { background: linear-gradient(145deg, rgba(255,255,255,.74) 0%, rgba(255,255,255,.62) 48%, rgba(255,255,255,.42) 100%); border-radius: 14px; content: ''; inset: 0; position: absolute; transition: background .16s ease; z-index: 1; }
        .club-tournamentRow::after { background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2)); border-radius: 999px; content: ''; height: 4px; left: 14px; position: absolute; right: 14px; top: 0; transition: background .16s ease, opacity .16s ease; z-index: 2; }
        .club-tournamentRow--active::before { background: linear-gradient(145deg, rgba(255,255,255,.40) 0%, rgba(255,255,255,.24) 45%, rgba(255,255,255,.08) 100%); }
        .club-tournamentRow--manualFlyer::before { background: linear-gradient(90deg, rgba(255,255,255,.92) 0%, rgba(255,255,255,.76) 58%, rgba(255,255,255,.28) 100%); }
        .club-tournamentRow--history::before { background: linear-gradient(145deg, rgba(255,255,255,.82) 0%, rgba(248,250,252,.72) 48%, rgba(241,245,249,.58) 100%); }
        .club-tournamentRow--history::after { background: linear-gradient(90deg, rgba(148,163,184,.82), rgba(203,213,225,.28)); }
        .club-tournamentRow:hover { background: #fbfdff; border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); box-shadow: 0 18px 38px var(--club-admin-glow); transform: translateY(-2px); }
        .club-tournamentRow:hover::before { background: linear-gradient(145deg, rgba(255,255,255,.34) 0%, rgba(255,255,255,.20) 46%, rgba(255,255,255,.06) 100%); }
        .club-tournamentRow--history:hover::before { background: linear-gradient(145deg, rgba(255,255,255,.78) 0%, rgba(248,250,252,.68) 48%, rgba(241,245,249,.52) 100%); }
        .club-tournamentRow--active:hover::after { background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2)); }
        .club-tournamentRow--history:hover { border-color: rgba(100,116,139,.24); }
        .club-tournamentRow--compact { min-height: 160px; }
        .club-tournamentOverlayLink { border-radius: 14px; inset: 0; position: absolute; z-index: 1; }
        .club-tournamentOverlayLink:focus-visible { outline: 2px solid var(--club-admin-accent); outline-offset: -3px; }
        .club-tournamentBackdrop { background-color: #17253f; background-position: center top !important; background-repeat: no-repeat !important; background-size: cover !important; border-radius: 14px; filter: saturate(1.46) contrast(1.06); inset: 0; opacity: 1; pointer-events: none; position: absolute; transition: filter .18s ease, transform .22s ease, opacity .18s ease; z-index: 0; }
        .club-tournamentRow--manualFlyer .club-tournamentBackdrop { background-position: right center !important; filter: saturate(1.05) contrast(1.02); }
        .club-tournamentRow--history .club-tournamentBackdrop { filter: grayscale(1) saturate(.12) contrast(.92); opacity: .72; }
        .club-tournamentBackdrop::after { background: linear-gradient(145deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.02) 42%, rgba(255,255,255,0) 100%); content: ''; inset: 0; position: absolute; }
        .club-tournamentRow--history .club-tournamentBackdrop::after { background: linear-gradient(145deg, rgba(255,255,255,.30) 0%, rgba(255,255,255,.18) 48%, rgba(255,255,255,.06) 100%); }
        .club-tournamentBackdropGlow { background: radial-gradient(circle at 86% 22%, rgba(255,255,255,.20), transparent 36%); inset: 0; pointer-events: none; position: absolute; transition: opacity .18s ease; }
        .club-tournamentRow:hover .club-tournamentBackdrop { filter: saturate(1.58) contrast(1.08); opacity: 1; transform: scale(1.01); }
        .club-tournamentRow--history:hover .club-tournamentBackdrop { filter: grayscale(1) saturate(.16) contrast(.96); opacity: .82; }
        .club-tournamentRow:hover .club-tournamentBackdropGlow { opacity: .92; }
        .club-tournamentMain, .club-tournamentDetails { min-width: 0; pointer-events: none; position: relative; z-index: 3; }
        .club-tournamentMain { display: grid; gap: 10px; }
        .club-titleLine { align-items: flex-start; display: flex; gap: 8px; justify-content: space-between; min-width: 0; overflow: visible; }
        .club-titleLine strong { color: #17253f; display: -webkit-box; font-size: 15px; font-weight: 950; line-height: 1.15; min-width: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .club-metaLine { color: #475569; display: flex; flex-wrap: wrap; font-size: 11px; gap: 6px; min-width: 0; }
        .club-metaLine span { background: rgba(255,255,255,.72); border: 1px solid rgba(15,23,42,.06); border-radius: 999px; min-width: 0; overflow: hidden; padding: 4px 7px; text-overflow: ellipsis; white-space: nowrap; }
        .club-tournamentDetails { display: grid; gap: 7px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-tournamentDetails span { background: rgba(248,250,252,.74); border: 1px solid rgba(15,23,42,.06); border-radius: 10px; display: grid; gap: 2px; min-width: 0; padding: 8px; }
        .club-tournamentDetails small { color: #64748b; font-size: 10px; font-weight: 900; line-height: 1; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-tournamentDetails strong { color: #17253f; font-size: 12px; font-weight: 950; line-height: 1.15; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-rowActions { display: flex; justify-content: flex-end; pointer-events: none; position: relative; z-index: 3; }
        .club-rowActions .club-secondaryBtn { pointer-events: auto; }
        .club-rowActions .club-secondaryBtn { min-height: 34px; padding: 7px 14px; }
        .club-statusBadge { align-items: center; border-radius: 999px; display: inline-flex; flex: 0 0 auto; font-size: 10px; font-weight: 950; gap: 5px; isolation: isolate; overflow: visible; padding: 5px 7px; position: relative; white-space: nowrap; z-index: 6; }
        .club-statusBadge--active,
        .club-statusBadge--registration { background: #ecfdf3; color: #166534; }
        .club-statusBadge--ready { background: #fff7df; color: #854d0e; }
        .club-statusBadge--done,
        .club-statusBadge--finished { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); color: #061b3a; }
        .club-statusBadge--muted,
        .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-statusBadge--draft { background: #fff7df; color: #854d0e; }
        .club-statusBadge--running { animation: clubRunningPulse 1.65s ease-in-out infinite; background: #dff4ff; color: #075985; box-shadow: 0 0 0 1px rgba(14,165,233,.16), 0 8px 18px rgba(14,165,233,.18); }
        .club-statusBadge--running::after { animation: clubStatusPulseRing 1.65s ease-out infinite; background: rgba(14,165,233,.16); border: 1px solid rgba(14,165,233,.42); border-radius: inherit; content: ''; inset: -4px; pointer-events: none; position: absolute; z-index: -1; }
        .club-statusBadge--live { animation: clubLivePulse 1.45s ease-in-out infinite; background: #dc2626; color: #fff; box-shadow: 0 0 0 1px rgba(220,38,38,.18), 0 10px 22px rgba(220,38,38,.22); }
        .club-statusBadge--live::before { animation: clubLiveDot 1s ease-in-out infinite; background: #fff; border-radius: 999px; box-shadow: 0 0 0 2px rgba(255,255,255,.26), 0 0 8px rgba(255,255,255,.65); content: ''; flex: 0 0 auto; height: 6px; width: 6px; }
        .club-statusBadge--live::after { animation: clubLivePulseRing 1.45s ease-out infinite; background: rgba(220,38,38,.18); border: 1px solid rgba(220,38,38,.52); border-radius: inherit; content: ''; inset: -5px; pointer-events: none; position: absolute; z-index: -1; }
        @keyframes clubRunningPulse {
          0%, 100% { filter: saturate(1); }
          50% { filter: saturate(1.25); }
        }
        @keyframes clubStatusPulseRing {
          0% { opacity: .62; transform: scale(.96); }
          70% { opacity: 0; transform: scale(1.16); }
          100% { opacity: 0; transform: scale(1.16); }
        }
        @keyframes clubLivePulse {
          0%, 100% { filter: saturate(1); }
          50% { filter: saturate(1.35); }
        }
        @keyframes clubLivePulseRing {
          0% { opacity: .72; transform: scale(.95); }
          72% { opacity: 0; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(1.2); }
        }
        @keyframes clubLiveDot {
          0%, 100% { opacity: .74; transform: scale(.78); }
          50% { opacity: 1; transform: scale(1.18); }
        }
        @media (max-width: 720px) {
          .club-tournaments { padding: 12px; }
          .club-tournamentsHead { display: grid; gap: 10px; padding: 13px; }
          .club-tournamentsHead .club-sub { display:none; }
          .club-headActions { justify-content: stretch; }
          .club-headActions .club-primaryBtn { width:100%; }
          .club-cardHead--tabs { align-items: flex-start; flex-direction: column; }
          .club-calendarFilters { grid-template-columns: 1fr; }
          .club-tabs { align-items: stretch; flex-direction: column; width: 100%; }
          .club-tab { justify-content: space-between; width: 100%; }
          .club-metrics { grid-template-columns: repeat(3,minmax(0,1fr)); gap:6px; margin-top:10px; }
          .club-metric { border-radius:12px; padding:9px; }
          .club-metric span { font-size:10px; }
          .club-metric strong { font-size:20px; }
          .club-loadingCards { grid-template-columns:1fr; }
          .club-tournamentList { grid-template-columns: 1fr; }
          .club-titleLine { align-items: flex-start; flex-direction: column; }
          .club-tournamentDetails { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) { .club-loadingCards span { animation:none } }
      `}</style>
    </div>
  )
}
