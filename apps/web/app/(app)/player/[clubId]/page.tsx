'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Newspaper,
  ShieldCheck,
  Swords,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { supabase } from '@/lib/supabaseClient'
import { getClubTheme } from '@/lib/clubThemes'

type ClubRow = {
  id: string
  name: string
  city: string | null
  logo_url: string | null
  brand_name: string | null
  theme_key: string | null
}

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
  status: string | null
  starts_on: string | null
  start_date: string | null
  registration_deadline: string | null
  signup_deadline: string | null
  category: number | null
  gender: string | null
}

type TeamRow = {
  id: string
  tournament_id: string
  player1_user_id: string
  player2_user_id: string
}

type MatchRow = {
  id: string
  tournament_id: string
  team1_id: string
  team2_id: string
  status: string
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

function formatDate(value: string | null) {
  if (!value) return 'Fecha a definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha a definir'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'M' || normalized === 'MALE') return 'Caballeros'
  if (normalized === 'F' || normalized === 'FEMALE') return 'Damas'
  if (normalized === 'MIXED' || normalized === 'MIXTO') return 'Mixto'
  return 'Sin rama'
}

function initials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] ?? 'C'}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function scoreLabel(score: unknown) {
  if (!score) return 'Sin score'
  if (typeof score === 'string') return score
  if (typeof score === 'object' && 'text' in score && typeof (score as { text?: unknown }).text === 'string') return (score as { text: string }).text
  return 'Resultado cargado'
}

