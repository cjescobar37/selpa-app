'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Activity,
  CalendarCheck,
  CalendarDays,
  Cake,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Hand,
  ImageIcon,
  Mail,
  MapPin,
  Pencil,
  Ruler,
  Save,
  Search,
  Send,
  ShieldX,
  Star,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { buildLocalPreview, getClubInitials, uploadPlayerProfileImage } from '@/lib/clubAssets'
import { formatRankingCategory, formatRankingGender, formatRankingPoints, normalizeRankingGender } from '@/lib/ranking'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'

type ProfileData = {
  user_id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  cover_url: string | null
  city: string | null
  birth_date: string | null
  height_cm: number | null
  dominant_hand: string | null
}

type PlayerProfileResponse = {
  player: {
    id: string
    user_id: string
    full_name: string
    category: number | null
    gender: string | null
    ranking_points: number
    preferred_position: string | null
    approved_at: string | null
    created_at: string
    is_manual: boolean
  }
  profile: ProfileData | null
  stats: {
    tournaments_played: number
    matches_played: number
    wins: number
    losses: number
    effectiveness: number | null
    finals: number
    titles: number
  }
  frequent_partner: null | {
    user_id: string
    full_name: string
    tournaments_together: number
    matches_together: number
  }
  tournament_history: Array<{
    tournament_id: string
    tournament_name: string
    date: string | null
    category: number | null
    partner_name: string
    result: string
    points: number | null
  }>
  recent_matches: Array<{
    id: string
    date: string | null
    tournament_name: string
    partner_name: string
    rival_name: string
    result: string
    score: string
  }>
  activity: Array<{
    id: string
    date: string | null
    title: string
    description: string
  }>
  error?: string
}

type ActivePartnerPlayer = {
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
  player1: ActivePartnerPlayer | null
  player2: ActivePartnerPlayer | null
}

type ActivePartnershipsResponse = {
  partnerships: ActivePartnership[]
  error?: string
}

type PartnerInvite = {
  id: string
  club_id: string
  sender_club_player_id: string
  receiver_club_player_id: string
  status: string
  message: string | null
  responded_at: string | null
  created_at: string
  sender: ActivePartnerPlayer | null
  receiver: ActivePartnerPlayer | null
}

type PartnerInvitesResponse = {
  invites: PartnerInvite[]
  error?: string
}

type ClubPlayerOption = {
  id: string
  user_id: string
  full_name: string
  category: number | null
  gender: string | null
  ranking_points: number | null
  profile: {
    avatar_url: string | null
  } | null
}

type ClubPlayersResponse = {
  players: ClubPlayerOption[]
  error?: string
}

type EditProfileForm = {
  display_name: string
  city: string
  birth_date: string
  height_cm: string
  dominant_hand: string
  preferred_position: string
  avatar_url: string
  cover_url: string
}

const LA_PAMPA_CITIES = [
  'Santa Rosa',
  'General Pico',
  'Toay',
  'Eduardo Castex',
  'General Acha',
  'Realicó',
  'Intendente Alvear',
  'General San Martín',
  'Guatraché',
  'Macachín',
  'Victorica',
  'Quemú Quemú',
  'Catriló',
  '25 de Mayo',
  'Winifreda',
  'Jacinto Arauz',
  'Bernasconi',
  'Doblas',
  'Trenel',
  'Ingeniero Luiggi',
] as const

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function getAge(value?: string | null) {
  if (!value) return null
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

function formatPreferredPosition(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'DRIVE') return 'Drive'
  if (normalized === 'REVES') return 'Revés'
  if (normalized === 'BOTH') return 'Ambos lados'
  return 'Sin datos'
}

function formatDominantHand(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'RIGHT' || normalized === 'DERECHO') return 'Derecha'
  if (normalized === 'LEFT' || normalized === 'IZQUIERDO') return 'Izquierda'
  if (normalized === 'AMBIDEXTROUS') return 'Ambidiestro'
  return 'Sin datos'
}

function maskEmail(value?: string | null) {
  if (!value) return 'Sin email visible'
  const [name, domain] = value.split('@')
  if (!name || !domain) return 'Email disponible'
  return `${name.slice(0, 2)}***@${domain}`
}

function buildEditForm(data?: PlayerProfileResponse | null): EditProfileForm {
  return {
    display_name: data?.player.full_name ?? '',
    city: data?.profile?.city ?? '',
    birth_date: data?.profile?.birth_date ?? '',
    height_cm: data?.profile?.height_cm ? String(data.profile.height_cm) : '',
    dominant_hand: data?.profile?.dominant_hand ?? '',
    preferred_position: data?.player.preferred_position ?? '',
    avatar_url: data?.profile?.avatar_url ?? '',
    cover_url: data?.profile?.cover_url ?? '',
  }
}

function validateProfileImage(file: File, kind: 'avatar' | 'cover') {
  const max = kind === 'avatar' ? 4 * 1024 * 1024 : 7 * 1024 * 1024
  if (!file.type.toLowerCase().startsWith('image/')) {
    throw new Error('Seleccioná una imagen JPG, PNG o WebP.')
  }
  if (file.size > max) {
    throw new Error(kind === 'avatar' ? 'La foto de perfil no puede superar 4 MB.' : 'La portada no puede superar 7 MB.')
  }
}

