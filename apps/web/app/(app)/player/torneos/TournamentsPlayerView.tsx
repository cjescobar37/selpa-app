'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Compass, FileText, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PlayerSectionHero from '@/components/player/PlayerSectionHero'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import type { PublicTournamentItem } from '@/components/public/PublicTournamentsExperience'
import { supabase } from '@/lib/supabaseClient'
import { BRAND } from '@/lib/branding'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { groupPlayerAgenda, latestAgendaRegistrations } from '@/lib/playerAgenda'
import PlayerAgendaCard from '@/components/player/PlayerAgendaCard'
import agendaStyles from '@/components/player/PlayerAgenda.module.css'
import TournamentSearch from '@/components/public/TournamentSearch'
import { useTournamentDiscoveryFilters } from '@/lib/useTournamentDiscoveryFilters'
import { normalizeTournamentSearch } from '@/lib/publicTournamentDiscovery'

type ViewMode = 'mine' | 'calendar' | 'explore' | 'rules'

type TournamentRow = {
  registeredPairs?: number | null
  id: string
  club_id: string
  name: string
  status: string | null
  starts_on: string | null
  start_date: string | null
  ends_on: string | null
  end_date: string | null
  registration_deadline: string | null
  category: number | null
  gender: string | null
  price_per_player: number | null
  max_pairs: number | null
  type: string | null
  tournament_type: string | null
  segment: string | null
  rules: Record<string, unknown> | null
  rules_json: Record<string, unknown> | null
}

type TeamRow = {
  id: string
  club_id: string
  tournament_id: string
}

type RegistrationRow = {
  id: string
  club_id: string
  tournament_id: string
  team_id: string
  status: string | null
  created_at: string
}

type ClubRow = {
  id: string
  name: string
  city?: string | null
  theme_key: string | null
  logo_url?: string | null
  rules_pdf_url?: string | null
}

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE') return 'M'
  if (normalized === 'FEMALE') return 'F'
  return normalized || 'UNKNOWN'
}

function parseCalendarDate(value?: string | null) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function calendarKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function tournamentCalendarDate(tournament: TournamentRow) {
  return parseCalendarDate(tournament.starts_on ?? tournament.start_date)
}

function formatCalendarMonth(date: Date) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
}

function pageCopy(mode: ViewMode) {
  if (mode === 'calendar') {
    return {
      kicker: 'Calendario del club',
      title: 'Calendario del club',
      body: 'Agenda deportiva del club seleccionado, ordenada por fecha.',
      icon: CalendarDays,
    }
  }
  if (mode === 'explore') {
    return {
      kicker: 'Explorar',
      title: 'Torneos públicos',
      body: `Encontrá torneos abiertos de todos los clubes ${BRAND.name}.`,
      icon: Compass,
    }
  }
  if (mode === 'rules') {
    return {
      kicker: 'Reglamento',
      title: 'Reglas de competencia',
      body: `Reglamento general ${BRAND.name} y documento del club activo cuando esté disponible.`,
      icon: FileText,
    }
  }
  return {
    kicker: 'Mis torneos',
    title: 'Mi agenda de torneos',
    body: 'Inscripciones, fechas y estados de tu temporada.',
    icon: Trophy,
  }
}

