'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Compass, FileText, Search, Trophy, UsersRound } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PlayerSectionHero from '@/components/player/PlayerSectionHero'
import PlayerSpaceLayout from '@/components/player/PlayerSpaceLayout'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'
import { BRAND } from '@/lib/branding'

type ViewMode = 'mine' | 'calendar' | 'explore' | 'rules'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  status: string | null
  starts_on: string | null
  start_date: string | null
  registration_deadline: string | null
  category: number | null
  gender: string | null
  price_per_player: number | null
  max_pairs: number | null
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
  theme_key: string | null
  logo_url?: string | null
  rules_pdf_url?: string | null
}

const categories = ['all', '1', '2', '3', '4', '5', '6', '7']
const genders = [
  { value: 'all', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'MIXED', label: 'Mixto' },
]

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE') return 'M'
  if (normalized === 'FEMALE') return 'F'
  return normalized || 'UNKNOWN'
}

function formatGender(value?: string | null) {
  const normalized = normalizeGender(value)
  if (normalized === 'M') return 'Masculino'
  if (normalized === 'F') return 'Femenino'
  if (normalized === 'MIXED' || normalized === 'MIXTO') return 'Mixto'
  return 'Sin rama'
}

function formatCategory(value?: number | null) {
  return value ? `${value}ta` : 'Sin categoría'
}

function isRegistrationOpen(tournament: TournamentRow) {
  const status = String(tournament.status ?? '').toUpperCase()
  if (!['OPEN', 'PUBLISHED', 'REGISTRATION_OPEN'].includes(status)) return false
  if (!tournament.registration_deadline) return true
  return tournament.registration_deadline >= new Date().toISOString().slice(0, 10)
}

function statusLabel(value?: string | null) {
  const status = String(value ?? '').toUpperCase()
  if (status === 'CONFIRMED') return 'Confirmado'
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'CANCELLED') return 'Cancelado'
  if (status === 'OPEN' || status === 'PUBLISHED' || status === 'REGISTRATION_OPEN') return 'Inscripción abierta'
  if (status === 'DRAFT') return 'Borrador'
  if (status === 'FINISHED' || status === 'COMPLETED') return 'Finalizado'
  return value || 'Por definirse'
}

type ExploreBucket = 'live' | 'open' | 'finished'

function tournamentBucket(tournament: TournamentRow): ExploreBucket {
  const status = String(tournament.status ?? '').toUpperCase()
  if (['FINISHED', 'COMPLETED', 'CLOSED'].includes(status)) return 'finished'
  if (['IN_PROGRESS', 'ACTIVE', 'LIVE', 'PLAYING', 'GROUPS', 'PLAYOFF', 'STARTED'].includes(status)) return 'live'
  return 'open'
}

function statusTone(tournament: TournamentRow) {
  const bucket = tournamentBucket(tournament)
  if (bucket === 'live') return 'live'
  if (bucket === 'finished') return 'finished'
  if (isRegistrationOpen(tournament)) return 'open'
  return 'neutral'
}