export default function PlayerClubHomePage() {
  const params = useParams<{ clubId: string }>()
  const clubId = params?.clubId
  const session = useSession()
  const [club, setClub] = useState<ClubRow | null>(null)
  const [player, setPlayer] = useState<ClubPlayerRow | null>(null)
  const [rankPosition, setRankPosition] = useState<number | null>(null)
  const [openTournaments, setOpenTournaments] = useState<TournamentRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [activePartnership, setActivePartnership] = useState<ActivePartnership | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [message, setMessage] = useState('')

  const sessionClub = session.clubs.find((item) => item.id === clubId) ?? null
  const clubTheme = getClubTheme(club?.theme_key)
  const displayClubName = club?.brand_name || club?.name || sessionClub?.name || 'Club'
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams])
  const recentMatches = useMemo(() => matches
    .filter((match) => String(match.status).toUpperCase() === 'PLAYED')
    .sort((a, b) => String(b.scheduled_at ?? b.created_at).localeCompare(String(a.scheduled_at ?? a.created_at)))
    .slice(0, 5), [matches])
  const wins = recentMatches.filter((match) => match.winner_team_id && teamIds.includes(match.winner_team_id)).length
  const activePartner = activePartnership && player
    ? activePartnership.player1_club_player_id === player.id
      ? activePartnership.player2
      : activePartnership.player1
    : null

  useEffect(() => {
    let alive = true

    async function loadClubHome() {
      if (session.status === 'loading') return
      if (!session.user || !clubId) {
        setLoading(false)
        setHasLoaded(true)
        return
      }

      if (!hasLoaded) setLoading(true)
      setMessage('')

      try {
        const [{ data: clubData }, { data: playerData, error: playerError }] = await Promise.all([
          supabase
            .from('clubs')
            .select('id,name,city,logo_url,brand_name,theme_key')
            .eq('id', clubId)
            .maybeSingle(),
          supabase
            .from('club_players')
            .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at')
            .eq('club_id', clubId)
            .eq('user_id', session.user.id)
            .maybeSingle(),
        ])

        if (playerError) throw playerError
        const currentPlayer = (playerData ?? null) as ClubPlayerRow | null

        let rank: number | null = null
        const { data: rankingRows } = await supabase
          .from('club_players')
          .select('id,ranking_points,approved_at')
          .eq('club_id', clubId)
          .not('approved_at', 'is', null)
          .order('ranking_points', { ascending: false })

        if (currentPlayer && rankingRows && rankingRows.length > 0) {
          const index = rankingRows.findIndex((row) => row.id === currentPlayer.id)
          rank = index >= 0 ? index + 1 : null
        }

        const today = new Date().toISOString().slice(0, 10)
        const { data: tournamentData } = await supabase
          .from('tournaments')
          .select('id,club_id,name,status,starts_on,start_date,registration_deadline,signup_deadline,category,gender')
          .eq('club_id', clubId)
          .in('status', ['OPEN', 'PUBLISHED'])
          .or(`starts_on.gte.${today},start_date.gte.${today},starts_on.is.null,start_date.is.null`)
          .order('starts_on', { ascending: true, nullsFirst: false })
          .limit(6)

        const openRows = ((tournamentData ?? []) as TournamentRow[])
          .filter((tournament) => {
            const deadline = tournament.registration_deadline ?? tournament.signup_deadline
            return !deadline || deadline >= today
          })

        let teamRows: TeamRow[] = []
        let matchRows: MatchRow[] = []
        if (currentPlayer) {
          const { data: teamsData } = await supabase
            .from('tournament_teams')
            .select('id,tournament_id,player1_user_id,player2_user_id')
            .eq('club_id', clubId)
            .or(`player1_user_id.eq.${currentPlayer.user_id},player2_user_id.eq.${currentPlayer.user_id}`)
          teamRows = (teamsData ?? []) as TeamRow[]
          const ids = teamRows.map((team) => team.id)
          if (ids.length) {
            const [matchesAsOne, matchesAsTwo] = await Promise.all([
              supabase
                .from('tournament_matches')
                .select('id,tournament_id,team1_id,team2_id,status,winner_team_id,score,scheduled_at,created_at')
                .eq('club_id', clubId)
                .in('team1_id', ids),
              supabase
                .from('tournament_matches')
                .select('id,tournament_id,team1_id,team2_id,status,winner_team_id,score,scheduled_at,created_at')
                .eq('club_id', clubId)
                .in('team2_id', ids),
            ])
            const byId = new Map<string, MatchRow>()
            for (const match of [...((matchesAsOne.data ?? []) as MatchRow[]), ...((matchesAsTwo.data ?? []) as MatchRow[])]) byId.set(match.id, match)
            matchRows = Array.from(byId.values())
          }
        }

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        let partnership: ActivePartnership | null = null
        if (token) {
          const activeRes = await fetch(`/api/clubs/${clubId}/active-partnerships`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })
          const activeJson = await activeRes.json().catch(() => ({ partnerships: [] }))
          const rows = activeRes.ok ? (activeJson.partnerships ?? []) as ActivePartnership[] : []
          partnership = currentPlayer
            ? rows.find((row) => row.status === 'ACTIVE' && (row.player1_club_player_id === currentPlayer.id || row.player2_club_player_id === currentPlayer.id)) ?? null
            : null
        }

        if (!alive) return
        setClub((clubData ?? null) as ClubRow | null)
        setPlayer(currentPlayer)
        setRankPosition(rank)
        setOpenTournaments(openRows)
        setTeams(teamRows)
        setMatches(matchRows)
        setActivePartnership(partnership)
      } catch {
        if (!alive) return
        setMessage('No pudimos cargar este espacio del club. Intentá nuevamente en unos instantes.')
      } finally {
        if (alive) {
          setHasLoaded(true)
          setLoading(false)
        }
      }
    }

    void loadClubHome()

    return () => {
      alive = false
    }
  }, [clubId, hasLoaded, session.status, session.user?.id])

  async function activateThisClub() {
    if (!clubId) return
    try {
      await session.setActiveClub(clubId)
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No pude activar el club.')
    }
  }

  if ((session.status === 'loading' || loading) && !hasLoaded) {
    return <div className="playerClubHome"><PlayerStatePanel kind="loading" title="Cargando club" message="Preparando tu espacio deportivo" viewport /></div>
  }

  return (
    <div
      className="playerClubHome"
      style={{
        ['--club-accent' as string]: clubTheme.vars.accent,
        ['--club-accent-2' as string]: clubTheme.vars.accent2,
        ['--club-hero' as string]: clubTheme.vars.hero,
        ['--club-glow' as string]: clubTheme.vars.glow,
        ['--club-soft' as string]: clubTheme.vars.soft,
      }}
    >
      <section className="playerClubHero">
        <div className="playerClubLogo">
          {club?.logo_url || sessionClub?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club?.logo_url ?? sessionClub?.logoUrl ?? ''} alt="" />
          ) : initials(displayClubName)}
        </div>
        <div>
          <span>Mi club</span>
          <h1>{displayClubName}</h1>
          <p>{club?.city ? `${club.city} · ` : ''}Tu resumen deportivo dentro de este club.</p>
          {message ? <b>{message}</b> : null}
        </div>
        <div className="playerClubHeroActions">
          <Link href="/player">← Volver</Link>
          <button type="button" onClick={activateThisClub}>{session.activeClubId === clubId ? 'Club activo' : 'Activar club'}</button>
        </div>
      </section>

      <section className="playerClubStats">
        <article><ShieldCheck size={18} /><span>Estado</span><strong>{player?.approved_at ? 'Aprobado' : 'Pendiente'}</strong></article>
        <article><Trophy size={18} /><span>Ranking</span><strong>{rankPosition ? `#${rankPosition}` : 'Pendiente'}</strong><small>{player?.ranking_points ?? 0} pts</small></article>
        <article><UsersRound size={18} /><span>Pareja</span><strong>{activePartner?.full_name ?? 'Sin pareja activa'}</strong></article>
        <article><Swords size={18} /><span>Últimos</span><strong>{recentMatches.length}</strong><small>{wins} ganados</small></article>
      </section>

      <section className="playerClubGrid">
        <article className="playerClubPanel">
          <header><span>Torneos abiertos</span><h2>Listos para inscribirme</h2></header>
          <div className="playerClubList">
            {openTournaments.length ? openTournaments.map((tournament) => (
              <Link href={`/torneos/${tournament.id}`} key={tournament.id}>
                <CalendarDays size={17} />
                <div>
                  <strong>{tournament.name}</strong>
                  <small>{formatDate(tournament.starts_on ?? tournament.start_date)} · {tournament.category ?? 'Cat.'} · {formatGender(tournament.gender)}</small>
                </div>
                <ChevronRight size={17} />
              </Link>
            )) : <div className="playerClubEmpty">No hay torneos abiertos para inscribirte en este momento.</div>}
          </div>
        </article>

        <article className="playerClubPanel">
          <header><span>Pareja activa</span><h2>Vínculo en este club</h2></header>
          {activePartner ? (
            <div className="playerClubPartner">
              <i>{activePartner.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePartner.avatar_url} alt="" />
              ) : initials(activePartner.full_name)}</i>
              <div><strong>{activePartner.full_name}</strong><small>Activa desde {formatDate(activePartnership?.accepted_at ?? activePartnership?.created_at ?? null)}</small></div>
            </div>
          ) : <div className="playerClubEmpty">Todavía no tenés pareja activa en este club.</div>}
        </article>
      </section>

      <section className="playerClubGrid playerClubGrid--bottom">
        <article className="playerClubPanel">
          <header><span>Últimos partidos</span><h2>Resultados recientes</h2></header>
          <div className="playerClubMatchList">
            {recentMatches.length ? recentMatches.map((match) => {
              const ownTeamId = teamIds.includes(match.team1_id) ? match.team1_id : match.team2_id
              const result = match.winner_team_id === ownTeamId ? 'Ganado' : 'Perdido'
              return (
                <div key={match.id}>
                  <strong>{result} · {scoreLabel(match.score)}</strong>
                  <span>{formatDate(match.scheduled_at ?? match.created_at)}</span>
                </div>
              )
            }) : <div className="playerClubEmpty">Sin partidos jugados todavía.</div>}
          </div>
        </article>

        <article className="playerClubPanel">
          <header><span>Contenido</span><h2>Novedades del club</h2></header>
          <div className="playerClubNews">
            <Newspaper size={18} />
            <strong>Todavía no hay novedades</strong>
            <p>Las noticias y comunicaciones del club van a aparecer en este espacio.</p>
          </div>
        </article>
      </section>

      <style>{`
        .playerClubHome { background:
          radial-gradient(circle at 8% 0%, var(--club-glow, rgba(34,211,238,.15)), transparent 32%),
          radial-gradient(circle at 95% 8%, color-mix(in srgb, var(--club-accent-2, #ec4899) 12%, transparent), transparent 30%),
          #f3f7fb;
          color: #061b3a;
          display: grid;
          gap: 16px;
          margin: 0 auto;
          max-width: 1180px;
          padding: 18px;
          width: 100%;
        }
        .playerClubHero, .playerClubPanel, .playerClubStats article {
          background: rgba(255,255,255,.88);
          border: 1px solid rgba(226,232,240,.86);
          border-radius: 22px;
          box-shadow: 0 18px 48px rgba(15,23,42,.07);
        }
        .playerClubHero { align-items: center; background:
          radial-gradient(circle at 15% 0%, var(--club-soft, rgba(103,232,249,.18)), transparent 32%),
          linear-gradient(135deg, var(--club-hero, rgba(8,47,73,.96), rgba(15,23,42,.92) 52%, rgba(67,16,57,.86)));
          color: #fff;
          display: grid;
          gap: 16px;
          grid-template-columns: 74px minmax(0, 1fr) auto;
          overflow: hidden;
          padding: 20px;
          position: relative;
        }
        .playerClubHero::before { background: linear-gradient(90deg, var(--club-accent, #06b6d4), var(--club-accent-2, #ec4899)); content: ""; height: 3px; left: 20px; position: absolute; right: 20px; top: 0; }
        .playerClubLogo { align-items: center; background: linear-gradient(135deg, var(--club-accent, #0ea5e9), #172554); border: 3px solid rgba(255,255,255,.92); border-radius: 20px; color: #fff; display: flex; font-size: 20px; font-weight: 950; height: 74px; justify-content: center; overflow: hidden; width: 74px; }
        .playerClubLogo img, .playerClubPartner img { height: 100%; object-fit: cover; width: 100%; }
        .playerClubHero span { color: color-mix(in srgb, var(--club-accent, #67e8f9) 72%, white); }
        .playerClubPanel header span, .playerClubStats span { color: var(--club-accent, #0891b2); font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .playerClubHero h1 { font-size: clamp(30px, 4vw, 50px); font-weight: 950; letter-spacing: -.03em; line-height: 1; margin: 4px 0 7px; }
        .playerClubHero p { color: rgba(255,255,255,.76); font-weight: 800; margin: 0; }
        .playerClubHero b { color: #fecdd3; display: block; font-size: 13px; margin-top: 8px; }
        .playerClubHeroActions { align-items: end; display: grid; gap: 8px; justify-items: end; }
        .playerClubHeroActions a { background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18); border-radius: 999px; color: #fff; font-size: 12px; font-weight: 950; padding: 9px 12px; text-decoration: none; }
        .playerClubHeroActions button { background: color-mix(in srgb, var(--club-accent, #06b6d4) 16%, white); border: 1px solid color-mix(in srgb, var(--club-accent, #06b6d4) 38%, white); border-radius: 999px; color: #075985; cursor: pointer; font: inherit; font-weight: 950; padding: 10px 13px; }
        .playerClubStats { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .playerClubStats article { align-items: center; display: grid; gap: 4px; min-width: 0; padding: 15px; }
        .playerClubStats svg { color: var(--club-accent, #0891b2); }
        .playerClubStats strong { font-size: 20px; font-weight: 950; line-height: 1.12; overflow-wrap: anywhere; }
        .playerClubStats small { color: #64748b; font-weight: 850; }
        .playerClubGrid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); }
        .playerClubGrid--bottom { grid-template-columns: minmax(0, 1fr) minmax(320px, .85fr); }
        .playerClubPanel { align-content: start; display: grid; gap: 13px; padding: 18px; }
        .playerClubPanel header h2 { font-size: 22px; font-weight: 950; letter-spacing: -.02em; margin: 3px 0 0; }
        .playerClubList, .playerClubMatchList { display: grid; gap: 9px; }
        .playerClubList a { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 15px; color: #061b3a; display: grid; gap: 10px; grid-template-columns: 36px minmax(0, 1fr) 18px; padding: 12px; text-decoration: none; }
        .playerClubList a > svg:first-child { color: var(--club-accent, #0891b2); }
        .playerClubList strong, .playerClubPartner strong, .playerClubMatchList strong { display: block; font-weight: 950; line-height: 1.18; overflow-wrap: anywhere; }
        .playerClubList small, .playerClubPartner small, .playerClubMatchList span { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 3px; }
        .playerClubPartner { align-items: center; background: linear-gradient(135deg, #f8fafc, color-mix(in srgb, var(--club-accent, #06b6d4) 8%, white)); border: 1px solid color-mix(in srgb, var(--club-accent, #06b6d4) 28%, #e2e8f0); border-radius: 16px; display: grid; gap: 12px; grid-template-columns: 54px minmax(0, 1fr); padding: 13px; }
        .playerClubPartner i { align-items: center; background: linear-gradient(135deg, var(--club-accent, #0ea5e9), #172554); border-radius: 999px; color: #fff; display: flex; font-style: normal; font-weight: 950; height: 54px; justify-content: center; overflow: hidden; width: 54px; }
        .playerClubMatchList div, .playerClubNews, .playerClubEmpty { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; color: #64748b; display: grid; gap: 5px; padding: 12px; }
        .playerClubNews svg { color: var(--club-accent, #0891b2); }
        .playerClubNews strong { color: #061b3a; font-weight: 950; }
        .playerClubNews p { font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .playerClubEmpty { border-style: dashed; font-weight: 800; }
        @media (max-width: 900px) {
          .playerClubHero, .playerClubGrid, .playerClubGrid--bottom { grid-template-columns: 1fr; }
          .playerClubHeroActions { justify-items: start; }
          .playerClubStats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 520px) {
          .playerClubHome {
            gap: 10px;
            padding: 8px;
          }
          .playerClubHero, .playerClubPanel, .playerClubStats article {
            border-radius: 16px;
            box-shadow: 0 10px 26px rgba(15,23,42,.055);
          }
          .playerClubHero {
            gap: 10px;
            grid-template-columns: 48px minmax(0, 1fr);
            padding: 13px;
          }
          .playerClubHero::before {
            height: 2px;
            left: 13px;
            right: 13px;
          }
          .playerClubLogo {
            border-width: 2px;
            border-radius: 14px;
            font-size: 15px;
            height: 48px;
            width: 48px;
          }
          .playerClubHero h1 {
            font-size: clamp(24px, 9vw, 34px);
            margin: 2px 0 4px;
          }
          .playerClubHero p {
            font-size: 12px;
            line-height: 1.25;
          }
          .playerClubHeroActions {
            display: flex;
            gap: 7px;
            grid-column: 1 / -1;
            justify-content: flex-start;
          }
          .playerClubHeroActions a,
          .playerClubHeroActions button {
            font-size: 11px;
            min-height: 32px;
            padding: 7px 10px;
          }
          .playerClubStats {
            gap: 8px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .playerClubStats article {
            align-content: center;
            min-height: 74px;
            padding: 10px;
          }
          .playerClubStats span {
            font-size: 9px;
          }
          .playerClubStats strong {
            font-size: 16px;
          }
          .playerClubStats small {
            font-size: 11px;
          }
          .playerClubGrid,
          .playerClubGrid--bottom {
            gap: 10px;
          }
          .playerClubPanel {
            gap: 10px;
            padding: 12px;
          }
          .playerClubPanel header h2 {
            font-size: 19px;
            line-height: 1.05;
          }
          .playerClubList,
          .playerClubMatchList {
            gap: 8px;
          }
          .playerClubList a {
            border-radius: 13px;
            grid-template-columns: 30px minmax(0, 1fr) 16px;
            padding: 10px;
          }
          .playerClubPartner,
          .playerClubMatchList div,
          .playerClubNews,
          .playerClubEmpty {
            border-radius: 13px;
            padding: 10px;
          }
        }
      `}</style>
    </div>
  )
}