function PlayerTournamentAgenda({ tournaments, registrations, clubs }: { tournaments:TournamentRow[]; registrations:RegistrationRow[]; clubs:Record<string,ClubRow> }) {
  const groups = groupPlayerAgenda(tournaments, registrations, new Date())
  const latest = latestAgendaRegistrations(registrations)
  const sections = [
    { key:'upcoming' as const, title:'Próximos' },
    { key:'pending' as const, title:'Pendientes' },
    { key:'history' as const, title:'Historial' },
  ]
  return <div className={agendaStyles.sections}>
    {groups.upcoming.length || groups.pending.length ? <div className={agendaStyles.summary} aria-label="Resumen de tu agenda">
      <span><strong>{groups.upcoming.length}</strong> próximos</span><span><strong>{groups.pending.length}</strong> pendientes de confirmación</span>
    </div> : null}
    {!tournaments.length ? <p className={agendaStyles.empty}>Sin torneos en esta sección</p> : sections.filter(section => groups[section.key].length).map(section => <section key={section.key} className={agendaStyles.section} aria-label={section.title}>
      <header className={agendaStyles.head}><h2>{section.title}</h2><span>{groups[section.key].length} {groups[section.key].length===1?'torneo':'torneos'}</span></header>
      <div className={`${agendaStyles.cards} clubPublicTournamentGrid`}>{groups[section.key].map(tournament => <PlayerAgendaCard key={tournament.id} tournament={tournament} club={clubs[tournament.club_id]} registrationStatus={latest.get(tournament.id)?.status} />)}</div>
    </section>)}
    {tournaments.length ? <p className={agendaStyles.empty}>La confirmación corresponde al cupo. Consultá los pagos acreditados en <Link href="/player/pagos">Mis pagos</Link>.</p> : null}
  </div>
}

export default function TournamentsPlayerView({ mode }: { mode: ViewMode }) {
  return <Suspense fallback={<PlayerStatePanel kind="loading" title="Cargando torneos" message="Preparando tu agenda" compact />}><TournamentsPlayerContent mode={mode} /></Suspense>
}