export default function ClubJugadorDetailPage() {
  const params = useParams<{ id: string }>()
  const playerId = params?.id
  const { activeClub, user } = useSession()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [data, setData] = useState<PlayerProfileResponse | null>(null)
  const [activePartnerships, setActivePartnerships] = useState<ActivePartnership[]>([])
  const [partnerInvites, setPartnerInvites] = useState<PartnerInvite[]>([])
  const [clubPlayers, setClubPlayers] = useState<ClubPlayerOption[]>([])
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [selectedInvitePlayerId, setSelectedInvitePlayerId] = useState('')
  const [partnerActionMessage, setPartnerActionMessage] = useState('')
  const [partnerActionBusy, setPartnerActionBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editMessage, setEditMessage] = useState('')
  const [editForm, setEditForm] = useState<EditProfileForm>(() => buildEditForm(null))
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [profileTab, setProfileTab] = useState<'summary' | 'tournaments' | 'stats' | 'achievements'>('summary')

  const age = useMemo(() => getAge(data?.profile?.birth_date), [data?.profile?.birth_date])

  async function getToken() {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token ?? null
  }

  async function loadProfile() {
    if (!activeClub?.id || !playerId) {
      setData(null)
      setActivePartnerships([])
      setPartnerInvites([])
      setClubPlayers([])
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

    const res = await fetch(`/api/clubs/${activeClub.id}/players/${playerId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as PlayerProfileResponse

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar el perfil del jugador.')
      setData(null)
      setActivePartnerships([])
      setPartnerInvites([])
      setClubPlayers([])
      setLoading(false)
      return
    }

    const [partnershipsRes, invitesRes, playersRes] = await Promise.all([
      fetch(`/api/clubs/${activeClub.id}/active-partnerships`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      fetch(`/api/clubs/${activeClub.id}/partner-invites`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      fetch(`/api/clubs/${activeClub.id}/players`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
    ])
    const partnershipsJson = (await partnershipsRes.json().catch(() => ({ partnerships: [] }))) as ActivePartnershipsResponse
    const invitesJson = (await invitesRes.json().catch(() => ({ invites: [] }))) as PartnerInvitesResponse
    const playersJson = (await playersRes.json().catch(() => ({ players: [] }))) as ClubPlayersResponse

    setData(json)
    setActivePartnerships(partnershipsRes.ok ? partnershipsJson.partnerships ?? [] : [])
    setPartnerInvites(invitesRes.ok ? invitesJson.invites ?? [] : [])
    setClubPlayers(playersRes.ok ? playersJson.players ?? [] : [])
    setLoading(false)
  }

  async function refreshPartnerState() {
    if (!activeClub?.id) return
    const token = await getToken()
    if (!token) return

    const [partnershipsRes, invitesRes] = await Promise.all([
      fetch(`/api/clubs/${activeClub.id}/active-partnerships`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      fetch(`/api/clubs/${activeClub.id}/partner-invites`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
    ])
    const partnershipsJson = (await partnershipsRes.json().catch(() => ({ partnerships: [] }))) as ActivePartnershipsResponse
    const invitesJson = (await invitesRes.json().catch(() => ({ invites: [] }))) as PartnerInvitesResponse
    setActivePartnerships(partnershipsRes.ok ? partnershipsJson.partnerships ?? [] : [])
    setPartnerInvites(invitesRes.ok ? invitesJson.invites ?? [] : [])
  }

  async function sendPartnerInvite() {
    if (!activeClub?.id || !player?.id || !selectedInvitePlayerId) return
    setPartnerActionBusy(true)
    setPartnerActionMessage('')
    const token = await getToken()
    if (!token) {
      setPartnerActionMessage('Sesión inválida.')
      setPartnerActionBusy(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/partner-invites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderClubPlayerId: player.id,
        receiverClubPlayerId: selectedInvitePlayerId,
        message: inviteMessage,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }

    if (!res.ok) {
      setPartnerActionMessage(json.error ?? 'No pude enviar la invitación.')
      setPartnerActionBusy(false)
      return
    }

    setPartnerActionMessage('Invitación enviada correctamente.')
    setInviteOpen(false)
    setInviteQuery('')
    setInviteMessage('')
    setSelectedInvitePlayerId('')
    await refreshPartnerState()
    setPartnerActionBusy(false)
  }

  async function updatePartnerInvite(inviteId: string, action: 'accept' | 'decline' | 'cancel') {
    if (!activeClub?.id) return
    setPartnerActionBusy(true)
    setPartnerActionMessage('')
    const token = await getToken()
    if (!token) {
      setPartnerActionMessage('Sesión inválida.')
      setPartnerActionBusy(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/partner-invites/${inviteId}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }

    if (!res.ok) {
      setPartnerActionMessage(json.error ?? 'No pude actualizar la invitación.')
      setPartnerActionBusy(false)
      return
    }

    setPartnerActionMessage(action === 'accept' ? 'Pareja activa creada.' : 'Invitación actualizada.')
    await refreshPartnerState()
    setPartnerActionBusy(false)
  }

  function openInviteModal() {
    setPartnerActionMessage('')
    setInviteQuery('')
    setInviteMessage('')
    setSelectedInvitePlayerId('')
    setInviteOpen(true)
  }

  function openEditModal() {
    setEditForm(buildEditForm(data))
    setAvatarFile(null)
    setCoverFile(null)
    setAvatarPreview(null)
    setCoverPreview(null)
    setEditMessage('')
    setEditOpen(true)
  }

  function updateEditField<K extends keyof EditProfileForm>(field: K, value: EditProfileForm[K]) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  function selectProfileFile(kind: 'avatar' | 'cover', file?: File | null) {
    if (!file) return
    try {
      validateProfileImage(file, kind)
      const preview = buildLocalPreview(file)
      if (kind === 'avatar') {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview)
        setAvatarFile(file)
        setAvatarPreview(preview)
      } else {
        if (coverPreview) URL.revokeObjectURL(coverPreview)
        setCoverFile(file)
        setCoverPreview(preview)
      }
      setEditMessage('')
    } catch (error: unknown) {
      setEditMessage(error instanceof Error ? error.message : 'No pude leer la imagen.')
    }
  }

  async function saveOwnProfile() {
    if (!activeClub?.id || !player) return
    setEditSaving(true)
    setEditMessage('')

    try {
      const token = await getToken()
      if (!token) throw new Error('Sesión inválida.')

      let avatarUrl = editForm.avatar_url || null
      let coverUrl = editForm.cover_url || null

      if (avatarFile) {
        const uploaded = await uploadPlayerProfileImage({
          file: avatarFile,
          userId: player.user_id,
          kind: 'avatar',
        })
        avatarUrl = uploaded.publicUrl
      }

      if (coverFile) {
        const uploaded = await uploadPlayerProfileImage({
          file: coverFile,
          userId: player.user_id,
          kind: 'cover',
        })
        coverUrl = uploaded.publicUrl
      }

      const res = await fetch(`/api/clubs/${activeClub.id}/players/${player.id}/profile`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: editForm.display_name,
          city: editForm.city,
          birth_date: editForm.birth_date,
          height_cm: editForm.height_cm,
          dominant_hand: editForm.dominant_hand,
          preferred_position: editForm.preferred_position,
          avatar_url: avatarUrl,
          cover_url: coverUrl,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        player?: Partial<PlayerProfileResponse['player']>
        profile?: ProfileData
      }

      if (!res.ok) throw new Error(json.error ?? 'No pude guardar tu perfil.')

      setData((current) => current
        ? {
            ...current,
            player: { ...current.player, ...json.player },
            profile: json.profile ?? current.profile,
          }
        : current)
      setEditOpen(false)
      setAvatarFile(null)
      setCoverFile(null)
      setAvatarPreview(null)
      setCoverPreview(null)
    } catch (error: unknown) {
      setEditMessage(error instanceof Error ? error.message : 'Error guardando perfil.')
    } finally {
      setEditSaving(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadProfile())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, playerId])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      if (coverPreview) URL.revokeObjectURL(coverPreview)
    }
  }, [avatarPreview, coverPreview])

  const player = data?.player ?? null
  const profile = data?.profile ?? null
  const stats = data?.stats ?? null
  const heroCover = profile?.cover_url ?? null
  const matchesPlayed = stats?.matches_played ?? 0
  const winRate = matchesPlayed > 0 ? Math.round(((stats?.wins ?? 0) / matchesPlayed) * 100) : null
  const lossRate = matchesPlayed > 0 ? Math.round(((stats?.losses ?? 0) / matchesPlayed) * 100) : null
  const preferredPosition = formatPreferredPosition(player?.preferred_position)
  const rankingPositionLabel = player?.ranking_points && player.ranking_points > 0 ? 'A definir' : 'Sin ranking'
  const rankingPointsLabel = formatRankingPoints(player?.ranking_points ?? null)
  const isOwnProfile = Boolean(player?.user_id && user?.id && player.user_id === user.id)
  const recentMatches = data?.recent_matches.slice(0, 5) ?? []
  const activePartnership = player
    ? activePartnerships.find((partnership) =>
        partnership.status === 'ACTIVE' &&
        (partnership.player1_club_player_id === player.id || partnership.player2_club_player_id === player.id)
      ) ?? null
    : null
  const activePartner = activePartnership && player
    ? activePartnership.player1_club_player_id === player.id
      ? activePartnership.player2
      : activePartnership.player1
    : null
  const pendingPartnerInvite = player
    ? partnerInvites.find((invite) =>
        invite.status === 'PENDING' &&
        (invite.sender_club_player_id === player.id || invite.receiver_club_player_id === player.id)
      ) ?? null
    : null
  const pendingInviteOtherPlayer = pendingPartnerInvite && player
    ? pendingPartnerInvite.sender_club_player_id === player.id
      ? pendingPartnerInvite.receiver
      : pendingPartnerInvite.sender
    : null
  const activeClubPlayerIds = new Set(activePartnerships
    .filter((partnership) => partnership.status === 'ACTIVE')
    .flatMap((partnership) => [partnership.player1_club_player_id, partnership.player2_club_player_id]))
  const pendingInvitePlayerIds = new Set(partnerInvites
    .filter((invite) => invite.status === 'PENDING')
    .flatMap((invite) => [invite.sender_club_player_id, invite.receiver_club_player_id]))
  const inviteCandidates = clubPlayers
    .filter((option) => option.id !== player?.id)
    .filter((option) => !activeClubPlayerIds.has(option.id))
    .filter((option) => !pendingInvitePlayerIds.has(option.id))
    .filter((option) => {
      const query = inviteQuery.trim().toLowerCase()
      return !query || option.full_name.toLowerCase().includes(query)
    })
    .slice(0, 8)

  return (
    <div className="px-wrap">
      <div className={`club-panel player-premium${isOwnProfile ? ' is-own-profile' : ''}`}>
        {message ? <div className="player-message">{message}</div> : null}

        {!activeClub?.id ? (
          <PlayerStatePanel kind="empty" title="Seleccioná un club activo" message="Necesitamos un club para mostrar tu perfil deportivo." action={{ label: 'Seleccionar club', href: '/seleccionar-club' }} compact />
        ) : loading ? (
          <PlayerStatePanel kind="loading" title="Cargando perfil" message="Preparando tu información" viewport />
        ) : !player || !data ? (
          <PlayerStatePanel kind="error" title="No encontramos el perfil" message="Volvé a intentarlo desde tu espacio de jugador." action={{ label: 'Volver a Mi espacio', href: '/player' }} compact />
        ) : (
          <>
            <section className="playerProfileV3">
              <div className="playerProfileV3__cover">
                {heroCover ? <Image src={heroCover} alt="" fill sizes="1200px" priority /> : null}
                <Link className="playerProfileV3__back" href={isOwnProfile ? '/player' : '/club/jugadores'}>Volver</Link>
                {isOwnProfile ? <button type="button" className="playerProfileV3__coverEdit" onClick={openEditModal}><ImageIcon size={15} />Editar portada</button> : null}
              </div>
              <div className="playerProfileV3__intro">
                <button className="playerProfileV3__avatar" type="button" onClick={() => setAvatarOpen(true)} aria-label="Ver foto de perfil">
                  {profile?.avatar_url ? <Image src={profile.avatar_url} alt={player.full_name} fill sizes="144px" /> : getClubInitials(player.full_name)}
                  {isOwnProfile ? <span><Pencil size={14} /></span> : null}
                </button>
                <div className="playerProfileV3__identity">
                  <h1>{player.full_name}</h1>
                  <p>{formatRankingCategory(player.category)} · {formatRankingGender(player.gender)}</p>
                  <Link href={`/clubs/${activeClub.id}`} className="playerProfileV3__club">{activeClub.name}</Link>
                </div>
                <div className="playerProfileV3__metrics" aria-label="Resumen competitivo">
                  <span><small>Posición</small><strong>{rankingPositionLabel}</strong></span>
                  <span><small>Puntos</small><strong>{rankingPointsLabel}</strong></span>
                  <span><small>Partidos</small><strong>{matchesPlayed}</strong></span>
                </div>
                <div className="playerProfileV3__actions">
                  {isOwnProfile ? <button type="button" onClick={openEditModal}><Pencil size={15} />Editar perfil</button> : null}
                  <Link className="is-primary" href={isOwnProfile ? '/player/ranking' : '/club/ranking'}>Ver ranking</Link>
                </div>
              </div>
              <nav className="playerProfileV3__tabs" aria-label="Secciones del perfil">
                {[
                  ['summary', 'Resumen'],
                  ['tournaments', 'Torneos'],
                  ['stats', 'Estadísticas'],
                  ['achievements', 'Logros'],
                ].map(([key, label]) => <button key={key} type="button" className={profileTab === key ? 'is-active' : ''} onClick={() => setProfileTab(key as typeof profileTab)}>{label}</button>)}
              </nav>

              {profileTab === 'summary' ? <section className="playerProfileV3__summary">
                <article><span>Trayectoria</span><strong>{stats?.tournaments_played ?? 0} torneos</strong><p>{matchesPlayed} partidos · {stats?.wins ?? 0} ganados</p></article>
                <article><span>Próximo torneo</span><strong>Sin inscripción próxima</strong><Link href="/player/torneos/explorar">Explorar torneos</Link></article>
                <article><span>Último resultado</span>{recentMatches[0] ? <><strong>{recentMatches[0].result} · {recentMatches[0].score}</strong><p>{recentMatches[0].tournament_name}</p></> : <><strong>Sin partidos todavía</strong><p>Tu actividad aparecerá acá.</p></>}</article>
                <article><span>Club y pareja</span>{activePartner ? <Link href={`/club/jugadores/${activePartner.user_id}`}><strong>{activePartner.full_name}</strong><p>Pareja activa · {activeClub.name}</p></Link> : <><strong>{activeClub.name}</strong><p>Sin pareja activa</p>{isOwnProfile ? <button type="button" onClick={openInviteModal}>Buscar pareja</button> : null}</>}</article>
              </section> : null}

              {profileTab === 'tournaments' ? <section className="playerProfileV3__list"><h2>Torneos</h2>{data.tournament_history.length ? data.tournament_history.map((tournament) => <article key={`${tournament.tournament_id}-${tournament.date ?? ''}`}><strong>{tournament.tournament_name}</strong><span>{formatDate(tournament.date)} · {tournament.partner_name}</span><small>{tournament.result}{tournament.points !== null ? ` · ${tournament.points} pts` : ''}</small></article>) : <div className="playerProfileV3__empty">Todavía no hay torneos para mostrar.</div>}</section> : null}

              {profileTab === 'stats' ? <section className="playerProfileV3__stats">
                <article><Activity size={18} /><span>Partidos</span><strong>{matchesPlayed}</strong></article>
                <article><Trophy size={18} /><span>Ganados</span><strong>{stats?.wins ?? 0}</strong><small>{winRate !== null ? `${winRate}%` : ''}</small></article>
                <article><ShieldX size={18} /><span>Perdidos</span><strong>{stats?.losses ?? 0}</strong><small>{lossRate !== null ? `${lossRate}%` : ''}</small></article>
                <article><TrendingUp size={18} /><span>Efectividad</span><strong>{typeof stats?.effectiveness === 'number' ? `${stats.effectiveness}%` : '-'}</strong></article>
              </section> : null}

              {profileTab === 'achievements' ? <section className="playerProfileV3__summary playerProfileV3__summary--achievements">
                <article><span>Títulos</span><strong>{stats?.titles ?? 0}</strong><p>Campeonatos registrados</p></article>
                <article><span>Finales</span><strong>{stats?.finals ?? 0}</strong><p>Definiciones alcanzadas</p></article>
                <article><span>Mejor ranking</span><strong>{rankingPositionLabel}</strong><p>Según el ranking disponible</p></article>
              </section> : null}
            </section>

            {avatarOpen ? (
              <div className="player-lightbox" role="dialog" aria-modal="true" onClick={() => setAvatarOpen(false)}>
                <button type="button" onClick={() => setAvatarOpen(false)}>Cerrar</button>
                <div className="player-lightboxImage">
                  {profile?.avatar_url ? <Image src={profile.avatar_url} alt={player.full_name} fill sizes="420px" /> : getClubInitials(player.full_name)}
                </div>
              </div>
            ) : null}

            {inviteOpen ? (
              <div className="player-inviteOverlay" role="dialog" aria-modal="true">
                <div className="player-inviteModal">
                  <header>
                    <div>
                      <span className="club-kicker">Pareja activa</span>
                      <h2>Invitar pareja</h2>
                    </div>
                    <button type="button" onClick={() => setInviteOpen(false)} aria-label="Cerrar invitación"><X size={18} /></button>
                  </header>
                  <label className="player-inviteSearch">
                    <Search size={16} />
                    <input value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Buscar jugador del club" />
                  </label>
                  <div className="player-inviteResults">
                    {inviteCandidates.length ? inviteCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.id}
                        className={selectedInvitePlayerId === candidate.id ? 'is-selected' : ''}
                        onClick={() => setSelectedInvitePlayerId(candidate.id)}
                      >
                        <span>
                          {candidate.profile?.avatar_url ? <Image src={candidate.profile.avatar_url} alt={candidate.full_name} fill sizes="36px" /> : getClubInitials(candidate.full_name)}
                        </span>
                        <strong>{candidate.full_name}</strong>
                        <small>{formatRankingCategory(candidate.category)} · {formatRankingGender(candidate.gender)}</small>
                        {selectedInvitePlayerId === candidate.id ? <Check size={16} /> : null}
                      </button>
                    )) : <div className="player-placeholder">{inviteQuery.trim() ? 'No se encontraron jugadores.' : 'No hay jugadores disponibles para invitar.'}</div>}
                  </div>
                  <label className="player-inviteMessage">
                    <span>Mensaje opcional</span>
                    <textarea value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} maxLength={500} rows={3} placeholder="Ej: ¿Armamos pareja para los próximos torneos?" />
                  </label>
                  {partnerActionMessage ? <p className="player-partnerFeedback">{partnerActionMessage}</p> : null}
                  <footer>
                    <button type="button" onClick={() => setInviteOpen(false)}>Cancelar</button>
                    <button type="button" onClick={sendPartnerInvite} disabled={!selectedInvitePlayerId || partnerActionBusy}>
                      <Send size={15} />
                      Enviar invitación
                    </button>
                  </footer>
                </div>
              </div>
            ) : null}

            {editOpen && isOwnProfile ? (
              <div className="player-editOverlay" role="dialog" aria-modal="true">
                <form
                  className="player-editModal"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void saveOwnProfile()
                  }}
                >
                  <header>
                    <div>
                      <span className="club-kicker">Modo propio</span>
                      <h2>Editar perfil</h2>
                      <p>Solo podés modificar datos personales y deportivos permitidos. Ranking, categoría y estadísticas quedan bloqueados.</p>
                    </div>
                    <button type="button" onClick={() => setEditOpen(false)} aria-label="Cerrar edición"><X size={18} /></button>
                  </header>

                  {editMessage ? <div className="player-editError">{editMessage}</div> : null}

                  <section className="player-editSection">
                    <h3><ImageIcon size={16} /> Imagen</h3>
                    <div className="player-editMediaGrid">
                      <label>
                        <span>Foto/avatar</span>
                        <div className="player-editPreview player-editPreview--avatar">
                          {avatarPreview || editForm.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={(avatarPreview ?? editForm.avatar_url) || ''} alt="" />
                          ) : getClubInitials(player.full_name)}
                        </div>
                        <input type="file" accept="image/*" onChange={(event) => selectProfileFile('avatar', event.target.files?.[0])} />
                      </label>
                      <label>
                        <span>Portada</span>
                        <div className="player-editPreview player-editPreview--cover">
                          {coverPreview || editForm.cover_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={(coverPreview ?? editForm.cover_url) || ''} alt="" />
                          ) : <small>Usa la portada SELPA actual como fallback.</small>}
                        </div>
                        <input type="file" accept="image/*" onChange={(event) => selectProfileFile('cover', event.target.files?.[0])} />
                      </label>
                    </div>
                  </section>

                  <section className="player-editSection">
                    <h3><UserPlus size={16} /> Datos personales</h3>
                    <div className="player-editGrid">
                      <label>
                        <span>Nombre público</span>
                        <input value={editForm.display_name} onChange={(event) => updateEditField('display_name', event.target.value)} maxLength={90} />
                      </label>
                      <label>
                        <span>País</span>
                        <input value="Argentina" readOnly />
                      </label>
                      <label>
                        <span>Provincia</span>
                        <input value="La Pampa" readOnly />
                      </label>
                      <label>
                        <span>Ciudad</span>
                        <input
                          value={editForm.city}
                          onChange={(event) => updateEditField('city', event.target.value)}
                          maxLength={90}
                          list="player-la-pampa-cities"
                          placeholder="Elegí o buscá una ciudad"
                        />
                        <datalist id="player-la-pampa-cities">
                          {LA_PAMPA_CITIES.map((city) => <option key={city} value={city} />)}
                        </datalist>
                      </label>
                      <label>
                        <span>Fecha de nacimiento</span>
                        <input type="date" value={editForm.birth_date} onChange={(event) => updateEditField('birth_date', event.target.value)} />
                      </label>
                      <label className="is-locked">
                        <span>Email validado</span>
                        <input value={profile?.email ?? 'Sin email visible'} readOnly />
                      </label>
                    </div>
                  </section>

                  <section className="player-editSection">
                    <h3><Target size={16} /> Datos deportivos</h3>
                    <div className="player-editGrid">
                      <label>
                        <span>Altura</span>
                        <input inputMode="numeric" value={editForm.height_cm} onChange={(event) => updateEditField('height_cm', event.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="Ej: 178" />
                      </label>
                      <label>
                        <span>Mano hábil</span>
                        <select value={editForm.dominant_hand} onChange={(event) => updateEditField('dominant_hand', event.target.value)}>
                          <option value="">Sin datos</option>
                          <option value="RIGHT">Derecha</option>
                          <option value="LEFT">Izquierda</option>
                          <option value="AMBIDEXTROUS">Ambidiestro</option>
                        </select>
                      </label>
                      <label>
                        <span>Posición preferida</span>
                        <select value={editForm.preferred_position} onChange={(event) => updateEditField('preferred_position', event.target.value)}>
                          <option value="">Sin datos</option>
                          <option value="DRIVE">Drive</option>
                          <option value="REVES">Revés</option>
                          <option value="BOTH">Ambos lados</option>
                        </select>
                      </label>
                      <label className="is-locked">
                        <span>Categoría / rama</span>
                        <input value={`${formatRankingCategory(player.category)} · ${formatRankingGender(player.gender)}`} readOnly />
                      </label>
                      <label className="is-locked">
                        <span>Ranking / puntos</span>
                        <input value={`${rankingPositionLabel} · ${rankingPointsLabel}`} readOnly />
                      </label>
                      <label className="is-locked">
                        <span>Estado de membresía</span>
                        <input value="Activo en club" readOnly />
                      </label>
                    </div>
                  </section>

                  <footer>
                    <button type="button" onClick={() => setEditOpen(false)}>Cancelar</button>
                    <button type="submit" disabled={editSaving}>
                      <Save size={15} />
                      {editSaving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </footer>
                </form>
              </div>
            ) : null}
          </>
        )}
      </div>

      <style>{`
        .player-premium { background: linear-gradient(180deg, #ffffff, #f8fafc); display: grid; gap: 13px; overflow: hidden; }
        .club-panel.player-premium::before { background: linear-gradient(90deg, #22d3ee, #2563eb 52%, #ec4899); opacity: .86; }
        .playerProfileV3 { --profile-accent: var(--px-club-accent, #06b6d4); --profile-accent-2: var(--px-club-accent-2, #ec4899); --profile-soft: var(--px-club-soft, rgba(34,211,238,.13)); --profile-glow: var(--px-club-glow, rgba(14,165,233,.16)); display: grid; gap: 14px; margin: -18px; padding-bottom: 18px; }
        .playerProfileV3__cover { background: linear-gradient(120deg, #071426, #102744 58%, color-mix(in srgb, var(--profile-accent) 28%, #071426)); height: 224px; overflow: hidden; position: relative; }
        .playerProfileV3__cover::after { background: linear-gradient(180deg, transparent 28%, rgba(2,6,23,.62)); content: ''; inset: 0; position: absolute; }
        .playerProfileV3__cover img { object-fit: cover; opacity: .74; }
        .playerProfileV3__back { background: rgba(2,6,23,.56); border: 1px solid rgba(255,255,255,.22); border-radius: 10px; color: #fff; font-size: 12px; font-weight: 700; left: 14px; min-height: 34px; padding: 8px 10px; position: absolute; text-decoration: none; top: 12px; z-index: 1; }
        .playerProfileV3__coverEdit { align-items: center; background: rgba(2,6,23,.64); border: 1px solid rgba(255,255,255,.28); border-radius: 10px; bottom: 12px; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: 12px; font-weight: 700; gap: 6px; min-height: 36px; padding: 0 10px; position: absolute; right: 14px; z-index: 1; }
        .playerProfileV3__intro { align-items: center; display: grid; gap: 12px; grid-template-columns: 136px minmax(0, 1fr) auto; margin: -76px auto 0; max-width: 1100px; padding: 0 26px; position: relative; width: 100%; z-index: 2; }
        .playerProfileV3__avatar { align-items: center; background: linear-gradient(135deg, #10233c, var(--profile-accent)); border: 5px solid #fff; border-radius: 999px; box-shadow: 0 0 0 2px var(--profile-accent), 0 16px 32px rgba(15,23,42,.2); color: #fff; cursor: pointer; display: flex; font: inherit; font-size: 38px; font-weight: 900; height: 128px; justify-content: center; overflow: visible; padding: 0; position: relative; width: 128px; }
        .playerProfileV3__avatar img { border-radius: inherit; object-fit: cover; }
        .playerProfileV3__avatar > span { align-items: center; background: #061b3a; border: 2px solid #fff; border-radius: 999px; bottom: 2px; color: #fff; display: flex; height: 30px; justify-content: center; position: absolute; right: 2px; width: 30px; }
        .playerProfileV3__identity { align-self: end; min-width: 0; padding-bottom: 5px; }
        .playerProfileV3__identity h1 { color: #061b3a; font-size: clamp(26px, 3.2vw, 38px); font-weight: 780; line-height: 1.04; margin: 0; overflow-wrap: anywhere; }
        .playerProfileV3__identity p { color: #64748b; font-size: 14px; font-weight: 550; line-height: 1.3; margin: 5px 0 2px; }
        .playerProfileV3__club { color: color-mix(in srgb, var(--profile-accent) 78%, #061b3a); font-size: 14px; font-weight: 750; text-decoration: none; }
        .playerProfileV3__club:hover { text-decoration: underline; }
        .playerProfileV3__metrics { align-self: end; background: rgba(255,255,255,.95); border: 1px solid rgba(226,232,240,.9); border-radius: 14px; box-shadow: 0 10px 24px rgba(15,23,42,.07); display: grid; gap: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 290px; overflow: hidden; }
        .playerProfileV3__metrics span { display: grid; gap: 2px; min-width: 0; padding: 10px 12px; text-align: center; }
        .playerProfileV3__metrics span + span { border-left: 1px solid #e2e8f0; }
        .playerProfileV3__metrics small, .playerProfileV3__summary > article > span, .playerProfileV3__list h2 { color: #64748b; font-size: 10px; font-weight: 750; text-transform: uppercase; }
        .playerProfileV3__metrics strong { color: #061b3a; font-size: 15px; font-weight: 800; overflow-wrap: anywhere; }
        .playerProfileV3__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 0 auto; max-width: 1100px; padding: 0 26px; width: 100%; }
        .playerProfileV3__actions a, .playerProfileV3__actions button { align-items: center; background: #fff; border: 1px solid #dbe5ef; border-radius: 11px; color: #173457; cursor: pointer; display: inline-flex; font: inherit; font-size: 13px; font-weight: 720; gap: 6px; justify-content: center; min-height: 40px; padding: 0 13px; text-decoration: none; }
        .playerProfileV3__actions .is-primary { background: #061b3a; border-color: color-mix(in srgb, var(--profile-accent) 36%, #061b3a); color: #fff; }
        .playerProfileV3__tabs { border-bottom: 1px solid #e2e8f0; display: flex; gap: 4px; justify-content: center; padding: 4px 18px 0; }
        .playerProfileV3__tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; color: #64748b; cursor: pointer; font: inherit; font-size: 13px; font-weight: 680; min-height: 42px; padding: 0 14px; }
        .playerProfileV3__tabs button.is-active { border-bottom-color: var(--profile-accent); color: #061b3a; }
        .playerProfileV3__summary, .playerProfileV3__stats, .playerProfileV3__list { display: grid; gap: 10px; margin: 0 auto; max-width: 1100px; padding: 0 26px; width: 100%; }
        .playerProfileV3__summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .playerProfileV3__summary article, .playerProfileV3__stats article, .playerProfileV3__list article, .playerProfileV3__empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 8px 20px rgba(15,23,42,.04); min-width: 0; }
        .playerProfileV3__summary article { display: grid; gap: 5px; min-height: 112px; padding: 13px; }
        .playerProfileV3__summary strong { color: #061b3a; font-size: 16px; font-weight: 780; line-height: 1.15; overflow-wrap: anywhere; }
        .playerProfileV3__summary p { color: #64748b; font-size: 12px; font-weight: 550; line-height: 1.35; margin: 0; }
        .playerProfileV3__summary a { color: #061b3a; display: grid; gap: 5px; text-decoration: none; }
        .playerProfileV3__summary button { background: transparent; border: 0; color: color-mix(in srgb, var(--profile-accent) 76%, #061b3a); cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; justify-self: start; padding: 0; }
        .playerProfileV3__stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .playerProfileV3__stats article { align-items: center; display: grid; gap: 4px; min-height: 108px; padding: 14px; text-align: center; }
        .playerProfileV3__stats svg { color: var(--profile-accent); justify-self: center; }
        .playerProfileV3__stats span { color: #64748b; font-size: 11px; font-weight: 650; }
        .playerProfileV3__stats strong { color: #061b3a; font-size: 24px; font-weight: 800; }
        .playerProfileV3__stats small { color: color-mix(in srgb, var(--profile-accent) 72%, #061b3a); font-size: 11px; font-weight: 750; }
        .playerProfileV3__list { max-width: 760px; }
        .playerProfileV3__list h2 { margin: 0; }
        .playerProfileV3__list article { display: grid; gap: 3px; padding: 12px 13px; }
        .playerProfileV3__list strong { color: #061b3a; font-size: 15px; font-weight: 760; overflow-wrap: anywhere; }
        .playerProfileV3__list span, .playerProfileV3__list small { color: #64748b; font-size: 12px; font-weight: 550; }
        .playerProfileV3__empty { color: #64748b; font-size: 13px; font-weight: 600; padding: 16px; text-align: center; }
        .playerProfileV3__summary--achievements { grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 760px; }
        @media (max-width: 700px) {
          .playerProfileV3 { gap: 10px; margin: -10px; padding-bottom: 10px; }
          .playerProfileV3__cover { height: 164px; }
          .playerProfileV3__back { left: 10px; top: 8px; }
          .playerProfileV3__coverEdit { bottom: 8px; font-size: 11px; min-height: 32px; right: 10px; }
          .playerProfileV3__intro { display: flex; flex-direction: column; gap: 7px; margin-top: -64px; padding: 0 12px; text-align: center; }
          .playerProfileV3__avatar { flex: 0 0 124px; font-size: 34px; height: 124px; width: 124px; }
          .playerProfileV3__identity { align-self: auto; padding: 0; }
          .playerProfileV3__identity h1 { display: -webkit-box; font-size: clamp(24px, 7vw, 30px); -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.06; overflow: hidden; }
          .playerProfileV3__identity p, .playerProfileV3__club { font-size: 13px; }
          .playerProfileV3__metrics { min-width: 0; width: 100%; }
          .playerProfileV3__metrics span { padding: 9px 6px; }
          .playerProfileV3__metrics strong { font-size: 13px; }
          .playerProfileV3__actions { gap: 6px; padding: 0 12px; }
          .playerProfileV3__actions a, .playerProfileV3__actions button { flex: 1 1 0; font-size: 12px; min-height: 40px; padding: 0 8px; white-space: nowrap; }
          .playerProfileV3__tabs { gap: 0; justify-content: stretch; overflow-x: auto; padding: 0 8px; }
          .playerProfileV3__tabs button { flex: 1 0 auto; font-size: 12px; min-height: 40px; padding: 0 9px; }
          .playerProfileV3__summary, .playerProfileV3__stats, .playerProfileV3__list { gap: 8px; padding: 0 12px; }
          .playerProfileV3__summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .playerProfileV3__summary article { min-height: 104px; padding: 11px; }
          .playerProfileV3__summary strong { font-size: 14px; }
          .playerProfileV3__summary p { font-size: 11px; }
          .playerProfileV3__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .playerProfileV3__stats article { min-height: 94px; padding: 10px; }
          .playerProfileV3__summary--achievements { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .player-premiumTopbar { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
        .player-premiumTopActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .player-backBtn, .player-secondaryBtn { border-radius: 10px; font-size: 13px; font-weight: 850; padding: 9px 12px; text-decoration: none; }
        .player-backBtn { background: #fff1f7; border: 1px solid #fbcfe8; color: #be185d; }
        .player-secondaryBtn { background: #ecfeff; border: 1px solid #a5f3fc; color: #0e7490; }
        .player-editProfileBtn { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; cursor: pointer; display: inline-flex; font: inherit; font-size: 13px; font-weight: 900; gap: 7px; min-height: 38px; padding: 8px 12px; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .player-editProfileBtn:hover { border-color: rgba(14,165,233,.36); box-shadow: 0 12px 26px rgba(14,165,233,.10); transform: translateY(-1px); }
        .player-message { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; color: #9f1239; font-weight: 800; padding: 10px 12px; }
        .profileHeroV2 { background: #071426; border-radius: 0; height: 420px; margin-left: -18px; margin-right: -18px; overflow: hidden; position: relative; width: calc(100% + 36px); }
        .profileHeroV2__background { background: linear-gradient(135deg, #091729, #173457 48%, #22152c); inset: 0; position: absolute; }
        .profileHeroV2__background img { filter: saturate(1.02) brightness(1) blur(.1px); object-fit: cover; object-position: center; opacity: 1; }
        .profileHeroV2__wash { background:
          linear-gradient(90deg, rgba(5,15,35,.38) 0%, rgba(10,20,45,.25) 48%, rgba(15,23,42,.20) 100%),
          radial-gradient(circle at 11% 38%, var(--profile-accent-glow, rgba(103,232,249,.14)), transparent 34%),
          radial-gradient(circle at 92% 42%, rgba(255,255,255,.08), transparent 30%);
          inset: 0; position: absolute;
        }
        .profileHeroV2__band { background: rgba(15,23,42,.22); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.09); border-left: 3px solid var(--profile-accent, rgba(103,232,249,.72)); border-radius: 0 28px 28px 0; box-shadow: 0 22px 54px rgba(0,0,0,.10); clip-path: polygon(0 0, 88% 0, 100% 100%, 0 100%); height: 188px; left: 34px; position: absolute; right: 170px; top: 188px; }
        .profileHeroV2__band::after { display: none; }
        .profileHeroV2__content { align-items: center; display: grid; gap: 30px; grid-template-columns: 256px minmax(0, 1fr) 220px; height: 100%; padding: 108px 70px 8px; position: relative; z-index: 2; }
        .profileHeroV2__avatar { align-items: center; background:
          radial-gradient(circle at 30% 24%, var(--profile-accent-glow, rgba(103,232,249,.24)), transparent 32%),
          linear-gradient(135deg, #0f2c4a, #111827 58%, #172554);
          border: 7px solid rgba(255,255,255,.98); border-radius: 999px; box-shadow: 0 24px 54px rgba(0,0,0,.28), 0 0 0 2px var(--profile-accent, rgba(103,232,249,.72)), 0 0 24px var(--profile-accent-glow, rgba(103,232,249,.18)); color: #fff; cursor: pointer; display: flex; font: inherit; font-size: 72px; font-weight: 950; height: 256px; justify-content: center; overflow: hidden; padding: 0; position: relative; width: 256px; }
        .profileHeroV2__avatar img { object-fit: cover; }
        .profileHeroV2__camera { align-items: center; background: linear-gradient(135deg, #0ea5e9, #2563eb); border: 3px solid #fff; border-radius: 999px; bottom: 8px; color: #fff; display: flex; font-size: 9px; font-weight: 950; height: 34px; justify-content: center; position: absolute; right: 8px; width: 34px; }
        .profileHeroV2__identity { min-width: 0; transform: translateY(22px); }
        .profileHeroV2__identity h1 { color: #fff; font-size: clamp(34px, 3vw, 44px); font-weight: 800; letter-spacing: 0; line-height: 1.02; margin: 0 0 12px; max-width: 620px; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 18px 42px rgba(0,0,0,.28); white-space: nowrap; }
        .profileHeroV2__identity--long h1 { display: -webkit-box; font-size: clamp(30px, 2.6vw, 40px); line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.03; white-space: normal; }
        .profileHeroV2__identity p { color: rgba(255,255,255,.82); font-size: 17px; font-weight: 700; margin: 0 0 14px; }
        .profileHeroV2__meta { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
        .profileHeroV2__meta > span:not(.profileHeroV2__position)::before { color: rgba(255,255,255,.54); content: '·'; margin-right: 8px; }
        .profileHeroV2__position { background: var(--profile-accent-bg, rgba(8,145,178,.26)); border: 1px solid var(--profile-accent-soft, rgba(103,232,249,.44)); border-radius: 999px; box-shadow: 0 10px 24px var(--profile-accent-glow, rgba(103,232,249,.18)); color: #fff; padding: 5px 10px; text-shadow: 0 8px 18px rgba(0,0,0,.30); }
        .profileHeroV2__partner { align-items: center; background: rgba(15,23,42,.22); border: 1px solid var(--profile-accent-soft, rgba(103,232,249,.44)); border-radius: 999px; box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 0 22px transparent; color: #ffffff !important; display: inline-flex; font-size: 15px; font-weight: 900; gap: 10px; margin-bottom: 16px; padding: 7px 13px 7px 8px; text-decoration: none; text-shadow: 0 8px 20px rgba(0,0,0,.35); transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .profileHeroV2__partner:hover { background: var(--profile-accent-bg, rgba(8,145,178,.24)); border-color: var(--profile-accent, rgba(103,232,249,.9)); box-shadow: 0 0 0 1px var(--profile-accent-soft, rgba(103,232,249,.36)), 0 12px 28px var(--profile-accent-glow, rgba(103,232,249,.22)); transform: translateY(-1px); }
        .profileHeroV2__partner:active { box-shadow: 0 0 0 2px var(--profile-accent-soft, rgba(103,232,249,.44)), 0 8px 18px var(--profile-accent-glow, rgba(103,232,249,.18)); transform: translateY(0) scale(.98); }
        .profileHeroV2__partner span { align-items: center; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; color: #fff; display: inline-flex; font-size: 9px; font-weight: 950; height: 28px; justify-content: center; width: 28px; }
        .profileHeroV2--male { --profile-accent: rgba(103,232,249,.92); --profile-accent-soft: rgba(103,232,249,.44); --profile-accent-glow: rgba(103,232,249,.24); --profile-accent-bg: rgba(8,145,178,.26); }
        .profileHeroV2--female { --profile-accent: rgba(244,114,182,.94); --profile-accent-soft: rgba(244,114,182,.46); --profile-accent-glow: rgba(244,114,182,.24); --profile-accent-bg: rgba(190,24,93,.26); }
        .profileHeroV2__badges { display: flex; flex-wrap: wrap; gap: 7px; }
        .profileHeroV2__badges span { background: rgba(15,23,42,.34); border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: rgba(255,255,255,.86); font-size: 13px; font-weight: 850; padding: 10px 16px; }
        .profileHeroV2__badges span:first-child { background: rgba(34,197,94,.18); border-color: rgba(34,197,94,.38); color: #74f39a; }
        .profileHeroV2__badges span:nth-child(2) { background: rgba(37,99,235,.18); border-color: rgba(59,130,246,.36); color: #cfe6ff; }
        .profileHeroV2__badges span:nth-child(3) { background: rgba(245,158,11,.16); border-color: rgba(245,158,11,.40); color: #f8c55c; }
        .profileHeroV2__rank { align-self: end; background: rgba(255,255,255,.95); border: 1px solid color-mix(in srgb, var(--profile-accent, rgba(103,232,249,.72)) 34%, #e2e8f0); border-radius: 18px; box-shadow: 0 16px 36px rgba(15,23,42,.12); color: #061b3a; display: grid; gap: 4px; min-height: 128px; margin-bottom: 26px; padding: 13px 13px; width: 230px; }
        .profileHeroV2__rank--magenta { box-shadow: 0 16px 36px rgba(15,23,42,.12); }
        .profileHeroV2__rank > span, .profileHeroV2__rank small, .profileHeroV2__rank b { color: #64748b; font-size: 9px; font-weight: 900; text-transform: uppercase; }
        .profileHeroV2__crown { color: #f59e0b !important; font-size: 14px !important; line-height: 1; text-transform: none !important; }
        .profileHeroV2__rankMain { align-items: center; display: grid; gap: 11px; grid-template-columns: minmax(0, 1fr) minmax(78px, .82fr); }
        .profileHeroV2__rankMain > div { border-left: 1px solid #dbeafe; padding-left: 10px; }
        .profileHeroV2__rankMain em { color: #061b3a; font-size: 62px; font-style: normal; font-weight: 950; letter-spacing: -.07em; line-height: .82; position: relative; }
        .profileHeroV2__rankMain em::after { background: var(--profile-accent, rgba(103,232,249,.72)); border-radius: 999px; bottom: -7px; content: ""; height: 4px; left: 8px; opacity: .72; position: absolute; right: 2px; }
        .profileHeroV2__rankMain--text { grid-template-columns: minmax(0, 1fr) minmax(76px, .65fr); }
        .profileHeroV2__rankMain--text em { font-size: 25px; letter-spacing: -.03em; line-height: .98; max-width: 112px; }
        .profileHeroV2__rankMain--text em::after { left: 1px; right: 20px; }
        .profileHeroV2__rankMain strong { color: #08204a; display: block; font-size: 25px; font-weight: 900; line-height: .95; margin: 1px 0; }
        .profileHeroV2__rank i { background: color-mix(in srgb, var(--profile-accent, #0ea5e9) 14%, #f8fafc); border: 1px solid color-mix(in srgb, var(--profile-accent, #0ea5e9) 22%, #e2e8f0); border-radius: 999px; color: #0f2745; font-size: 9px; font-style: normal; font-weight: 950; justify-self: start; padding: 4px 8px; text-transform: uppercase; }
        .player-statGrid { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
        .player-statGrid article, .player-card { background: rgba(255,255,255,.96); border: 1px solid rgba(226,232,240,.92); border-radius: 15px; box-shadow: 0 10px 24px rgba(15,23,42,.04); }
        .player-statGrid article {
          align-items: center;
          background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.93));
          border-color: rgba(148,163,184,.22);
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 96px;
          min-width: 0;
          overflow: hidden;
          padding: 12px 10px 11px;
          position: relative;
          text-align: center;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .player-statGrid article::before {
          background: linear-gradient(90deg, var(--stat-accent), var(--stat-accent-2));
          border-radius: 999px;
          content: "";
          height: 3px;
          left: 18px;
          opacity: .72;
          position: absolute;
          right: 18px;
          top: 0;
        }
        .player-statGrid article:hover { border-color: color-mix(in srgb, var(--stat-accent) 24%, #e2e8f0); box-shadow: 0 13px 28px rgba(15,23,42,.06); transform: translateY(-1px); }
        .player-statIcon {
          align-items: center;
          background: rgba(248,250,252,.88);
          border: 1px solid color-mix(in srgb, var(--stat-accent) 18%, #e2e8f0);
          border-radius: 12px;
          color: var(--stat-accent);
          display: flex;
          height: 31px;
          justify-content: center;
          margin-bottom: 6px;
          position: relative;
          width: 31px;
          z-index: 1;
        }
        .player-statIcon svg { height: 18px; width: 18px; }
        .player-statCard--blue { --stat-accent: #0891b2; --stat-accent-2: #172554; }
        .player-statCard--green { --stat-accent: #059669; --stat-accent-2: #0891b2; }
        .player-statCard--red { --stat-accent: #be123c; --stat-accent-2: #db2777; }
        .player-statCard--pink { --stat-accent: #a21caf; --stat-accent-2: #0891b2; }
        .player-statCard--gold { --stat-accent: #b77905; --stat-accent-2: #be123c; }
        .player-statGrid article:nth-child(5) { --stat-accent: #3730a3; --stat-accent-2: #0891b2; }
        .player-statLabel { color: #64748b; font-size: 10px; font-weight: 900; letter-spacing: .02em; line-height: 1.1; margin: 0 0 6px; max-width: 100%; position: relative; text-align: center; text-transform: uppercase; z-index: 1; }
        .player-statValue { color: #061b3a; font-size: clamp(27px, 2.25vw, 34px); font-weight: 950; letter-spacing: -.02em; line-height: .94; max-width: 100%; position: relative; text-align: center; z-index: 1; }
        .player-statMeta { color: #64748b; font-size: 11px; font-weight: 900; line-height: 1; margin-top: 6px; position: relative; text-align: center; z-index: 1; }
        .player-infoGrid span, .player-summaryList span { color: #64748b; font-size: 10px; font-weight: 850; line-height: 1.1; text-transform: uppercase; }
        .player-infoDeck { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(280px, .9fr); }
        .player-layout { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .player-layout--single { grid-template-columns: minmax(0, 1fr); }
        .player-bottomGrid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr); }
        .player-bottomGrid--single { grid-template-columns: minmax(0, 520px); }
        .player-lowerGrid { align-items: start; display: grid; gap: 14px; grid-template-columns: minmax(0, 1.45fr) minmax(300px, .75fr); }
        .player-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
          border-color: rgba(148,163,184,.22);
          display: grid;
          gap: 10px;
          min-width: 0;
          padding: 14px;
        }
        .player-card header { align-items: start; border-bottom: 1px solid rgba(226,232,240,.72); display: grid; gap: 2px; padding-bottom: 10px; }
        .player-card header h2 { color: #061b3a; font-size: 17px; font-weight: 900; line-height: 1.12; margin: 0; }
        .player-card .club-kicker { color: #0891b2; font-size: 10px; letter-spacing: .03em; }
        .player-infoGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .player-infoGrid div { background: #ffffff; border: 1px solid rgba(226,232,240,.92); border-radius: 12px; display: grid; gap: 3px; grid-template-columns: 31px minmax(0, 1fr); min-width: 0; padding: 10px; }
        .player-infoGrid i { align-items: center; align-self: center; background: color-mix(in srgb, var(--profile-accent, #0ea5e9) 10%, #f8fafc); border: 1px solid color-mix(in srgb, var(--profile-accent, #0ea5e9) 16%, #e2e8f0); border-radius: 11px; color: #2563eb; display: flex; font-style: normal; grid-row: span 2; height: 31px; justify-content: center; width: 31px; }
        .player-infoGrid strong { color: #061b3a; font-size: 13px; font-weight: 850; line-height: 1.2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .player-partnerBox, .player-placeholder { background: linear-gradient(135deg, #f8fafc, rgba(241,245,249,.72)); border: 1px solid rgba(226,232,240,.92); border-radius: 13px; color: #526277; display: grid; gap: 5px; padding: 12px; text-decoration: none; }
        .player-partnerBox { min-height: 104px; }
        .player-partnerBox--suggestion { min-height: 0; }
        .player-partnerBox strong { color: #0369a1; font-size: 18px; font-weight: 900; }
        .player-partnerBox span, .player-partnerBox p, .player-placeholder { font-size: 13px; font-weight: 700; line-height: 1.4; margin: 0; }
        .player-activePartnerBox { align-items: center; background:
          radial-gradient(circle at 10% 12%, rgba(103,232,249,.18), transparent 34%),
          linear-gradient(135deg, rgba(255,255,255,.96), rgba(236,253,255,.82));
          border: 1px solid rgba(103,232,249,.32); border-radius: 15px; box-shadow: 0 12px 26px rgba(8,47,73,.07); color: #061b3a; display: grid; gap: 11px; grid-template-columns: 46px minmax(0, 1fr) 32px; padding: 12px; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
        }
        .player-activePartnerBox:hover { border-color: rgba(14,165,233,.68); box-shadow: 0 18px 38px rgba(8,47,73,.12); transform: translateY(-1px); }
        .player-activePartnerIcon { align-items: center; background: linear-gradient(135deg, #0ea5e9, #53c7d9); border: 2px solid #fff; border-radius: 999px; box-shadow: 0 10px 22px rgba(14,165,233,.18); color: #fff; display: flex; font-size: 12px; font-weight: 950; height: 46px; justify-content: center; overflow: hidden; position: relative; width: 46px; }
        .player-activePartnerIcon img { object-fit: cover; }
        .player-activePartnerContent { display: grid; gap: 3px; min-width: 0; }
        .player-activePartnerContent b { background: rgba(14,165,233,.12); border: 1px solid rgba(14,165,233,.22); border-radius: 999px; color: #0369a1; font-size: 10px; font-weight: 950; justify-self: start; padding: 4px 8px; text-transform: uppercase; }
        .player-activePartnerContent strong { color: #061b3a; font-size: 16px; font-weight: 950; line-height: 1.18; overflow-wrap: anywhere; }
        .player-activePartnerContent small { color: #64748b; font-size: 11px; font-weight: 800; }
        .player-activePartnerBox i { align-items: center; background: rgba(255,255,255,.78); border: 1px solid rgba(14,165,233,.18); border-radius: 11px; color: #0891b2; display: flex; font-style: normal; height: 32px; justify-content: center; width: 32px; }
        .player-partnerStack { display: grid; gap: 9px; }
        .player-placeholder--activePartner { background: linear-gradient(135deg, rgba(248,250,252,.98), rgba(236,253,255,.74)); border-color: rgba(103,232,249,.22); }
        .player-placeholder--activePartner strong { color: #061b3a; font-size: 15px; font-weight: 950; }
        .player-inviteButton { align-items: center; background: linear-gradient(135deg, #0ea5e9, #06b6d4); border: 0; border-radius: 999px; box-shadow: 0 12px 22px rgba(14,165,233,.18); color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: 12px; font-weight: 950; gap: 7px; justify-self: start; margin-top: 5px; padding: 8px 11px; }
        .player-pendingInviteBox { align-items: center; background: linear-gradient(135deg, rgba(255,255,255,.98), rgba(239,246,255,.82)); border: 1px solid rgba(59,130,246,.22); border-radius: 16px; box-shadow: 0 14px 30px rgba(15,23,42,.06); display: grid; gap: 11px; grid-template-columns: 42px minmax(0, 1fr); padding: 13px; }
        .player-pendingInviteIcon { align-items: center; background: rgba(59,130,246,.10); border: 1px solid rgba(59,130,246,.20); border-radius: 14px; color: #2563eb; display: flex; height: 42px; justify-content: center; width: 42px; }
        .player-pendingInviteBox div { min-width: 0; }
        .player-pendingInviteBox b { color: #2563eb; display: block; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .player-pendingInviteBox strong { color: #061b3a; display: block; font-size: 17px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .player-pendingInviteBox small { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 2px; }
        .player-pendingInviteActions { display: flex; flex-wrap: wrap; gap: 7px; grid-column: 1 / -1; }
        .player-pendingInviteActions button { background: #fff; border: 1px solid #dbeafe; border-radius: 999px; color: #075985; cursor: pointer; font: inherit; font-size: 12px; font-weight: 900; padding: 7px 10px; }
        .player-pendingInviteActions button:first-child { background: #ecfeff; border-color: #a5f3fc; color: #0e7490; }
        .player-pendingInviteActions button:disabled, .player-inviteButton:disabled { cursor: wait; opacity: .62; }
        .player-partnerFeedback { background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 12px; color: #0e7490; font-size: 12px; font-weight: 850; margin: 0; padding: 9px 10px; }
        .player-inviteOverlay { align-items: center; background: rgba(15,23,42,.42); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 90; }
        .player-inviteModal { background:
          radial-gradient(circle at 12% 0%, rgba(103,232,249,.18), transparent 30%),
          radial-gradient(circle at 100% 12%, rgba(244,114,182,.12), transparent 28%),
          rgba(255,255,255,.96);
          border: 1px solid rgba(255,255,255,.72); border-radius: 20px; box-shadow: 0 28px 80px rgba(15,23,42,.24); display: grid; gap: 13px; max-height: min(720px, calc(100vh - 34px)); max-width: 560px; overflow: auto; padding: 16px; width: min(560px, 100%);
        }
        .player-inviteModal header, .player-inviteModal footer { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
        .player-inviteModal header h2 { color: #061b3a; font-size: 20px; font-weight: 950; margin: 2px 0 0; }
        .player-inviteModal header button, .player-inviteModal footer button { align-items: center; border-radius: 999px; cursor: pointer; display: inline-flex; font: inherit; font-size: 13px; font-weight: 950; gap: 7px; justify-content: center; padding: 9px 12px; }
        .player-inviteModal header button { background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; height: 38px; padding: 0; width: 38px; }
        .player-inviteModal footer button:first-child { background: #fff; border: 1px solid #e2e8f0; color: #334155; }
        .player-inviteModal footer button:last-child { background: linear-gradient(135deg, #0ea5e9, #06b6d4); border: 0; color: #fff; }
        .player-inviteModal footer button:disabled { cursor: not-allowed; opacity: .55; }
        .player-inviteSearch { align-items: center; background: #fff; border: 1px solid #dbeafe; border-radius: 14px; color: #2563eb; display: grid; gap: 9px; grid-template-columns: 18px minmax(0, 1fr); padding: 10px 12px; }
        .player-inviteSearch input { background: transparent; border: 0; color: #061b3a; font: inherit; font-size: 14px; font-weight: 750; min-width: 0; outline: none; }
        .player-inviteResults { display: grid; gap: 8px; }
        .player-inviteResults button { align-items: center; background: rgba(255,255,255,.86); border: 1px solid #e2e8f0; border-radius: 14px; color: #061b3a; cursor: pointer; display: grid; gap: 8px; grid-template-columns: 38px minmax(0, 1fr) auto 18px; padding: 9px; text-align: left; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .player-inviteResults button:hover, .player-inviteResults button.is-selected { border-color: rgba(14,165,233,.52); box-shadow: 0 12px 24px rgba(14,165,233,.10); transform: translateY(-1px); }
        .player-inviteResults button > span { align-items: center; background: linear-gradient(135deg, #0ea5e9, #172554); border-radius: 999px; color: #fff; display: flex; font-size: 11px; font-weight: 950; height: 38px; justify-content: center; overflow: hidden; position: relative; width: 38px; }
        .player-inviteResults button > span img { object-fit: cover; }
        .player-inviteResults button strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .player-inviteResults button small { color: #64748b; font-size: 11px; font-weight: 800; }
        .player-inviteResults button svg { color: #0891b2; }
        .player-inviteMessage { display: grid; gap: 6px; }
        .player-inviteMessage span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .player-inviteMessage textarea { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; color: #061b3a; font: inherit; font-size: 13px; font-weight: 750; min-height: 76px; outline: none; padding: 10px 12px; resize: vertical; }
        .player-editOverlay { align-items: center; background: rgba(15,23,42,.44); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 92; }
        .player-editModal { background:
          radial-gradient(circle at 12% 0%, rgba(103,232,249,.18), transparent 30%),
          radial-gradient(circle at 100% 8%, rgba(244,114,182,.12), transparent 28%),
          rgba(255,255,255,.97);
          border: 1px solid rgba(255,255,255,.78); border-radius: 22px; box-shadow: 0 28px 90px rgba(15,23,42,.26); color: #061b3a; display: grid; gap: 13px; max-height: min(820px, calc(100vh - 34px)); max-width: 820px; overflow: auto; padding: 16px; width: min(820px, 100%);
        }
        .player-editModal header, .player-editModal footer { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
        .player-editModal header h2 { color: #061b3a; font-size: 22px; font-weight: 950; margin: 2px 0 4px; }
        .player-editModal header p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; max-width: 560px; }
        .player-editModal header button { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; color: #334155; cursor: pointer; display: inline-flex; flex: 0 0 auto; height: 38px; justify-content: center; padding: 0; width: 38px; }
        .player-editError { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 13px; color: #9f1239; font-size: 13px; font-weight: 850; padding: 10px 12px; }
        .player-editSection { background: rgba(248,250,252,.72); border: 1px solid rgba(226,232,240,.78); border-radius: 17px; display: grid; gap: 11px; padding: 13px; }
        .player-editSection h3 { align-items: center; color: #061b3a; display: flex; font-size: 14px; font-weight: 950; gap: 7px; margin: 0; }
        .player-editGrid, .player-editMediaGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .player-editGrid label, .player-editMediaGrid label { display: grid; gap: 6px; min-width: 0; }
        .player-editGrid span, .player-editMediaGrid span { color: #64748b; font-size: 10px; font-weight: 950; letter-spacing: .03em; text-transform: uppercase; }
        .player-editGrid input, .player-editGrid select { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; color: #061b3a; font: inherit; font-size: 13px; font-weight: 800; min-height: 40px; outline: none; padding: 9px 11px; width: 100%; }
        .player-editGrid input:focus, .player-editGrid select:focus { border-color: rgba(14,165,233,.55); box-shadow: 0 0 0 3px rgba(14,165,233,.10); }
        .player-editGrid .is-locked input { background: #f8fafc; color: #64748b; cursor: not-allowed; }
        .player-editPreview { align-items: center; background: linear-gradient(135deg, #eff6ff, #ecfeff); border: 1px dashed rgba(14,165,233,.34); color: #0f3b67; display: flex; font-size: 30px; font-weight: 950; justify-content: center; overflow: hidden; position: relative; }
        .player-editPreview img { height: 100%; object-fit: cover; width: 100%; }
        .player-editPreview--avatar { border-radius: 999px; height: 112px; width: 112px; }
        .player-editPreview--cover { border-radius: 14px; min-height: 112px; width: 100%; }
        .player-editPreview small { color: #64748b; font-size: 12px; font-weight: 750; line-height: 1.35; padding: 12px; text-align: center; }
        .player-editMediaGrid input { color: #64748b; font: inherit; font-size: 12px; font-weight: 800; max-width: 100%; }
        .player-editModal footer { border-top: 1px solid rgba(226,232,240,.84); padding-top: 12px; }
        .player-editModal footer button { align-items: center; border-radius: 999px; cursor: pointer; display: inline-flex; font: inherit; font-size: 13px; font-weight: 950; gap: 7px; justify-content: center; padding: 9px 13px; }
        .player-editModal footer button:first-child { background: #fff; border: 1px solid #e2e8f0; color: #334155; }
        .player-editModal footer button:last-child { background: linear-gradient(135deg, #0ea5e9, #06b6d4); border: 0; color: #fff; }
        .player-editModal footer button:disabled { cursor: wait; opacity: .62; }
        .player-list, .player-timeline, .player-summaryList { display: grid; gap: 8px; }
        .player-list div, .player-timeline div, .player-summaryList div { background: linear-gradient(135deg, #f8fafc, rgba(236,253,255,.34)); border: 1px solid rgba(226,232,240,.92); border-radius: 12px; display: grid; gap: 3px; padding: 10px 11px; }
        .player-list strong, .player-timeline strong, .player-summaryList strong { color: #061b3a; font-size: 13px; font-weight: 900; }
        .player-summaryList div { align-items: center; grid-template-columns: 1fr auto; }
        .player-list span, .player-list em, .player-timeline span, .player-timeline p { color: #64748b; font-size: 12px; font-style: normal; font-weight: 700; line-height: 1.32; margin: 0; }
        .player-lightbox { align-items: center; background: rgba(2,6,23,.82); display: grid; inset: 0; justify-items: center; padding: 24px; position: fixed; z-index: 80; }
        .player-lightbox button { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; color: #fff; cursor: pointer; font: inherit; font-size: 13px; font-weight: 900; padding: 9px 13px; position: absolute; right: 22px; top: 22px; }
        .player-lightboxImage { align-items: center; background: #0f172a; border: 1px solid rgba(255,255,255,.2); border-radius: 28px; box-shadow: 0 28px 90px rgba(0,0,0,.45); color: #fff; display: flex; font-size: 58px; font-weight: 950; height: min(420px, 74vw); justify-content: center; overflow: hidden; position: relative; width: min(420px, 74vw); }
        .player-lightboxImage img { object-fit: cover; }
        @media (max-width: 980px) {
          .profileHeroV2 { height: auto; min-height: 0; }
          .profileHeroV2__content { grid-template-columns: 1fr; height: auto; padding: 34px 18px 18px; }
          .profileHeroV2__band { bottom: 12px; clip-path: none; left: 12px; right: 12px; top: 78px; width: auto; }
          .profileHeroV2__band::after { left: 16px; right: 16px; top: 16px; }
          .profileHeroV2__identity h1 { font-size: 34px; white-space: normal; }
          .profileHeroV2__rank { height: auto; max-width: 320px; width: 100%; }
          .player-statGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .player-infoDeck, .player-layout, .player-bottomGrid, .player-lowerGrid { grid-template-columns: 1fr; }
          .player-editGrid, .player-editMediaGrid { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .player-premium.is-own-profile {
            gap: 10px;
            padding: 10px;
          }
          .player-premium.is-own-profile .player-premiumTopbar {
            flex-wrap: nowrap;
            gap: 6px;
          }
          .player-premium.is-own-profile .player-premiumTopActions {
            flex-wrap: nowrap;
            gap: 6px;
          }
          .player-premium.is-own-profile .player-backBtn,
          .player-premium.is-own-profile .player-secondaryBtn,
          .player-premium.is-own-profile .player-editProfileBtn {
            align-items: center;
            display: inline-flex;
            font-size: 11px;
            justify-content: center;
            min-height: 40px;
            padding: 0 9px;
            white-space: nowrap;
          }
          .player-premium.is-own-profile .profileHeroV2 {
            background: linear-gradient(145deg, #071426, #10233c 62%, #17182c);
            border-radius: 18px;
            margin: 0;
            width: 100%;
          }
          .player-premium.is-own-profile .profileHeroV2__background img {
            filter: grayscale(.2) saturate(.7);
            opacity: .08;
          }
          .player-premium.is-own-profile .profileHeroV2__wash {
            background: radial-gradient(circle at 10% 10%, var(--profile-accent-glow, rgba(103,232,249,.18)), transparent 36%), linear-gradient(135deg, rgba(2,6,23,.22), rgba(15,23,42,.58));
          }
          .player-premium.is-own-profile .profileHeroV2__band {
            background: rgba(255,255,255,.045);
            border-color: rgba(255,255,255,.08);
            border-left-color: var(--profile-accent, rgba(103,232,249,.72));
            bottom: 10px;
            left: 10px;
            right: 10px;
            top: 10px;
          }
          .player-premium.is-own-profile .profileHeroV2__content {
            align-items: center;
            gap: 10px 12px;
            grid-template-columns: 92px minmax(0, 1fr);
            padding: 14px;
          }
          .player-premium.is-own-profile .profileHeroV2__avatar {
            font-size: 28px;
            height: 92px;
            justify-self: start;
            width: 92px;
          }
          .player-premium.is-own-profile .profileHeroV2__identity {
            min-width: 0;
          }
          .player-premium.is-own-profile .profileHeroV2__identity h1 {
            display: -webkit-box;
            font-size: clamp(20px, 5.6vw, 22px);
            line-clamp: 2;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            line-height: 1.02;
            margin-bottom: 7px;
            overflow: hidden;
            white-space: normal;
          }
          .player-premium.is-own-profile .profileHeroV2__meta {
            gap: 5px;
          }
          .player-premium.is-own-profile .profileHeroV2__meta > span {
            font-size: 11px;
          }
          .player-premium.is-own-profile .profileHeroV2__meta > span:not(.profileHeroV2__position)::before {
            margin-right: 5px;
          }
          .player-premium.is-own-profile .profileHeroV2__partner {
            display: none;
          }
          .player-premium.is-own-profile .profileHeroV2__rank {
            align-items: center;
            display: grid;
            grid-column: 1 / -1;
            grid-template-columns: auto minmax(0, 1fr) auto;
            min-height: 66px;
            padding: 9px 10px;
          }
          .player-premium.is-own-profile .profileHeroV2__rank > span,
          .player-premium.is-own-profile .profileHeroV2__crown {
            display: none;
          }
          .player-premium.is-own-profile .profileHeroV2__rankMain,
          .player-premium.is-own-profile .profileHeroV2__rankMain--text {
            gap: 10px;
            grid-template-columns: minmax(88px, .9fr) minmax(78px, 1fr);
          }
          .player-premium.is-own-profile .profileHeroV2__rankMain em {
            font-size: 20px;
            max-width: none;
          }
          .player-premium.is-own-profile .profileHeroV2__rankMain em::after {
            bottom: -5px;
            left: 0;
            right: 12px;
          }
          .player-premium.is-own-profile .profileHeroV2__rankMain strong {
            font-size: 21px;
          }
          .player-premium.is-own-profile .profileHeroV2__rank i {
            justify-self: end;
          }
          .player-premium.is-own-profile .player-statGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .player-premium.is-own-profile .player-statGrid article:nth-child(n + 5) {
            display: none;
          }
          .profileHeroV2 {
            margin-left: -12px;
            margin-right: -12px;
            width: calc(100% + 24px);
          }
          .profileHeroV2__content {
            gap: 12px;
            padding: 20px 12px 12px;
          }
          .profileHeroV2__band {
            border-radius: 18px;
            bottom: 10px;
            left: 10px;
            right: 10px;
            top: 54px;
          }
          .profileHeroV2__avatar {
            border-width: 4px;
            box-shadow: 0 14px 30px rgba(0,0,0,.22), 0 0 0 1px var(--profile-accent, rgba(103,232,249,.62));
            font-size: 34px;
            height: 112px;
            justify-self: start;
            width: 112px;
          }
          .profileHeroV2__camera {
            border-width: 2px;
            bottom: 2px;
            height: 26px;
            right: 2px;
            width: 26px;
          }
          .profileHeroV2__identity {
            transform: none;
          }
          .profileHeroV2__identity h1 {
            font-size: clamp(25px, 8vw, 32px);
            margin-bottom: 7px;
          }
          .profileHeroV2__identity p {
            font-size: 13px;
            line-height: 1.25;
            margin-bottom: 9px;
          }
          .profileHeroV2__partner {
            font-size: 12px;
            margin-bottom: 9px;
            padding: 6px 10px 6px 7px;
          }
          .profileHeroV2__badges {
            gap: 5px;
          }
          .profileHeroV2__badges span {
            font-size: 11px;
            padding: 7px 10px;
          }
          .profileHeroV2__rank {
            border-radius: 15px;
            gap: 3px;
            margin-bottom: 0;
            max-width: none;
            min-height: 0;
            padding: 10px;
            width: 100%;
          }
          .profileHeroV2__rankMain {
            gap: 8px;
            grid-template-columns: minmax(0, .8fr) minmax(0, 1fr);
          }
          .profileHeroV2__rankMain em {
            font-size: 42px;
          }
          .profileHeroV2__rankMain strong {
            font-size: 22px;
          }
          .player-statGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .player-statGrid article {
            min-height: 78px;
            padding: 10px 8px;
          }
          .player-statLabel {
            font-size: 9px;
          }
          .player-statValue {
            font-size: clamp(22px, 8vw, 30px);
            overflow-wrap: anywhere;
          }
          .player-infoGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
