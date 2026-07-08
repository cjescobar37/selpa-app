'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Newspaper,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { getClubTheme } from '@/lib/clubThemes'
import { BRAND } from '@/lib/branding'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'
import PublicHomeEmbed from '@/components/public/PublicHomeEmbed'
import ModeSegmentedControl, { type HomeMode } from '@/components/ModeSegmentedControl'

type ClubPlayerRow = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  approved_at: string | null
}

type TournamentRow = {
  id: string
  club_id: string
  name: string
  starts_on: string | null
  start_date: string | null
  ends_on?: string | null
  end_date?: string | null
  status: string | null
  type?: string | null
  tournament_type?: string | null
  category: number | null
  category_id?: number | null
  gender: string | null
  segment?: string | null
  registration_deadline?: string | null
  signup_deadline?: string | null
  price_per_player?: number | null
  max_pairs?: number | null
  rules_json?: Record<string, unknown> | null
}

type TeamRow = {
  id: string
  club_id: string
  tournament_id: string
  player1_user_id: string
  player2_user_id: string
}

type RegistrationRow = {
  id: string
  tournament_id: string
  club_id: string
  team_id: string
  status: string | null
  created_at: string
}

type MatchRow = {
  id: string
  club_id: string
  tournament_id: string
  team1_id: string
  team2_id: string
  status: string | null
  winner_team_id: string | null
  score: unknown
  scheduled_at: string | null
  created_at: string
}

type PartnerPlayer = {
  id: string
  user_id: string
  full_name: string
  avatar_url: string | null
}

type ActivePartnership = {
  id: string
  club_id: string
  player1_club_player_id: string
  player2_club_player_id: string
  status: string
  accepted_at: string | null
  created_at: string
  player1?: PartnerPlayer | null
  player2?: PartnerPlayer | null
}

type PartnerInvite = {
  id: string
  club_id: string
  sender_club_player_id: string
  receiver_club_player_id: string
  status: string
  created_at: string
  sender?: PartnerPlayer | null
  receiver?: PartnerPlayer | null
}

type ClubContentNotice = {
  id: string
  clubId: string
  clubName: string
  title: string
  body: string
}

type ClubThemeRow = {
  id: string
  theme_key: string | null
}

function normalizeGender(gender: string | null) {
  const value = String(gender ?? '').toUpperCase()
  if (value === 'M' || value === 'MALE') return 'Masculino'
  if (value === 'F' || value === 'FEMALE') return 'Femenino'
  if (value === 'MIXED' || value === 'MIXTO') return 'Mixto'
  return gender ?? 'Sin rama'
}

function formatDate(value: string | null) {
  if (!value) return 'Fecha a definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha a definir'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function registrationStatusView(status: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized.includes('CANCEL')) return { label: 'Cancelado', tone: 'cancelled' }
  if (normalized.includes('PENDING') || normalized.includes('WAITING')) return { label: 'Pendiente', tone: 'pending' }
  if (normalized.includes('CONFIRM') || normalized.includes('APPROV')) return { label: 'Confirmado', tone: 'confirmed' }
  return { label: status ? status.replace(/_/g, ' ') : 'Inscripto', tone: 'neutral' }
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] ?? 'P'}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function PlayerHomeLoader() {
  return (
    <>
      <div className="playerHomeShell playerHomeShell--loading">
        <div className="playerHomePanel playerHomePanel--loading">
          <div className="px-loginLoading" role="status" aria-live="polite">
            <span className="px-loginLoading__mark" aria-hidden="true">
              <span className="px-spinner" />
            </span>
            <div>
              <strong>Ingresando...</strong>
              <p>Preparando tu espacio</p>
            </div>
            <span className="px-loginLoading__line" aria-hidden="true" />
          </div>
        </div>
      </div>
      <style>{`
        .playerHomeShell--loading {
          align-items: start;
          background:
            radial-gradient(circle at 8% 0%, rgba(34,211,238,.16), transparent 34%),
            #f3f7fb;
          color: #061b3a;
          display: grid;
          margin: 0 auto;
          max-width: 1180px;
          min-height: 132px;
          padding: 18px;
          width: 100%;
        }
        .playerHomePanel--loading {
          align-items: center;
          background: rgba(255,255,255,.86);
          border: 1px solid rgba(226,232,240,.86);
          border-radius: 18px;
          box-shadow: 0 14px 34px rgba(15,23,42,.06);
          display: flex;
          justify-content: center;
          min-height: 108px;
          padding: 14px;
        }
        @media (max-width: 560px) {
          .playerHomeShell--loading {
            min-height: 112px;
            padding: 8px;
          }
          .playerHomePanel--loading {
            min-height: 92px;
            padding: 12px;
          }
        }
      `}</style>
    </>
  )
}

