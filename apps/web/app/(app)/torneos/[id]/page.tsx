'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Trophy, Users } from 'lucide-react'
import PampraxHero from '@/components/ui/PampraxHero'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'
import { BRAND } from '@/lib/branding'

type PublicTournamentDetail = {
  tournament: {
    id: string
    clubId: string
    name: string
    status: string
    type: string
    format: string
    gender: string
    segment: string
    category: number | null
    startDate: string | null
    endDate: string | null
    registrationDeadline: string | null
    minPairs: number | null
    maxPairs: number | null
    pricePerPlayer: number | null
    pointsTotal: number | null
    rulesSummary: {
      description: string | null
      competitionSystem: string | null
      venueName: string | null
      tiebreaker: string | null
      courtsCount: number | null
      courts: string[]
      scheduleMode: string | null
      pointsMode: string | null
      pointsConfig?: {
        champion?: number
        finalist?: number
        semifinalist?: number
        quarterfinalist?: number
        round_of_16?: number
        eighthFinalist?: number
        zone?: number
        participation?: number
      }
    }
  }
  club: {
    id: string
    name: string
    logoUrl: string | null
    city: string | null
    province: string | null
    address: string | null
    themeKey: string | null
  } | null
  status: {
    key: 'live' | 'registration_open' | 'upcoming' | 'finished' | 'draft' | 'cancelled'
    label: string
    priority: number
    className: string
  }
  flyerUrl: string | null
  labels: {
    category: string
    gender: string
    segment: string
    tournamentType: string
  }
  dates: {
    startDate: string | null
    endDate: string | null
    registrationDeadline: string | null
  }
  price: {
    pricePerPlayer: number | null
  }
  capacity: {
    registeredTeamsCount: number
    maxPairs: number | null
    spotsLeft: number | null
  }
  viewer: {
    isAuthenticated: boolean
    isPlayerInClub: boolean
    isRegisteredInTournament: boolean
    myTeam: null | {
      id: string
      registrationId: string | null
      registrationStatus: string | null
      availability?: null | {
        preferredSlots: string[]
        availabilityScore: number | null
        flexibilityLevel: string | null
      }
      paymentStatus?: string | null
      paymentMethod?: string | null
      registrationChangeRequest?: null | {
        id: string
        type: string
        status: string
        reason: string | null
        refundPercent?: number | null
        refundPolicyLabel?: string | null
        refundMetadata?: Record<string, unknown> | null
        createdAt: string | null
        resolvedAt: string | null
      }
      players: Array<{ userId: string; name: string; avatarUrl: string | null }>
    }
    activePartnership: null | {
      id: string
      status: string
      acceptedAt: string | null
      createdAt: string | null
      partner: null | { clubPlayerId: string; userId: string | null; name: string; avatarUrl: string | null }
    }
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const datePart = value.includes('T') ? value.split('T')[0] : value
  const date = new Date(`${datePart}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateLong(value?: string | null) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  const date = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    .formatToParts(parsed)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value
      return acc
    }, {})
  const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed)
  return `${date.day} de ${date.month} de ${date.year} · ${time}`
}

function formatMoney(value?: number | null) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'A confirmar'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount)
}

function formatSystem(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  const labels: Record<string, string> = {
    GROUPS_PLAYOFF: 'Zonas + Playoff',
    GROUPS_ELIMINATION: 'Zonas + Playoff',
    ROUND_ROBIN: 'Todos contra todos',
    SINGLE_ELIMINATION: 'Eliminación directa',
  }
  return labels[normalized] ?? value ?? 'A definir por la organización'
}

function getPostRegistrationPaymentView(status?: string | null, method?: string | null) {
  const normalizedStatus = String(status ?? '').toUpperCase()
  const normalizedMethod = String(method ?? '').toUpperCase()

  if (normalizedMethod === 'CASH_ON_SITE_REQUEST' && normalizedStatus === 'PENDING') {
    return {
      tone: 'warning',
      badge: 'SOLICITUD PENDIENTE',
      title: 'Pago en club pendiente',
      text: 'El club debe aprobar tu solicitud para confirmar tu lugar. Puede demorar hasta 24 hs.',
      secondaryText: 'Podés enviar un mensaje si necesitás consultar el estado.',
      registrationLabel: 'Pendiente',
      paymentLabel: 'Pendiente',
      action: 'message' as const,
    }
  }
  if (normalizedStatus === 'APPROVED' || normalizedStatus === 'PAID') {
    return {
      tone: 'success',
      badge: normalizedStatus === 'PAID' ? 'PAGO ACREDITADO' : 'INSCRIPCIÓN CONFIRMADA',
      title: 'Todo listo para competir',
      text: 'Tu lugar está confirmado.',
      secondaryText: null,
      registrationLabel: 'Confirmada',
      paymentLabel: 'Aprobado',
      action: null,
    }
  }
  if (normalizedStatus === 'REJECTED') {
    return {
      tone: 'danger',
      badge: 'PAGO RECHAZADO',
      title: 'El club rechazó la solicitud',
      text: 'Necesitás elegir otro método de pago para avanzar.',
      secondaryText: null,
      registrationLabel: 'Pago rechazado',
      paymentLabel: 'Rechazado',
      action: 'pay' as const,
    }
  }
  return {
    tone: 'muted',
    badge: 'PAGO NO REGISTRADO',
    title: 'Pago no registrado',
    text: 'Completá el pago para que el club pueda confirmar tu lugar.',
    secondaryText: null,
    registrationLabel: 'Pendiente de pago',
    paymentLabel: 'No registrado',
    action: 'pay' as const,
  }
}

function isRegistrationClosed(value?: string | null) {
  if (!value) return false
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return false
  return deadline.getTime() <= Date.now()
}

function getRefundEstimate(startDate?: string | null, totalAmount?: number | null) {
  if (!startDate) return { percent: 0, amount: 0, label: 'Sujeto a aprobación del club' }
  const startsAt = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00`)
  if (Number.isNaN(startsAt.getTime())) return { percent: 0, amount: 0, label: 'Sujeto a aprobación del club' }
  const hoursLeft = (startsAt.getTime() - Date.now()) / 36e5
  const percent = hoursLeft > 72 ? 100 : hoursLeft > 48 ? 75 : hoursLeft > 24 ? 50 : 0
  const amount = Math.max(0, Math.round(Number(totalAmount ?? 0) * (percent / 100)))
  const label = percent > 0 ? `${percent}% estimado` : '0% o sujeto a aprobación'
  return { percent, amount, label }
}

function buildGoogleMapsUrl(parts: Array<string | null | undefined>) {
  const query = parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || 'SELPA')}`
}

function getTiebreakerSteps(value?: string | null) {
  const text = String(value ?? '').trim()
  if (!text) return []
  const [orderText, finalText] = text.split(/Si persiste el empate:/i)
  const orderSteps = orderText
    .replace(/\.$/, '')
    .split('→')
    .map((step) => {
      const normalized = step.trim()
      return normalized.toLowerCase() === 'puntos' ? 'Cantidad de puntos' : normalized
    })
    .filter(Boolean)
  const final = finalText?.replace(/\.$/, '').trim()
  return final ? [...orderSteps, final] : orderSteps
}

function getCountdownParts(value?: string | null) {
  if (!value) return { main: 'A confirmar', suffix: '' }
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return { main: 'A confirmar', suffix: '' }
  const diffMs = deadline.getTime() - Date.now()
  if (diffMs <= 0) return { main: 'Cerrada', suffix: '' }

  const totalMinutes = Math.max(1, Math.floor(diffMs / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    const dayText = `${days} día${days === 1 ? '' : 's'}`
    const hourText = `${hours} hora${hours === 1 ? '' : 's'}`
    return { main: `${dayText} y ${hourText}`, suffix: '' }
  }
  if (hours > 0) return { main: `${hours} hora${hours === 1 ? '' : 's'} y ${minutes} min`, suffix: '' }
  return { main: `${minutes} min`, suffix: '' }
}

function getPointDistribution(detail: PublicTournamentDetail) {
  const points = detail.tournament.rulesSummary.pointsConfig ?? {}
  const total = Number(detail.tournament.pointsTotal ?? 0)
  const fallbackByLabel: Record<string, number> = total > 0
    ? {
        Campeón: total,
        Finalista: Math.round(total * 0.8),
        Semifinalista: Math.round(total * 0.6),
        Cuartos: Math.round(total * 0.4),
        Octavos: Math.round(total * 0.3),
        'Participación/Zona': Math.round(total * 0.1),
      }
    : {}

  const items = [
    { label: 'Campeón', value: Number(points.champion ?? 0) || fallbackByLabel.Campeón || 0 },
    { label: 'Finalista', value: Number(points.finalist ?? 0) || fallbackByLabel.Finalista || 0 },
    { label: 'Semifinalista', value: Number(points.semifinalist ?? 0) || fallbackByLabel.Semifinalista || 0 },
    {
      label: 'Cuartos',
      value:
        Number((points as Record<string, unknown>).quarterfinalist ?? (points as Record<string, unknown>).quarterfinal ?? 0) ||
        fallbackByLabel.Cuartos ||
        0,
    },
    {
      label: 'Octavos',
      value:
        Number(
          (points as Record<string, unknown>).round_of_16 ??
            (points as Record<string, unknown>).eighthFinalist ??
            (points as Record<string, unknown>).octavos ??
            0
        ) ||
        fallbackByLabel.Octavos ||
        0,
    },
    {
      label: 'Participación/Zona',
      value: Number(points.zone ?? points.participation ?? 0) || fallbackByLabel['Participación/Zona'] || 0,
    },
  ].filter((item) => item.value > 0)

  if (items.length) return items
  if (total <= 0) return []
  return []
}

export default function TorneoDetallePage() {
  const params = useParams<{ id: string }>()
  const tournamentId = params?.id

  const [detail, setDetail] = useState<PublicTournamentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clubMessageOpen, setClubMessageOpen] = useState(false)
  const [clubMessage, setClubMessage] = useState('')
  const [clubMessageFeedback, setClubMessageFeedback] = useState('')
  const [clubMessageNotice, setClubMessageNotice] = useState('')
  const [clubMessageSaving, setClubMessageSaving] = useState(false)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [withdrawalSaving, setWithdrawalSaving] = useState(false)
  const [withdrawalSubmitted, setWithdrawalSubmitted] = useState(false)
  const [withdrawalFeedback, setWithdrawalFeedback] = useState('')

  useEffect(() => {
    let alive = true

    async function loadDetail() {
      if (!tournamentId) return
      setLoading(true)
      setError('')

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const response = await fetch(`/api/tournaments/${tournamentId}/public-detail`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const payload = await response.json()

        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo cargar el torneo.')
        if (alive) setDetail(payload as PublicTournamentDetail)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar el torneo.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    loadDetail()

    return () => {
      alive = false
    }
  }, [tournamentId])

  useEffect(() => {
    if (!clubMessageNotice) return
    const timer = window.setTimeout(() => setClubMessageNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [clubMessageNotice])

  if (loading) {
    return (
      <main className="tournamentPublicDetail">
        <div className="tournamentPublicDetail__loading">Cargando detalle del torneo...</div>
      </main>
    )
  }

  if (error || !detail) {
    return (
      <main className="tournamentPublicDetail">
        <div className="tournamentPublicDetail__empty">
          <p>{error || 'Torneo no encontrado.'}</p>
          <Link href="/torneos">Volver a torneos</Link>
        </div>
      </main>
    )
  }

  const clubLocation = [detail.club?.city, detail.club?.province].filter(Boolean).join(', ')
  const mapsUrl = buildGoogleMapsUrl([detail.club?.address, detail.club?.city, detail.club?.province, detail.club?.name])
  const venueLabel = [detail.club?.name, detail.club?.address, clubLocation].filter(Boolean).join(' · ') || 'A definir'
  const courtsLabel = detail.tournament.rulesSummary.courts?.length
    ? detail.tournament.rulesSummary.courts.join(', ')
    : detail.tournament.rulesSummary.courtsCount
      ? `${detail.tournament.rulesSummary.courtsCount} canchas`
      : 'A definir'
  const tiebreakerSteps = getTiebreakerSteps(detail.tournament.rulesSummary.tiebreaker)
  const subtitle = [
    detail.club?.name,
    detail.labels.category,
    detail.labels.gender,
    detail.labels.segment,
    detail.labels.tournamentType,
  ]
    .filter(Boolean)
    .join(' · ')
  const pointItems = getPointDistribution(detail)
  const availableSlots = detail.capacity.spotsLeft ?? Math.max((detail.capacity.maxPairs ?? 0) - detail.capacity.registeredTeamsCount, 0)
  const progressMax = detail.capacity.maxPairs ?? 0
  const progressPercent = progressMax > 0 ? Math.min(100, Math.max(0, (detail.capacity.registeredTeamsCount / progressMax) * 100)) : 0
  const countdown = getCountdownParts(detail.dates.registrationDeadline)
  const registrationClosed = isRegistrationClosed(detail.dates.registrationDeadline)
  const theme = getClubTheme(detail.club?.themeKey)
  const themeStyle = {
    ['--pamprax-hero-accent' as string]: theme.vars.accent,
    ['--pamprax-hero-accent-2' as string]: theme.vars.accent2,
  } as CSSProperties
  const paymentView = getPostRegistrationPaymentView(detail.viewer.myTeam?.paymentStatus, detail.viewer.myTeam?.paymentMethod)
  const refundEstimate = getRefundEstimate(detail.dates.startDate, Number(detail.price.pricePerPlayer ?? 0) * 2)
  const withdrawalPending = withdrawalSubmitted || detail.viewer.myTeam?.registrationChangeRequest?.status === 'PENDING'

  async function requestWithdrawal() {
    if (!detail) return
    const currentTournamentId = detail.tournament.id
    const reason = withdrawalReason.trim()
    if (reason.length < 8) {
      setWithdrawalFeedback('Contanos brevemente el motivo de la baja.')
      return
    }
    setWithdrawalSaving(true)
    setWithdrawalFeedback('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Iniciá sesión para solicitar la baja.')

      const response = await fetch(`/api/tournaments/${currentTournamentId}/registration-change-requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CANCEL_REGISTRATION',
          reason,
          refundEstimatePercent: refundEstimate.percent,
          refundEstimateAmount: refundEstimate.amount,
          refundPolicyLabel: refundEstimate.label,
          hoursBeforeStart: detail.dates.startDate
            ? (new Date(detail.dates.startDate).getTime() - Date.now()) / 36e5
            : null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'No pude enviar la solicitud de baja.')

      setWithdrawalSubmitted(true)
      setWithdrawalReason('')
      setWithdrawalOpen(false)
    } catch (error) {
      setWithdrawalFeedback(error instanceof Error ? error.message : 'No pude enviar la solicitud de baja.')
    } finally {
      setWithdrawalSaving(false)
    }
  }

  async function sendClubMessage() {
    if (!detail?.club?.id || !tournamentId || clubMessage.trim().length < 4) return

    setClubMessageSaving(true)
    setClubMessageFeedback('')
    setClubMessageNotice('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Iniciá sesión para enviar el mensaje.')

      const response = await fetch(`/api/clubs/${detail.club.id}/message-threads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournamentId,
          subject: `Consulta por inscripción · ${detail.tournament.name}`,
          message: clubMessage.trim(),
          context: 'tournament_registration',
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error ?? 'No se pudo enviar el mensaje.')

      setClubMessage('')
      setClubMessageFeedback('')
      setClubMessageOpen(false)
      setClubMessageNotice('Mensaje enviado al club correctamente.')
    } catch (err) {
      setClubMessageFeedback(err instanceof Error ? err.message : 'No se pudo enviar el mensaje.')
    } finally {
      setClubMessageSaving(false)
    }
  }

  return (
    <main className="tournamentPublicDetail" style={themeStyle}>
      <PampraxHero
        kicker={clubLocation || detail.club?.name || `Torneo ${BRAND.name}`}
        title={detail.tournament.name}
        subtitle={subtitle}
        statusBadge={registrationClosed ? { label: 'Inscripción cerrada', tone: 'info' } : detail.status.key === 'registration_open' ? { label: 'Inscripción abierta', tone: 'success' } : { label: detail.status.label, tone: 'info' }}
        secondaryAction={detail.club ? { label: 'Ver club', href: `/clubs/${detail.club.id}` } : { label: 'Calendario', href: '/torneos' }}
        logo={{ src: detail.club?.logoUrl, alt: detail.club?.name ?? 'Club', fallback: detail.club?.name?.slice(0, 2).toUpperCase() ?? 'SE' }}
        themeKey={detail.club?.themeKey}
        coverUrl={detail.flyerUrl}
      />

      <section id="estado-jugador" className="tournamentPublicDetail__landingPitch">
        {detail.viewer.isRegisteredInTournament && detail.viewer.myTeam ? (
          <div className="tournamentPublicDetail__registeredBlock">
            <div className="tournamentPublicDetail__registeredIntro">
              <span className="tournamentPublicDetail__eyebrow">Tu torneo</span>
              <h2>YA ESTÁS DENTRO</h2>
              <p>Tu inscripción fue registrada correctamente.</p>
              <small>Zona pendiente: aparecerá cuando la organización publique el cuadro.</small>
            </div>
            <div className={`tournamentPublicDetail__registeredStatus is-${paymentView.tone}`}>
              <span>{paymentView.badge}</span>
              <h3>{paymentView.title}</h3>
              <p>{paymentView.text}</p>
              {paymentView.secondaryText ? <p className="tournamentPublicDetail__registeredStatusNote">{paymentView.secondaryText}</p> : null}
              <div className="tournamentPublicDetail__registeredActions">
                {paymentView.action === 'message' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClubMessageFeedback('')
                      setClubMessageNotice('')
                      setClubMessageOpen(true)
                    }}
                  >
                    Enviar mensaje al club
                  </button>
                ) : null}
                {paymentView.action === 'pay' ? (
                  <Link href={`/torneos/${detail.tournament.id}/inscripcion?step=pago`}>
                    {paymentView.tone === 'danger' ? 'Elegir otro método de pago' : 'Completar pago'}
                  </Link>
                ) : null}
                {withdrawalPending ? (
                  <div className="tournamentPublicDetail__withdrawPending">
                    <b>Baja solicitada</b>
                    <small>
                      {detail.viewer.myTeam?.registrationChangeRequest?.refundPercent !== null &&
                      detail.viewer.myTeam?.registrationChangeRequest?.refundPercent !== undefined
                        ? `Reintegro estimado: ${detail.viewer.myTeam.registrationChangeRequest.refundPercent}%`
                        : 'El club está revisando tu solicitud.'}
                    </small>
                  </div>
                ) : (
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => {
                      setWithdrawalFeedback('')
                      setWithdrawalOpen(true)
                    }}
                  >
                    Solicitar baja del torneo
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="tournamentPublicDetail__pitchGrid">
            <div className="tournamentPublicDetail__pitchCopy">
              <span className="tournamentPublicDetail__eyebrow">{registrationClosed ? 'Inscripción cerrada' : 'Inscripción'}</span>
              <h2>{registrationClosed ? 'Inscripción cerrada' : 'No te quedes afuera'}</h2>
              <p>{registrationClosed ? 'La inscripción para este torneo ya finalizó.' : 'Asegurá tu lugar y llegá listo para competir.'}</p>
            </div>
            <div className="tournamentPublicDetail__signupCard">
              {registrationClosed ? (
                <div className="tournamentPublicDetail__closedBox">
                  <strong>INSCRIPCIÓN CERRADA</strong>
                  <span>Ya no se reciben nuevas parejas para este torneo.</span>
                </div>
              ) : (
                <div className="tournamentPublicDetail__countdown">
                  <span>Falta</span>
                  <strong>{countdown.main}</strong>
                  <span>para cerrar inscripción</span>
                </div>
              )}
              {registrationClosed ? (
                <Link href={detail.club ? `/clubs/${detail.club.id}` : `/torneos/${detail.tournament.id}`}>Ver club <span>→</span></Link>
              ) : (
                <Link href={`/torneos/${detail.tournament.id}/inscripcion`}>INSCRIBIRME AHORA <span>→</span></Link>
              )}
              <div className="tournamentPublicDetail__pitchFacts">
                <span><b>{detail.capacity.registeredTeamsCount}/{detail.capacity.maxPairs ?? '—'}</b> parejas</span>
                <span><b>{availableSlots}</b> lugares disponibles</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="tournamentPublicDetail__personalBoard">
        <div className="tournamentPublicDetail__cardHeader">
          <span>Tu torneo</span>
          <Users size={18} />
        </div>
        {detail.viewer.isRegisteredInTournament && detail.viewer.myTeam ? (
          <>
            <p>Este será tu tablero personal cuando la organización publique zonas y partidos.</p>
            <div className="tournamentPublicDetail__personalSlots">
              <span>
                <small>Tu compañero</small>
                <strong>{detail.viewer.myTeam.players.map((player) => player.name).join(' / ')}</strong>
              </span>
              <span>
                <small>Tu grupo</small>
                <strong>A definir</strong>
              </span>
              <span>
                <small>Próximo partido</small>
                <strong>A definir</strong>
              </span>
              <span>
                <small>Tu posición</small>
                <strong>A definir</strong>
              </span>
            </div>
          </>
        ) : (
          <>
            <p>Cuando te inscribas, este será tu tablero personal.</p>
            <div className="tournamentPublicDetail__personalSlots">
              <span>Tu compañero</span>
              <span>Tu grupo</span>
              <span>Tus partidos</span>
              <span>Tu posición</span>
            </div>
          </>
        )}
      </section>

      <section className="tournamentPublicDetail__progressCard">
        <div className="tournamentPublicDetail__cardHeader">
          <span>Estado del torneo</span>
          <Users size={18} />
        </div>
        <div className="tournamentPublicDetail__progressTrack">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="tournamentPublicDetail__progressCount">
          <strong>{detail.capacity.registeredTeamsCount} / {detail.capacity.maxPairs ?? '—'}</strong>
          <span>parejas inscriptas</span>
        </div>
        <div className="tournamentPublicDetail__progressGrid">
          <div>
            <small>Cierre</small>
            <strong>{formatDateLong(detail.dates.registrationDeadline)}</strong>
          </div>
          <div>
            <small>Inicio</small>
            <strong>{formatDate(detail.dates.startDate)}</strong>
          </div>
          <div>
            <small>Final</small>
            <strong>{formatDate(detail.dates.endDate)}</strong>
          </div>
          <div>
            <small>Formato</small>
            <strong>{formatSystem(detail.tournament.rulesSummary.competitionSystem ?? detail.tournament.format)}</strong>
          </div>
        </div>
      </section>

      <section className="tournamentPublicDetail__generalInfo">
        <div className="tournamentPublicDetail__cardHeader">
          <span>Información general</span>
          <Trophy size={18} />
        </div>
        <div className="tournamentPublicDetail__infoGrid">
          <div className="tournamentPublicDetail__infoPanel tournamentPublicDetail__infoPanel--wide">
            <small>Puntos para el ranking</small>
            {pointItems.length ? (
              <div className="tournamentPublicDetail__points tournamentPublicDetail__points--compact">
                {pointItems.map((item, index) => (
                  <span key={item.label}>
                    <i>{String(index + 1).padStart(2, '0')}</i>
                    <small>{item.label}</small>
                    <strong>{item.value} pts</strong>
                  </span>
                ))}
              </div>
            ) : (
              <p>Este torneo no entrega puntos para el ranking.</p>
            )}
          </div>
          <div className="tournamentPublicDetail__infoPanel">
            <small>Sistema de desempate</small>
            {tiebreakerSteps.length ? (
              <div className="tournamentPublicDetail__tiebreakerBlock">
                <p>
                  Se aplican en este orden. Si el empate sigue, se usa el siguiente criterio.
                </p>
                <ol className="tournamentPublicDetail__tiebreakerList">
                  {tiebreakerSteps.map((step, index) => (
                  <li key={`${step}-${index}`}>
                    <span>{index + 1}</span>
                    <b>{step}</b>
                  </li>
                  ))}
                </ol>
              </div>
            ) : (
              <strong>A definir</strong>
            )}
          </div>
          <div className="tournamentPublicDetail__infoPanel">
            <small>Canchas</small>
            <strong>{courtsLabel}</strong>
          </div>
          <div className="tournamentPublicDetail__infoPanel">
            <small>Sede</small>
            <strong>{venueLabel}</strong>
            <a className="tournamentPublicDetail__mapsLink" href={mapsUrl} target="_blank" rel="noreferrer">
              <span>Ubicación</span>
              <b>Ver en Google Maps</b>
            </a>
          </div>
          <div className="tournamentPublicDetail__infoPanel">
            <small>Formato</small>
            <strong>{formatSystem(detail.tournament.rulesSummary.competitionSystem ?? detail.tournament.format)}</strong>
          </div>
        </div>
      </section>

      {clubMessageOpen ? (
        <div className="tournamentPublicDetail__modalBackdrop" role="presentation">
          <div className="tournamentPublicDetail__messageModal" role="dialog" aria-modal="true" aria-label="Enviar mensaje al club">
            <div>
              <span>Mensaje al club</span>
              <button type="button" onClick={() => setClubMessageOpen(false)} aria-label="Cerrar">×</button>
            </div>
            <h3>Consultar por tu inscripción</h3>
            {clubMessageFeedback ? <p className="tournamentPublicDetail__modalFeedback">{clubMessageFeedback}</p> : null}
            <textarea
              value={clubMessage}
              onChange={(event) => {
                setClubMessage(event.target.value)
                setClubMessageFeedback('')
              }}
              placeholder="Hola, ya solicité pagar en el predio. ¿Podrían aprobar mi inscripción?"
              rows={4}
            />
            <div className="tournamentPublicDetail__modalActions">
              <button type="button" onClick={() => setClubMessageOpen(false)}>Cancelar</button>
              <button
                type="button"
                disabled={clubMessage.trim().length < 4 || clubMessageSaving}
                onClick={sendClubMessage}
              >
                {clubMessageSaving ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </div>
            <p>El club recibirá una notificación interna con tu consulta.</p>
          </div>
        </div>
      ) : null}

      {withdrawalOpen ? (
        <div className="tournamentPublicDetail__modalBackdrop" role="presentation">
          <div className="tournamentPublicDetail__messageModal tournamentPublicDetail__withdrawalModal" role="dialog" aria-modal="true" aria-label="Solicitar baja del torneo">
            <div>
              <span>Baja del torneo</span>
              <button type="button" onClick={() => setWithdrawalOpen(false)} aria-label="Cerrar">×</button>
            </div>
            <h3>Solicitar baja del torneo</h3>
            <p>Si solicitás la baja, el club revisará tu pedido. El reintegro dependerá del tiempo restante hasta el inicio del torneo.</p>
            <div className="tournamentPublicDetail__refundSummary">
              <span>Reintegro estimado</span>
              <strong>{refundEstimate.label}</strong>
              <small>Importe estimado: {formatMoney(refundEstimate.amount)}</small>
              <em>El club puede revisar el caso antes de aprobar la baja.</em>
            </div>
            <label className="tournamentPublicDetail__withdrawalReason">
              <span>Motivo de baja</span>
              <textarea
                value={withdrawalReason}
                onChange={(event) => {
                  setWithdrawalReason(event.target.value)
                  setWithdrawalFeedback('')
                }}
                placeholder="Contanos brevemente por qué necesitás solicitar la baja."
                rows={4}
              />
            </label>
            {withdrawalFeedback ? <p className="tournamentPublicDetail__modalFeedback">{withdrawalFeedback}</p> : null}
            <div className="tournamentPublicDetail__modalActions">
              <button type="button" onClick={() => setWithdrawalOpen(false)} disabled={withdrawalSaving}>Cancelar</button>
              <button type="button" onClick={requestWithdrawal} disabled={withdrawalSaving || withdrawalReason.trim().length < 8}>
                {withdrawalSaving ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clubMessageNotice ? (
        <div className="tournamentPublicDetail__toast" role="status" aria-live="polite">
          <span aria-hidden="true"><CheckCircle2 size={16} /></span>
          <p>{clubMessageNotice}</p>
        </div>
      ) : null}

      <style>{`
        .tournamentPublicDetail {
          width: min(1180px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 22px 0 56px;
          color: #061a3f;
          font-family: var(--font-pamprax-body, var(--font-ui));
        }

        .tournamentPublicDetail__loading,
        .tournamentPublicDetail__empty {
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: rgba(255, 255, 255, 0.92);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 22px 55px rgba(15, 23, 42, 0.08);
        }

        .tournamentPublicDetail__empty a {
          color: #0284c7;
          font-weight: 900;
          text-decoration: none;
        }

        .tournamentPublicDetail__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 16px;
        }

        .tournamentPublicDetail__landingPitch,
        .tournamentPublicDetail__personalBoard,
        .tournamentPublicDetail__progressCard,
        .tournamentPublicDetail__generalInfo {
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 30%, rgba(15,23,42,.08));
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, transparent), transparent 34%),
            radial-gradient(circle at 96% 20%, color-mix(in srgb, var(--pamprax-hero-accent-2, #ec4899) 10%, transparent), transparent 30%),
            rgba(255,255,255,.94);
          border-radius: 24px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
          margin-top: 14px;
          padding: 18px;
        }

        .tournamentPublicDetail__landingPitch {
          padding: clamp(14px, 1.6vw, 20px);
          position: relative;
          overflow: hidden;
        }

        .tournamentPublicDetail__landingPitch::before {
          background: linear-gradient(180deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #ec4899));
          border-radius: 999px;
          content: "";
          inset: 18px auto 18px 0;
          position: absolute;
          width: 5px;
        }

        .tournamentPublicDetail__eyebrow {
          color: #0284c7;
          display: block;
          font-family: var(--font-pamprax-sport, var(--font-ui));
          font-size: 14px;
          font-weight: 950;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__pitchGrid {
          align-items: stretch;
          display: grid;
          gap: clamp(14px, 2vw, 24px);
          grid-template-columns: minmax(0, 1fr) minmax(340px, .9fr);
          position: relative;
          z-index: 1;
        }

        .tournamentPublicDetail__pitchCopy {
          align-content: center;
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 13%, transparent), transparent 42%),
            linear-gradient(135deg, rgba(255,255,255,.88), rgba(248,250,252,.66));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 22%, rgba(15,23,42,.08));
          border-radius: 22px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.72);
          display: grid;
          gap: 13px;
          min-width: 0;
          min-height: 220px;
          padding: clamp(16px, 1.8vw, 22px);
        }

        .tournamentPublicDetail__landingPitch h2 {
          color: #061a3f;
          font-family: var(--font-pamprax-display, var(--font-ui));
          font-size: clamp(46px, 5.6vw, 76px);
          font-weight: 400;
          letter-spacing: .01em;
          line-height: .84;
          margin: 0;
          max-width: 560px;
          text-wrap: balance;
        }

        .tournamentPublicDetail__landingPitch p {
          color: #334155;
          font-size: clamp(18px, 1.9vw, 23px);
          font-weight: 850;
          line-height: 1.35;
          margin: 0;
          max-width: 520px;
        }

        .tournamentPublicDetail__landingPitch .tournamentPublicDetail__pitchCopy > strong {
          color: #0b2554;
          display: inline-flex;
          font-size: 15px;
          margin: 0;
        }

        .tournamentPublicDetail__countdown {
          align-items: baseline;
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 18%, transparent), transparent 54%),
            rgba(8,30,64,.62);
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 42%, rgba(255,255,255,.16));
          border-radius: 20px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
          display: flex;
          gap: 9px;
          justify-content: center;
          margin: 0;
          max-width: none;
          padding: 9px 16px;
          width: 100%;
        }

        .tournamentPublicDetail__countdown strong {
          color: color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 72%, #fff);
          font-family: var(--font-pamprax-display, var(--font-ui));
          font-size: clamp(32px, 3.9vw, 50px);
          font-weight: 400;
          letter-spacing: .02em;
          line-height: .92;
          margin: 0;
        }

        .tournamentPublicDetail__countdown span {
          color: rgba(248,250,252,.92);
          font-family: var(--font-pamprax-sport, var(--font-ui));
          font-size: 14px;
          font-weight: 700;
          letter-spacing: .04em;
        }

        .tournamentPublicDetail__signupCard {
          align-content: center;
          background:
            radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 22%, transparent), transparent 44%),
            radial-gradient(circle at 92% 82%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, transparent), transparent 46%),
            linear-gradient(145deg, #020617, #061a3f 62%, #0b2554);
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 45%, rgba(255,255,255,.18));
          border-radius: 24px;
          box-shadow:
            0 28px 70px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 22%, rgba(15,23,42,.22)),
            inset 0 1px 0 rgba(255,255,255,.12);
          color: #fff;
          display: grid;
          gap: 17px;
          justify-items: center;
          min-height: 220px;
          padding: clamp(16px, 2vw, 24px);
          position: relative;
          overflow: hidden;
          text-align: center;
        }

        .tournamentPublicDetail__signupCard::before {
          content: none;
        }

        .tournamentPublicDetail__signupCard > * {
          position: relative;
          z-index: 1;
        }

        .tournamentPublicDetail__signupCard .tournamentPublicDetail__countdown strong {
          color: color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 72%, #fff);
        }

        .tournamentPublicDetail__signupCard .tournamentPublicDetail__countdown span {
          color: rgba(248,250,252,.94);
        }

        .tournamentPublicDetail__signupCard p {
          color: rgba(226,232,240,.88);
          font-size: clamp(17px, 2vw, 22px);
          font-weight: 900;
          line-height: 1.45;
          margin: 0;
          max-width: 360px;
        }

        .tournamentPublicDetail__signupCard a:first-of-type {
          align-items: center;
          animation: tournamentPublicDetailCtaPulse 2.35s ease-in-out infinite;
          background:
            linear-gradient(135deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #67e8f9));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent-2, #67e8f9) 74%, rgba(255,255,255,.35));
          border-radius: 999px;
          box-shadow: 0 22px 58px color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 34%, transparent);
          color: #061a3f;
          display: inline-flex;
          font-family: var(--font-pamprax-display, var(--font-ui));
          font-size: 24px;
          font-weight: 400;
          letter-spacing: .04em;
          justify-content: center;
          min-height: 60px;
          padding: 0 24px;
          text-decoration: none;
          transition: transform .18s ease, box-shadow .18s ease;
          width: 100%;
        }

        .tournamentPublicDetail__signupCard a:first-of-type span {
          display: inline-block;
          margin-left: 8px;
          transition: transform .18s ease;
        }

        .tournamentPublicDetail__signupCard a:first-of-type:hover {
          animation-play-state: paused;
          transform: translateY(-4px) scale(1.024);
          box-shadow: 0 34px 82px color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 48%, transparent);
        }

        .tournamentPublicDetail__signupCard a:first-of-type:hover span {
          transform: translateX(5px);
        }

        .tournamentPublicDetail__pitchFacts {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin: 0;
          width: 100%;
        }

        .tournamentPublicDetail__pitchFacts span {
          align-items: center;
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 14%, transparent), rgba(255,255,255,.06));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 38%, rgba(255,255,255,.14));
          border-radius: 999px;
          color: rgba(248,250,252,.92);
          display: inline-flex;
          font-family: var(--font-pamprax-sport, var(--font-ui));
          font-size: 14px;
          font-weight: 900;
          min-height: 40px;
          padding: 0 14px;
          box-shadow: 0 12px 28px rgba(15,23,42,.05);
        }

        .tournamentPublicDetail__pitchFacts b {
          color: color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 72%, #fff);
          font-weight: 950;
          margin-right: 4px;
        }

        .tournamentPublicDetail__closedBox {
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 22px;
          background: rgba(255,255,255,.08);
          color: rgba(255,255,255,.86);
          display: grid;
          gap: 5px;
          padding: 14px 16px;
          text-align: center;
        }

        .tournamentPublicDetail__closedBox strong {
          color: #f8fafc;
          font-family: var(--font-pamprax-emotional, var(--font-ui));
          font-size: 25px;
          letter-spacing: .04em;
          margin: 0;
        }

        .tournamentPublicDetail__closedBox span {
          color: rgba(255,255,255,.72);
          font-size: 13px;
          font-weight: 850;
        }

        .tournamentPublicDetail__registeredBlock {
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1.12fr) minmax(340px, .88fr);
          align-items: stretch;
          width: 100%;
        }

        .tournamentPublicDetail__registeredIntro,
        .tournamentPublicDetail__registeredStatus {
          border-radius: 22px;
          min-height: 158px;
          padding: 14px 16px;
        }

        .tournamentPublicDetail__registeredIntro {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 16%, transparent), transparent 36%),
            linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,250,252,.9));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 26%, rgba(15,23,42,.09));
          box-shadow: 0 22px 60px rgba(15,23,42,.08);
          display: grid;
          align-content: center;
        }

        .tournamentPublicDetail__registeredIntro::before {
          background: linear-gradient(180deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #d946ef));
          content: "";
          inset: 18px auto 18px 0;
          position: absolute;
          width: 5px;
          border-radius: 999px;
          box-shadow: 0 0 24px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 48%, transparent);
        }

        .tournamentPublicDetail__registeredIntro > * {
          position: relative;
          z-index: 1;
        }

        .tournamentPublicDetail__registeredIntro h2 {
          color: #061a3f;
          font-family: var(--font-pamprax-emotional, var(--font-ui));
          font-size: clamp(32px, 4vw, 48px);
          letter-spacing: .01em;
          line-height: .86;
          margin: 4px 0 7px;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__registeredIntro p {
          color: #23395f;
          font-size: 14px;
          font-weight: 900;
          margin: 0;
        }

        .tournamentPublicDetail__registeredIntro button {
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 44%, rgba(255,255,255,.18));
          border-radius: 999px;
          background:
            linear-gradient(135deg, #061a3f, color-mix(in srgb, #061a3f 72%, var(--pamprax-hero-accent, #22d3ee)));
          color: #fff;
          display: inline-flex;
          align-items: center;
          font-weight: 950;
          justify-content: center;
          min-height: 32px;
          margin: 0 0 7px;
          padding: 0 13px;
          box-shadow: 0 16px 34px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, transparent);
          width: fit-content;
        }

        .tournamentPublicDetail__registeredIntro button:disabled {
          cursor: not-allowed;
          opacity: .62;
        }

        .tournamentPublicDetail__registeredIntro small {
          color: #64748b;
          display: block;
          font-size: 12px;
          font-weight: 800;
          margin-top: 6px;
        }

        .tournamentPublicDetail__registeredActions {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: space-between;
          padding: 2px 0 0;
        }

        .tournamentPublicDetail__registeredActions button {
          align-items: center;
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 26%, rgba(15,23,42,.10));
          border-radius: 999px;
          background: rgba(255,255,255,.9);
          color: #061a3f;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .tournamentPublicDetail__registeredActions a {
          align-items: center;
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 26%, rgba(15,23,42,.10));
          border-radius: 999px;
          background: rgba(255,255,255,.9);
          color: #061a3f;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          text-decoration: none;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .tournamentPublicDetail__registeredActions button:not(:disabled):hover,
        .tournamentPublicDetail__registeredActions a:hover {
          border-color: color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 46%, rgba(15,23,42,.10));
          box-shadow: 0 12px 26px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 14%, transparent);
          transform: translateY(-1px);
        }

        .tournamentPublicDetail__registeredActions button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .tournamentPublicDetail__registeredActions button.is-danger {
          margin-left: auto;
          border-color: rgba(244,63,94,.22);
          background: rgba(255,255,255,.72);
          color: #be123c;
          font-size: 12px;
        }

        .tournamentPublicDetail__withdrawPending {
          align-items: center;
          background: rgba(245,158,11,.10);
          border: 1px solid rgba(245,158,11,.24);
          border-radius: 999px;
          color: #92400e;
          display: inline-flex;
          gap: 8px;
          min-height: 34px;
          padding: 0 12px;
        }

        .tournamentPublicDetail__withdrawPending b {
          color: #92400e;
          font-size: 12px;
          font-weight: 950;
          margin: 0;
        }

        .tournamentPublicDetail__withdrawPending small {
          color: #a16207;
          font-size: 11px;
          font-weight: 850;
          margin: 0;
          text-transform: none;
        }

        .tournamentPublicDetail__registeredStatus {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 15% 5%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 22%, transparent), transparent 38%),
            linear-gradient(135deg, #061a3f, #102a4f 54%, color-mix(in srgb, #061a3f 70%, var(--pamprax-hero-accent-2, #d946ef)));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 30%, rgba(255,255,255,.14));
          color: #fff;
          display: grid;
          align-content: center;
          gap: 8px;
          box-shadow: 0 26px 66px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, rgba(15,23,42,.26));
        }

        .tournamentPublicDetail__registeredStatus::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent);
          content: "";
          height: 140%;
          position: absolute;
          right: 20%;
          top: -20%;
          transform: rotate(22deg);
          width: 1px;
        }

        .tournamentPublicDetail__registeredStatus > * {
          position: relative;
          z-index: 1;
        }

        .tournamentPublicDetail__registeredStatus.is-warning { border-color: rgba(245,158,11,.42); }
        .tournamentPublicDetail__registeredStatus.is-success { border-color: rgba(16,185,129,.42); }
        .tournamentPublicDetail__registeredStatus.is-danger { border-color: rgba(244,63,94,.42); }
        .tournamentPublicDetail__registeredStatus.is-muted { border-color: rgba(148,163,184,.32); }

        .tournamentPublicDetail__registeredStatus > span {
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 999px;
          color: #fff;
          display: inline-flex;
          font-size: 10px;
          font-weight: 950;
          padding: 4px 8px;
          width: fit-content;
        }

        .tournamentPublicDetail__registeredStatus.is-warning > span { background: rgba(245,158,11,.18); color: #fde68a; }
        .tournamentPublicDetail__registeredStatus.is-success > span { background: rgba(16,185,129,.18); color: #bbf7d0; }
        .tournamentPublicDetail__registeredStatus.is-danger > span { background: rgba(244,63,94,.18); color: #fecdd3; }

        .tournamentPublicDetail__registeredStatus h3 {
          color: #fff;
          font-size: 19px;
          font-weight: 950;
          margin: 0;
        }

        .tournamentPublicDetail__registeredStatus p {
          color: rgba(255,255,255,.76);
          font-size: 13px;
          font-weight: 820;
          line-height: 1.28;
          margin: 0;
        }

        .tournamentPublicDetail__registeredStatus .tournamentPublicDetail__registeredStatusNote {
          color: rgba(255,255,255,.66);
          font-size: 12px;
          font-weight: 800;
        }

        .tournamentPublicDetail__registeredStatus small {
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 999px;
          color: rgba(255,255,255,.84);
          display: inline-flex;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0;
          padding: 5px 8px;
          text-transform: none;
          width: fit-content;
        }

        .tournamentPublicDetail__registeredStatus button,
        .tournamentPublicDetail__registeredStatus a {
          align-items: center;
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 42%, rgba(255,255,255,.28));
          border-radius: 999px;
          background: rgba(255,255,255,.96);
          color: #061a3f;
          cursor: pointer;
          display: inline-flex;
          font-weight: 950;
          justify-content: center;
          min-height: 34px;
          padding: 0 11px;
          text-decoration: none;
          width: fit-content;
          box-shadow: 0 14px 34px rgba(2,8,23,.16);
          transition: transform .18s ease, box-shadow .18s ease;
        }

        .tournamentPublicDetail__registeredStatus button:hover,
        .tournamentPublicDetail__registeredStatus a:hover {
          box-shadow: 0 18px 42px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 22%, rgba(2,8,23,.18));
          transform: translateY(-1px);
        }

        .tournamentPublicDetail__modalBackdrop {
          align-items: center;
          background: rgba(2,8,23,.56);
          display: flex;
          inset: 0;
          justify-content: center;
          padding: 18px;
          position: fixed;
          z-index: 80;
        }

        .tournamentPublicDetail__messageModal {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(14,165,233,.22);
          border-radius: 24px;
          box-shadow: 0 30px 90px rgba(2,8,23,.28);
          display: grid;
          gap: 12px;
          padding: 18px;
          width: min(520px, 100%);
        }

        .tournamentPublicDetail__messageModal > div:first-child {
          align-items: center;
          display: flex;
          justify-content: space-between;
        }

        .tournamentPublicDetail__messageModal span {
          color: #0284c7;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__messageModal h3 {
          color: #061a3f;
          font-size: 24px;
          font-weight: 950;
          margin: 0;
        }

        .tournamentPublicDetail__messageModal textarea {
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 16px;
          color: #061a3f;
          font: inherit;
          font-weight: 800;
          min-height: 110px;
          outline: none;
          padding: 12px;
          resize: vertical;
        }

        .tournamentPublicDetail__messageModal p {
          color: #64748b;
          font-size: 13px;
          font-weight: 850;
          margin: 0;
        }

        .tournamentPublicDetail__messageModal .tournamentPublicDetail__modalFeedback {
          background: color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 12%, rgba(255,255,255,.86));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 24%, rgba(15,23,42,.08));
          border-radius: 14px;
          color: #0b2554;
          padding: 10px 12px;
        }

        .tournamentPublicDetail__messageModal button {
          border: 1px solid rgba(14,165,233,.24);
          border-radius: 999px;
          background: #061a3f;
          color: #fff;
          cursor: pointer;
          font-weight: 950;
          min-height: 40px;
          padding: 0 14px;
        }

        .tournamentPublicDetail__messageModal button:disabled {
          cursor: not-allowed;
          opacity: .45;
        }

        .tournamentPublicDetail__toast {
          align-items: center;
          animation: tournamentPublicToastIn .22s ease both, tournamentPublicToastOut .24s ease 2.76s forwards;
          background:
            linear-gradient(135deg, rgba(2,8,23,.98), rgba(6,26,63,.96));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 48%, rgba(255,255,255,.14));
          border-radius: 18px;
          bottom: 24px;
          box-shadow:
            0 24px 60px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 24%, rgba(2,8,23,.34)),
            inset 0 1px 0 rgba(255,255,255,.10);
          color: #f8fafc;
          display: inline-flex;
          gap: 10px;
          max-width: min(420px, calc(100vw - 32px));
          padding: 12px 14px;
          position: fixed;
          right: 24px;
          z-index: 90;
        }

        .tournamentPublicDetail__toast::before {
          background: linear-gradient(180deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #ec4899));
          border-radius: 999px;
          bottom: 10px;
          content: "";
          left: 0;
          position: absolute;
          top: 10px;
          width: 3px;
        }

        .tournamentPublicDetail__toast span {
          align-items: center;
          background: color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, rgba(255,255,255,.08));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 42%, rgba(255,255,255,.12));
          border-radius: 999px;
          color: color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 72%, #fff);
          display: inline-flex;
          flex: 0 0 auto;
          height: 28px;
          justify-content: center;
          width: 28px;
        }

        .tournamentPublicDetail__toast p {
          color: #f8fafc;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.25;
          margin: 0;
        }

        @keyframes tournamentPublicToastIn {
          from { opacity: 0; transform: translate3d(0, 12px, 0) scale(.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes tournamentPublicToastOut {
          to { opacity: 0; transform: translate3d(0, 10px, 0) scale(.98); }
        }

        .tournamentPublicDetail__modalActions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .tournamentPublicDetail__modalActions button:first-child {
          background: #fff;
          color: #0b2554;
        }

        .tournamentPublicDetail__refundSummary {
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 16%, transparent), transparent 48%),
            linear-gradient(135deg, rgba(248,250,252,.96), rgba(255,255,255,.86));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 24%, rgba(15,23,42,.08));
          border-radius: 18px;
          display: grid;
          gap: 4px;
          padding: 12px;
        }

        .tournamentPublicDetail__refundSummary span {
          color: #64748b;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__refundSummary strong {
          color: #061a3f;
          font-size: 24px;
          font-weight: 950;
          margin: 0;
        }

        .tournamentPublicDetail__refundSummary small,
        .tournamentPublicDetail__refundSummary em {
          color: #64748b;
          font-size: 12px;
          font-style: normal;
          font-weight: 850;
        }

        .tournamentPublicDetail__withdrawalReason {
          display: grid;
          gap: 8px;
        }

        .tournamentPublicDetail__withdrawalReason > span {
          color: #64748b;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__urgency {
          align-items: center;
          background: linear-gradient(135deg, rgba(245,158,11,.15), rgba(239,68,68,.10));
          border: 1px solid rgba(245,158,11,.32);
          border-radius: 999px;
          color: #b45309;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          gap: 7px;
          margin-top: 10px;
          padding: 8px 11px;
        }

        .tournamentPublicDetail__deadline {
          align-items: center;
          background: rgba(14,165,233,.08);
          border: 1px solid rgba(14,165,233,.18);
          border-radius: 999px;
          color: #0b2554;
          display: inline-flex;
          font-size: 13px;
          font-weight: 950;
          gap: 7px;
          margin-top: 10px;
          padding: 8px 11px;
        }

        .tournamentPublicDetail__points span {
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.72);
          border-radius: 18px;
          padding: 12px;
        }

        .tournamentPublicDetail__points {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }

        .tournamentPublicDetail__points--compact {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }

        .tournamentPublicDetail__points span {
          background:
            linear-gradient(135deg, rgba(255,255,255,.96), rgba(248,250,252,.9));
          border-color: rgba(15,23,42,.10);
          box-shadow: 0 14px 32px rgba(15,23,42,.06);
        }

        .tournamentPublicDetail__points small {
          color: #64748b;
        }

        .tournamentPublicDetail__points strong {
          color: #061a3f;
          font-size: 34px;
        }

        .tournamentPublicDetail__generalInfo p {
          color: #475569;
          font-weight: 850;
          margin: 0;
        }

        .tournamentPublicDetail__points i {
          color: #061a3f;
          display: block;
          font-style: normal;
          font-family: var(--font-pamprax-display, var(--font-ui));
          font-size: 32px;
          line-height: 1;
          margin-bottom: 8px;
        }

        .tournamentPublicDetail__progressTrack {
          background: rgba(15,23,42,.08);
          border-radius: 999px;
          height: 16px;
          overflow: hidden;
          position: relative;
        }

        .tournamentPublicDetail__progressTrack span {
          background: linear-gradient(90deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #ec4899));
          border-radius: inherit;
          display: block;
          height: 100%;
          min-width: 8px;
        }

        .tournamentPublicDetail__progressCount {
          align-items: baseline;
          display: flex;
          gap: 8px;
          margin: 12px 0 14px;
        }

        .tournamentPublicDetail__progressCount strong {
          font-size: 30px;
          margin: 0;
        }

        .tournamentPublicDetail__progressCount span {
          color: #64748b;
          font-weight: 850;
        }

        .tournamentPublicDetail__progressGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .tournamentPublicDetail__progressGrid div,
        .tournamentPublicDetail__personalSlots span,
        .tournamentPublicDetail__infoPanel {
          background: rgba(255,255,255,.72);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          padding: 12px;
        }

        .tournamentPublicDetail__personalBoard p {
          color: #475569;
          font-weight: 850;
          margin: 0 0 12px;
        }

        .tournamentPublicDetail__personalSlots {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .tournamentPublicDetail__personalSlots span {
          color: #0b2554;
          font-weight: 950;
          text-align: center;
        }

        .tournamentPublicDetail__personalSlots span small {
          margin-bottom: 4px;
        }

        .tournamentPublicDetail__infoGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .tournamentPublicDetail__infoPanel--wide {
          grid-column: span 4;
        }

        .tournamentPublicDetail__tiebreakerBlock {
          display: grid;
          gap: 7px;
          margin-top: 8px;
        }

        .tournamentPublicDetail__tiebreakerBlock p {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.25;
          margin: 0;
        }

        .tournamentPublicDetail__tiebreakerList {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .tournamentPublicDetail__tiebreakerList li {
          align-items: center;
          background: linear-gradient(135deg, rgba(255,255,255,.9), rgba(248,250,252,.68));
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 999px;
          display: inline-flex;
          gap: 5px;
          min-height: 28px;
          padding: 3px 8px 3px 4px;
        }

        .tournamentPublicDetail__tiebreakerList li span {
          align-items: center;
          background: #061a3f;
          border-radius: 999px;
          color: #fff;
          display: inline-flex;
          font-family: var(--font-pamprax-sport, var(--font-ui));
          font-size: 10px;
          font-weight: 950;
          height: 20px;
          justify-content: center;
          width: 20px;
        }

        .tournamentPublicDetail__tiebreakerList li b {
          color: #061a3f;
          font-size: 12px;
          font-weight: 950;
          line-height: 1;
        }

        .tournamentPublicDetail__mapsLink {
          align-items: center;
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, transparent), transparent 48%),
            linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.72));
          border: 1px solid color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 36%, rgba(15,23,42,.10));
          border-radius: 16px;
          color: #0b2554;
          display: grid;
          gap: 1px;
          justify-items: start;
          margin-top: 12px;
          min-height: 58px;
          padding: 10px 14px 10px 44px;
          position: relative;
          text-decoration: none;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .tournamentPublicDetail__mapsLink::before {
          align-items: center;
          background: linear-gradient(135deg, var(--pamprax-hero-accent, #22d3ee), var(--pamprax-hero-accent-2, #67e8f9));
          border-radius: 999px;
          color: #fff;
          content: "G";
          display: flex;
          font-size: 14px;
          font-weight: 950;
          height: 28px;
          justify-content: center;
          left: 12px;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
        }

        .tournamentPublicDetail__mapsLink span {
          color: #64748b;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail__mapsLink b {
          color: #061a3f;
          font-size: 14px;
          font-weight: 950;
        }

        .tournamentPublicDetail__mapsLink:hover {
          border-color: color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 54%, rgba(15,23,42,.10));
          box-shadow: 0 14px 30px color-mix(in srgb, var(--pamprax-hero-accent, #22d3ee) 18%, transparent);
          transform: translateY(-2px);
        }

        .tournamentPublicDetail__card {
          border: 1px solid rgba(15, 23, 42, 0.1);
          background:
            linear-gradient(135deg, rgba(255,255,255,.95), rgba(248,250,252,.9)),
            rgba(255,255,255,.92);
          border-radius: 22px;
          padding: 18px;
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.07);
        }

        .tournamentPublicDetail__card--wide {
          grid-column: span 2;
        }

        .tournamentPublicDetail__cardHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: #0b2554;
          font-family: var(--font-pamprax-sport, var(--font-ui));
          font-weight: 950;
          letter-spacing: .04em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        @keyframes tournamentPublicDetailCtaPulse {
          0%, 100% {
            box-shadow: 0 22px 58px color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 32%, transparent);
            filter: saturate(1);
          }
          50% {
            box-shadow:
              0 28px 76px color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 58%, transparent),
              0 0 0 10px color-mix(in srgb, var(--pamprax-hero-accent-2, #22d3ee) 14%, transparent);
            filter: saturate(1.18);
          }
        }

        .tournamentPublicDetail__summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .tournamentPublicDetail__summary div {
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.75);
          border-radius: 16px;
          padding: 12px;
        }

        .tournamentPublicDetail small {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .tournamentPublicDetail strong {
          display: block;
          margin-top: 4px;
          color: #061a3f;
          font-size: 17px;
          font-weight: 950;
        }

        .tournamentPublicDetail__metric strong {
          font-size: 42px;
          line-height: 1;
        }

        .tournamentPublicDetail__metric span {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-weight: 800;
        }

        .tournamentPublicDetail__card p {
          color: #334155;
          line-height: 1.5;
          margin: 10px 0 0;
        }

        .tournamentPublicDetail__muted {
          color: #64748b;
        }

        .tournamentPublicDetail__playerState {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .tournamentPublicDetail__playerState p {
          flex: 1 1 360px;
          margin: 0;
        }

        .tournamentPublicDetail__playerState a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(14, 165, 233, 0.36);
          background: #061a3f;
          color: white;
          font-weight: 950;
          text-decoration: none;
          box-shadow: 0 16px 32px rgba(14, 165, 233, 0.18);
          transition: transform .18s ease, box-shadow .18s ease;
        }

        .tournamentPublicDetail__playerState a:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 42px rgba(14, 165, 233, 0.28);
        }

        .tournamentPublicDetail__team,
        .tournamentPublicDetail__partner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          color: #334155;
          font-weight: 850;
        }

        .tournamentPublicDetail__team span,
        .tournamentPublicDetail__partner {
          border: 1px solid rgba(14, 165, 233, 0.22);
          background: rgba(14, 165, 233, 0.08);
          border-radius: 999px;
          padding: 8px 11px;
        }

        @media (max-width: 860px) {
          .tournamentPublicDetail {
            width: min(100% - 22px, 1180px);
            padding-top: 12px;
          }

          .tournamentPublicDetail__grid {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__card--wide {
            grid-column: auto;
          }

          .tournamentPublicDetail__summary {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tournamentPublicDetail__pitchGrid {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__registeredBlock {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__toast {
            bottom: 18px;
            left: 16px;
            right: 16px;
            justify-content: flex-start;
          }

          .tournamentPublicDetail__registeredIntro button {
            width: 100%;
          }

          .tournamentPublicDetail__pitchCopy {
            padding-left: 8px;
          }

          .tournamentPublicDetail__signupCard {
            min-height: auto;
          }

          .tournamentPublicDetail__points {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tournamentPublicDetail__progressGrid,
          .tournamentPublicDetail__personalSlots,
          .tournamentPublicDetail__infoGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tournamentPublicDetail__infoPanel--wide {
            grid-column: span 2;
          }
        }

        @media (max-width: 560px) {
          .tournamentPublicDetail__summary {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__metric strong {
            font-size: 34px;
          }

          .tournamentPublicDetail__points {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__progressGrid,
          .tournamentPublicDetail__personalSlots,
          .tournamentPublicDetail__infoGrid {
            grid-template-columns: 1fr;
          }

          .tournamentPublicDetail__infoPanel--wide {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  )
}