function TournamentsPlayerContent({ mode }: { mode: ViewMode }) {
  const session = useSession()
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [clubs, setClubs] = useState<Record<string, ClubRow>>({})
  const [activeClubDetails, setActiveClubDetails] = useState<ClubRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const { query, category, gender, club: clubFilter, returnTo, updateFilters } = useTournamentDiscoveryFilters()
  const [calendarMonthOverride, setCalendarMonth] = useState<Date | null>(null)
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null)

  const copy = pageCopy(mode)
  const Icon = copy.icon

  useEffect(() => {
    let alive = true

    async function load() {
      if (session.status === 'loading') return
      if (!session.user?.id) {
        setLoading(false)
        return
      }

      setLoading(true)
      setMessage('')

      try {
        const activeClubId = session.activeClubId ?? null
        const activeClubQuery = activeClubId
          ? supabase.from('clubs').select('id,name,logo_url,rules_pdf_url').eq('id', activeClubId).maybeSingle()
          : Promise.resolve({ data: null, error: null })

        let tournamentRows: TournamentRow[] = []
        let registrationRows: RegistrationRow[] = []
        let discoveredClubs: ClubRow[] = []

        if (mode === 'mine') {
          const clubIds = session.clubs.map((club) => club.id)
          if (clubIds.length) {
            const { data: teamData, error: teamsError } = await supabase
              .from('tournament_teams')
              .select('id,club_id,tournament_id')
              .in('club_id', clubIds)
              .or(`player1_user_id.eq.${session.user.id},player2_user_id.eq.${session.user.id}`)

            if (teamsError) throw teamsError
            const teams = (teamData ?? []) as TeamRow[]
            const teamIds = teams.map((team) => team.id)
            if (teamIds.length) {
              const { data: registrationData, error: registrationError } = await supabase
                .from('tournament_registrations')
                .select('id,club_id,tournament_id,team_id,status,created_at')
                .in('team_id', teamIds)
                .order('created_at', { ascending: false })

              if (registrationError) throw registrationError
              registrationRows = (registrationData ?? []) as RegistrationRow[]
              const tournamentIds = Array.from(new Set(registrationRows.map((row) => row.tournament_id)))
              if (tournamentIds.length) {
                const { data: tournamentData, error: tournamentError } = await supabase
                  .from('tournaments')
                  .select('id,club_id,name,status,starts_on,start_date,ends_on,end_date,registration_deadline,category,gender,price_per_player,max_pairs,type,tournament_type,segment,rules,rules_json')
                  .in('id', tournamentIds)
                if (tournamentError) throw tournamentError
                tournamentRows = (tournamentData ?? []) as TournamentRow[]
              }
            }
          }
        } else if (mode === 'calendar') {
          if (activeClubId) {
            const { data: tournamentData, error: tournamentError } = await supabase
              .from('tournaments')
              .select('id,club_id,name,status,starts_on,start_date,ends_on,end_date,registration_deadline,category,gender,price_per_player,max_pairs,type,tournament_type,segment,rules,rules_json')
              .eq('club_id', activeClubId)
              .not('status', 'in', '("DRAFT","CANCELLED","CANCELED","CANCELADO","ARCHIVED")')
              .order('starts_on', { ascending: true, nullsFirst: false })
            if (tournamentError) throw tournamentError
            tournamentRows = (tournamentData ?? []) as TournamentRow[]
          }
        } else if (mode === 'explore') {
          const response = await fetch('/api/public/tournaments', { cache: 'no-store' })
          if (!response.ok) throw new Error('No pudimos cargar los torneos públicos. Intentá nuevamente.')
          const discovery = await response.json() as { tournaments: PublicTournamentItem[] }
          tournamentRows = discovery.tournaments.map(item => ({
            id: item.id, club_id: item.club_id, name: item.name, status: item.status,
            starts_on: item.startDate, start_date: item.startDate, ends_on: item.endDate ?? null, end_date: item.endDate ?? null,
            registration_deadline: item.registrationDeadline, category: item.category, gender: item.gender,
            price_per_player: item.pricePerPlayer, max_pairs: item.maxPairs, type: item.type ?? null, tournament_type: item.type ?? null,
            segment: item.segment ?? null, rules: item.rules ?? null, rules_json: item.rules ?? null, registeredPairs: item.registeredPairs,
          }))
          discoveredClubs = discovery.tournaments.map(item => ({ id: item.club_id, name: item.clubName, logo_url: item.clubLogoUrl, theme_key: item.clubThemeKey }))
        }

        const clubIds = Array.from(new Set([
          ...session.clubs.map((club) => club.id),
          ...tournamentRows.map((tournament) => tournament.club_id),
        ]))
        const [activeClubResult, clubRowsResult] = await Promise.all([
          activeClubQuery,
          clubIds.length
            ? supabase.from('clubs').select('id,name,city,theme_key,logo_url').in('id', clubIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (activeClubResult.error) throw activeClubResult.error
        if (clubRowsResult.error) throw clubRowsResult.error
        if (!alive) return
        setActiveClubDetails((activeClubResult.data ?? null) as ClubRow | null)
        const clubsById = new Map(((clubRowsResult.data ?? []) as ClubRow[]).map(club => [club.id, club]))
        for (const club of discoveredClubs) clubsById.set(club.id, { ...clubsById.get(club.id), ...club })
        setClubs(Object.fromEntries(clubsById))
        setTournaments(tournamentRows)
        setRegistrations(registrationRows)
      } catch (error: unknown) {
        if (alive) setMessage(error instanceof Error ? error.message : 'No pude cargar torneos.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [loadAttempt, mode, session.activeClubId, session.clubs, session.status, session.user?.id])


  const visibleTournaments = useMemo(() => {
    const search = normalizeTournamentSearch(query)
    const homeCity = String(session.globalProfile?.city ?? '').trim().toLocaleLowerCase('es-AR')
    return tournaments
      .filter((tournament) => category === 'all' || String(tournament.category ?? '') === category)
      .filter((tournament) => gender === 'all' || normalizeGender(tournament.gender) === gender)
      .filter((tournament) => clubFilter === 'all' || clubs[tournament.club_id]?.name === clubFilter)
      .filter((tournament) => !search || normalizeTournamentSearch(`${tournament.name} ${clubs[tournament.club_id]?.name ?? ''}`).includes(search))
      .sort((a, b) => {
        if (mode === 'explore' && homeCity) {
          const aLocal = String(clubs[a.club_id]?.city ?? '').trim().toLocaleLowerCase('es-AR') === homeCity
          const bLocal = String(clubs[b.club_id]?.city ?? '').trim().toLocaleLowerCase('es-AR') === homeCity
          if (aLocal !== bLocal) return aLocal ? -1 : 1
        }
        const left = new Date(a.starts_on ?? a.start_date ?? '2999-12-31').getTime()
        const right = new Date(b.starts_on ?? b.start_date ?? '2999-12-31').getTime()
        return left - right
      })
  }, [category, clubFilter, clubs, gender, mode, query, session.globalProfile?.city, tournaments])

  const exploreSections = useMemo(() => {
    const live: TournamentRow[] = []
    const open: TournamentRow[] = []
    const upcoming: TournamentRow[] = []
    const finished: TournamentRow[] = []

    for (const tournament of visibleTournaments) {
      const bucket = getTournamentDisplayStatus(tournament).key
      if (bucket === 'live') live.push(tournament)
      else if (bucket === 'finished') finished.push(tournament)
      else if (bucket === 'registration_open') open.push(tournament)
      else upcoming.push(tournament)
    }

    const dateValue = (item: TournamentRow) => new Date(item.starts_on ?? item.start_date ?? '2999-12-31').getTime()
    const closestFirst = (items: TournamentRow[]) => items.sort((a, b) => dateValue(a) - dateValue(b))
    const mostRecentFirst = (items: TournamentRow[]) => items.sort((a, b) => dateValue(b) - dateValue(a))
    return [
      { key: 'live', title: 'En juego', subtitle: 'Torneos jugándose ahora', items: closestFirst(live) },
      { key: 'open', title: 'Inscripción abierta', subtitle: 'Próximos torneos disponibles', items: closestFirst(open) },
      { key: 'upcoming', title: 'Próximos', subtitle: 'Torneos por jugarse', items: closestFirst(upcoming) },
      { key: 'finished', title: 'Finalizados', subtitle: 'Historial público reciente', items: mostRecentFirst(finished) },
    ] as const
  }, [visibleTournaments])

  const calendarEvents = useMemo(() => tournaments
    .map((tournament) => ({ tournament, date: tournamentCalendarDate(tournament) }))
    .filter((item): item is { tournament: TournamentRow; date: Date } => Boolean(item.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [tournaments])

  const calendarEventsByDay = useMemo(() => {
    const next = new Map<string, TournamentRow[]>()
    for (const item of calendarEvents) {
      const key = calendarKey(item.date)
      next.set(key, [...(next.get(key) ?? []), item.tournament])
    }
    return next
  }, [calendarEvents])

  const calendarMonth = useMemo(() => {
    if (calendarMonthOverride) return calendarMonthOverride
    const today = new Date()
    const nextEvent = calendarEvents.find((item) => item.date >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) ?? calendarEvents[0]
    return nextEvent
      ? new Date(nextEvent.date.getFullYear(), nextEvent.date.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1)
  }, [calendarEvents, calendarMonthOverride])

  const monthCalendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const firstWeekday = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
    return Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - firstWeekday + 1))
  }, [calendarMonth])

  const selectedCalendarEvents = useMemo(() => {
    const firstAvailable = calendarEvents.find((item) => item.date.getFullYear() === calendarMonth.getFullYear() && item.date.getMonth() === calendarMonth.getMonth())
    return calendarEventsByDay.get(selectedCalendarDay ?? (firstAvailable ? calendarKey(firstAvailable.date) : '')) ?? []
  }, [calendarEvents, calendarEventsByDay, calendarMonth, selectedCalendarDay])

  function renderTournamentCard(tournament: TournamentRow) {
    return <PlayerAgendaCard returnTo={returnTo} key={tournament.id} tournament={tournament} club={clubs[tournament.club_id]} />
  }

  return (
    <PlayerSpaceLayout><main className="playerTournamentsShell">
      <PlayerSectionHero
        badge={copy.kicker}
        title={copy.title}
        description={copy.body}
        icon={<Icon />}
        action={mode==='mine'?undefined:<Link className="playerTournamentsBack" href="/player/torneos">← Mi agenda</Link>}
      />

      <nav className={agendaStyles.navigation} aria-label="Secciones de torneos">
        {[{ mode: 'mine', href: '/player/torneos', label: 'Mi agenda' }, { mode: 'explore', href: '/player/torneos/explorar', label: 'Explorar' }, { mode: 'calendar', href: '/player/torneos/calendario', label: 'Calendario' }].map(item => <Link key={item.mode} href={item.href} aria-current={mode === item.mode ? 'page' : undefined}>{item.label}</Link>)}
      </nav>

      {mode === 'rules' ? (
        <section className="playerRulesGrid">
          <article>
            <span>Reglamento general</span>
            <strong>Reglas {BRAND.name}</strong>
            <p>Consulta las bases generales de competencia, inscripción, resultados y conducta deportiva. El documento completo se publicará desde la plataforma.</p>
          </article>
          <article>
            <span>Club activo</span>
            <strong>{activeClubDetails?.name ?? session.activeClub?.name ?? 'Club activo'}</strong>
            <p>{activeClubDetails?.rules_pdf_url ? 'El club tiene un reglamento específico cargado.' : 'Este club todavía no tiene reglamento PDF cargado.'}</p>
            {activeClubDetails?.rules_pdf_url ? <Link href={activeClubDetails.rules_pdf_url}>Abrir reglamento del club</Link> : null}
          </article>
        </section>
      ) : (
        <>
          {mode === 'explore' ? (
            <TournamentSearch query={query} onQuery={value => updateFilters({ q: value })} category={category} onCategory={value => updateFilters({ categoria: value })} gender={gender} onGender={value => updateFilters({ rama: value })} club={clubFilter} onClub={value => updateFilters({ club: value })} onApplyFilters={filters => updateFilters({ categoria: filters.category, rama: filters.gender, club: filters.club })} clubs={Array.from(new Set(Object.values(clubs).map(club => club.name))).sort()} count={visibleTournaments.length} />
          ) : null}

          {loading ? <PlayerStatePanel kind="loading" title="Cargando torneos" message="Buscando la actividad de tu club" compact /> : null}
          {message ? <PlayerStatePanel kind="error" title="No pudimos cargar los torneos" message="Revisá tu conexión e intentá nuevamente." onRetry={() => setLoadAttempt(value => value + 1)} compact /> : null}

          {!loading && !message ? (
            mode === 'explore' ? (
              <section className="playerExploreSections">
                {!visibleTournaments.length ? <PlayerStatePanel kind="empty" title="No encontramos torneos" message="Probá otra búsqueda o quitá los filtros." compact /> : null}
                {exploreSections.filter(section => section.items.length).map((section) => (
                  <div className="playerExploreSection" key={section.key}>
                    <header>
                      <div>
                        <span>{section.title}</span>
                        <strong>{section.subtitle}</strong>
                      </div>
                      <small>{section.items.length} {section.items.length === 1 ? 'torneo' : 'torneos'}</small>
                    </header>
                    {section.items.length ? (
                      <div className="playerTournamentList clubPublicTournamentGrid">{section.items.map(renderTournamentCard)}</div>
                    ) : (
                      <div className="playerTournamentEmpty playerTournamentEmpty--section">
                        <strong>Sin torneos en esta sección</strong>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ) : mode === 'mine' ? (
              <PlayerTournamentAgenda tournaments={visibleTournaments} registrations={registrations} clubs={clubs} />
            ) : mode === 'calendar' ? (
              <section className="playerClubCalendar" aria-label="Calendario del club">
                <header className="playerClubCalendar__head">
                  <div><span>Agenda del club</span><strong>{formatCalendarMonth(calendarMonth)}</strong></div>
                  <div className="playerClubCalendar__controls"><button type="button" onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)); setSelectedCalendarDay(null) }} aria-label="Mes anterior"><ChevronLeft /></button><button type="button" onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)); setSelectedCalendarDay(null) }} aria-label="Mes siguiente"><ChevronRight /></button></div>
                </header>
                <div className="playerClubCalendar__body">
                  <div className="playerClubCalendar__grid" role="grid" aria-label={formatCalendarMonth(calendarMonth)}>
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}
                    {monthCalendarDays.map((date, index) => date ? (() => {
                      const key = calendarKey(date)
                      const events = calendarEventsByDay.get(key) ?? []
                      const selected = (selectedCalendarDay ?? '') === key || (!selectedCalendarDay && selectedCalendarEvents.some((event) => calendarKey(tournamentCalendarDate(event)!) === key))
                      return <button key={key} type="button" className={`${events.length ? 'has-events' : ''}${selected ? ' is-selected' : ''}`} onClick={() => events.length ? setSelectedCalendarDay(key) : undefined} disabled={!events.length} aria-label={`${date.getDate()} de ${formatCalendarMonth(calendarMonth)}${events.length ? `, ${events.length} torneo${events.length === 1 ? '' : 's'}` : ''}`}><b>{date.getDate()}</b>{events.length ? <i>{events.length}</i> : null}</button>
                    })() : <span className="playerClubCalendar__blank" key={`blank-${index}`} aria-hidden="true" />)}
                  </div>
                  <div className="playerClubCalendar__agenda">
                    <div className="playerClubCalendar__agendaHead"><strong>{selectedCalendarEvents.length ? 'Actividades del día' : 'Sin actividades este día'}</strong><span>{selectedCalendarEvents.length ? `${selectedCalendarEvents.length} torneo${selectedCalendarEvents.length === 1 ? '' : 's'}` : 'Elegí otro día'}</span></div>
                    {selectedCalendarEvents.length ? <div className="clubPublicTournamentGrid">{selectedCalendarEvents.map(renderTournamentCard)}</div> : <div className="playerTournamentEmpty playerTournamentEmpty--section"><strong>Sin torneos en esta sección</strong></div>}
                  </div>
                </div>
              </section>
            ) : (
              <section className="playerTournamentList">
                {visibleTournaments.length ? visibleTournaments.map(renderTournamentCard) : (
                <div className="playerTournamentEmpty">
                  <strong>Sin torneos en esta sección</strong>
                </div>
                )}
              </section>
            )
          ) : null}
        </>
      )}

      <style>{`
        .playerTournamentsShell { color: #061b3a; display: grid; gap: 16px; width: 100%; }
        .playerTournamentsHero, .playerTournamentEmpty, .playerRulesGrid article { background:#fff; border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); }
        .playerTournamentsHero { align-items: center; background: radial-gradient(circle at 12% 0%, var(--club-soft), transparent 34%), linear-gradient(135deg, #fff, #f8fbff); display: flex; justify-content: space-between; gap: 14px; padding: 16px 18px; position: relative; overflow: hidden; }
        .playerTournamentsHero::before { background: var(--club-gradient); content: ""; height: 4px; left: 22px; position: absolute; right: 22px; top: 0; }
        .playerTournamentsHero span, .playerRulesGrid span { color: var(--club-primary); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerTournamentsHero h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 950; letter-spacing: -.04em; line-height: .98; margin: 4px 0 5px; }
        .playerTournamentsHero p { color: #64748b; font-size: 13px; font-weight: 800; margin: 0; }
        .playerTournamentsBack { color:var(--club-primary); font-size:12px; font-weight:900; text-decoration:none; white-space:nowrap; }
        .playerTournamentsHero i { align-items: center; background: color-mix(in srgb, var(--club-primary) 12%, white); border: 1px solid color-mix(in srgb, var(--club-primary) 30%, white); border-radius: 16px; color: var(--club-primary); display: flex; flex: 0 0 auto; height: 48px; justify-content: center; width: 48px; }
        .playerTournamentFilters { background:transparent; border:0; box-shadow:none; display:grid; gap:8px; grid-template-columns:minmax(0,1fr) minmax(280px,.65fr); padding:0; }
        .playerTournamentSearch { align-items:center; background:#fff; border:1px solid #d5e2eb; border-radius:12px; color:#61748b; display:flex; gap:8px; min-width:0; padding:0 12px; }
        .playerTournamentSearch input { background:transparent; border:0; color:#061b3a; flex:1; font:inherit; font-size:16px; min-height:44px; min-width:0; padding:8px 0; width:100%; }
        .playerTournamentSearch input:focus { outline:0; }
        .playerTournamentSearch:focus-within { border-color:#0891b2; outline:2px solid #0891b2; outline-offset:2px; }
        .playerTournamentSearch svg { flex-shrink:0; }
        .playerTournamentQuickFilters { display:flex; gap:8px; min-width:0; }
        .playerTournamentQuickFilters select { background:#fff; border:1px solid #d5e2eb; border-radius:10px; color:#40566f; flex:1; font:inherit; font-size:16px; min-height:44px; min-width:0; padding:6px 9px; width:0; }
        .playerTournamentQuickFilters select:focus-visible { outline:2px solid #0891b2; outline-offset:2px; }
        .playerExploreSections { display: grid; gap: 18px; }
        .playerExploreSection { display: grid; gap: 10px; }
        .playerExploreSection > header { align-items: end; display: flex; justify-content: space-between; gap: 12px; padding: 0 2px; }
        .playerExploreSection > header span { color: #061b3a; display: block; font-size: 21px; font-weight: 950; letter-spacing: -.03em; }
        .playerExploreSection > header strong { color: #64748b; display: block; font-size: 12px; font-weight: 850; margin-top: 2px; }
        .playerExploreSection > header small { background: rgba(255,255,255,.86); border: 1px solid #e2e8f0; border-radius: 999px; color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 950; padding: 6px 9px; }
        .playerTournamentList { display: grid; gap: 12px; }
        .playerExploreSection .clubPublicTournamentGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .playerClubCalendar { background:rgba(255,255,255,.9); border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); display:grid; gap:12px; padding:14px; }
        .playerClubCalendar__head { align-items:center; display:flex; gap:12px; justify-content:space-between; }
        .playerClubCalendar__head span { color:var(--club-primary); display:block; font-size:10px; font-weight:950; letter-spacing:.06em; text-transform:uppercase; }
        .playerClubCalendar__head strong { color:#061b3a; display:block; font-size:20px; font-weight:950; letter-spacing:-.035em; margin-top:2px; text-transform:capitalize; }
        .playerClubCalendar__controls { display:flex; gap:6px; }
        .playerClubCalendar__controls button { align-items:center; background:#fff; border:1px solid color-mix(in srgb,var(--club-primary) 23%,#dbe6f0); border-radius:10px; color:var(--club-primary); cursor:pointer; display:flex; height:40px; justify-content:center; width:40px; }
        .playerClubCalendar__controls button:hover { background:var(--club-soft); }
        .playerClubCalendar__body { display:grid; gap:14px; grid-template-columns:minmax(0,1fr) minmax(280px,.85fr); }
        .playerClubCalendar__grid { align-items:stretch; display:grid; gap:5px; grid-template-columns:repeat(7,minmax(0,1fr)); }
        .playerClubCalendar__grid > span { color:#64748b; font-size:10px; font-weight:900; padding-bottom:2px; text-align:center; text-transform:uppercase; }
        .playerClubCalendar__grid > button, .playerClubCalendar__blank { aspect-ratio:1; min-height:42px; }
        .playerClubCalendar__grid > button { background:#f8fafc; border:1px solid #e2e8f0; border-radius:11px; color:#64748b; display:grid; font:inherit; justify-items:center; padding:5px 2px; position:relative; }
        .playerClubCalendar__grid > button:disabled { cursor:default; }
        .playerClubCalendar__grid > button.has-events { background:color-mix(in srgb,var(--club-primary) 10%,white); border-color:color-mix(in srgb,var(--club-primary) 34%,#dbe6f0); color:#061b3a; cursor:pointer; }
        .playerClubCalendar__grid > button.is-selected { background:var(--club-gradient); border-color:transparent; color:#fff; box-shadow:0 8px 18px var(--club-glow); }
        .playerClubCalendar__grid b { font-size:14px; line-height:1; }
        .playerClubCalendar__grid > button i { align-items:center; background:var(--club-secondary); border-radius:999px; color:#fff; display:flex; font-size:9px; font-style:normal; font-weight:950; height:16px; justify-content:center; min-width:16px; position:absolute; right:3px; top:3px; }
        .playerClubCalendar__agenda { display:grid; gap:8px; min-width:0; }
        .playerClubCalendar__agendaHead { align-items:end; border-bottom:1px solid #e8eef5; display:flex; gap:8px; justify-content:space-between; padding-bottom:7px; }
        .playerClubCalendar__agendaHead strong { font-size:14px; }
        .playerClubCalendar__agendaHead span { color:#64748b; font-size:11px; font-weight:800; }
        .playerClubCalendar__agenda .clubPublicTournamentGrid { display:grid; gap:8px; grid-template-columns:1fr; }
        .playerRulesGrid a { background: linear-gradient(135deg, var(--card-accent, var(--club-primary)), var(--card-accent-2, var(--club-secondary))); border-radius: 999px; color: #fff; font-size: 12px; font-weight: 950; padding: 10px 13px; text-decoration: none; white-space: nowrap; }
        .playerTournamentEmpty { color:#61748b; display:grid; justify-items:start; padding:12px; }
        .playerTournamentEmpty--section { background: rgba(255,255,255,.64); border-style: dashed; box-shadow: none; }
        .playerTournamentEmpty strong { color:#526780; font-size:13px; font-weight:600; }
        .playerTournamentEmpty p { margin: 0; }
        .playerTournamentEmpty--danger { color: #be123c; }
        .playerRulesGrid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .playerRulesGrid article { display: grid; gap: 8px; padding: 18px; }
        .playerRulesGrid strong { font-size: 22px; font-weight: 950; }
        .playerRulesGrid p { color: #64748b; font-weight: 800; line-height: 1.45; margin: 0; }
        .playerRulesGrid a { justify-self: start; margin-top: 4px; }
        @media (max-width: 820px) {
          .playerTournamentsShell { gap:12px; }
          .playerTournamentsHero { border-radius:16px; min-height:104px; padding:13px 14px; }
          .playerTournamentsHero::before { left:14px; right:14px; }
          .playerTournamentsHero h1 { font-size:25px; line-height:1.02; margin:4px 0; }
          .playerTournamentsHero p { font-size:12px; max-width:250px; }
          .playerTournamentsHero i { border-radius:13px; height:40px; width:40px; }
          .playerTournamentsHero i svg { height:21px; width:21px; }
          .playerTournamentFilters, .playerRulesGrid { display:grid; grid-template-columns:1fr; }
          .playerExploreSection .clubPublicTournamentGrid { grid-template-columns:1fr; }
          .playerClubCalendar { border-radius:16px; gap:10px; padding:10px; }
          .playerClubCalendar__head strong { font-size:18px; }
          .playerClubCalendar__controls button { height:36px; width:36px; }
          .playerClubCalendar__body { grid-template-columns:1fr; }
          .playerClubCalendar__grid { gap:4px; }
          .playerClubCalendar__grid > span { font-size:9px; }
          .playerClubCalendar__grid > button, .playerClubCalendar__blank { min-height:40px; }
          .playerClubCalendar__grid > button { border-radius:9px; }
          .playerRulesGrid a { border-radius:10px; font-size:11px; padding:8px 10px; }
        }
        @media (max-width: 390px) {
          .playerTournamentsHero h1 { font-size:23px; }
          .playerTournamentsHero p { font-size:11px; }
        }
      `}</style>
    </main></PlayerSpaceLayout>
  )
}
