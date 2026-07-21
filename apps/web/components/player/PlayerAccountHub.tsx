'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  LockKeyhole,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PlayerSectionHero from '@/components/player/PlayerSectionHero'
import { supabase } from '@/lib/supabaseClient'

type HubView = 'activity' | 'preferences'

type RegistrationRow = {
  id: string
  tournament_id: string
  status: string | null
  created_at: string
}

type TournamentRow = {
  id: string
  name: string
  starts_on: string | null
  start_date: string | null
  club_id: string
}

type NotificationRow = {
  id: string
  title: string
  message: string
  created_at: string
  read: boolean
  link: string | null
}

function formatDate(value: string | null) {
  if (!value) return 'Fecha a definir'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha a definir'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date)
}

function registrationLabel(status: string | null) {
  const value = String(status ?? '').toUpperCase()
  if (value === 'CONFIRMED') return 'Confirmada'
  if (value === 'PENDING') return 'Pendiente'
  if (value === 'CANCELLED') return 'Cancelada'
  return 'Inscripción registrada'
}

export default function PlayerAccountHub({ view }: { view: HubView }) {
  const session = useSession()
  const [loading, setLoading] = useState(view === 'activity')
  const [error, setError] = useState('')
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [tournaments, setTournaments] = useState<Record<string, TournamentRow>>({})
  const [notifications, setNotifications] = useState<NotificationRow[]>([])

  useEffect(() => {
    if (view !== 'activity' || session.status === 'loading') return
    if (!session.user?.id) {
      setLoading(false)
      return
    }

    const userId = session.user.id
    let alive = true

    async function loadActivity() {
      setLoading(true)
      setError('')

      try {
        const { data: teamRows, error: teamsError } = await supabase
          .from('tournament_teams')
          .select('id')
          .or(`player1_user_id.eq.${userId},player2_user_id.eq.${userId}`)

        if (teamsError) throw teamsError

        const teamIds = (teamRows ?? []).map((team: { id: string }) => team.id)
        const registrationResult = teamIds.length
          ? await supabase
              .from('tournament_registrations')
              .select('id,tournament_id,status,created_at')
              .in('team_id', teamIds)
              .order('created_at', { ascending: false })
              .limit(12)
          : { data: [], error: null }

        if (registrationResult.error) throw registrationResult.error

        const registrationRows = (registrationResult.data ?? []) as RegistrationRow[]
        const tournamentIds = Array.from(new Set(registrationRows.map((item) => item.tournament_id)))
        const tournamentResult = tournamentIds.length
          ? await supabase
              .from('tournaments')
              .select('id,name,starts_on,start_date,club_id')
              .in('id', tournamentIds)
          : { data: [], error: null }

        if (tournamentResult.error) throw tournamentResult.error

        const notificationResult = await supabase
          .from('notifications')
          .select('id,title,message,created_at,read,link')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(8)

        if (notificationResult.error) throw notificationResult.error
        if (!alive) return

        setRegistrations(registrationRows)
        setTournaments(Object.fromEntries(((tournamentResult.data ?? []) as TournamentRow[]).map((item) => [item.id, item])))
        setNotifications((notificationResult.data ?? []) as NotificationRow[])
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'No pudimos cargar tu actividad.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadActivity()
    return () => {
      alive = false
    }
  }, [session.status, session.user?.id, view])

  const confirmedRegistrations = registrations.filter((item) => String(item.status).toUpperCase() === 'CONFIRMED').length
  const unreadNotifications = notifications.filter((item) => !item.read).length
  const activityItems = useMemo(() => {
    const registrationItems = registrations.map((registration) => {
      const tournament = tournaments[registration.tournament_id]
      return {
        id: `registration-${registration.id}`,
        date: registration.created_at,
        icon: Trophy,
        title: tournament?.name ?? 'Torneo SELPA',
        description: `${registrationLabel(registration.status)}${tournament ? ` · ${formatDate(tournament.starts_on ?? tournament.start_date)}` : ''}`,
        href: tournament ? `/torneos/${tournament.id}` : '/player/torneos',
        tone: 'tournament',
      }
    })
    const notificationItems = notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      date: notification.created_at,
      icon: Bell,
      title: notification.title,
      description: notification.message,
      href: notification.link || '/notificaciones',
      tone: notification.read ? 'read' : 'notice',
    }))

    return [...registrationItems, ...notificationItems]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 10)
  }, [notifications, registrations, tournaments])

  if (session.status === 'loading') {
    return <PlayerStatePanel kind="loading" title="Preparando tu espacio" message="Cargando tu cuenta" viewport />
  }

  if (!session.user) {
    return <PlayerStatePanel kind="empty" title="Ingresá para ver tu cuenta" message="Tu actividad y tus preferencias quedan disponibles cuando iniciás sesión." action={{ label: 'Ingresar', href: '/login' }} viewport />
  }

  if (view === 'preferences') {
    return (
      <main className="playerAccountHub">
        <PlayerSectionHero badge="Mi cuenta" title="Preferencias" description="Todo lo importante de tu perfil y tu experiencia de juego." icon={<ShieldCheck />} />

        <section className="playerPreferenceIdentity">
          <span className="playerPreferenceIdentity__avatar">{session.user.avatarUrl ? <img src={session.user.avatarUrl} alt="" /> : session.user.name.slice(0, 1)}</span>
          <div>
            <strong>{session.user.name}</strong>
            <small>{session.activeClub?.name ?? 'Sin club activo'}</small>
          </div>
          <Link href="/mis-datos">Editar</Link>
        </section>

        <section className="playerPreferenceGroup" aria-label="Perfil y juego">
          <span>Perfil y juego</span>
          <Link href="/perfil"><CircleUserRound size={19} /><div><strong>Mi perfil</strong><small>Así te ven otros jugadores</small></div><ChevronRight size={18} /></Link>
          <Link href="/mis-datos"><CircleUserRound size={19} /><div><strong>Mis datos</strong><small>Información personal, deportiva y seguridad</small></div><ChevronRight size={18} /></Link>
          <Link href="/seleccionar-club"><UsersRound size={19} /><div><strong>Club activo</strong><small>{session.activeClub?.name ?? 'Elegí dónde querés jugar'}</small></div><ChevronRight size={18} /></Link>
        </section>

        <section className="playerPreferenceGroup" aria-label="Cuenta y privacidad">
          <span>Cuenta y privacidad</span>
          <Link href="/notificaciones"><Bell size={19} /><div><strong>Notificaciones</strong><small>Revisá novedades de tus clubes y torneos</small></div><ChevronRight size={18} /></Link>
          <Link href="/reset-password"><LockKeyhole size={19} /><div><strong>Seguridad</strong><small>Actualizá tu contraseña</small></div><ChevronRight size={18} /></Link>
          <div className="playerPreferenceGroup__note"><ShieldCheck size={17} /><span>Tu información de juego se comparte solo dentro de los espacios donde participás.</span></div>
        </section>
        <style>{`
          .playerAccountHub { color:#061b3a; display:grid; gap:14px; width:100%; }
          .playerAccountHero { background:linear-gradient(135deg,#0b1c38,#102747); border-radius:18px; box-shadow:0 16px 38px rgba(15,23,42,.14); color:#fff; overflow:hidden; padding:16px; position:relative; }
          .playerAccountHero::after { background:linear-gradient(90deg,#22d3ee,#ec4899); bottom:0; content:""; height:3px; left:0; position:absolute; right:0; }
          .playerAccountHero span { color:#67e8f9; font-size:10px; font-weight:850; letter-spacing:.07em; text-transform:uppercase; }
          .playerAccountHero h1 { font-size:28px; font-weight:800; letter-spacing:0; line-height:1; margin:5px 0 6px; }
          .playerAccountHero p { color:rgba(255,255,255,.72); font-size:13px; line-height:1.35; margin:0; }
          .playerPreferenceIdentity,.playerPreferenceGroup { background:#fff; border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); }
          .playerPreferenceIdentity { align-items:center; display:grid; gap:10px; grid-template-columns:42px minmax(0,1fr) auto; padding:10px; }
          .playerPreferenceIdentity__avatar { align-items:center; background:#0f274a; border-radius:50%; color:#fff; display:flex; font-size:15px; font-weight:800; height:42px; justify-content:center; overflow:hidden; width:42px; }
          .playerPreferenceIdentity__avatar img { height:100%; object-fit:cover; width:100%; }
          .playerPreferenceIdentity strong,.playerPreferenceIdentity small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .playerPreferenceIdentity strong { font-size:14px; }
          .playerPreferenceIdentity small { color:#64748b; font-size:11px; margin-top:2px; }
          .playerPreferenceIdentity a { color:#0e7490; font-size:12px; font-weight:700; text-decoration:none; }
          .playerPreferenceGroup { display:grid; overflow:hidden; padding:10px; }
          .playerPreferenceGroup > span { color:#0891b2; font-size:10px; font-weight:800; letter-spacing:.06em; padding:2px 2px 7px; text-transform:uppercase; }
          .playerPreferenceGroup > a { align-items:center; border-top:1px solid #edf2f7; color:#061b3a; display:grid; gap:10px; grid-template-columns:21px minmax(0,1fr) 18px; min-height:56px; padding:8px 2px; text-decoration:none; }
          .playerPreferenceGroup > a > svg:first-child { color:#0e7490; }
          .playerPreferenceGroup > a > svg:last-child { color:#94a3b8; }
          .playerPreferenceGroup strong,.playerPreferenceGroup small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .playerPreferenceGroup strong { font-size:13px; font-weight:700; }
          .playerPreferenceGroup small { color:#64748b; font-size:11px; margin-top:2px; }
          .playerPreferenceGroup__note { align-items:start; background:#f8fafc; border-radius:10px; color:#64748b; display:flex; font-size:11px; gap:7px; line-height:1.35; margin-top:7px; padding:9px; }
          .playerPreferenceGroup__note svg { color:#0e7490; flex:0 0 auto; }
          @media (max-width:390px) { .playerAccountHub { gap:12px; } .playerAccountHero h1 { font-size:26px; } }
        `}</style>
      </main>
    )
  }

  return (
    <main className="playerAccountHub">
      <PlayerSectionHero badge="Tu recorrido" title="Mi actividad" description="Inscripciones y novedades que importan para tu juego." icon={<Activity />} />

      {loading ? <PlayerStatePanel kind="loading" title="Cargando actividad" message="Buscando tus últimos movimientos" compact /> : null}
      {error ? <PlayerStatePanel kind="error" title="No pudimos cargar tu actividad" message="Probá de nuevo en unos segundos." action={{ label: 'Ir a Mis torneos', href: '/player/torneos' }} compact /> : null}

      {!loading && !error ? (
        <>
          <section className="playerActivityStats" aria-label="Resumen de actividad">
            <article><Trophy size={18} /><strong>{registrations.length}</strong><span>inscripciones</span></article>
            <article><ShieldCheck size={18} /><strong>{confirmedRegistrations}</strong><span>confirmadas</span></article>
            <article><Bell size={18} /><strong>{unreadNotifications}</strong><span>novedades</span></article>
          </section>

          <section className="playerActivityTimeline">
            <header><div><span>Reciente</span><h2>Lo último de tu juego</h2></div><Link href="/player/torneos">Mis torneos <ChevronRight size={16} /></Link></header>
            {activityItems.length ? activityItems.map((item) => {
              const Icon = item.icon
              return <Link key={item.id} href={item.href} className={`playerActivityItem playerActivityItem--${item.tone}`}><span><Icon size={18} /></span><div><strong>{item.title}</strong><p>{item.description}</p></div><time>{formatDate(item.date)}</time></Link>
            }) : (
              <div className="playerActivityEmpty"><CalendarDays size={22} /><strong>Tu actividad empieza en la cancha</strong><p>Cuando te inscribas a un torneo o recibas una novedad, la vas a ver acá.</p><Link href="/player/torneos/explorar">Explorar torneos</Link></div>
            )}
          </section>
        </>
      ) : null}

      <style>{`
        .playerAccountHub { color:#061b3a; display:grid; gap:14px; width:100%; }
        .playerAccountHero { background:linear-gradient(135deg,#0b1c38,#102747); border-radius:18px; box-shadow:0 16px 38px rgba(15,23,42,.14); color:#fff; overflow:hidden; padding:16px; position:relative; }
        .playerAccountHero::after { background:linear-gradient(90deg,#22d3ee,#ec4899); bottom:0; content:""; height:3px; left:0; position:absolute; right:0; }
        .playerAccountHero span { color:#67e8f9; font-size:10px; font-weight:850; letter-spacing:.07em; text-transform:uppercase; }
        .playerAccountHero h1 { font-size:28px; font-weight:800; letter-spacing:0; line-height:1; margin:5px 0 6px; }
        .playerAccountHero p { color:rgba(255,255,255,.72); font-size:13px; line-height:1.35; margin:0; }
        .playerActivityStats { display:grid; gap:8px; grid-template-columns:repeat(3,minmax(0,1fr)); }
        .playerActivityStats article { align-items:center; background:#fff; border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); display:grid; gap:2px; min-height:88px; padding:11px; }
        .playerActivityStats svg { color:#0891b2; }
        .playerActivityStats strong { font-size:22px; line-height:1; }
        .playerActivityStats span { color:#64748b; font-size:11px; font-weight:600; }
        .playerActivityTimeline,.playerPreferenceGroup,.playerPreferenceIdentity { background:#fff; border:1px solid var(--player-card-border); border-radius:var(--player-card-radius); box-shadow:var(--player-card-shadow); }
        .playerActivityTimeline { display:grid; gap:2px; overflow:hidden; padding:12px; }
        .playerActivityTimeline header { align-items:center; display:flex; justify-content:space-between; padding:2px 2px 9px; }
        .playerActivityTimeline header span,.playerPreferenceGroup > span { color:#0891b2; font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
        .playerActivityTimeline h2 { font-size:17px; letter-spacing:0; line-height:1.1; margin:3px 0 0; }
        .playerActivityTimeline header > a { align-items:center; color:#0f4c6e; display:inline-flex; font-size:11px; font-weight:700; gap:2px; text-decoration:none; }
        .playerActivityItem { align-items:center; border-top:1px solid #edf2f7; color:inherit; display:grid; gap:10px; grid-template-columns:34px minmax(0,1fr) auto; min-height:61px; padding:8px 2px; text-decoration:none; }
        .playerActivityItem > span { align-items:center; background:#ecfeff; border-radius:10px; color:#0891b2; display:flex; height:34px; justify-content:center; width:34px; }
        .playerActivityItem--notice > span { background:#eff6ff; color:#2563eb; }
        .playerActivityItem--read > span { background:#f1f5f9; color:#64748b; }
        .playerActivityItem div { min-width:0; }
        .playerActivityItem strong { display:block; font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .playerActivityItem p { color:#64748b; font-size:11px; line-height:1.28; margin:2px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .playerActivityItem time { color:#94a3b8; font-size:10px; font-weight:650; }
        .playerActivityEmpty { align-items:start; border-top:1px solid #edf2f7; color:#64748b; display:grid; gap:6px; justify-items:start; padding:20px 4px 4px; }
        .playerActivityEmpty svg { color:#0891b2; }
        .playerActivityEmpty strong { color:#061b3a; font-size:15px; }
        .playerActivityEmpty p { font-size:12px; line-height:1.4; margin:0; }
        .playerActivityEmpty a { background:#061b3a; border-radius:10px; color:#fff; font-size:12px; font-weight:700; padding:9px 11px; text-decoration:none; }
        .playerPreferenceIdentity { align-items:center; display:grid; gap:10px; grid-template-columns:42px minmax(0,1fr) auto; padding:10px; }
        .playerPreferenceIdentity__avatar { align-items:center; background:#0f274a; border-radius:50%; color:#fff; display:flex; font-size:15px; font-weight:800; height:42px; justify-content:center; overflow:hidden; width:42px; }
        .playerPreferenceIdentity__avatar img { height:100%; object-fit:cover; width:100%; }
        .playerPreferenceIdentity strong,.playerPreferenceIdentity small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .playerPreferenceIdentity strong { font-size:14px; }
        .playerPreferenceIdentity small { color:#64748b; font-size:11px; margin-top:2px; }
        .playerPreferenceIdentity a { color:#0e7490; font-size:12px; font-weight:700; text-decoration:none; }
        .playerPreferenceGroup { display:grid; overflow:hidden; padding:10px; }
        .playerPreferenceGroup > span { padding:2px 2px 7px; }
        .playerPreferenceGroup > a { align-items:center; border-top:1px solid #edf2f7; color:#061b3a; display:grid; gap:10px; grid-template-columns:21px minmax(0,1fr) 18px; min-height:56px; padding:8px 2px; text-decoration:none; }
        .playerPreferenceGroup > a > svg:first-child { color:#0e7490; }
        .playerPreferenceGroup > a > svg:last-child { color:#94a3b8; }
        .playerPreferenceGroup strong,.playerPreferenceGroup small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .playerPreferenceGroup strong { font-size:13px; font-weight:700; }
        .playerPreferenceGroup small { color:#64748b; font-size:11px; margin-top:2px; }
        .playerPreferenceGroup__note { align-items:start; background:#f8fafc; border-radius:10px; color:#64748b; display:flex; font-size:11px; gap:7px; line-height:1.35; margin-top:7px; padding:9px; }
        .playerPreferenceGroup__note svg { color:#0e7490; flex:0 0 auto; }
        @media (max-width:390px) { .playerAccountHub { gap:12px; } .playerAccountHero h1 { font-size:26px; } .playerActivityStats article { min-height:82px; padding:9px; } .playerActivityStats strong { font-size:20px; } .playerActivityStats span { font-size:10px; } }
      `}</style>
    </main>
  )
}