function formatMoney(value?: number | null) {
  if (!value) return null
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function dateParts(value?: string | null) {
  if (!value) return { day: '--', month: 'Fecha', year: 'a definir' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '--', month: 'Fecha', year: 'a definir' }
  return {
    day: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
    year: new Intl.DateTimeFormat('es-AR', { year: 'numeric' }).format(date),
  }
}

function pageCopy(mode: ViewMode) {
  if (mode === 'calendar') {
    return {
      kicker: 'Calendario del club',
      title: 'Torneos del club activo',
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

export default function TournamentsPlayerView({ mode }: { mode: ViewMode }) {
  const session = useSession()
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [clubs, setClubs] = useState<Record<string, ClubRow>>({})
  const [activeClubDetails, setActiveClubDetails] = useState<ClubRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [gender, setGender] = useState('all')

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
        const activeClubId = session.activeClub?.id ?? null
        const activeClubQuery = activeClubId
          ? supabase.from('clubs').select('id,name,logo_url,rules_pdf_url').eq('id', activeClubId).maybeSingle()
          : Promise.resolve({ data: null, error: null })

        let tournamentRows: TournamentRow[] = []
        let registrationRows: RegistrationRow[] = []

        if (mode === 'mine') {
          const clubIds = session.clubs.map((club) => club.id)
          if (clubIds.length) {
            const { data: teamData } = await supabase
              .from('tournament_teams')
              .select('id,club_id,tournament_id')
              .in('club_id', clubIds)
              .or(`player1_user_id.eq.${session.user.id},player2_user_id.eq.${session.user.id}`)

            const teams = (teamData ?? []) as TeamRow[]
            const teamIds = teams.map((team) => team.id)
            if (teamIds.length) {
              const { data: registrationData } = await supabase
                .from('tournament_registrations')
                .select('id,club_id,tournament_id,team_id,status,created_at')
                .in('team_id', teamIds)
                .order('created_at', { ascending: false })

              registrationRows = (registrationData ?? []) as RegistrationRow[]
              const tournamentIds = Array.from(new Set(registrationRows.map((row) => row.tournament_id)))
              if (tournamentIds.length) {
                const { data: tournamentData } = await supabase
                  .from('tournaments')
                  .select('id,club_id,name,status,starts_on,start_date,registration_deadline,category,gender,price_per_player,max_pairs')
                  .in('id', tournamentIds)
                tournamentRows = (tournamentData ?? []) as TournamentRow[]
              }
            }
          }
        } else if (mode === 'calendar') {
          if (activeClubId) {
            const { data: tournamentData } = await supabase
              .from('tournaments')
              .select('id,club_id,name,status,starts_on,start_date,registration_deadline,category,gender,price_per_player,max_pairs')
              .eq('club_id', activeClubId)
              .order('starts_on', { ascending: true, nullsFirst: false })
              .limit(24)
            tournamentRows = (tournamentData ?? []) as TournamentRow[]
          }
        } else if (mode === 'explore') {
          const { data: tournamentData } = await supabase
            .from('tournaments')
            .select('id,club_id,name,status,starts_on,start_date,registration_deadline,category,gender,price_per_player,max_pairs')
            .not('status', 'in', '("DRAFT","CANCELLED","ARCHIVED")')
            .order('starts_on', { ascending: true, nullsFirst: false })
            .limit(72)
          tournamentRows = (tournamentData ?? []) as TournamentRow[]
        }

        const clubIds = Array.from(new Set([
          ...session.clubs.map((club) => club.id),
          ...tournamentRows.map((tournament) => tournament.club_id),
        ]))
        const [activeClubResult, clubRowsResult] = await Promise.all([
          activeClubQuery,
          clubIds.length
            ? supabase.from('clubs').select('id,name,theme_key,logo_url').in('id', clubIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (!alive) return
        setActiveClubDetails((activeClubResult.data ?? null) as ClubRow | null)
        setClubs(Object.fromEntries(((clubRowsResult.data ?? []) as ClubRow[]).map((club) => [club.id, club])))
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
  }, [mode, session.activeClub?.id, session.clubs, session.status, session.user?.id])

  const registrationByTournament = useMemo(
    () => new Map(registrations.map((registration) => [registration.tournament_id, registration])),
    [registrations],
  )

  const visibleTournaments = useMemo(() => {
    const search = query.trim().toLowerCase()
    return tournaments
      .filter((tournament) => category === 'all' || String(tournament.category ?? '') === category)
      .filter((tournament) => gender === 'all' || normalizeGender(tournament.gender) === gender)
      .filter((tournament) => !search || `${tournament.name} ${clubs[tournament.club_id]?.name ?? ''}`.toLowerCase().includes(search))
      .sort((a, b) => {
        const left = new Date(a.starts_on ?? a.start_date ?? '2999-12-31').getTime()
        const right = new Date(b.starts_on ?? b.start_date ?? '2999-12-31').getTime()
        return left - right
      })
  }, [category, clubs, gender, query, tournaments])

  const exploreSections = useMemo(() => {
    const live: TournamentRow[] = []
    const open: TournamentRow[] = []
    const finished: TournamentRow[] = []

    for (const tournament of visibleTournaments) {
      const bucket = tournamentBucket(tournament)
      if (bucket === 'live') live.push(tournament)
      else if (bucket === 'finished') finished.push(tournament)
      else open.push(tournament)
    }

    return [
      { key: 'live', title: 'En juego', subtitle: 'Torneos jugándose ahora', items: live },
      { key: 'open', title: 'Inscripción abierta', subtitle: 'Próximos torneos disponibles', items: open },
      { key: 'finished', title: 'Finalizados', subtitle: 'Historial público reciente', items: finished },
    ] as const
  }, [visibleTournaments])

  function renderTournamentCard(tournament: TournamentRow) {
    const club = clubs[tournament.club_id]
    const clubTheme = getClubTheme(club?.theme_key ?? null)
    const registration = registrationByTournament.get(tournament.id)
    const canRegister = isRegistrationOpen(tournament)
    const parts = dateParts(tournament.starts_on ?? tournament.start_date)
    const money = formatMoney(tournament.price_per_player)
    const tone = statusTone(tournament)
    const logoUrl = buildAssetProxyUrl(club?.logo_url ?? null)

    return (
      <article
        className="playerTournamentCard"
        key={tournament.id}
        style={{
          ['--card-accent' as string]: clubTheme.vars.accent,
          ['--card-accent-2' as string]: clubTheme.vars.accent2,
          ['--card-glow' as string]: clubTheme.vars.glow,
          ['--card-soft' as string]: clubTheme.vars.soft,
        }}
      >
        <div className="playerTournamentCard__date">
          <strong>{parts.day}</strong>
          <span>{parts.month}</span>
          <small>{parts.year}</small>
        </div>
        <div className="playerTournamentCard__main">
          <div className="playerTournamentCard__club">
            <span className="playerTournamentClubMark">
              {logoUrl ? <img src={logoUrl} alt="" /> : getClubInitials(club?.name)}
            </span>
            <b>{club?.name ?? `Club ${BRAND.name}`}</b>
          </div>
          <strong>{tournament.name}</strong>
          <p>{formatCategory(tournament.category)} · {formatGender(tournament.gender)}</p>
          <div className="playerTournamentCard__meta">
            <span className={`playerTournamentStatus playerTournamentStatus--${tone}`}>{registration ? statusLabel(registration.status) : statusLabel(tournament.status)}</span>
            {money ? <span>{money}</span> : null}
            {tournament.max_pairs ? <span><UsersRound size={12} /> Hasta {tournament.max_pairs} parejas</span> : null}
          </div>
        </div>
        <div className="playerTournamentCard__actions">
          <Link href={`/torneos/${tournament.id}`}>Ver torneo</Link>
          {canRegister && !registration ? <Link href={`/torneos/${tournament.id}/inscripcion`}>Inscribirme</Link> : null}
        </div>
      </article>
    )
  }

  return (
    <PlayerSpaceLayout><main className="playerTournamentsShell">
      <PlayerSectionHero badge={copy.kicker} title={copy.title} description={copy.body} icon={<Icon />} />

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
            <section className="playerTournamentFilters">
              <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'Todas' : `${item}ta`}</option>)}</select></label>
              <label><span>Género</span><select value={gender} onChange={(event) => setGender(event.target.value)}>{genders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="playerTournamentSearch"><span>Buscar</span><div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Torneo o club" /></div></label>
            </section>
          ) : null}

          {loading ? <PlayerStatePanel kind="loading" title="Cargando torneos" message="Buscando la actividad de tu club" compact /> : null}
          {message ? <PlayerStatePanel kind="error" title="No pudimos cargar los torneos" message="Revisá tu conexión e intentá nuevamente." action={{ label: 'Volver a Mi espacio', href: '/player' }} compact /> : null}

          {!loading && !message ? (
            mode === 'explore' ? (
              <section className="playerExploreSections">
                {exploreSections.map((section) => (
                  <div className="playerExploreSection" key={section.key}>
                    <header>
                      <div>
                        <span>{section.title}</span>
                        <strong>{section.subtitle}</strong>
                      </div>
                      <small>{section.items.length} {section.items.length === 1 ? 'torneo' : 'torneos'}</small>
                    </header>
                    {section.items.length ? (
                      <div className="playerTournamentList">{section.items.map(renderTournamentCard)}</div>
                    ) : (
                      <div className="playerTournamentEmpty playerTournamentEmpty--section">
                        <Trophy size={18} />
                        <strong>Sin torneos en esta sección</strong>
                        <p>No hay eventos que coincidan con los filtros actuales.</p>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ) : (
              <section className="playerTournamentList">
                {visibleTournaments.length ? visibleTournaments.map(renderTournamentCard) : (
                <div className="playerTournamentEmpty">
                  <Trophy size={20} />
                  <strong>Sin torneos para mostrar</strong>
                  <p>{mode === 'mine' ? 'Cuando te inscribas a un torneo, va a aparecer acá.' : 'No hay torneos disponibles con estos criterios.'}</p>
                </div>
                )}
              </section>
            )
          ) : null}
        </>
      )}

      <style>{`
        .playerTournamentsShell { color: #061b3a; display: grid; gap: 16px; width: 100%; }
        .playerTournamentsHero, .playerTournamentFilters, .playerTournamentCard, .playerTournamentEmpty, .playerRulesGrid article { background:#fff; border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); }
        .playerTournamentsHero { align-items: center; background: radial-gradient(circle at 12% 0%, var(--club-soft), transparent 34%), linear-gradient(135deg, #fff, #f8fbff); display: flex; justify-content: space-between; gap: 14px; padding: 16px 18px; position: relative; overflow: hidden; }
        .playerTournamentsHero::before { background: var(--club-gradient); content: ""; height: 4px; left: 22px; position: absolute; right: 22px; top: 0; }
        .playerTournamentsHero span, .playerTournamentFilters span, .playerRulesGrid span { color: var(--club-primary); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerTournamentsHero h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 950; letter-spacing: -.04em; line-height: .98; margin: 4px 0 5px; }
        .playerTournamentsHero p { color: #64748b; font-size: 13px; font-weight: 800; margin: 0; }
        .playerTournamentsHero i { align-items: center; background: color-mix(in srgb, var(--club-primary) 12%, white); border: 1px solid color-mix(in srgb, var(--club-primary) 30%, white); border-radius: 16px; color: var(--club-primary); display: flex; flex: 0 0 auto; height: 48px; justify-content: center; width: 48px; }
        .playerTournamentFilters { display: grid; gap: 12px; grid-template-columns: 160px 160px minmax(0, 1fr); padding: 13px; }
        .playerTournamentFilters label { display: grid; gap: 6px; min-width: 0; }
        .playerTournamentFilters select, .playerTournamentFilters input { background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; color: #061b3a; font: inherit; font-weight: 850; min-width: 0; padding: 10px 11px; }
        .playerTournamentSearch div { align-items: center; background: #f8fafc; border: 1px solid #dbe6f0; border-radius: 12px; display: flex; gap: 8px; padding-left: 10px; }
        .playerTournamentSearch input { background: transparent; border: 0; flex: 1; }
        .playerExploreSections { display: grid; gap: 18px; }
        .playerExploreSection { display: grid; gap: 10px; }
        .playerExploreSection > header { align-items: end; display: flex; justify-content: space-between; gap: 12px; padding: 0 2px; }
        .playerExploreSection > header span { color: #061b3a; display: block; font-size: 21px; font-weight: 950; letter-spacing: -.03em; }
        .playerExploreSection > header strong { color: #64748b; display: block; font-size: 12px; font-weight: 850; margin-top: 2px; }
        .playerExploreSection > header small { background: rgba(255,255,255,.86); border: 1px solid #e2e8f0; border-radius: 999px; color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 950; padding: 6px 9px; }
        .playerTournamentList { display: grid; gap: 12px; }
        .playerTournamentCard { align-items: stretch; background: radial-gradient(circle at 0% 0%, var(--card-soft), transparent 32%), rgba(255,255,255,.94); border-color: color-mix(in srgb, var(--card-accent) 20%, #e2e8f0); display: grid; gap: 15px; grid-template-columns: 108px minmax(0, 1fr) auto; overflow: hidden; padding: 14px; position: relative; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .playerTournamentCard::before { background: linear-gradient(180deg, var(--card-accent), var(--card-accent-2)); bottom: 14px; content: ""; left: 0; position: absolute; top: 14px; width: 4px; }
        .playerTournamentCard:hover { border-color: color-mix(in srgb, var(--card-accent) 42%, #e2e8f0); box-shadow: 0 22px 58px rgba(15,23,42,.1), 0 0 0 5px var(--card-glow); transform: translateY(-1px); }
        .playerTournamentCard__date { align-content: center; background: linear-gradient(180deg, #fff, #f8fbff); border: 1px solid color-mix(in srgb, var(--card-accent) 24%, #e2e8f0); border-radius: 18px; color: #061b3a; display: grid; justify-items: center; min-height: 104px; padding: 10px; text-align: center; }
        .playerTournamentCard__date strong { font-size: 34px; font-weight: 950; letter-spacing: -.06em; line-height: .9; }
        .playerTournamentCard__date span { color: var(--card-accent); font-size: 13px; font-weight: 950; text-transform: uppercase; }
        .playerTournamentCard__date small { color: #64748b; font-size: 11px; font-weight: 900; }
        .playerTournamentCard__main { min-width: 0; }
        .playerTournamentCard__club { align-items: center; display: flex; gap: 8px; margin-bottom: 7px; min-width: 0; }
        .playerTournamentClubMark { align-items: center; background: #061b3a; border: 1px solid color-mix(in srgb, var(--card-accent) 34%, white); border-radius: 12px; color: #fff; display: inline-flex; flex: 0 0 auto; font-size: 10px; font-weight: 950; height: 34px; justify-content: center; overflow: hidden; width: 34px; }
        .playerTournamentClubMark img { height: 100%; object-fit: cover; width: 100%; }
        .playerTournamentCard__club b { color: #475569; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .playerTournamentCard__main > strong { color: #061b3a; display: block; font-size: clamp(20px, 2.4vw, 28px); font-weight: 950; letter-spacing: -.035em; line-height: 1.02; overflow-wrap: anywhere; }
        .playerTournamentCard__main p { color: #64748b; font-size: 13px; font-weight: 850; margin: 6px 0 10px; }
        .playerTournamentCard__meta { display: flex; flex-wrap: wrap; gap: 7px; }
        .playerTournamentCard__meta span { align-items: center; background: color-mix(in srgb, var(--card-accent) 8%, white); border: 1px solid color-mix(in srgb, var(--card-accent) 22%, white); border-radius: 999px; color: #075985; display: inline-flex; gap: 5px; font-size: 11px; font-weight: 950; padding: 5px 8px; }
        .playerTournamentStatus--live { background: rgba(34,197,94,.12) !important; border-color: rgba(34,197,94,.28) !important; color: #047857 !important; }
        .playerTournamentStatus--open { background: color-mix(in srgb, var(--card-accent) 12%, white) !important; color: #075985 !important; }
        .playerTournamentStatus--finished { background: #f1f5f9 !important; border-color: #e2e8f0 !important; color: #64748b !important; }
        .playerTournamentStatus--neutral { background: #fff7ed !important; border-color: #fed7aa !important; color: #9a3412 !important; }
        .playerTournamentCard__actions { align-content: center; display: grid; gap: 8px; justify-items: end; min-width: 126px; }
        .playerTournamentCard__actions a, .playerRulesGrid a { background: linear-gradient(135deg, var(--card-accent, var(--club-primary)), var(--card-accent-2, var(--club-secondary))); border-radius: 999px; color: #fff; font-size: 12px; font-weight: 950; padding: 10px 13px; text-decoration: none; white-space: nowrap; }
        .playerTournamentCard__actions a:first-child { background: #fff; border: 1px solid color-mix(in srgb, var(--card-accent, var(--club-primary)) 34%, #e2e8f0); color: #075985; }
        .playerTournamentEmpty { color: #64748b; display: grid; gap: 6px; justify-items: start; padding: 18px; }
        .playerTournamentEmpty--section { background: rgba(255,255,255,.64); border-style: dashed; box-shadow: none; }
        .playerTournamentEmpty strong { color: #061b3a; font-weight: 950; }
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
          .playerTournamentCard { align-items:start; border-radius:16px; gap:9px; grid-template-columns:62px minmax(0,1fr); min-height:126px; padding:10px; }
          .playerTournamentCard::before { bottom:10px; top:10px; width:3px; }
          .playerTournamentCard__date { border-radius:13px; min-height:66px; padding:6px; }
          .playerTournamentCard__date strong { font-size:27px; }
          .playerTournamentCard__date span { font-size:10px; }
          .playerTournamentCard__date small { font-size:9px; }
          .playerTournamentCard__club { gap:6px; margin-bottom:4px; }
          .playerTournamentClubMark { border-radius:9px; height:24px; width:24px; }
          .playerTournamentCard__club b { font-size:10px; }
          .playerTournamentCard__main > strong { font-size:18px; letter-spacing:0; line-height:1.08; }
          .playerTournamentCard__main p { font-size:11px; margin:4px 0 7px; }
          .playerTournamentCard__meta { gap:5px; }
          .playerTournamentCard__meta span { font-size:10px; padding:4px 7px; }
          .playerTournamentCard__actions { align-items:center; display:flex; gap:7px; grid-column:2; justify-content:flex-end; justify-items:initial; min-width:0; }
          .playerTournamentCard__actions a, .playerRulesGrid a { border-radius:10px; font-size:11px; padding:8px 10px; }
          .playerTournamentCard__main strong { white-space:normal; }
        }
        @media (max-width: 390px) {
          .playerTournamentsHero h1 { font-size:23px; }
          .playerTournamentsHero p { font-size:11px; }
          .playerTournamentCard { grid-template-columns:58px minmax(0,1fr); padding:9px; }
          .playerTournamentCard__date { min-height:62px; }
          .playerTournamentCard__main > strong { font-size:17px; }
          .playerTournamentCard__actions a:first-child { padding-inline:9px; }
        }
      `}</style>
    </main></PlayerSpaceLayout>
  )
}