export default function PlayerHomePage() {
  const session = useSession()
  const [players, setPlayers] = useState<ClubPlayerRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [myTeams, setMyTeams] = useState<TeamRow[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [partnerships, setPartnerships] = useState<ActivePartnership[]>([])
  const [invites, setInvites] = useState<PartnerInvite[]>([])
  const [clubThemeKeys, setClubThemeKeys] = useState<Record<string, string | null>>({})
  const [loadingData, setLoadingData] = useState(true)
  const [hasLoadedData, setHasLoadedData] = useState(false)
  const [message, setMessage] = useState('')
  const [homeMode, setHomeMode] = useState<HomeMode>('space')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('selpa.player.homeMode')
    if (stored === 'space' || stored === 'community') setHomeMode(stored)
  }, [])

  function changeHomeMode(mode: HomeMode) {
    setHomeMode(mode)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('selpa.player.homeMode', mode)
    }
  }

  const clubsById = useMemo(() => new Map(session.clubs.map((club) => [club.id, club])), [session.clubs])
  const playerByClubId = useMemo(() => new Map(players.map((player) => [player.club_id, player])), [players])
  const pendingInvites = invites.filter((invite) => invite.status === 'PENDING')
  const activeClub = session.activeClubId ? clubsById.get(session.activeClubId) : undefined
  const activePlayer = activeClub ? playerByClubId.get(activeClub.id) : undefined
  const activeTheme = getClubTheme(session.activeClubId ? clubThemeKeys[session.activeClubId] : null)
  const activeCategoryLabel = activePlayer?.category ? `Categoría ${activePlayer.category}` : 'Categoría por definir'
  const activePositionLabel = activePlayer ? 'Posición por definir' : 'Sin ranking'
  const activePointsLabel = `${activePlayer?.ranking_points ?? 0} pts`
  const activePartnerName = useMemo(() => {
    const activePartnership = partnerships.find((partnership) => (
      activeClub ? partnership.club_id === activeClub.id : true
    ))
    if (!activePartnership) return '-'

    const player = playerByClubId.get(activePartnership.club_id)
    const partner = activePartnership.player1_club_player_id === player?.id
      ? activePartnership.player2
      : activePartnership.player1

    return partner?.full_name ?? '-'
  }, [activeClub, partnerships, playerByClubId])

  const upcomingTournaments = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return tournaments
      .filter((tournament) => {
        const dateValue = tournament.starts_on ?? tournament.start_date
        if (!dateValue) return true
        const date = new Date(dateValue)
        return Number.isNaN(date.getTime()) || date >= now
      })
      .sort((a, b) => {
        const left = new Date(a.starts_on ?? a.start_date ?? '2999-12-31').getTime()
        const right = new Date(b.starts_on ?? b.start_date ?? '2999-12-31').getTime()
        return left - right
      })
      .slice(0, 8)
  }, [tournaments])

  const tournamentById = useMemo(() => new Map(tournaments.map((tournament) => [tournament.id, tournament])), [tournaments])
  const teamIds = useMemo(() => myTeams.map((team) => team.id), [myTeams])
  const nextTournament = upcomingTournaments[0]
  const nextTournamentClub = nextTournament ? clubsById.get(nextTournament.club_id) : undefined
  const priorityInvite = pendingInvites[0]
  const priorityInviteClub = priorityInvite ? clubsById.get(priorityInvite.club_id) : undefined
  const priorityInvitePlayer = priorityInvite
    ? (
        priorityInvite.sender_club_player_id === playerByClubId.get(priorityInvite.club_id)?.id
          ? priorityInvite.receiver
          : priorityInvite.sender
      )
    : null
  const sortedPlayerClubs = useMemo(() => {
    return [...session.clubs].sort((left, right) => {
      if (left.id === session.activeClubId) return -1
      if (right.id === session.activeClubId) return 1
      return left.name.localeCompare(right.name)
    })
  }, [session.activeClubId, session.clubs])
  const myTournamentCards = useMemo(() => {
    return registrations
      .map((registration) => {
        const tournament = tournamentById.get(registration.tournament_id)
        if (!tournament) return null
        return { registration, tournament, club: clubsById.get(registration.club_id) }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const left = new Date(a!.tournament.starts_on ?? a!.tournament.start_date ?? a!.registration.created_at).getTime()
        const right = new Date(b!.tournament.starts_on ?? b!.tournament.start_date ?? b!.registration.created_at).getTime()
        return right - left
      })
      .slice(0, 6)
  }, [clubsById, registrations, tournamentById])

  const recentMatches = useMemo(() => {
    return matches
      .filter((match) => String(match.status ?? '').toUpperCase() === 'PLAYED')
      .sort((a, b) => String(b.scheduled_at ?? b.created_at).localeCompare(String(a.scheduled_at ?? a.created_at)))
      .slice(0, 5)
  }, [matches])

  const clubNewsFallbacks: ClubContentNotice[] = useMemo(() => (
    session.clubs.slice(0, 3).map((club) => ({
      id: `fallback-${club.id}`,
      clubId: club.id,
      clubName: club.name,
      title: 'Sin noticias publicadas',
      body: 'Cuando el club active su contenido propio, vas a verlo acá.',
    }))
  ), [session.clubs])

  useEffect(() => {
    let alive = true

    async function loadPlayerHome() {
      if (session.status === 'loading') return
      if (!session.user) {
        setLoadingData(false)
        setHasLoadedData(true)
        return
      }

      if (!hasLoadedData) setLoadingData(true)
      setMessage('')

      try {
        const clubIds = session.clubs.map((club) => club.id)
        const [playersResult, themesResult] = await Promise.all([
          supabase
            .from('club_players')
            .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at')
            .eq('user_id', session.user.id),
          clubIds.length
            ? supabase
                .from('clubs')
                .select('id,theme_key')
                .in('id', clubIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (playersResult.error) throw playersResult.error
        if (themesResult.error) throw themesResult.error

        let tournamentRows: TournamentRow[] = []
        let teamRows: TeamRow[] = []
        let registrationRows: RegistrationRow[] = []
        let matchRows: MatchRow[] = []
        if (clubIds.length) {
          const { data: tournamentData, error: tournamentError } = await supabase
            .from('tournaments')
            .select('id,club_id,name,starts_on,start_date,ends_on,end_date,status,type,tournament_type,category,category_id,gender,segment,registration_deadline,signup_deadline,price_per_player,max_pairs,rules_json')
            .in('club_id', clubIds)
            .order('starts_on', { ascending: true, nullsFirst: false })
            .limit(12)

          if (!tournamentError) tournamentRows = (tournamentData ?? []) as TournamentRow[]
        }

        if (clubIds.length) {
          const { data: teamData } = await supabase
            .from('tournament_teams')
            .select('id,club_id,tournament_id,player1_user_id,player2_user_id')
            .in('club_id', clubIds)
            .or(`player1_user_id.eq.${session.user.id},player2_user_id.eq.${session.user.id}`)

          teamRows = (teamData ?? []) as TeamRow[]
          const ids = teamRows.map((team) => team.id)

          if (ids.length) {
            const [{ data: registrationData }, matchesAsOne, matchesAsTwo] = await Promise.all([
              supabase
                .from('tournament_registrations')
                .select('id,tournament_id,club_id,team_id,status,created_at')
                .in('team_id', ids)
                .order('created_at', { ascending: false }),
              supabase
                .from('tournament_matches')
                .select('id,club_id,tournament_id,team1_id,team2_id,status,winner_team_id,score,scheduled_at,created_at')
                .in('club_id', clubIds)
                .in('team1_id', ids),
              supabase
                .from('tournament_matches')
                .select('id,club_id,tournament_id,team1_id,team2_id,status,winner_team_id,score,scheduled_at,created_at')
                .in('club_id', clubIds)
                .in('team2_id', ids),
            ])

            registrationRows = (registrationData ?? []) as RegistrationRow[]
            const missingTournamentIds = Array.from(new Set(registrationRows.map((row) => row.tournament_id)))
              .filter((id) => !tournamentRows.some((tournament) => tournament.id === id))

            if (missingTournamentIds.length) {
              const { data: registeredTournamentData } = await supabase
                .from('tournaments')
                .select('id,club_id,name,starts_on,start_date,ends_on,end_date,status,type,tournament_type,category,category_id,gender,segment,registration_deadline,signup_deadline,price_per_player,max_pairs,rules_json')
                .in('id', missingTournamentIds)
              tournamentRows = [...tournamentRows, ...((registeredTournamentData ?? []) as TournamentRow[])]
            }

            const byId = new Map<string, MatchRow>()
            for (const match of [...((matchesAsOne.data ?? []) as MatchRow[]), ...((matchesAsTwo.data ?? []) as MatchRow[])]) {
              byId.set(match.id, match)
            }
            matchRows = Array.from(byId.values())
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        let activeRows: ActivePartnership[] = []
        let inviteRows: PartnerInvite[] = []

        if (token && clubIds.length) {
          const partnerResults = await Promise.all(clubIds.map(async (clubId) => {
            const [activeRes, invitesRes] = await Promise.all([
              fetch(`/api/clubs/${clubId}/active-partnerships`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
              }),
              fetch(`/api/clubs/${clubId}/partner-invites`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
              }),
            ])
            const activeJson = await activeRes.json().catch(() => ({ partnerships: [] }))
            const invitesJson = await invitesRes.json().catch(() => ({ invites: [] }))
            return {
              partnerships: activeRes.ok ? (activeJson.partnerships ?? []) as ActivePartnership[] : [],
              invites: invitesRes.ok ? (invitesJson.invites ?? []) as PartnerInvite[] : [],
            }
          }))

          activeRows = partnerResults.flatMap((result) => result.partnerships)
          inviteRows = partnerResults.flatMap((result) => result.invites)
        }

        if (!alive) return
        setPlayers((playersResult.data ?? []) as ClubPlayerRow[])
        setClubThemeKeys(Object.fromEntries(((themesResult.data ?? []) as ClubThemeRow[]).map((row) => [row.id, row.theme_key])))
        setTournaments(tournamentRows)
        setMyTeams(teamRows)
        setRegistrations(registrationRows)
        setMatches(matchRows)
        setPartnerships(activeRows)
        setInvites(inviteRows)
      } catch (error: unknown) {
        if (!alive) return
        setMessage(error instanceof Error ? error.message : 'No pude cargar el inicio del jugador.')
      } finally {
        if (alive) {
          setHasLoadedData(true)
          setLoadingData(false)
        }
      }
    }

    void loadPlayerHome()

    return () => {
      alive = false
    }
  }, [hasLoadedData, session.status, session.user?.id, session.clubs])

  async function activateClub(clubId: string) {
    try {
      await session.setActiveClub(clubId)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No pude activar el club.')
    }
  }

  if ((session.status === 'loading' || loadingData) && !hasLoadedData) {
    return <PlayerHomeLoader />
  }

  if (!session.user) {
    return (
      <div className="playerHomeShell">
        <div className="playerHomePanel playerHomePanel--empty">
          <h1>Entrá a tu cuenta {BRAND.name}</h1>
          <p>Necesitás iniciar sesión para ver tus clubes, torneos e invitaciones.</p>
          <Link href="/login">Iniciar sesión</Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="playerHomeShell"
      style={{
        ['--active-club-accent' as string]: activeTheme.vars.accent,
        ['--active-club-accent-2' as string]: activeTheme.vars.accent2,
        ['--active-club-hero' as string]: activeTheme.vars.hero,
        ['--active-club-glow' as string]: activeTheme.vars.glow,
        ['--active-club-soft' as string]: activeTheme.vars.soft,
      }}
    >
      <ModeSegmentedControl value={homeMode} onChange={changeHomeMode} />
      <div className={`homeModePane${homeMode === 'community' ? ' is-community' : ''}`}>
      {homeMode === 'community' ? (
        <PublicHomeEmbed userName={session.user.name} />
      ) : (
      <>
      <section className="playerHomeHero">
        <div>
          <span className="playerHomeKicker">Inicio jugador</span>
          <h1>Hola, {session.user.name}</h1>
          <p>
            {activeClub ? (
              <>
                Estás dentro del club{' '}
                <Link href={`/clubs/${activeClub.id}`} className="playerHomeHeroClubLink">
                  {activeClub.name}
                </Link>
                .
              </>
            ) : (
              `Elegí un club para empezar a operar en ${BRAND.name}.`
            )}
          </p>
          {message ? <div className="playerHomeMessage">{message}</div> : null}
        </div>
        <div className="playerHomeHeroCard" aria-label="Resumen deportivo actual">
          <span className="playerHomeHeroCard__club">{activeClub?.name ?? 'Sin club activo'}</span>
          <div className="playerHomeHeroStats">
            <span>
              <small>Categoría</small>
              <strong>{activeCategoryLabel.replace('Categoría ', '')}</strong>
            </span>
            <span>
              <small>Puntos</small>
              <strong>{activePointsLabel}</strong>
            </span>
            <span>
              <small>Posición</small>
              <strong>{activePositionLabel}</strong>
            </span>
          </div>
        </div>
      </section>

      <section className="playerPriorityPanel" aria-label="Acción principal del jugador">
        {priorityInvite ? (
          <a href="#pareja-activa" className="playerPriorityCard playerPriorityCard--urgent">
            <span>Invitación pendiente</span>
            <strong>{priorityInvitePlayer?.full_name ?? 'Tenés una invitación'}</strong>
            <small>{priorityInviteClub?.name ?? 'Club'} · respondé cuando puedas</small>
            <b>Ver invitación <ChevronRight size={16} /></b>
          </a>
        ) : nextTournament ? (
          <Link href={`/torneos/${nextTournament.id}`} className="playerPriorityCard">
            <span>Próximo torneo</span>
            <strong>{nextTournament.name}</strong>
            <small>{nextTournamentClub?.name ?? 'Club'} · {formatDate(nextTournament.starts_on ?? nextTournament.start_date)}</small>
            <b>Ver torneo <ChevronRight size={16} /></b>
          </Link>
        ) : activeClub ? (
          <Link href={`/player/${activeClub.id}`} className="playerPriorityCard">
            <span>Club activo</span>
            <strong>{activeClub.name}</strong>
            <small>{activePlayer ? `${activePlayer.category ?? 'Sin cat.'} · ${normalizeGender(activePlayer.gender)}` : 'Tu espacio deportivo del club'}</small>
            <b>Entrar al club <ChevronRight size={16} /></b>
          </Link>
        ) : (
          <Link href="/torneos" className="playerPriorityCard">
            <span>Explorar</span>
            <strong>Buscá tu próximo torneo</strong>
            <small>Encontrá actividad abierta en la comunidad.</small>
            <b>Ver torneos <ChevronRight size={16} /></b>
          </Link>
        )}

        <div className="playerPrioritySide">
          <a href="#mis-torneos">
            <Trophy size={16} />
            <span>Mis torneos</span>
            <strong>{myTournamentCards.length}</strong>
          </a>
          <a href="#pareja-activa">
            <UsersRound size={16} />
            <span>{pendingInvites.length ? 'Invitaciones' : 'Pareja'}</span>
            <strong>{pendingInvites.length || activePartnerName}</strong>
          </a>
        </div>
      </section>

      <section className="playerQuickGrid playerQuickGrid--secondary">
        <Link href={activeClub ? `/player/${activeClub.id}` : '#clubes-activos'}>
          <ShieldCheck size={18} />
          <span>Club activo</span>
          <strong>{activeClub?.name ?? 'Elegir'}</strong>
        </Link>
        <a href="#clubes-activos">
          <ShieldCheck size={18} />
          <span>Clubes</span>
          <strong>{session.clubs.length}</strong>
        </a>
        <Link href="/torneos">
          <CalendarDays size={18} />
          <span>Calendario</span>
          <strong>{upcomingTournaments.length}</strong>
        </Link>
        <Link href="/perfil">
          <UserRound size={18} />
          <span>Perfil</span>
          <strong>Ver</strong>
        </Link>
      </section>

      <section className="playerSection playerClubSection" id="clubes-activos">
        <header className="playerSectionHeader">
          <div>
            <span className="playerHomeKicker">Club deportivo</span>
            <h2>{activeClub ? 'Tu club activo' : 'Elegí dónde operar'}</h2>
          </div>
          {activeClub && session.clubs.length > 1 ? <span className="playerClubSwitchHint">Cambiar club</span> : null}
        </header>
        {session.clubs.length ? (
          <div className="playerClubGrid">
            {sortedPlayerClubs.map((club) => {
              const player = playerByClubId.get(club.id)
              const isActive = session.activeClubId === club.id
              const theme = getClubTheme(clubThemeKeys[club.id])
              return (
                <article
                  key={club.id}
                  className={`playerClubCard${isActive ? ' is-active' : ''}`}
                  style={{
                    ['--club-accent' as string]: theme.vars.accent,
                    ['--club-accent-2' as string]: theme.vars.accent2,
                    ['--club-soft' as string]: theme.vars.soft,
                  }}
                >
                  <div className="playerClubLogo">
                    {club.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={club.logoUrl} alt="" />
                    ) : initials(club.name)}
                  </div>
                  <div>
                    <strong>{club.name}</strong>
                    <span>{player ? `${player.category ?? 'Sin cat.'} · ${normalizeGender(player.gender)}` : 'Jugador vinculado'}</span>
                    {isActive ? <em>Activo</em> : null}
                  </div>
                  <div className="playerClubActions">
                    <Link href={`/player/${club.id}`}>Entrar al club</Link>
                    {!isActive ? (
                      <button type="button" onClick={() => activateClub(club.id)}>
                        Activar
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="playerEmptyState">
            <ShieldCheck size={20} />
            <strong>Todavía no tenés clubes activos</strong>
            <span>Pedí el alta en un club para empezar a competir.</span>
            <Link href="/clubs">Ver clubes</Link>
          </div>
        )}
      </section>

      <section className="playerDashboardGrid">
        <article className="playerSection playerSection--flat">
          <header>
            <span className="playerHomeKicker">Todos tus clubes</span>
            <h2>Agenda competitiva</h2>
          </header>
          <div className="playerTournamentCards">
            {upcomingTournaments.length ? upcomingTournaments.slice(0, 3).map((tournament) => {
              const club = clubsById.get(tournament.club_id)
              return (
                <TournamentPublicCard
                  key={tournament.id}
                  tournament={{
                    id: tournament.id,
                    name: tournament.name,
                    status: tournament.status ?? 'DRAFT',
                    type: tournament.type,
                    tournament_type: tournament.tournament_type,
                    gender: tournament.gender ?? '',
                    segment: tournament.segment ?? tournament.rules_json?.segment as string | null,
                    category: tournament.category_id ?? tournament.category,
                    startDate: tournament.starts_on ?? tournament.start_date,
                    endDate: tournament.ends_on ?? tournament.end_date,
                    registrationDeadline: tournament.registration_deadline ?? tournament.signup_deadline,
                    pricePerPlayer: tournament.price_per_player,
                    maxPairs: tournament.max_pairs,
                    clubName: club?.name ?? 'Club',
                    clubLogoUrl: club?.logoUrl ?? null,
                    clubThemeKey: clubThemeKeys[tournament.club_id] ?? null,
                    rules: tournament.rules_json ?? {},
                  }}
                  showClub
                />
              )
            }) : (
              <div className="playerEmptyState playerEmptyState--compact">
                <CalendarDays size={18} />
                <strong>Sin torneos próximos</strong>
                <span>Cuando tus clubes publiquen torneos, aparecerán acá.</span>
              </div>
            )}
          </div>
        </article>

        <article className="playerSection playerSection--flat" id="mis-torneos">
          <header>
            <span className="playerHomeKicker">Inscripciones</span>
            <h2>Mis torneos</h2>
          </header>
          <div className="playerTournamentList">
            {myTournamentCards.length ? myTournamentCards.map((item) => {
              if (!item) return null
              const status = registrationStatusView(item.registration.status)
              const tournamentDate = formatDate(item.tournament.starts_on ?? item.tournament.start_date)
              return (
                <Link key={item.registration.id} href={`/torneos/${item.tournament.id}`} className="playerMyTournamentCard">
                  <div className="playerMyTournamentCard__body">
                    <span className={`playerMyTournamentCard__status is-${status.tone}`}>{status.label}</span>
                    <strong>{item.tournament.name}</strong>
                    <small>{item.club?.name ?? 'Club'}</small>
                    <em>{tournamentDate}</em>
                  </div>
                  <span className="playerMyTournamentCard__cta" aria-hidden="true">
                    <ChevronRight size={17} />
                  </span>
                </Link>
              )
            }) : (
              <div className="playerEmptyState playerEmptyState--compact">
                <Trophy size={18} />
                <strong>Sin torneos inscriptos</strong>
                <span>Cuando confirmes una pareja en un torneo, lo vas a ver acá.</span>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="playerDashboardGrid">
        <article className="playerSection playerSection--flat" id="pareja-activa">
          <header>
            <span className="playerHomeKicker">Pareja activa</span>
            <h2>Vínculos e invitaciones</h2>
          </header>
          <div className="playerPartnerList">
            {partnerships.length ? partnerships.map((partnership) => {
              const player = playerByClubId.get(partnership.club_id)
              const partner = partnership.player1_club_player_id === player?.id ? partnership.player2 : partnership.player1
              const club = clubsById.get(partnership.club_id)
              return partner ? (
                <div key={partnership.id} className="playerPartnerCard">
                  <span>{partner.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={partner.avatar_url} alt="" />
                  ) : initials(partner.full_name)}</span>
                  <div>
                    <strong>{partner.full_name}</strong>
                    <small>{club?.name ?? 'Club'} · activa desde {formatDate(partnership.accepted_at ?? partnership.created_at)}</small>
                  </div>
                </div>
              ) : null
            }) : (
              <div className="playerEmptyState playerEmptyState--compact">
                <UsersRound size={18} />
                <strong>Sin pareja activa</strong>
                <span>Cuando aceptes una invitación, la vas a ver destacada acá.</span>
              </div>
            )}

            {pendingInvites.length ? (
              <div className="playerInviteStack">
                <b><Bell size={15} /> Invitaciones pendientes</b>
                {pendingInvites.map((invite) => {
                  const player = playerByClubId.get(invite.club_id)
                  const other = invite.sender_club_player_id === player?.id ? invite.receiver : invite.sender
                  const club = clubsById.get(invite.club_id)
                  return (
                    <div key={invite.id}>
                      <span>{other?.full_name ?? 'Jugador'}</span>
                      <small>{club?.name ?? 'Club'} · {formatDate(invite.created_at)}</small>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </article>

        <article className="playerSection playerSection--flat">
          <header>
            <span className="playerHomeKicker">Resumen deportivo</span>
            <h2>Ranking y últimos partidos</h2>
          </header>
          <div className="playerSportSummary">
            {players.length ? players.map((player) => {
              const club = clubsById.get(player.club_id)
              return (
                <Link key={player.id} href={`/player/${player.club_id}`}>
                  <span>{club?.name ?? 'Club'}</span>
                  <strong>{player.ranking_points ?? 0} pts</strong>
                  <small>{player.category ?? 'Cat.'} · {normalizeGender(player.gender)}</small>
                </Link>
              )
            }) : (
              <div className="playerEmptyState playerEmptyState--compact">
                <Trophy size={18} />
                <strong>Sin ranking todavía</strong>
                <span>Sumate a un club para ver tus puntos.</span>
              </div>
            )}

            {recentMatches.length ? (
              <div className="playerRecentStack">
                <b><Swords size={15} /> Últimos partidos</b>
                {recentMatches.map((match) => {
                  const ownTeamId = teamIds.includes(match.team1_id) ? match.team1_id : match.team2_id
                  const result = match.winner_team_id === ownTeamId ? 'Ganado' : 'Perdido'
                  const club = clubsById.get(match.club_id)
                  return (
                    <div key={match.id}>
                      <span>{result}</span>
                      <small>{club?.name ?? 'Club'} · {formatDate(match.scheduled_at ?? match.created_at)}</small>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="playerSection playerNewsSection">
        <header>
          <span className="playerHomeKicker">Noticias</span>
          <h2>Contenido de tus clubes</h2>
        </header>
        <div className="playerNewsGrid">
          {clubNewsFallbacks.length ? clubNewsFallbacks.map((notice) => (
            <article key={notice.id}>
              <Newspaper size={18} />
              <span>{notice.clubName}</span>
              <strong>{notice.title}</strong>
              <p>{notice.body}</p>
            </article>
          )) : (
            <div className="playerEmptyState playerEmptyState--compact">
              <Newspaper size={18} />
              <strong>Sin noticias por ahora</strong>
              <span>Cuando te sumes a un club, su contenido aparecerá acá.</span>
            </div>
          )}
        </div>
      </section>
      </>
      )}
      </div>

      <style>{`
        .playerHomeShell { background:
          radial-gradient(circle at 8% 0%, var(--active-club-glow, rgba(34,211,238,.16)), transparent 34%),
          radial-gradient(circle at 94% 8%, color-mix(in srgb, var(--active-club-accent-2, #ec4899) 12%, transparent), transparent 30%),
          #f3f7fb;
          color: #061b3a;
          display: grid;
          gap: 16px;
          margin: 0 auto;
          max-width: 1180px;
          padding: 18px;
          width: 100%;
        }
        .playerHomePanel, .playerHomeHero, .playerSection, .playerQuickGrid {
          background: rgba(255,255,255,.86);
          border: 1px solid rgba(226,232,240,.86);
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(15,23,42,.07);
        }
        .playerHomePanel { padding: 22px; }
        .playerHomePanel--empty { display: grid; gap: 10px; justify-items: start; }
        .playerHomePanel--empty h1 { font-size: 28px; margin: 0; }
        .playerHomePanel--empty p { color: #64748b; font-weight: 750; margin: 0; }
        .playerHomePanel--empty a { background: #0ea5e9; border-radius: 999px; color: #fff; font-weight: 900; padding: 10px 14px; text-decoration: none; }
        .homeModePane {
          animation: modeFadeIn .22s ease both;
          display: grid;
          gap: 16px;
          min-width: 0;
        }
        .homeModePane.is-community {
          display: block;
        }
        .modePublicHomeEmbed {
          animation: modeFadeIn .22s ease both;
          margin: 0 -18px;
        }
        .modeEmbedState {
          background: rgba(255,255,255,.86);
          border: 1px solid rgba(226,232,240,.86);
          border-radius: 18px;
          color: #475569;
          font-weight: 850;
          padding: 18px;
        }
        @keyframes modeFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .playerHomeHero {
          align-items: center;
          background:
            radial-gradient(circle at 30% 0%, var(--active-club-soft, rgba(103,232,249,.20)), transparent 34%),
            linear-gradient(135deg, var(--active-club-hero, rgba(8,47,73,.96), rgba(15,23,42,.92) 52%, rgba(67,16,57,.88)));
          color: #fff;
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) 190px;
          overflow: hidden;
          padding: 26px;
          position: relative;
        }
        .playerHomeHero::after { background: linear-gradient(90deg, var(--active-club-accent, #06b6d4), var(--active-club-accent-2, #ec4899)); content: ""; height: 3px; left: 26px; position: absolute; right: 26px; top: 0; }
        .playerHomeKicker { color: #0891b2; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerHomeHero .playerHomeKicker { color: color-mix(in srgb, var(--active-club-accent, #67e8f9) 76%, white); }
        .playerHomeHero h1 { font-size: clamp(32px, 5vw, 58px); font-weight: 950; letter-spacing: -.03em; line-height: .98; margin: 7px 0 10px; }
        .playerHomeHero p { color: rgba(255,255,255,.76); font-size: 16px; font-weight: 750; margin: 0; max-width: 640px; }
        .playerHomeHeroClubLink { color: #fff; font-weight: 950; text-decoration: none; text-shadow: 0 8px 22px rgba(0,0,0,.22); transition: color .18s ease, text-shadow .18s ease; }
        .playerHomeHeroClubLink:hover { color: color-mix(in srgb, var(--active-club-accent, #67e8f9) 74%, white); text-shadow: 0 0 18px color-mix(in srgb, var(--active-club-accent, #67e8f9) 38%, transparent); }
        .playerHomeHeroCard { align-items: stretch; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18); border-radius: 20px; display: grid; gap: 10px; padding: 13px; }
        .playerHomeHeroCard__club { color: rgba(255,255,255,.78); font-size: 11px; font-weight: 950; letter-spacing: .035em; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .playerHomeHeroStats { display: grid; gap: 7px; }
        .playerHomeHeroStats span { background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; display: grid; gap: 3px; padding: 10px; }
        .playerHomeHeroStats small { color: rgba(255,255,255,.62); font-size: 9px; font-weight: 950; letter-spacing: .04em; line-height: 1; text-transform: uppercase; }
        .playerHomeHeroStats strong { color: #fff; font-size: 17px; font-weight: 950; letter-spacing: -.025em; line-height: 1.02; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerHomeMessage { background: rgba(251,113,133,.13); border: 1px solid rgba(251,113,133,.26); border-radius: 12px; color: #ffe4e6; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .playerPriorityPanel {
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(0, 1fr) 260px;
        }
        .playerPriorityCard,
        .playerPrioritySide a {
          background: rgba(255,255,255,.9);
          border: 1px solid rgba(226,232,240,.92);
          border-radius: 18px;
          box-shadow: 0 16px 38px rgba(15,23,42,.07);
          color: #061b3a;
          min-width: 0;
          text-decoration: none;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .playerPriorityCard {
          display: grid;
          gap: 6px;
          overflow: hidden;
          padding: 17px 18px;
          position: relative;
        }
        .playerPriorityCard::before {
          background: linear-gradient(180deg, var(--active-club-accent, #06b6d4), var(--active-club-accent-2, #ec4899));
          bottom: 14px;
          border-radius: 999px;
          content: "";
          left: 0;
          position: absolute;
          top: 14px;
          width: 4px;
        }
        .playerPriorityCard--urgent {
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--active-club-accent, #06b6d4) 10%, white), #fff);
          border-color: color-mix(in srgb, var(--active-club-accent, #06b6d4) 38%, #e2e8f0);
        }
        .playerPriorityCard--urgent::before {
          bottom: 10px;
          top: 10px;
          width: 5px;
        }
        .playerPriorityCard:hover,
        .playerPrioritySide a:hover {
          border-color: color-mix(in srgb, var(--active-club-accent, #06b6d4) 34%, #e2e8f0);
          box-shadow: 0 18px 42px color-mix(in srgb, var(--active-club-accent, #06b6d4) 11%, rgba(15,23,42,.08));
          transform: translateY(-1px);
        }
        .playerPriorityCard span,
        .playerPrioritySide span {
          color: #64748b;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .playerPriorityCard strong {
          font-size: clamp(20px, 3vw, 30px);
          font-weight: 950;
          letter-spacing: -.035em;
          line-height: 1.02;
          max-width: 22ch;
        }
        .playerPriorityCard small {
          color: #475569;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.25;
        }
        .playerPriorityCard b {
          align-items: center;
          color: color-mix(in srgb, var(--active-club-accent, #0891b2) 70%, #061b3a);
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          gap: 5px;
          margin-top: 2px;
        }
        .playerPriorityCard b svg,
        .playerPrioritySide a svg {
          transition: transform .18s ease;
        }
        .playerPriorityCard:hover b svg {
          transform: translateX(3px);
        }
        .playerPrioritySide {
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr;
        }
        .playerPrioritySide a {
          align-items: center;
          display: grid;
          gap: 4px 10px;
          grid-template-columns: 28px minmax(0, 1fr);
          padding: 12px;
        }
        .playerPrioritySide svg {
          color: var(--active-club-accent, #0891b2);
          grid-row: 1 / span 2;
        }
        .playerPrioritySide strong {
          color: #061b3a;
          font-size: 19px;
          font-weight: 950;
          line-height: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .playerQuickGrid { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 12px; }
        .playerQuickGrid a { align-content: center; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid #e2e8f0; border-radius: 16px; color: #061b3a; display: grid; gap: 4px 10px; grid-template-columns: 26px minmax(0, 1fr); min-height: 72px; min-width: 0; padding: 13px; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .playerQuickGrid a:hover { border-color: color-mix(in srgb, var(--active-club-accent, #0891b2) 35%, #e2e8f0); box-shadow: 0 12px 24px rgba(15,23,42,.06); transform: translateY(-1px); }
        .playerQuickGrid span { align-self: end; color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: .03em; min-width: 0; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .playerQuickGrid strong { color: #061b3a; display: block; font-size: 17px; font-weight: 950; grid-column: 2; line-height: 1.05; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerQuickGrid svg { align-self: center; color: var(--active-club-accent, #0891b2); flex: 0 0 auto; grid-row: 1 / span 2; }
        .playerSection { display: grid; gap: 13px; padding: 18px; }
        .playerSection--flat { align-content: start; box-shadow: 0 14px 36px rgba(15,23,42,.06); }
        .playerSectionHeader { align-items: end; display: flex; gap: 12px; justify-content: space-between; }
        .playerSection header h2 { font-size: 22px; font-weight: 950; letter-spacing: -.02em; margin: 3px 0 0; }
        .playerClubSwitchHint { border: 1px solid color-mix(in srgb, var(--active-club-accent, #06b6d4) 28%, #dbeafe); border-radius: 999px; color: color-mix(in srgb, var(--active-club-accent, #0891b2) 72%, #061b3a); flex: 0 0 auto; font-size: 11px; font-weight: 950; padding: 7px 10px; }
        .playerClubGrid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .playerClubCard { align-items: center; background:
          radial-gradient(circle at 0% 0%, var(--club-soft, rgba(103,232,249,.14)), transparent 34%),
          linear-gradient(135deg, #fff, #f8fbff);
          border: 1px solid color-mix(in srgb, var(--club-accent, #06b6d4) 14%, #e2e8f0);
          border-radius: 18px;
          display: grid;
          gap: 12px;
          grid-template-columns: 50px minmax(0, 1fr) auto;
          padding: 12px;
          position: relative;
          overflow: hidden;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
        }
        .playerClubCard::before { background: linear-gradient(180deg, var(--club-accent, #06b6d4), var(--club-accent-2, #ec4899)); border-radius: 999px; bottom: 15px; content: ""; left: 0; opacity: .45; position: absolute; top: 15px; width: 3px; }
        .playerClubCard:hover { border-color: color-mix(in srgb, var(--club-accent, #06b6d4) 30%, #e2e8f0); box-shadow: 0 14px 30px rgba(15,23,42,.07); transform: translateY(-1px); }
        .playerClubCard.is-active {
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--club-accent, #06b6d4) 22%, transparent), transparent 40%),
            radial-gradient(circle at 100% 12%, color-mix(in srgb, var(--club-accent-2, #ec4899) 15%, transparent), transparent 35%),
            linear-gradient(135deg, #fff, #f8fbff);
          border-color: color-mix(in srgb, var(--club-accent, #06b6d4) 52%, #e2e8f0);
          box-shadow: 0 20px 44px color-mix(in srgb, var(--club-accent, #06b6d4) 15%, transparent), 0 0 0 1px color-mix(in srgb, var(--club-accent, #06b6d4) 10%, transparent);
          transform: translateY(-2px);
        }
        .playerClubCard.is-active::before { bottom: 10px; opacity: .95; top: 10px; width: 5px; }
        .playerClubLogo, .playerPartnerCard > span { align-items: center; background: linear-gradient(135deg, var(--club-accent, #0ea5e9), #172554); border-radius: 16px; color: #fff; display: flex; font-weight: 950; height: 50px; justify-content: center; overflow: hidden; width: 50px; }
        .playerClubCard.is-active .playerClubLogo { box-shadow: 0 12px 24px color-mix(in srgb, var(--club-accent, #06b6d4) 22%, transparent); }
        .playerClubLogo img, .playerPartnerCard img { height: 100%; object-fit: cover; width: 100%; }
        .playerClubCard strong { display: block; font-size: 15px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerClubCard span { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 3px; }
        .playerClubCard em { background: linear-gradient(135deg, var(--club-accent, #06b6d4), var(--club-accent-2, #ec4899)); border-radius: 999px; color: #fff; display: inline-flex; font-size: 10px; font-style: normal; font-weight: 950; letter-spacing: .03em; margin-top: 8px; padding: 4px 8px; text-transform: uppercase; }
        .playerClubActions { align-items: end; display: grid; gap: 7px; justify-items: end; }
        .playerClubActions a { background: linear-gradient(135deg, var(--club-accent, #0ea5e9), #0891b2); border-radius: 999px; color: #fff; font-size: 12px; font-weight: 950; padding: 8px 11px; text-decoration: none; white-space: nowrap; }
        .playerClubActions button { background: rgba(255,255,255,.72); border: 1px solid color-mix(in srgb, var(--club-accent, #06b6d4) 28%, #e2e8f0); border-radius: 999px; color: #0e7490; cursor: pointer; font: inherit; font-size: 11px; font-weight: 950; padding: 7px 9px; }
        .playerDashboardGrid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); }
        .playerTournamentCards { display: grid; gap: 12px; grid-template-columns: 1fr; }
        .playerTournamentCards :global(.TournamentPublicCard) { --tournament-card-height: 286px; height: 286px; min-height: 286px; }
        .playerTournamentList, .playerPartnerList, .playerInviteStack { display: grid; gap: 9px; }
        .playerMyTournamentCard { align-items: center; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148,163,184,.28); border-radius: 16px; color: #061b3a; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) 38px; min-width: 0; padding: 13px; text-decoration: none; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease, background .18s ease; }
        .playerMyTournamentCard:hover { border-color: rgba(14,165,233,.34); box-shadow: 0 14px 30px rgba(15,23,42,.08); transform: translateY(-1px); }
        .playerMyTournamentCard__body { display: grid; gap: 5px; min-width: 0; }
        .playerMyTournamentCard__status { border: 1px solid rgba(14,165,233,.18); border-radius: 999px; color: #075985; display: inline-flex; font-size: 10px; font-weight: 950; justify-self: start; letter-spacing: .04em; line-height: 1; padding: 5px 8px; text-transform: uppercase; width: fit-content; }
        .playerMyTournamentCard__status.is-pending { background: rgba(245,158,11,.10); border-color: rgba(245,158,11,.24); color: #92400e; }
        .playerMyTournamentCard__status.is-confirmed { background: rgba(16,185,129,.11); border-color: rgba(16,185,129,.24); color: #047857; }
        .playerMyTournamentCard__status.is-cancelled { background: rgba(244,63,94,.10); border-color: rgba(244,63,94,.24); color: #be123c; }
        .playerMyTournamentCard__status.is-neutral { background: rgba(14,165,233,.10); }
        .playerMyTournamentCard strong { display: block; font-size: 15px; font-weight: 950; line-height: 1.1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerMyTournamentCard small { color: #475569; display: block; font-size: 12px; font-weight: 850; line-height: 1.2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerMyTournamentCard em { color: #64748b; display: block; font-size: 12px; font-style: normal; font-weight: 850; line-height: 1.2; }
        .playerMyTournamentCard__cta { align-items: center; background: #061b3a; border: 1px solid rgba(14,165,233,.24); border-radius: 999px; color: #fff; display: inline-flex; height: 34px; justify-content: center; justify-self: end; transition: transform .18s ease, background .18s ease; width: 34px; }
        .playerMyTournamentCard:hover .playerMyTournamentCard__cta { background: #020817; transform: translateX(2px); }
        .playerPartnerCard { align-items: center; background: linear-gradient(135deg, #f8fafc, rgba(236,253,255,.72)); border: 1px solid rgba(103,232,249,.32); border-radius: 16px; display: grid; gap: 12px; grid-template-columns: 50px minmax(0, 1fr); padding: 12px; }
        .playerPartnerCard strong { display: block; font-size: 16px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerPartnerCard small { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 3px; }
        .playerInviteStack { border-top: 1px solid #e2e8f0; margin-top: 3px; padding-top: 12px; }
        .playerInviteStack b { align-items: center; color: #0e7490; display: flex; font-size: 12px; font-weight: 950; gap: 6px; text-transform: uppercase; }
        .playerInviteStack div { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; display: grid; gap: 2px; padding: 10px; }
        .playerInviteStack span { color: #061b3a; font-weight: 900; }
        .playerInviteStack small { color: #64748b; font-weight: 800; }
        .playerSportSummary { display: grid; gap: 9px; }
        .playerSportSummary > a { background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid #e2e8f0; border-radius: 14px; color: #061b3a; display: grid; gap: 3px; padding: 11px 12px; text-decoration: none; }
        .playerSportSummary > a span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .playerSportSummary > a strong { font-size: 20px; font-weight: 950; }
        .playerSportSummary > a small { color: #64748b; font-weight: 800; }
        .playerRecentStack { border-top: 1px solid #e2e8f0; display: grid; gap: 8px; margin-top: 4px; padding-top: 12px; }
        .playerRecentStack b { align-items: center; color: #0e7490; display: flex; font-size: 12px; font-weight: 950; gap: 6px; text-transform: uppercase; }
        .playerRecentStack div { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; display: grid; gap: 2px; padding: 10px; }
        .playerRecentStack span { color: #061b3a; font-weight: 900; }
        .playerRecentStack small { color: #64748b; font-weight: 800; }
        .playerNewsGrid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .playerNewsGrid article { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; display: grid; gap: 7px; padding: 14px; }
        .playerNewsGrid svg { color: #0891b2; }
        .playerNewsGrid span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .playerNewsGrid strong { font-size: 16px; font-weight: 950; overflow-wrap: anywhere; }
        .playerNewsGrid p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .playerEmptyState { align-items: start; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 16px; color: #64748b; display: grid; gap: 6px; justify-items: start; padding: 16px; }
        .playerEmptyState strong { color: #061b3a; font-weight: 950; }
        .playerEmptyState a { background: #0ea5e9; border-radius: 999px; color: #fff; font-weight: 950; margin-top: 4px; padding: 8px 11px; text-decoration: none; }
        .playerEmptyState--compact { padding: 13px; }
        @media (max-width: 980px) {
          .playerHomeHero, .playerDashboardGrid, .playerPriorityPanel { grid-template-columns: 1fr; }
          .playerPrioritySide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .playerQuickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .playerClubGrid, .playerNewsGrid { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .playerHomeShell {
            gap: 10px;
            padding: 8px;
          }
          .homeModePane {
            gap: 10px;
          }
          .modePublicHomeEmbed {
            margin: 0 -8px;
          }
          .playerHomePanel, .playerHomeHero, .playerSection, .playerQuickGrid {
            border-radius: 16px;
            box-shadow: 0 10px 26px rgba(15,23,42,.055);
          }
          .playerHomeHero {
            align-items: start;
            gap: 10px;
            grid-template-columns: minmax(0, 1fr);
            padding: 13px;
          }
          .playerHomeHero::after {
            height: 2px;
            left: 13px;
            right: 13px;
          }
          .playerHomeKicker {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .035em;
          }
          .playerHomeHero h1 {
            font-size: clamp(26px, 10vw, 34px);
            font-weight: 850;
            line-height: .96;
            margin: 4px 0 6px;
          }
          .playerHomeHero p {
            font-size: 13px;
            font-weight: 650;
            line-height: 1.28;
            max-width: 100%;
          }
          .playerHomeHeroCard {
            gap: 7px;
            padding: 9px;
            text-align: left;
            width: 100%;
          }
          .playerHomeHeroCard__club {
            font-size: 9px;
            font-weight: 800;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .playerHomeHeroStats {
            gap: 6px;
            grid-template-columns: .72fr .76fr 1fr;
          }
          .playerHomeHeroStats span {
            border-radius: 11px;
            gap: 2px;
            min-width: 0;
            padding: 7px;
          }
          .playerHomeHeroStats small {
            font-size: 8px;
            font-weight: 800;
          }
          .playerHomeHeroStats strong {
            font-size: 12px;
            font-weight: 850;
          }
          .playerPriorityPanel {
            gap: 7px;
          }
          .playerPriorityCard {
            border-radius: 15px;
            gap: 4px;
            padding: 12px 13px 12px 15px;
          }
          .playerPriorityCard::before {
            bottom: 12px;
            top: 12px;
            width: 3px;
          }
          .playerPriorityCard span,
          .playerPrioritySide span {
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .025em;
          }
          .playerPriorityCard strong {
            font-size: 19px;
            font-weight: 850;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .playerPriorityCard small {
            font-size: 11px;
            font-weight: 650;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .playerPriorityCard b {
            font-size: 12px;
            font-weight: 850;
          }
          .playerPrioritySide {
            gap: 7px;
          }
          .playerPrioritySide a {
            border-radius: 13px;
            gap: 2px 8px;
            grid-template-columns: 22px minmax(0, 1fr);
            padding: 9px;
          }
          .playerPrioritySide svg {
            height: 15px;
            width: 15px;
          }
          .playerPrioritySide strong {
            font-size: 14px;
            font-weight: 850;
          }
          .playerQuickGrid {
            gap: 7px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            padding: 7px;
          }
          .playerQuickGrid--secondary {
            display: none;
          }
          .playerQuickGrid a {
            border-radius: 13px;
            gap: 2px 8px;
            grid-template-columns: 22px minmax(0, 1fr);
            min-height: 58px;
            padding: 9px;
          }
          .playerQuickGrid svg {
            height: 16px;
            width: 16px;
          }
          .playerQuickGrid span {
            font-size: 9px;
            font-weight: 800;
            letter-spacing: .02em;
          }
          .playerQuickGrid strong {
            font-size: 14px;
            font-weight: 850;
          }
          .playerSection {
            gap: 10px;
            padding: 12px;
          }
          .playerClubSection {
            background: rgba(255,255,255,.72);
            box-shadow: 0 8px 20px rgba(15,23,42,.045);
          }
          .playerSectionHeader {
            align-items: center;
          }
          .playerSection header h2 {
            font-size: 19px;
            font-weight: 850;
            line-height: 1.04;
            margin-top: 2px;
          }
          .playerClubSwitchHint {
            font-size: 10px;
            font-weight: 700;
            padding: 6px 8px;
          }
          .playerClubGrid,
          .playerTournamentCards,
          .playerTournamentList,
          .playerPartnerList,
          .playerSportSummary,
          .playerNewsGrid {
            gap: 8px;
          }
          .playerClubCard {
            border-radius: 14px;
            gap: 9px;
            grid-template-columns: 38px minmax(0, 1fr);
            padding: 10px;
          }
          .playerClubCard:not(.is-active) {
            background: #fff;
            box-shadow: none;
          }
          .playerClubCard:not(.is-active)::before {
            opacity: .18;
          }
          .playerClubLogo, .playerPartnerCard > span {
            border-radius: 12px;
            height: 38px;
            width: 38px;
          }
          .playerClubCard strong {
            font-size: 14px;
            font-weight: 850;
          }
          .playerClubCard span {
            font-size: 11px;
            font-weight: 650;
            margin-top: 2px;
          }
          .playerClubActions { grid-column: 1 / -1; grid-template-columns: auto auto; justify-content: start; justify-items: start; }
          .playerMyTournamentCard {
            align-items: center;
            border-radius: 13px;
            gap: 9px;
            grid-template-columns: minmax(0, 1fr) 30px;
            padding: 10px;
          }
          .playerMyTournamentCard__body {
            gap: 4px;
          }
          .playerMyTournamentCard__status {
            font-size: 9px;
            font-weight: 800;
            padding: 4px 7px;
          }
          .playerMyTournamentCard strong { white-space: normal; }
          .playerMyTournamentCard small,
          .playerMyTournamentCard em {
            font-size: 11px;
          }
          .playerMyTournamentCard__cta {
            height: 30px;
            width: 30px;
          }
          .playerPartnerCard,
          .playerSportSummary > a,
          .playerRecentStack div,
          .playerInviteStack div,
          .playerNewsGrid article,
          .playerEmptyState {
            border-radius: 13px;
            padding: 10px;
          }
          .playerEmptyState--compact {
            padding: 10px;
          }
          .playerNewsSection {
            display: none;
          }
        }
        @media (max-width: 390px) {
          .playerHomeHeroStats {
            grid-template-columns: 1fr 1fr;
          }
          .playerHomeHeroStats span:last-child {
            grid-column: 1 / -1;
          }
          .playerQuickGrid a {
            min-height: 54px;
            padding: 8px;
          }
          .playerQuickGrid strong {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  )
}
