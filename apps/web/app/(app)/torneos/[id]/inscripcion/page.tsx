'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Banknote, CalendarDays, CheckCircle2, Clock, CreditCard, Search, ShieldCheck, Users } from 'lucide-react'
import SelpaLoader from '@/components/SelpaLoader'
import PampraxHero from '@/components/ui/PampraxHero'
import { getClubTheme } from '@/lib/clubThemes'
import { supabase } from '@/lib/supabaseClient'

type PublicTournamentDetail = {
  tournament: {
    id: string
    clubId: string
    name: string
    gender: string
    category: number | null
    startDate?: string | null
    registrationDeadline: string | null
    status?: string | null
    pricePerPlayer: number | null
  }
  club: { id: string; name: string; logoUrl: string | null; themeKey: string | null } | null
  status: { key: string; label: string }
  flyerUrl: string | null
  labels: { category: string; gender: string; segment: string; tournamentType: string }
  capacity: { registeredTeamsCount: number; maxPairs: number | null; spotsLeft: number | null }
  viewer: {
    isAuthenticated: boolean
    isPlayerInClub: boolean
    isRegisteredInTournament: boolean
    clubPlayer: null | { id: string; userId: string; name: string; category: number | null; gender: string | null; approved: boolean }
    myTeam: null | {
      id: string
      registrationId?: string | null
      registrationStatus: string | null
      paymentStatus?: string | null
      paymentMethod?: string | null
      paymentRequestedAt?: string | null
      paymentApprovedAt?: string | null
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
      partner: null | { clubPlayerId: string; userId: string | null; name: string; avatarUrl: string | null }
    }
  }
}

type PartnerOption = {
  clubPlayerId: string
  userId: string
  name: string
  avatarUrl: string | null
  category: number | null
  gender: string | null
  approved: boolean
}

type PaymentMethod = 'MERCADO_PAGO' | 'CASH_ON_SITE_REQUEST' | 'BANK_TRANSFER'
type WizardStep = 1 | 2 | 3 | 4

const paymentMethods: Array<{
  key: PaymentMethod
  title: string
  description: string
  badge: string
  icon: 'card' | 'cash' | 'bank'
}> = [
  {
    key: 'MERCADO_PAGO',
    title: 'Mercado Pago',
    description: 'Tarjeta de crédito, débito o dinero en cuenta. La integración real se activará en la próxima fase.',
    badge: 'Próximamente',
    icon: 'card',
  },
  {
    key: 'BANK_TRANSFER',
    title: 'Transferencia bancaria',
    description: 'Disponible cuando el club configure alias o CBU para este torneo.',
    badge: 'Futuro',
    icon: 'bank',
  },
  {
    key: 'CASH_ON_SITE_REQUEST',
    title: 'Solicitar pagar en el predio',
    description: 'El club revisará tu solicitud. Tu inscripción quedará pendiente hasta que el pago sea aprobado.',
    badge: 'Disponible',
    icon: 'cash',
  },
]

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const datePart = value.includes('T') ? value.split('T')[0] : value
  const date = new Date(`${datePart}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatMoney(value?: number | null) {
  if (!value) return 'Sin cargo informado'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)
}

function isRegistrationClosed(value?: string | null) {
  if (!value) return false
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return false
  return deadline.getTime() <= Date.now()
}

function getRefundEstimate(startDate?: string | null, totalAmount?: number | null) {
  if (!startDate) return { percent: 0, amount: 0, label: 'Sujeto a aprobación del club', hoursBeforeStart: null as number | null }
  const startsAt = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00`)
  if (Number.isNaN(startsAt.getTime())) return { percent: 0, amount: 0, label: 'Sujeto a aprobación del club', hoursBeforeStart: null as number | null }
  const hoursBeforeStart = (startsAt.getTime() - Date.now()) / 36e5
  const percent = hoursBeforeStart > 72 ? 100 : hoursBeforeStart > 48 ? 75 : hoursBeforeStart > 24 ? 50 : 0
  const amount = Math.max(0, Math.round(Number(totalAmount ?? 0) * (percent / 100)))
  const label = percent > 0 ? `${percent}% estimado` : '0% o sujeto a aprobación'
  return { percent, amount, label, hoursBeforeStart }
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] ?? 'P'}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function genderLabel(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'MALE' || normalized === 'M' || normalized === 'MASCULINO') return 'Caballeros'
  if (normalized === 'FEMALE' || normalized === 'F' || normalized === 'FEMENINO') return 'Damas'
  if (normalized.includes('MIX')) return 'Mixto'
  return 'Sin rama'
}

function getDraftKey(tournamentId?: string | null, userId?: string | null) {
  if (!tournamentId || !userId) return null
  return `pamprax:tournament-signup:${tournamentId}:${userId}`
}

function paymentStatusLabel(status?: string | null, method?: string | null, registrationStatus?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  const normalizedMethod = String(method ?? '').toUpperCase()
  if (normalized === 'APPROVED' || normalized === 'PAID' || registrationStatus === 'CONFIRMED') return 'Pago aprobado'
  if (normalized === 'REJECTED') return 'Pago rechazado'
  if (normalized === 'PENDING' && normalizedMethod === 'CASH_ON_SITE_REQUEST') return 'Solicitud de pago en predio pendiente'
  if (normalized === 'PENDING') return 'Pago pendiente'
  return 'Sin pago registrado'
}

function registrationStatusLabel(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'CONFIRMED') return 'Confirmada'
  if (normalized === 'CANCELLED') return 'Cancelada'
  if (normalized === 'PENDING') return 'Pendiente'
  return status ?? 'Registrada'
}

function postPaymentView(status?: string | null, method?: string | null) {
  const normalizedStatus = String(status ?? '').toUpperCase()
  const normalizedMethod = String(method ?? '').toUpperCase()

  if (normalizedMethod === 'CASH_ON_SITE_REQUEST' && normalizedStatus === 'PENDING') {
    return {
      tone: 'warning',
      title: 'Pago en predio pendiente',
      badge: 'PENDIENTE',
      text: 'El club debe aprobar tu solicitud de pago. Puede demorar hasta 24 hs.',
      action: 'message' as const,
    }
  }
  if (normalizedStatus === 'APPROVED') {
    return {
      tone: 'success',
      title: 'Inscripción confirmada',
      badge: 'Pago aprobado',
      text: 'Tu lugar está confirmado.',
      action: null,
    }
  }
  if (normalizedStatus === 'PAID' && (normalizedMethod === 'MERCADO_PAGO' || normalizedMethod === 'CARD_CREDIT' || normalizedMethod === 'CARD_DEBIT')) {
    return {
      tone: 'success',
      title: 'Inscripción confirmada',
      badge: 'Pago acreditado',
      text: 'Tu lugar está confirmado.',
      action: null,
    }
  }
  if (normalizedStatus === 'REJECTED') {
    return {
      tone: 'danger',
      title: 'Pago rechazado',
      badge: 'Rechazado',
      text: 'El club rechazó el pago registrado. Elegí otro método para avanzar.',
      action: 'pay' as const,
    }
  }
  if (normalizedStatus === 'PENDING') {
    return {
      tone: 'warning',
      title: 'Pago pendiente',
      badge: 'Pendiente',
      text: 'El pago todavía está pendiente de validación.',
      action: 'message' as const,
    }
  }
  return {
    tone: 'muted',
    title: 'Pago no registrado',
    badge: 'Sin pago registrado',
    text: 'Todavía no hay un pago asociado a esta inscripción.',
    action: 'pay' as const,
  }
}

const availabilitySlots = [
  { id: 'T1', title: 'Turno 1', time: '09:00 - 12:00' },
  { id: 'T2', title: 'Turno 2', time: '12:00 - 15:00' },
  { id: 'T3', title: 'Turno 3', time: '15:00 - 18:00' },
  { id: 'T4', title: 'Turno 4', time: '18:00 - 22:00' },
]

const wizardSteps: Array<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Elegir compañero' },
  { id: 2, label: 'Disponibilidad' },
  { id: 3, label: 'Pago' },
  { id: 4, label: 'Confirmación' },
]

const loadingPageStyle: CSSProperties = {
  alignItems: 'center',
  boxSizing: 'border-box',
  display: 'grid',
  justifyItems: 'center',
  margin: '0 auto',
  minHeight: 'calc(100dvh - 96px)',
  padding: '16px 11px 36px',
  width: 'min(100% - 22px, 1180px)',
}

const loadingStateStyle: CSSProperties = {
  alignItems: 'center',
  boxSizing: 'border-box',
  display: 'grid',
  justifyItems: 'center',
  margin: '0 auto',
  minHeight: 220,
  padding: '16px 12px',
  textAlign: 'center',
  width: 'min(100%, 340px)',
}

export default function TorneoInscripcionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const tournamentId = params?.id
  const requestedStep = searchParams.get('step')

  const [detail, setDetail] = useState<PublicTournamentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [partnerSearchError, setPartnerSearchError] = useState('')
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [availability, setAvailability] = useState<string[]>([])
  const [partnerModalOpen, setPartnerModalOpen] = useState(false)
  const [modalPartner, setModalPartner] = useState<PartnerOption | null>(null)
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false)
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [withdrawalFeedback, setWithdrawalFeedback] = useState('')
  const [withdrawalSaving, setWithdrawalSaving] = useState(false)
  const [clubMessageModalOpen, setClubMessageModalOpen] = useState(false)
  const [clubMessage, setClubMessage] = useState('')
  const [clubMessageError, setClubMessageError] = useState('')
  const [clubMessageToast, setClubMessageToast] = useState('')
  const [clubMessageSaving, setClubMessageSaving] = useState(false)
  const [restoredDraft, setRestoredDraft] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true

    async function loadDetail() {
      if (!tournamentId) return
      setLoading(true)
      setMessage('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const response = await fetch(`/api/tournaments/${tournamentId}/public-detail`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error ?? 'No se pudo cargar el torneo.')
        if (alive) setDetail(payload)
      } catch (error) {
        if (alive) setMessage(error instanceof Error ? error.message : 'No se pudo cargar el torneo.')
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
    let alive = true
    const controller = new AbortController()
    const q = search.trim()

    async function runSearch() {
      setPartners([])
      setPartnerSearchError('')
      if (!detail || q.length < 1) return
      setSearching(true)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return
        const response = await fetch(`/api/tournaments/${detail.tournament.id}/registration/partners?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error ?? 'No pude buscar jugadores.')
        if (alive) setPartners(payload.partners ?? [])
      } catch (error) {
        if (alive && !(error instanceof DOMException && error.name === 'AbortError')) {
          setPartnerSearchError(error instanceof Error ? error.message : 'No pude buscar jugadores.')
        }
      } finally {
        if (alive) setSearching(false)
      }
    }

    const timer = window.setTimeout(runSearch, 280)
    return () => {
      alive = false
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search, detail])

  const activePartnerOption = useMemo<PartnerOption | null>(() => {
    const partner = detail?.viewer.activePartnership?.partner
    if (!partner?.userId) return null
    return {
      clubPlayerId: partner.clubPlayerId,
      userId: partner.userId,
      name: partner.name,
      avatarUrl: partner.avatarUrl,
      category: null,
      gender: null,
      approved: true,
    }
  }, [detail?.viewer.activePartnership])

  const allTurnsSelected = availability.length === availabilitySlots.length
  const availabilityReady = availability.length >= 2
  const availabilityPayload = useMemo(() => ({
    preferred_slots: availability,
    availability_score: availability.length,
    flexibility_level: availability.length,
    slots: availability,
    flexibility: availability.length,
  }), [availability])
  const alreadyRegistered = Boolean(detail?.viewer.isRegisteredInTournament)
  const forcePaymentStep = requestedStep === 'pago'
  const registrationClosed = isRegistrationClosed(detail?.tournament.registrationDeadline)
  const tournamentPaused = String(detail?.tournament.status ?? '').toUpperCase() === 'PAUSED'

  useEffect(() => {
    if (!detail || restoredDraft) return
    const key = getDraftKey(detail.tournament.id, detail.viewer.clubPlayer?.userId)
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the one-time local-draft restoration gate.
      setRestoredDraft(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const draft = JSON.parse(raw) as {
          selectedPartner?: PartnerOption | null
          selectedAvailabilitySlots?: string[]
          selectedPaymentMethod?: PaymentMethod | null
          currentStep?: WizardStep
        }
        if (draft.selectedPartner?.userId) setSelectedPartner(draft.selectedPartner)
        const restoredAvailability = Array.isArray(draft.selectedAvailabilitySlots)
          ? draft.selectedAvailabilitySlots.filter((slot) => availabilitySlots.some((item) => item.id === slot))
          : []
        if (restoredAvailability.length) setAvailability(restoredAvailability)
        const validPayment = draft.selectedPaymentMethod === 'CASH_ON_SITE_REQUEST' ? draft.selectedPaymentMethod : null
        if (validPayment) setPaymentMethod(validPayment)
        const requestedStep = draft.currentStep && draft.currentStep >= 1 && draft.currentStep <= 4 ? draft.currentStep : 1
        const safeRestoredStep = requestedStep > 1 && !draft.selectedPartner?.userId
          ? 1
          : requestedStep > 2 && restoredAvailability.length < 2
            ? 2
            : requestedStep > 3 && !validPayment
              ? 3
              : requestedStep
        setCurrentStep(safeRestoredStep)
      }
    } catch {
      window.localStorage.removeItem(key)
    } finally {
      setRestoredDraft(true)
    }
  }, [detail, restoredDraft])

  useEffect(() => {
    if (!detail || !restoredDraft || alreadyRegistered) return
    const key = getDraftKey(detail.tournament.id, detail.viewer.clubPlayer?.userId)
    if (!key) return
    const safeStep = currentStep > 1 && !selectedPartner ? 1 : currentStep > 2 && !availabilityReady ? 2 : currentStep > 3 && !paymentMethod ? 3 : currentStep
    window.localStorage.setItem(key, JSON.stringify({
      selectedPartner,
      selectedAvailabilitySlots: availability,
      selectedPaymentMethod: paymentMethod,
      currentStep: safeStep,
    }))
  }, [availability, availabilityReady, alreadyRegistered, currentStep, detail, paymentMethod, restoredDraft, selectedPartner])

  useEffect(() => {
    if (!clubMessageToast) return
    const timer = window.setTimeout(() => setClubMessageToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [clubMessageToast])

  async function submitRegistration() {
    if (!detail || !selectedPartner?.userId || !paymentMethod || !availabilityReady) return
    if (isRegistrationClosed(detail.tournament.registrationDeadline)) {
      setMessage('La inscripción para este torneo ya finalizó.')
      return
    }
    setSaving(true)
    setMessage(paymentMethod === 'CASH_ON_SITE_REQUEST' ? 'Enviando solicitud de pago...' : 'Preparando pago...')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Iniciá sesión para inscribirte.')

      const response = await fetch(`/api/tournaments/${detail.tournament.id}/registration/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partnerUserId: selectedPartner.userId,
          paymentMethod,
          preferredSlots: availabilityPayload.preferred_slots,
          availabilityScore: availabilityPayload.availability_score,
          flexibilityLevel: String(availabilityPayload.flexibility_level),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'No se pudo confirmar la inscripción.')

      const paymentResponse = await fetch(`/api/tournaments/${detail.tournament.id}/payments/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method: paymentMethod }),
      })
      const paymentPayload = await paymentResponse.json()
      if (!paymentResponse.ok) {
        throw new Error(paymentPayload?.error ?? 'La inscripción se creó, pero no pude registrar la solicitud de pago.')
      }

      setMessage(
        paymentMethod === 'CASH_ON_SITE_REQUEST'
          ? 'Solicitud enviada. El club debe aprobar el pago para confirmar tu inscripción.'
          : 'Solicitud creada correctamente.'
      )
      const draftKey = getDraftKey(detail.tournament.id, detail.viewer.clubPlayer?.userId)
      if (draftKey) window.localStorage.removeItem(draftKey)
      router.replace(`/torneos/${detail.tournament.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar la inscripción.')
    } finally {
      setSaving(false)
    }
  }

  async function submitPaymentRequestOnly() {
    if (!detail || !paymentMethod) return
    setSaving(true)
    setMessage(paymentMethod === 'CASH_ON_SITE_REQUEST' ? 'Enviando solicitud de pago...' : 'Preparando pago...')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Iniciá sesión para solicitar el pago.')

      const paymentResponse = await fetch(`/api/tournaments/${detail.tournament.id}/payments/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method: paymentMethod }),
      })
      const paymentPayload = await paymentResponse.json()
      if (!paymentResponse.ok) throw new Error(paymentPayload?.error ?? 'No pude registrar la solicitud de pago.')

      setMessage(
        paymentMethod === 'CASH_ON_SITE_REQUEST'
          ? 'Solicitud enviada. El club debe aprobar el pago para confirmar tu inscripción.'
          : 'Solicitud de pago registrada.'
      )
      router.replace(`/torneos/${detail.tournament.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude registrar la solicitud de pago.')
    } finally {
      setSaving(false)
    }
  }

  async function requestWithdrawal() {
    if (!detail) return
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
      const refundEstimate = getRefundEstimate(detail.tournament.startDate, Number(detail.tournament.pricePerPlayer ?? 0) * 2)

      const response = await fetch(`/api/tournaments/${detail.tournament.id}/registration-change-requests`, {
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
          hoursBeforeStart: refundEstimate.hoursBeforeStart,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'No pude enviar la solicitud de baja.')

      setMessage('Solicitud de baja enviada. El club debe revisarla.')
      setDetail((current) => {
        if (!current?.viewer.myTeam) return current
        const request = payload?.request ?? {}
        return {
          ...current,
          viewer: {
            ...current.viewer,
            myTeam: {
              ...current.viewer.myTeam,
              registrationChangeRequest: {
                id: String(request.id ?? ''),
                type: String(request.type ?? 'CANCEL_REGISTRATION'),
                status: String(request.status ?? 'PENDING'),
                reason,
                refundPercent: request.refund_percent ?? null,
                refundPolicyLabel: request.refund_policy_label ?? 'A confirmar',
                refundMetadata: request.refund_metadata ?? null,
                createdAt: request.created_at ?? new Date().toISOString(),
                resolvedAt: request.resolved_at ?? null,
              },
            },
          },
        }
      })
      setWithdrawalModalOpen(false)
      setWithdrawalReason('')
    } catch (error) {
      setWithdrawalFeedback(error instanceof Error ? error.message : 'No pude enviar la solicitud de baja.')
    } finally {
      setWithdrawalSaving(false)
    }
  }

  async function sendClubMessage() {
    if (!detail?.club?.id || !tournamentId || clubMessage.trim().length < 4) return

    setClubMessageSaving(true)
    setClubMessageError('')
    setMessage('')

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
      setClubMessageError('')
      setClubMessageModalOpen(false)
      setClubMessageToast('Mensaje enviado al club correctamente.')
    } catch (error) {
      setClubMessageError(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.')
    } finally {
      setClubMessageSaving(false)
    }
  }

  function selectPartner(partner: PartnerOption) {
    setSelectedPartner(partner)
    setSearch('')
    setPartners([])
    setModalPartner(null)
    setPartnerModalOpen(false)
    setMessage('')
  }

  function toggleAvailability(slotId: string) {
    setAvailability((current) => current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId])
  }

  function toggleAllAvailability() {
    setAvailability((current) => current.length === availabilitySlots.length ? [] : availabilitySlots.map((slot) => slot.id))
  }

  function openPartnerModal() {
    setModalPartner(selectedPartner)
    setSearch('')
    setPartners([])
    setPartnerModalOpen(true)
  }

  function goToStep(step: WizardStep) {
    if (step > 1 && !selectedPartner) return
    if (step > 2 && !availabilityReady) return
    if (step > 3 && !paymentMethod) return
    setCurrentStep(step)
  }

  if (loading) {
    return (
      <main className="tournamentSignupPage" style={loadingPageStyle}>
        <div className="tournamentSignupPage__state" style={loadingStateStyle}>
          <SelpaLoader className="tournamentSignupPage__loader" title="Preparando inscripción..." subtitle="Cargando datos del torneo" />
        </div>
      </main>
    )
  }

  if (!detail) {
    return (
      <main className="tournamentSignupPage">
        <div className="tournamentSignupPage__state">
          <p>{message || 'No se pudo cargar la inscripción.'}</p>
          <Link href="/torneos">Volver a torneos</Link>
        </div>
      </main>
    )
  }

  const canSubmit = Boolean(detail.viewer.isAuthenticated && detail.viewer.isPlayerInClub && selectedPartner?.userId && availabilityReady && paymentMethod && !saving)
  const pricePerPlayer = detail.tournament.pricePerPlayer ?? 0
  const totalPairPrice = pricePerPlayer * 2
  const myTeamPlayers = detail.viewer.myTeam?.players ?? []
  const enrolledPlayerName = myTeamPlayers[0]?.name ?? detail.viewer.clubPlayer?.name ?? 'Jugador'
  const enrolledPartnerName =
    myTeamPlayers.find((player) => player.userId !== detail.viewer.clubPlayer?.userId)?.name ??
    myTeamPlayers[1]?.name ??
    'A confirmar'
  const postPayment = postPaymentView(detail.viewer.myTeam?.paymentStatus, detail.viewer.myTeam?.paymentMethod)
  const showPaymentOnly = alreadyRegistered && forcePaymentStep && postPayment.action === 'pay'
  const theme = getClubTheme(detail.club?.themeKey)
  const themeStyle = {
    ['--tournament-signup-accent' as string]: theme.vars.accent,
    ['--tournament-signup-accent-2' as string]: theme.vars.accent2,
  } as CSSProperties

  return (
    <main className={`tournamentSignupPage ${!detail.viewer.isAuthenticated ? 'is-guest-signup' : ''}`} style={themeStyle}>
      <PampraxHero
        kicker="Inscripción al torneo"
        mobileKicker={detail.club?.name ?? 'Inscripción al torneo'}
        title={detail.tournament.name}
        subtitle={`${detail.club?.name ?? 'Club'} · ${detail.labels.category} · ${detail.labels.gender} · ${detail.labels.segment}`}
        mobileStatusBadge={tournamentPaused ? { label: 'Torneo pausado', tone: 'info' } : registrationClosed ? { label: 'Inscripción cerrada', tone: 'info' } : { label: 'Inscripción abierta', tone: 'success' }}
        primaryAction={{ label: 'Volver al torneo', href: `/torneos/${detail.tournament.id}` }}
        secondaryAction={detail.club ? { label: 'Ver club', href: `/clubs/${detail.club.id}` } : undefined}
        logo={{ src: detail.club?.logoUrl, alt: detail.club?.name ?? 'Club', fallback: detail.club?.name?.slice(0, 2).toUpperCase() ?? 'SE' }}
        stats={[
          { label: 'Cupos', value: `${detail.capacity.registeredTeamsCount}/${detail.capacity.maxPairs ?? '—'}`, icon: <Users size={16} /> },
          { label: 'Cierre', value: formatDate(detail.tournament.registrationDeadline), icon: <CalendarDays size={16} /> },
          { label: 'Valor', value: formatMoney(detail.tournament.pricePerPlayer), icon: <ShieldCheck size={16} /> },
        ]}
        mobileStats={[
          { label: 'Cierre', value: formatDate(detail.tournament.registrationDeadline), icon: <CalendarDays size={16} /> },
          { label: 'Valor', value: formatMoney(detail.tournament.pricePerPlayer), icon: <ShieldCheck size={16} /> },
        ]}
        themeKey={detail.club?.themeKey}
        coverUrl={detail.flyerUrl}
        variant="player-tournament"
      />

      {message ? <div className="tournamentSignupPage__message">{message}</div> : null}

      {!detail.viewer.isAuthenticated ? (
        <section className="tournamentSignupPage__panel tournamentSignupPage__panel--center tournamentSignupPage__guestGate">
          <span>Cuenta SELPA</span>
          <strong className="tournamentSignupPage__guestTournament">{detail.tournament.name}</strong>
          <h2>Iniciá sesión para anotarte</h2>
          <p>Entrás con tu cuenta y volvés directo a esta inscripción.</p>
          <Link className="tournamentSignupPage__primary" href={`/login?next=/torneos/${detail.tournament.id}/inscripcion`}>
            Ingresar y continuar
          </Link>
          <Link className="tournamentSignupPage__guestBack" href={`/torneos/${detail.tournament.id}`}>
            Volver al torneo
          </Link>
        </section>
      ) : (tournamentPaused || registrationClosed) && !alreadyRegistered ? (
        <section className="tournamentSignupPage__panel tournamentSignupPage__panel--center">
          <h2>{tournamentPaused ? 'Torneo pausado' : 'Inscripción cerrada'}</h2>
          <p>{tournamentPaused ? 'El club pausó temporalmente las inscripciones.' : 'La inscripción para este torneo ya finalizó.'}</p>
          <Link className="tournamentSignupPage__primary" href={`/torneos/${detail.tournament.id}`}>
            Ver torneo
          </Link>
        </section>
      ) : showPaymentOnly ? (
        <section className="tournamentSignupPage__panel tournamentSignupPage__stepPanel">
          <div className="tournamentSignupPage__stepTitle">
            <div>
              <span>Pago pendiente</span>
              <h2>Completá el pago</h2>
              <p>Tu pareja ya está registrada. Elegí un método para que el club pueda confirmar la inscripción.</p>
            </div>
            <CreditCard size={22} />
          </div>

          <div className="tournamentSignupPage__paymentGrid">
            <div className="tournamentSignupPage__checkoutSummary">
              <div className="tournamentSignupPage__header">
                <span>Tu inscripción</span>
                <Users size={18} />
              </div>
              <dl>
                <div>
                  <dt>Jugador</dt>
                  <dd>{enrolledPlayerName}</dd>
                </div>
                <div>
                  <dt>Compañero</dt>
                  <dd>{enrolledPartnerName}</dd>
                </div>
                <div>
                  <dt>Torneo</dt>
                  <dd>{detail.tournament.name}</dd>
                </div>
                <div>
                  <dt>Precio por jugador</dt>
                  <dd>{formatMoney(pricePerPlayer)}</dd>
                </div>
              </dl>
              <div className="tournamentSignupPage__checkoutTotal">
                <span>Total pareja</span>
                <strong>{totalPairPrice > 0 ? formatMoney(totalPairPrice) : 'A confirmar'}</strong>
                <small>{formatMoney(pricePerPlayer)} por jugador x 2</small>
              </div>
            </div>

            <div className="tournamentSignupPage__checkoutMethods">
              <div className="tournamentSignupPage__header">
                <span>Métodos de pago</span>
                <Banknote size={18} />
              </div>
              <div className="tournamentSignupPage__paymentMethods">
                {paymentMethods.map((method) => {
                  const disabled = method.key !== 'CASH_ON_SITE_REQUEST'
                  const recommended = method.key === 'MERCADO_PAGO'
                  const available = method.key === 'CASH_ON_SITE_REQUEST'
                  const selected = paymentMethod === method.key
                  return (
                    <button
                      key={method.key}
                      type="button"
                      className={`${selected ? 'is-selected' : ''} ${recommended ? 'is-recommended' : ''} ${available ? 'is-available' : ''}`}
                      disabled={disabled}
                      onClick={() => setPaymentMethod(method.key)}
                    >
                      {selected ? (
                        <span className="tournamentSignupPage__paymentCheck">
                          <CheckCircle2 size={16} />
                          Seleccionado
                        </span>
                      ) : null}
                      <i>{method.icon === 'cash' ? <Banknote size={18} /> : method.icon === 'bank' ? <ShieldCheck size={18} /> : <CreditCard size={18} />}</i>
                      <div>
                        <span>{method.badge}</span>
                        <strong>{method.title}</strong>
                        <p>{method.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="tournamentSignupPage__actions">
            <Link className="is-secondary" href={`/torneos/${detail.tournament.id}`}>← Volver al torneo</Link>
            <button
              type="button"
              disabled={!paymentMethod || saving}
              onClick={submitPaymentRequestOnly}
            >
              {paymentMethod === 'MERCADO_PAGO' ? 'Continuar a Mercado Pago' : paymentMethod === 'BANK_TRANSFER' ? 'Registrar transferencia' : paymentMethod === 'CASH_ON_SITE_REQUEST' ? 'Solicitar aprobación' : 'Continuar'}
            </button>
          </div>
        </section>
      ) : alreadyRegistered ? (
        <section className="tournamentSignupPage__insidePanel">
          <div className="tournamentSignupPage__insideColumns">
            <div className="tournamentSignupPage__insideIntro">
              <span>TU TORNEO</span>
              <h2>YA ESTÁS DENTRO</h2>
              <p>Tu inscripción fue registrada correctamente.</p>

              <div className="tournamentSignupPage__insideChips">
                <span>{enrolledPlayerName}</span>
                <span>{enrolledPartnerName}</span>
              </div>
            </div>

            <div className={`tournamentSignupPage__paymentStatusCard is-${postPayment.tone}`}>
              <div className="tournamentSignupPage__paymentStatusHead">
                <span>{postPayment.badge}</span>
                <CheckCircle2 size={20} />
              </div>
              <h3>{postPayment.title}</h3>
              <p>{postPayment.text}</p>
              <small>Inscripción: {registrationStatusLabel(detail.viewer.myTeam?.registrationStatus)}</small>

              {postPayment.action === 'message' ? (
                <button
                  type="button"
                  onClick={() => {
                    setClubMessageError('')
                    setClubMessageToast('')
                    setClubMessageModalOpen(true)
                  }}
                >
                  Enviar mensaje al club
                </button>
              ) : null}
              {postPayment.action === 'pay' ? (
                <Link href={`/torneos/${detail.tournament.id}/inscripcion`} className="tournamentSignupPage__statusAction">
                  Elegir otro método de pago
                </Link>
              ) : null}
            </div>
          </div>

          <div className="tournamentSignupPage__zoneAction">
            <button type="button" disabled title="La zona aparecerá cuando la organización publique el cuadro.">
              VER MI ZONA
            </button>
            <span>La zona aparecerá cuando la organización publique el cuadro.</span>
          </div>

          <div className="tournamentSignupPage__withdrawalInline">
            <button type="button" onClick={() => setWithdrawalModalOpen(true)}>
              {detail.viewer.myTeam?.registrationChangeRequest?.status === 'PENDING' ? 'Baja solicitada' : 'Solicitar baja del torneo'}
            </button>
          </div>

          {detail.viewer.myTeam?.registrationChangeRequest?.status === 'PENDING' ? (
            <div className="tournamentSignupPage__confirmNote">
              Solicitud de baja pendiente de revisión por el club.
            </div>
          ) : null}
        </section>
      ) : (
        <>
        <div className="tournamentSignupPage__steps" aria-label="Pasos de inscripción">
          {wizardSteps.map((step) => {
            const isComplete = step.id < currentStep
            const isCurrent = step.id === currentStep
            const isDisabled = (step.id > 1 && !selectedPartner) || (step.id > 2 && !availabilityReady) || (step.id > 3 && !paymentMethod)
            return (
              <button
                key={step.id}
                type="button"
                className={`${isComplete ? 'is-complete' : ''} ${isCurrent ? 'is-current' : ''}`}
                disabled={isDisabled}
                onClick={() => goToStep(step.id)}
              >
                <b>{isComplete ? '✓' : step.id}</b>
                {step.label}
              </button>
            )
          })}
        </div>

        <section className="tournamentSignupPage__wizard">
          {currentStep === 1 ? (
            <article className="tournamentSignupPage__panel tournamentSignupPage__stepPanel">
              <div className="tournamentSignupPage__stepTitle">
                <div>
                  <span>Paso 1</span>
                  <h2>Elegir compañero</h2>
                </div>
                <Users size={22} />
              </div>

              <div className="tournamentSignupPage__partnerGrid">
                <div className="tournamentSignupPage__subPanel">
                  <div className="tournamentSignupPage__header">
                    <span>Tu jugador</span>
                    <ShieldCheck size={18} />
                  </div>
                  {detail.viewer.clubPlayer ? (
                    <div className="tournamentSignupPage__player">
                      <div className="tournamentSignupPage__avatar">{initials(detail.viewer.clubPlayer.name)}</div>
                      <div>
                        <strong>{detail.viewer.clubPlayer.name}</strong>
                        <span>
                          {detail.viewer.clubPlayer.category ?? '—'}ta · {genderLabel(detail.viewer.clubPlayer.gender)}
                        </span>
                        <em>{detail.viewer.clubPlayer.approved ? 'Jugador aprobado' : 'Pendiente de aprobación'}</em>
                      </div>
                    </div>
                  ) : (
                    <p>No tenés perfil de jugador en este club. Pedí aprobación al club para poder inscribirte.</p>
                  )}
                </div>

                <div className="tournamentSignupPage__subPanel">
                  <div className="tournamentSignupPage__header">
                    <span>Buscar compañero</span>
                    <Search size={18} />
                  </div>

                  {selectedPartner ? (
                    <div className="tournamentSignupPage__partnerSummary">
                      <CheckCircle2 size={22} />
                      <div className="tournamentSignupPage__avatar">
                        {selectedPartner.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selectedPartner.avatarUrl} alt="" />
                        ) : (
                          initials(selectedPartner.name)
                        )}
                      </div>
                      <div>
                        <strong>{selectedPartner.name}</strong>
                        <span>
                          {selectedPartner.category ?? '—'}ta · {genderLabel(selectedPartner.gender)}
                        </span>
                      </div>
                      <button type="button" onClick={openPartnerModal}>Cambiar</button>
                    </div>
                  ) : (
                    <>
                      <label className="tournamentSignupPage__search tournamentSignupPage__search--hero">
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Buscar compañero por nombre o apellido"
                        />
                      </label>

                      {activePartnerOption ? (
                        <div className="tournamentSignupPage__activePartner">
                          <div>
                            <small>Pareja activa detectada</small>
                            <strong>{activePartnerOption.name}</strong>
                            <span>Podés usarla para completar la inscripción.</span>
                          </div>
                          <button type="button" onClick={() => selectPartner(activePartnerOption)}>
                            Usar pareja activa
                          </button>
                        </div>
                      ) : (
                        <div className="tournamentSignupPage__emptyPartner">Sin pareja activa detectada para este club.</div>
                      )}

                      <div className="tournamentSignupPage__results">
                        {searching ? <div className="tournamentSignupPage__emptyPartner">Buscando jugadores...</div> : null}
                        {partnerSearchError ? (
                          <div className="tournamentSignupPage__emptyPartner is-error">{partnerSearchError}</div>
                        ) : null}
                        {!searching && !partnerSearchError && search.trim().length >= 1 && !partners.length ? (
                          <div className="tournamentSignupPage__emptyPartner">No se encontraron jugadores.</div>
                        ) : null}
                        {partners.map((partner) => (
                          <button
                            key={partner.clubPlayerId}
                            type="button"
                            onClick={() => selectPartner(partner)}
                          >
                            <div className="tournamentSignupPage__avatar">
                              {partner.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={partner.avatarUrl} alt="" />
                              ) : (
                                initials(partner.name)
                              )}
                            </div>
                            <div>
                              <strong>{partner.name}</strong>
                              <span>
                                {partner.category ?? '—'}ta · {genderLabel(partner.gender)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {selectedPartner ? (
                <div className="tournamentSignupPage__continueBox">
                  <span>Ya tenés compañero. Continuá al siguiente paso.</span>
                  <button type="button" onClick={() => setCurrentStep(2)}>Continuar →</button>
                </div>
              ) : null}
            </article>
          ) : null}

          {currentStep === 2 ? (
            <article className="tournamentSignupPage__panel tournamentSignupPage__stepPanel">
              <div className="tournamentSignupPage__stepTitle">
                <div>
                  <span>Paso 2</span>
                  <h2>Disponibilidad horaria</h2>
                  <p>Seleccioná los horarios en los que la pareja puede jugar durante la fase de grupos.</p>
                </div>
                <Clock size={22} />
              </div>

              <div className="tournamentSignupPage__availabilityHint">
                <Clock size={18} />
                <span>Estos horarios son una preferencia. Intentaremos respetarlos, pero pueden cambiar según canchas e inscriptos.</span>
              </div>

              <div className="tournamentSignupPage__slots">
                <label className={`tournamentSignupPage__allSlots ${allTurnsSelected ? 'is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={allTurnsSelected}
                    onChange={toggleAllAvailability}
                  />
                  <span>Todos los turnos</span>
                  <strong>Sin restricciones horarias</strong>
                </label>
                {availabilitySlots.map((slot) => (
                  <label key={slot.id} className={`${availability.includes(slot.id) ? 'is-selected' : ''} ${allTurnsSelected ? 'is-disabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={availability.includes(slot.id)}
                      disabled={allTurnsSelected}
                      onChange={() => toggleAvailability(slot.id)}
                    />
                    <span>{slot.title}</span>
                    <strong>{slot.time}</strong>
                  </label>
                ))}
              </div>

              <div className={`tournamentSignupPage__availabilityState ${
                availability.length === 0 ? 'is-empty' : availability.length === 1 ? 'is-warning' : 'is-ready'
              }`}>
                {availability.length === 0 ? 'Elegí al menos 2 turnos para continuar.' : null}
                {availability.length === 1 ? 'Seleccioná al menos un turno más.' : null}
                {availability.length >= 2 ? `Disponibilidad registrada: ${availability.length} turnos seleccionados.` : null}
              </div>

              <div className="tournamentSignupPage__actions">
                <button type="button" className="is-secondary" onClick={() => setCurrentStep(1)}>← Volver</button>
                <button type="button" disabled={!availabilityReady} onClick={() => setCurrentStep(3)}>Continuar →</button>
              </div>
            </article>
          ) : null}

          {currentStep === 3 ? (
            <article className="tournamentSignupPage__panel tournamentSignupPage__stepPanel">
              <div className="tournamentSignupPage__stepTitle">
                <div>
                  <span>Paso 3</span>
                  <h2>Pago</h2>
                  <p>Revisá el total y elegí cómo querés avanzar con la solicitud de pago.</p>
                </div>
                <CreditCard size={22} />
              </div>

              <div className="tournamentSignupPage__paymentGrid">
                <div className="tournamentSignupPage__checkoutSummary">
                  <div className="tournamentSignupPage__header">
                    <span>Tu inscripción</span>
                    <Users size={18} />
                  </div>
                  <dl>
                    <div>
                      <dt>Jugador</dt>
                      <dd>{detail.viewer.clubPlayer?.name ?? 'Tu jugador'}</dd>
                    </div>
                    <div>
                      <dt>Compañero</dt>
                      <dd>{selectedPartner?.name}</dd>
                    </div>
                    <div>
                      <dt>Torneo</dt>
                      <dd>{detail.tournament.name}</dd>
                    </div>
                    <div>
                      <dt>Precio por jugador</dt>
                      <dd>{formatMoney(pricePerPlayer)}</dd>
                    </div>
                  </dl>
                  <div className="tournamentSignupPage__checkoutTotal">
                    <span>Total pareja</span>
                    <strong>{totalPairPrice > 0 ? formatMoney(totalPairPrice) : 'A confirmar'}</strong>
                    <small>{formatMoney(pricePerPlayer)} por jugador x 2</small>
                  </div>
                </div>

                <div className="tournamentSignupPage__checkoutMethods">
                  <div className="tournamentSignupPage__header">
                    <span>Métodos de pago</span>
                    <Banknote size={18} />
                  </div>
                  <div className="tournamentSignupPage__paymentMethods">
                    {paymentMethods.map((method) => {
                      const disabled = method.key !== 'CASH_ON_SITE_REQUEST'
                      const recommended = method.key === 'MERCADO_PAGO'
                      const available = method.key === 'CASH_ON_SITE_REQUEST'
                      const selected = paymentMethod === method.key
                      return (
                        <button
                          key={method.key}
                          type="button"
                          className={`${selected ? 'is-selected' : ''} ${recommended ? 'is-recommended' : ''} ${available ? 'is-available' : ''}`}
                          disabled={disabled}
                          onClick={() => setPaymentMethod(method.key)}
                        >
                          {selected ? (
                            <span className="tournamentSignupPage__paymentCheck">
                              <CheckCircle2 size={16} />
                              Seleccionado
                            </span>
                          ) : null}
                          <i>{method.icon === 'cash' ? <Banknote size={18} /> : method.icon === 'bank' ? <ShieldCheck size={18} /> : <CreditCard size={18} />}</i>
                          <div>
                            <span>{method.badge}</span>
                            <strong>{method.title}</strong>
                            <p>{method.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="tournamentSignupPage__actions">
                <button type="button" className="is-secondary" onClick={() => setCurrentStep(2)}>← Volver</button>
                <button
                  type="button"
                  disabled={!paymentMethod}
                  onClick={() => setCurrentStep(4)}
                >
                  {paymentMethod === 'MERCADO_PAGO' ? 'Continuar a Mercado Pago' : paymentMethod === 'BANK_TRANSFER' ? 'Registrar transferencia' : paymentMethod === 'CASH_ON_SITE_REQUEST' ? 'Solicitar aprobación' : 'Continuar'}
                </button>
              </div>
            </article>
          ) : null}

          {currentStep === 4 ? (
            <article className="tournamentSignupPage__panel tournamentSignupPage__stepPanel tournamentSignupPage__finalPanel">
              <div className="tournamentSignupPage__stepTitle">
                <div>
                  <span>Paso 4</span>
                  <h2>Confirmación</h2>
                  <p>Revisá los datos antes de enviar la solicitud al club.</p>
                </div>
                <CheckCircle2 size={22} />
              </div>

              <div className="tournamentSignupPage__summaryGrid">
                <div>
                  <span>Jugador</span>
                  <strong>{detail.viewer.clubPlayer?.name ?? 'Tu jugador'}</strong>
                </div>
                <div>
                  <span>Compañero</span>
                  <strong>{selectedPartner?.name}</strong>
                </div>
                <div>
                  <span>Disponibilidad</span>
                  <strong>{allTurnsSelected ? 'Todos los turnos' : availabilitySlots.filter((slot) => availability.includes(slot.id)).map((slot) => slot.title).join(' · ')}</strong>
                  <em>Flexibilidad {availabilityPayload.flexibility_level}/4</em>
                </div>
                <div>
                  <span>Pago</span>
                  <strong>{paymentMethods.find((method) => method.key === paymentMethod)?.title ?? 'Seleccioná un método'}</strong>
                </div>
              </div>

              <div className="tournamentSignupPage__confirmNote">
                La inscripción quedará pendiente hasta que el club apruebe el pago.
              </div>

              <div className="tournamentSignupPage__actions">
                <button type="button" className="is-secondary" onClick={() => setCurrentStep(3)}>← Volver</button>
                <button type="button" disabled={!canSubmit} onClick={submitRegistration}>
                  {saving ? 'Enviando...' : 'CONFIRMAR INSCRIPCIÓN'}
                </button>
              </div>
            </article>
          ) : null}
        </section>

        {partnerModalOpen ? (
          <div className="tournamentSignupPage__modalBackdrop" role="presentation">
            <div className="tournamentSignupPage__modal" role="dialog" aria-modal="true" aria-label="Cambiar compañero">
              <div className="tournamentSignupPage__modalHeader">
                <div>
                  <span>Cambiar compañero</span>
                  <h3>Elegí otro jugador del club</h3>
                </div>
                <button type="button" onClick={() => setPartnerModalOpen(false)} aria-label="Cerrar">×</button>
              </div>

              <label className="tournamentSignupPage__search">
                <span>Buscar jugador</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nombre o apellido"
                  autoFocus
                />
              </label>

              <div className="tournamentSignupPage__modalResults">
                {searching ? <div className="tournamentSignupPage__emptyPartner">Buscando jugadores...</div> : null}
                {partnerSearchError ? (
                  <div className="tournamentSignupPage__emptyPartner is-error">{partnerSearchError}</div>
                ) : null}
                {!searching && !partnerSearchError && search.trim().length >= 1 && !partners.length ? (
                  <div className="tournamentSignupPage__emptyPartner">No se encontraron jugadores.</div>
                ) : null}
                {!searching && search.trim().length < 1 ? (
                  <div className="tournamentSignupPage__emptyPartner">Empezá a escribir para buscar.</div>
                ) : null}
                {partners.map((partner) => (
                  <button
                    key={partner.clubPlayerId}
                    type="button"
                    className={modalPartner?.clubPlayerId === partner.clubPlayerId ? 'is-selected' : ''}
                    onClick={() => setModalPartner(partner)}
                  >
                    <div className="tournamentSignupPage__avatar">
                      {partner.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={partner.avatarUrl} alt="" />
                      ) : (
                        initials(partner.name)
                      )}
                    </div>
                    <div>
                      <strong>{partner.name}</strong>
                      <span>{partner.category ?? '—'}ta · {genderLabel(partner.gender)}</span>
                    </div>
                    {modalPartner?.clubPlayerId === partner.clubPlayerId ? <CheckCircle2 size={18} /> : null}
                  </button>
                ))}
              </div>

              <div className="tournamentSignupPage__modalActions">
                <button type="button" className="is-secondary" onClick={() => setPartnerModalOpen(false)}>Cancelar</button>
                <button type="button" disabled={!modalPartner} onClick={() => modalPartner ? selectPartner(modalPartner) : undefined}>
                  Confirmar compañero
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      )}

      {withdrawalModalOpen ? (
        <div className="tournamentSignupPage__modalBackdrop" role="presentation">
          <div className="tournamentSignupPage__modal tournamentSignupPage__modal--compact" role="dialog" aria-modal="true" aria-label="Solicitar baja del torneo">
            <div className="tournamentSignupPage__modalHeader">
              <div>
                <span>Baja del torneo</span>
                <h3>Solicitud pendiente de club</h3>
              </div>
              <button type="button" onClick={() => setWithdrawalModalOpen(false)} aria-label="Cerrar">×</button>
            </div>
            <p className="tournamentSignupPage__modalText">
              La baja del torneo debe ser revisada y aprobada por el club. Escribí un motivo breve para enviar la solicitud.
            </p>
            <label className="tournamentSignupPage__withdrawalReason">
              <span>Motivo</span>
              <textarea
                value={withdrawalReason}
                onChange={(event) => {
                  setWithdrawalReason(event.target.value)
                  setWithdrawalFeedback('')
                }}
                placeholder="Ej: No voy a poder asistir en la fecha del torneo."
                rows={4}
              />
            </label>
            {withdrawalFeedback ? <p className="tournamentSignupPage__modalError" role="alert">{withdrawalFeedback}</p> : null}
            <div className="tournamentSignupPage__modalActions">
              <button type="button" className="is-secondary" onClick={() => setWithdrawalModalOpen(false)} disabled={withdrawalSaving}>Cancelar</button>
              <button type="button" onClick={requestWithdrawal} disabled={withdrawalSaving || withdrawalReason.trim().length < 8}>
                {withdrawalSaving ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clubMessageModalOpen ? (
        <div className="tournamentSignupPage__modalBackdrop" role="presentation">
          <div className="tournamentSignupPage__modal tournamentSignupPage__modal--compact" role="dialog" aria-modal="true" aria-label="Enviar mensaje al club">
            <div className="tournamentSignupPage__modalHeader">
              <div>
                <span>Mensaje al club</span>
                <h3>Consultar por tu pago</h3>
              </div>
              <button type="button" onClick={() => setClubMessageModalOpen(false)} aria-label="Cerrar">×</button>
            </div>
            {clubMessageError ? (
              <p className="tournamentSignupPage__modalError" role="alert">
                {clubMessageError}
              </p>
            ) : null}
            <label className="tournamentSignupPage__withdrawalReason">
              <span>Consulta</span>
              <textarea
                value={clubMessage}
                onChange={(event) => {
                  setClubMessage(event.target.value)
                  setClubMessageError('')
                }}
                placeholder="Hola, ya solicité pagar en el predio. ¿Podrían aprobar mi inscripción?"
                rows={4}
              />
            </label>
            <div className="tournamentSignupPage__modalActions">
              <button type="button" className="is-secondary" onClick={() => setClubMessageModalOpen(false)}>Cancelar</button>
              <button
                type="button"
                disabled={clubMessage.trim().length < 4 || clubMessageSaving}
                onClick={sendClubMessage}
              >
                {clubMessageSaving ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clubMessageToast ? (
        <div className="tournamentSignupPage__toast" role="status" aria-live="polite">
          <span aria-hidden="true"><CheckCircle2 size={16} /></span>
          <p>{clubMessageToast}</p>
        </div>
      ) : null}

      <style>{`
        .tournamentSignupPage {
          box-sizing: border-box;
          max-width: 1180px;
          width: 100%;
          margin: 0 auto;
          padding: 22px 0 56px;
          color: #061a3f;
        }

        .tournamentSignupPage__state,
        .tournamentSignupPage__message,
        .tournamentSignupPage__panel {
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: rgba(255, 255, 255, 0.92);
          border-radius: 24px;
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.07);
        }

        .tournamentSignupPage__state,
        .tournamentSignupPage__message {
          padding: 18px;
          margin-top: 16px;
          font-weight: 850;
        }

        .tournamentSignupPage__steps {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }

        .tournamentSignupPage__steps button {
          align-items: center;
          border: 1px solid rgba(15,23,42,.10);
          background: rgba(255,255,255,.78);
          border-radius: 999px;
          color: #64748b;
          cursor: pointer;
          display: inline-flex;
          font-size: 13px;
          font-weight: 900;
          gap: 8px;
          min-height: 42px;
          padding: 0 12px;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }

        .tournamentSignupPage__steps button:disabled {
          cursor: not-allowed;
          opacity: .62;
        }

        .tournamentSignupPage__steps button b {
          align-items: center;
          background: #e2e8f0;
          border-radius: 999px;
          color: #061a3f;
          display: inline-flex;
          font-size: 12px;
          height: 24px;
          justify-content: center;
          width: 24px;
        }

        .tournamentSignupPage__steps button.is-current {
          border-color: rgba(14,165,233,.34);
          background: rgba(14,165,233,.09);
          color: #0b2554;
          box-shadow: 0 12px 28px rgba(14,165,233,.08);
        }

        .tournamentSignupPage__steps button.is-current b {
          background: #061a3f;
          color: #fff;
        }

        .tournamentSignupPage__steps button.is-complete {
          border-color: rgba(16,185,129,.32);
          background: rgba(16,185,129,.10);
          color: #047857;
        }

        .tournamentSignupPage__steps button.is-complete b {
          background: #10b981;
          color: #fff;
        }

        .tournamentSignupPage__wizard {
          margin-top: 18px;
        }

        .tournamentSignupPage__stepPanel {
          display: grid;
          gap: 16px;
          animation: tournamentSignupStepIn .22s ease both;
        }

        @keyframes tournamentSignupStepIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tournamentSignupPage__stepTitle {
          align-items: start;
          display: flex;
          gap: 16px;
          justify-content: space-between;
        }

        .tournamentSignupPage__stepTitle > svg {
          color: #0284c7;
        }

        .tournamentSignupPage__stepTitle span {
          color: #0284c7;
          display: block;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__stepTitle h2 {
          margin-top: 2px;
        }

        .tournamentSignupPage__stepTitle p {
          margin-top: 4px;
        }

        .tournamentSignupPage__partnerGrid,
        .tournamentSignupPage__paymentGrid {
          display: grid;
          gap: 14px;
          grid-template-columns: .9fr 1.1fr;
        }

        .tournamentSignupPage__subPanel {
          border: 1px solid rgba(15,23,42,.08);
          background: rgba(248,250,252,.78);
          border-radius: 20px;
          padding: 14px;
        }

        .tournamentSignupPage__panel {
          padding: 18px;
        }

        .tournamentSignupPage__panel--wide {
          grid-row: span 2;
        }

        .tournamentSignupPage__panel--payment {
          grid-column: span 2;
        }

        .tournamentSignupPage__panel--confirm {
          display: grid;
          align-content: start;
          gap: 12px;
        }

        .tournamentSignupPage__panel--center {
          margin-top: 18px;
          text-align: center;
          display: grid;
          gap: 12px;
          justify-items: center;
        }

        .tournamentSignupPage__guestGate {
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 14%, transparent), transparent 44%),
            rgba(255,255,255,.9);
          border-color: color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 24%, rgba(15,23,42,.1));
        }

        .tournamentSignupPage__guestGate > span {
          color: #0284c7;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__guestTournament {
          color: #0b2554;
          display: block;
          font-size: 13px;
          font-weight: 950;
          line-height: 1.15;
          max-width: 340px;
        }

        .tournamentSignupPage__guestBack {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
        }

        .tournamentSignupPage__guestBack:hover {
          color: #0b2554;
        }

        .tournamentSignupPage__panel h2 {
          margin: 0;
          color: #061a3f;
          font-size: 24px;
          font-weight: 950;
        }

        .tournamentSignupPage__panel p {
          margin: 0;
          color: #475569;
          line-height: 1.5;
        }

        .tournamentSignupPage__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          color: #0b2554;
          font-weight: 950;
        }

        .tournamentSignupPage__player,
        .tournamentSignupPage__activePartner,
        .tournamentSignupPage__results button {
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(14, 165, 233, 0.18);
          background: linear-gradient(135deg, rgba(14,165,233,.08), rgba(236,72,153,.04));
          border-radius: 18px;
          padding: 12px;
        }

        .tournamentSignupPage__avatar {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          overflow: hidden;
          flex: 0 0 auto;
          background: #061a3f;
          color: white;
          font-size: 14px;
          font-weight: 950;
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.8), 0 10px 24px rgba(14,165,233,.18);
        }

        .tournamentSignupPage__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .tournamentSignupPage__player strong,
        .tournamentSignupPage__results strong,
        .tournamentSignupPage__activePartner strong {
          display: block;
          color: #061a3f;
          font-size: 16px;
          font-weight: 950;
        }

        .tournamentSignupPage__player span,
        .tournamentSignupPage__results span,
        .tournamentSignupPage__activePartner span {
          display: block;
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
        }

        .tournamentSignupPage__player em {
          display: inline-flex;
          margin-top: 6px;
          border-radius: 999px;
          background: rgba(16,185,129,.12);
          color: #047857;
          padding: 5px 8px;
          font-size: 12px;
          font-style: normal;
          font-weight: 950;
        }

        .tournamentSignupPage__activePartner {
          justify-content: space-between;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .tournamentSignupPage__activePartner small {
          display: block;
          color: #0284c7;
          font-weight: 950;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: .05em;
        }

        .tournamentSignupPage__activePartner button,
        .tournamentSignupPage__primary,
        .tournamentSignupPage__actions a,
        .tournamentSignupPage__actions button,
        .tournamentSignupPage__continueBox button {
          align-items: center;
          border: 1px solid rgba(14, 165, 233, 0.28);
          border-radius: 999px;
          background: #061a3f;
          color: white !important;
          cursor: pointer;
          display: inline-flex;
          font-weight: 950;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          text-decoration: none;
          transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
          box-shadow: 0 14px 30px rgba(14,165,233,.18);
        }

        .tournamentSignupPage__activePartner button:hover,
        .tournamentSignupPage__primary:hover,
        .tournamentSignupPage__actions a:hover,
        .tournamentSignupPage__actions button:not(:disabled):hover,
        .tournamentSignupPage__continueBox button:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 42px rgba(14,165,233,.28);
        }

        .tournamentSignupPage__actions button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .tournamentSignupPage__actions button.is-secondary,
        .tournamentSignupPage__actions a.is-secondary {
          background: rgba(255,255,255,.86);
          color: #0b2554;
          box-shadow: none;
        }

        .tournamentSignupPage__emptyPartner,
        .tournamentSignupPage__selected {
          border: 1px dashed rgba(14, 165, 233, 0.22);
          border-radius: 16px;
          background: rgba(14, 165, 233, 0.06);
          color: #475569;
          padding: 12px;
          font-weight: 850;
        }

        .tournamentSignupPage__search--hero + .tournamentSignupPage__emptyPartner {
          background: #f3f6fa;
          border-color: rgba(100,116,139,.18);
          color: #64748b;
          margin-top: 14px;
        }

        .tournamentSignupPage__partnerSummary {
          align-items: center;
          border: 1px solid rgba(16,185,129,.26);
          background: linear-gradient(135deg, rgba(16,185,129,.12), rgba(14,165,233,.06));
          border-radius: 20px;
          display: grid;
          gap: 12px;
          grid-template-columns: 28px 52px minmax(0, 1fr) auto;
          padding: 14px;
          animation: tournamentSignupStepIn .22s ease both;
        }

        .tournamentSignupPage__partnerSummary > svg {
          color: #059669;
        }

        .tournamentSignupPage__partnerSummary small,
        .tournamentSignupPage__summaryGrid span {
          color: #0284c7;
          display: block;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__partnerSummary strong,
        .tournamentSignupPage__summaryGrid strong {
          color: #061a3f;
          display: block;
          font-size: 17px;
          font-weight: 950;
        }

        .tournamentSignupPage__summaryGrid em {
          color: #64748b;
          display: block;
          font-size: 12px;
          font-style: normal;
          font-weight: 850;
          margin-top: 5px;
        }

        .tournamentSignupPage__partnerSummary span {
          color: #64748b;
          display: block;
          font-size: 13px;
          font-weight: 850;
        }

        .tournamentSignupPage__partnerSummary button {
          border: 1px solid rgba(15,23,42,.12);
          border-radius: 999px;
          background: rgba(255,255,255,.88);
          color: #0b2554;
          cursor: pointer;
          font-weight: 900;
          padding: 8px 11px;
        }

        .tournamentSignupPage__continueBox {
          align-items: center;
          border: 1px solid rgba(16,185,129,.22);
          background: rgba(16,185,129,.08);
          border-radius: 20px;
          color: #047857;
          display: flex;
          flex-wrap: wrap;
          font-weight: 950;
          gap: 12px;
          justify-content: space-between;
          padding: 14px;
        }

        .tournamentSignupPage__slots {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }

        .tournamentSignupPage__slots label {
          border: 1px solid rgba(15,23,42,.10);
          background: rgba(255,255,255,.88);
          border-radius: 20px;
          cursor: pointer;
          display: grid;
          gap: 8px;
          min-height: 128px;
          padding: 14px;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }

        .tournamentSignupPage__slots label:hover,
        .tournamentSignupPage__slots label.is-selected {
          border-color: rgba(14,165,233,.42);
          background: linear-gradient(135deg, rgba(14,165,233,.10), rgba(255,255,255,.92));
          box-shadow: 0 18px 36px rgba(14,165,233,.12);
          transform: translateY(-2px);
        }

        .tournamentSignupPage__slots label.is-disabled {
          cursor: not-allowed;
          opacity: .72;
          transform: none;
        }

        .tournamentSignupPage__slots label.is-disabled:hover {
          box-shadow: none;
        }

        .tournamentSignupPage__slots .tournamentSignupPage__allSlots {
          border-color: rgba(16,185,129,.26);
          background: linear-gradient(135deg, rgba(16,185,129,.10), rgba(14,165,233,.05));
        }

        .tournamentSignupPage__slots input {
          width: 18px;
          height: 18px;
          accent-color: #0284c7;
        }

        .tournamentSignupPage__slots span {
          color: #061a3f;
          font-size: 16px;
          font-weight: 950;
        }

        .tournamentSignupPage__slots strong {
          color: #64748b;
          font-size: 14px;
          font-weight: 900;
        }

        .tournamentSignupPage__availabilityState,
        .tournamentSignupPage__availabilityHint {
          border-radius: 18px;
          font-weight: 900;
          padding: 12px 14px;
        }

        .tournamentSignupPage__availabilityState.is-empty {
          border: 1px solid rgba(100,116,139,.18);
          background: rgba(100,116,139,.07);
          color: #64748b;
        }

        .tournamentSignupPage__availabilityState.is-warning {
          border: 1px solid rgba(14,165,233,.25);
          background: rgba(14,165,233,.08);
          color: #0369a1;
        }

        .tournamentSignupPage__availabilityState.is-ready {
          border: 1px solid rgba(16,185,129,.24);
          background: rgba(16,185,129,.10);
          color: #047857;
        }

        .tournamentSignupPage__availabilityHint {
          border: 1px solid rgba(15,23,42,.08);
          background: linear-gradient(135deg, rgba(245,158,11,.10), rgba(14,165,233,.08), rgba(255,255,255,.90));
          color: #0b2554;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          line-height: 1.45;
        }

        .tournamentSignupPage__availabilityHint svg {
          color: #0284c7;
          flex: 0 0 auto;
        }

        .tournamentSignupPage__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 4px;
          padding-top: 14px;
          border-top: 1px solid rgba(15,23,42,.08);
        }

        .tournamentSignupPage__actions .is-secondary {
          margin-right: auto;
        }

        .tournamentSignupPage__summaryGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .tournamentSignupPage__summaryGrid > div {
          border: 1px solid rgba(15,23,42,.08);
          background: rgba(255,255,255,.86);
          border-radius: 18px;
          padding: 14px;
        }

        .tournamentSignupPage__confirmNote {
          border: 1px solid rgba(14,165,233,.18);
          background: linear-gradient(135deg, rgba(14,165,233,.08), rgba(236,72,153,.05));
          border-radius: 18px;
          color: #0b2554;
          font-weight: 900;
          padding: 14px;
          text-align: center;
        }

        .tournamentSignupPage__emptyPartner.is-error {
          background: rgba(244,63,94,.07);
          border-color: rgba(244,63,94,.22);
          color: #9f1239;
        }

        .tournamentSignupPage__modalBackdrop {
          align-items: center;
          background: rgba(2, 8, 23, 0.56);
          display: flex;
          inset: 0;
          justify-content: center;
          padding: 18px;
          position: fixed;
          z-index: 80;
        }

        .tournamentSignupPage__modal {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(14,165,233,.22);
          border-radius: 26px;
          box-shadow: 0 30px 90px rgba(2,8,23,.28);
          display: grid;
          gap: 14px;
          max-height: min(720px, calc(100vh - 34px));
          overflow: hidden;
          padding: 18px;
          width: min(620px, 100%);
        }

        .tournamentSignupPage__modal--compact {
          width: min(520px, 100%);
        }

        .tournamentSignupPage__modalText {
          color: #475569;
          font-weight: 850;
          line-height: 1.5;
          margin: 0;
        }

        .tournamentSignupPage__modalError {
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.24);
          border-radius: 14px;
          color: #9f1239;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.35;
          margin: 0;
          padding: 10px 12px;
        }

        .tournamentSignupPage__withdrawalReason {
          display: grid;
          gap: 8px;
          color: #0b2554;
          font-weight: 950;
        }

        .tournamentSignupPage__withdrawalReason textarea {
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

        .tournamentSignupPage__withdrawalReason textarea:focus {
          border-color: rgba(14,165,233,.48);
          box-shadow: 0 0 0 4px rgba(14,165,233,.12);
        }

        .tournamentSignupPage__modalHeader {
          align-items: start;
          display: flex;
          justify-content: space-between;
          gap: 14px;
        }

        .tournamentSignupPage__modalHeader span {
          color: #0284c7;
          display: block;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__modalHeader h3 {
          color: #061a3f;
          font-size: 24px;
          font-weight: 950;
          margin: 2px 0 0;
        }

        .tournamentSignupPage__modalHeader > button {
          border: 1px solid rgba(15,23,42,.10);
          background: #fff;
          border-radius: 999px;
          color: #061a3f;
          cursor: pointer;
          font-size: 24px;
          font-weight: 800;
          height: 38px;
          line-height: 1;
          width: 38px;
        }

        .tournamentSignupPage__modalResults {
          display: grid;
          gap: 10px;
          max-height: 330px;
          overflow: auto;
          padding-right: 4px;
        }

        .tournamentSignupPage__modalResults button {
          align-items: center;
          border: 1px solid rgba(15,23,42,.10);
          background: rgba(255,255,255,.88);
          border-radius: 18px;
          color: #061a3f;
          cursor: pointer;
          display: grid;
          gap: 12px;
          grid-template-columns: 48px minmax(0, 1fr) 22px;
          padding: 12px;
          text-align: left;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .tournamentSignupPage__modalResults button:hover,
        .tournamentSignupPage__modalResults button.is-selected {
          border-color: rgba(14,165,233,.45);
          box-shadow: 0 16px 34px rgba(14,165,233,.14);
          transform: translateY(-2px);
        }

        .tournamentSignupPage__modalResults strong {
          display: block;
          font-size: 16px;
          font-weight: 950;
        }

        .tournamentSignupPage__modalResults span {
          color: #64748b;
          display: block;
          font-size: 13px;
          font-weight: 850;
        }

        .tournamentSignupPage__modalActions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .tournamentSignupPage__modalActions button {
          border: 1px solid rgba(14, 165, 233, 0.28);
          border-radius: 999px;
          background: #061a3f;
          color: white;
          cursor: pointer;
          font-weight: 950;
          min-height: 42px;
          padding: 0 16px;
        }

        .tournamentSignupPage__modalActions button.is-secondary {
          background: rgba(255,255,255,.90);
          color: #0b2554;
        }

        .tournamentSignupPage__modalActions button:disabled {
          cursor: not-allowed;
          opacity: .45;
        }

        .tournamentSignupPage__toast {
          align-items: center;
          animation: tournamentSignupToastIn .22s ease both, tournamentSignupToastOut .24s ease 2.76s forwards;
          background: linear-gradient(135deg, rgba(2,8,23,.98), rgba(6,26,63,.96));
          border: 1px solid color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 48%, rgba(255,255,255,.14));
          border-radius: 18px;
          bottom: 24px;
          box-shadow:
            0 24px 60px color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 24%, rgba(2,8,23,.34)),
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

        .tournamentSignupPage__toast::before {
          background: linear-gradient(180deg, var(--tournament-signup-accent, #22d3ee), var(--tournament-signup-accent-2, #ec4899));
          border-radius: 999px;
          bottom: 10px;
          content: "";
          left: 0;
          position: absolute;
          top: 10px;
          width: 3px;
        }

        .tournamentSignupPage__toast span {
          align-items: center;
          background: color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 18%, rgba(255,255,255,.08));
          border: 1px solid color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 42%, rgba(255,255,255,.12));
          border-radius: 999px;
          color: color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 72%, #fff);
          display: inline-flex;
          flex: 0 0 auto;
          height: 28px;
          justify-content: center;
          width: 28px;
        }

        .tournamentSignupPage__toast p {
          color: #f8fafc;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.25;
          margin: 0;
        }

        @keyframes tournamentSignupToastIn {
          from { opacity: 0; transform: translate3d(0, 12px, 0) scale(.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes tournamentSignupToastOut {
          to { opacity: 0; transform: translate3d(0, 10px, 0) scale(.98); }
        }

        .tournamentSignupPage__total {
          border: 1px solid rgba(14,165,233,.18);
          background: linear-gradient(135deg, rgba(14,165,233,.08), rgba(255,255,255,.82));
          border-radius: 18px;
          display: grid;
          gap: 3px;
          margin-bottom: 12px;
          padding: 14px;
        }

        .tournamentSignupPage__total span,
        .tournamentSignupPage__total small {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .tournamentSignupPage__total strong {
          color: #061a3f;
          font-size: 30px;
          font-weight: 950;
          line-height: 1;
        }

        .tournamentSignupPage__checkoutSummary,
        .tournamentSignupPage__checkoutMethods {
          border: 1px solid rgba(15,23,42,.08);
          background: rgba(248,250,252,.78);
          border-radius: 22px;
          padding: 14px;
        }

        .tournamentSignupPage__checkoutSummary dl {
          display: grid;
          gap: 8px;
          margin: 0;
        }

        .tournamentSignupPage__checkoutSummary dl div {
          align-items: start;
          border-bottom: 1px solid rgba(15,23,42,.07);
          display: grid;
          gap: 10px;
          grid-template-columns: 132px minmax(0, 1fr);
          padding-bottom: 8px;
        }

        .tournamentSignupPage__checkoutSummary dl div:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .tournamentSignupPage__checkoutSummary dt {
          color: #64748b;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .04em;
          margin: 0;
          text-transform: uppercase;
        }

        .tournamentSignupPage__checkoutSummary dd {
          color: #061a3f;
          font-size: 15px;
          font-weight: 950;
          margin: 0;
          text-align: right;
        }

        .tournamentSignupPage__checkoutTotal {
          border: 1px solid rgba(14,165,233,.22);
          background: linear-gradient(135deg, rgba(14,165,233,.10), rgba(236,72,153,.05), rgba(255,255,255,.90));
          border-radius: 20px;
          display: grid;
          gap: 4px;
          margin-top: 12px;
          padding: 14px;
        }

        .tournamentSignupPage__checkoutTotal span,
        .tournamentSignupPage__checkoutTotal small {
          color: #64748b;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__checkoutTotal strong {
          color: #061a3f;
          font-size: 30px;
          font-weight: 950;
          line-height: 1;
        }

        .tournamentSignupPage__paymentMethods {
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr;
        }

        .tournamentSignupPage__paymentMethods button {
          border: 1px solid rgba(15,23,42,.10);
          background: rgba(255,255,255,.84);
          border-radius: 22px;
          color: #061a3f;
          cursor: pointer;
          display: grid;
          gap: 10px;
          grid-template-columns: 34px minmax(0, 1fr);
          min-height: 92px;
          padding: 12px 14px;
          position: relative;
          text-align: left;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, opacity .18s ease;
        }

        .tournamentSignupPage__paymentMethods button:disabled {
          cursor: not-allowed;
          opacity: .72;
        }

        .tournamentSignupPage__paymentMethods button:not(:disabled):hover,
        .tournamentSignupPage__paymentMethods button.is-selected {
          border-color: rgba(14,165,233,.72);
          box-shadow: 0 20px 44px rgba(14,165,233,.20);
          transform: translateY(-2px);
        }

        .tournamentSignupPage__paymentMethods button.is-selected {
          background: linear-gradient(135deg, rgba(14,165,233,.14), rgba(16,185,129,.08), rgba(255,255,255,.96));
          border-width: 2px;
        }

        .tournamentSignupPage__paymentMethods button.is-recommended {
          background: linear-gradient(135deg, rgba(6,26,63,.96), rgba(7,89,133,.88));
          border-color: rgba(14,165,233,.35);
          color: #fff;
          min-height: 104px;
          box-shadow: 0 18px 44px rgba(14,165,233,.13);
        }

        .tournamentSignupPage__paymentMethods button.is-recommended strong,
        .tournamentSignupPage__paymentMethods button.is-recommended p {
          color: #fff;
        }

        .tournamentSignupPage__paymentMethods button.is-recommended p {
          opacity: .82;
        }

        .tournamentSignupPage__paymentMethods button.is-available {
          background: linear-gradient(135deg, rgba(255,255,255,.96), rgba(16,185,129,.08));
          border-color: rgba(16,185,129,.28);
        }

        .tournamentSignupPage__paymentMethods button.is-available.is-selected {
          border-color: rgba(16,185,129,.62);
          box-shadow: 0 20px 44px rgba(16,185,129,.18), 0 0 0 4px rgba(14,165,233,.08);
        }

        .tournamentSignupPage__paymentCheck {
          align-items: center;
          background: #10b981;
          border: 1px solid rgba(255,255,255,.82);
          border-radius: 999px;
          color: #fff !important;
          display: inline-flex !important;
          font-size: 11px !important;
          font-weight: 950;
          gap: 5px;
          letter-spacing: 0 !important;
          margin: 0 !important;
          padding: 5px 9px !important;
          position: absolute;
          right: 12px;
          text-transform: none !important;
          top: 12px;
          z-index: 1;
        }

        .tournamentSignupPage__paymentMethods i {
          align-items: center;
          background: #061a3f;
          border-radius: 999px;
          color: #fff;
          display: inline-flex;
          height: 34px;
          justify-content: center;
          width: 34px;
        }

        .tournamentSignupPage__paymentMethods button span {
          align-items: center;
          border: 1px solid rgba(14,165,233,.20);
          border-radius: 999px;
          color: #0284c7;
          display: inline-flex;
          font-size: 11px;
          font-weight: 950;
          margin-bottom: 5px;
          padding: 3px 7px;
          text-transform: uppercase;
        }

        .tournamentSignupPage__paymentMethods button strong {
          color: #061a3f;
          display: block;
          font-size: 16px;
          font-weight: 950;
          margin-bottom: 3px;
        }

        .tournamentSignupPage__paymentMethods button p {
          color: #64748b;
          display: -webkit-box;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.35;
          margin: 0;
          overflow: hidden;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }


        .tournamentSignupPage__search {
          display: grid;
          gap: 8px;
          margin-top: 12px;
          color: #0b2554;
          font-weight: 950;
        }

        .tournamentSignupPage__search input {
          width: 100%;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 16px;
          background: white;
          color: #061a3f;
          padding: 12px 14px;
          outline: none;
          font-weight: 800;
        }

        .tournamentSignupPage__search input:focus {
          border-color: rgba(14, 165, 233, 0.5);
          box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.12);
        }

        .tournamentSignupPage__search--hero {
          margin-top: 0;
        }

        .tournamentSignupPage__search--hero input {
          border-radius: 22px;
          font-size: 17px;
          min-height: 58px;
          padding: 0 18px;
          box-shadow: 0 14px 32px rgba(14,165,233,.08);
        }

        .tournamentSignupPage__results {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        .tournamentSignupPage__results button {
          width: 100%;
          text-align: left;
          cursor: pointer;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }

        .tournamentSignupPage__results button:hover,
        .tournamentSignupPage__results button.is-selected {
          transform: translateY(-2px);
          border-color: rgba(14, 165, 233, 0.48);
          box-shadow: 0 16px 34px rgba(14, 165, 233, 0.14);
        }

        .tournamentSignupPage__team {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }

        .tournamentSignupPage__team span {
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(14, 165, 233, 0.22);
          padding: 8px 11px;
          font-weight: 900;
        }

        .tournamentSignupPage__insidePanel {
          border: 1px solid rgba(14,165,233,.18);
          background: linear-gradient(135deg, rgba(255,255,255,.94), rgba(14,165,233,.06), rgba(236,72,153,.04));
          border-radius: 28px;
          box-shadow: 0 22px 58px rgba(15,23,42,.09);
          display: grid;
          gap: 16px;
          margin-top: 18px;
          padding: 20px;
        }

        .tournamentSignupPage__insideColumns {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) minmax(320px, .85fr);
          align-items: stretch;
        }

        .tournamentSignupPage__insideIntro,
        .tournamentSignupPage__paymentStatusCard {
          border: 1px solid rgba(15,23,42,.08);
          background: rgba(255,255,255,.88);
          border-radius: 24px;
          padding: 18px;
        }

        .tournamentSignupPage__insideIntro > span {
          color: #0284c7;
          display: block;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .09em;
          text-transform: uppercase;
        }

        .tournamentSignupPage__insideIntro h2 {
          color: #061a3f;
          font-weight: 950;
          font-size: clamp(34px, 5vw, 56px);
          letter-spacing: .01em;
          line-height: .92;
          margin: 8px 0 12px;
        }

        .tournamentSignupPage__insideIntro p {
          color: #475569;
          font-size: 16px;
          font-weight: 850;
          margin: 0;
        }

        .tournamentSignupPage__insideChips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .tournamentSignupPage__insideChips span {
          border: 1px solid rgba(14,165,233,.20);
          border-radius: 999px;
          background: rgba(14,165,233,.08);
          color: #0b2554;
          display: inline-flex;
          font-weight: 950;
          padding: 9px 12px;
        }

        .tournamentSignupPage__paymentStatusCard {
          background: #061a3f;
          color: #fff;
          display: grid;
          align-content: center;
          gap: 10px;
          box-shadow: 0 20px 48px rgba(14,165,233,.16);
        }

        .tournamentSignupPage__paymentStatusCard.is-warning {
          background: linear-gradient(135deg, #061a3f, #123255);
          border-color: rgba(245,158,11,.30);
        }

        .tournamentSignupPage__paymentStatusCard.is-success {
          background: linear-gradient(135deg, #052e2b, #064e3b);
          border-color: rgba(16,185,129,.34);
        }

        .tournamentSignupPage__paymentStatusCard.is-danger {
          background: linear-gradient(135deg, #3f0618, #7f1d1d);
          border-color: rgba(244,63,94,.34);
        }

        .tournamentSignupPage__paymentStatusCard.is-muted {
          background: linear-gradient(135deg, #0f172a, #334155);
        }

        .tournamentSignupPage__paymentStatusHead {
          align-items: center;
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .tournamentSignupPage__paymentStatusHead span {
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 999px;
          color: #fff;
          display: inline-flex;
          font-size: 12px;
          font-weight: 950;
          padding: 6px 10px;
        }

        .tournamentSignupPage__paymentStatusCard.is-warning .tournamentSignupPage__paymentStatusHead span { background: rgba(245,158,11,.18); color: #fde68a; }
        .tournamentSignupPage__paymentStatusCard.is-success .tournamentSignupPage__paymentStatusHead span { background: rgba(16,185,129,.18); color: #bbf7d0; }
        .tournamentSignupPage__paymentStatusCard.is-danger .tournamentSignupPage__paymentStatusHead span { background: rgba(244,63,94,.18); color: #fecdd3; }

        .tournamentSignupPage__paymentStatusCard h3 {
          color: #fff;
          font-size: 26px;
          font-weight: 950;
          margin: 0;
        }

        .tournamentSignupPage__paymentStatusCard p,
        .tournamentSignupPage__paymentStatusCard small {
          color: rgba(255,255,255,.76);
          font-weight: 850;
          line-height: 1.45;
          margin: 0;
        }

        .tournamentSignupPage__paymentStatusCard button,
        .tournamentSignupPage__statusAction {
          align-items: center;
          border: 1px solid rgba(103,232,249,.34);
          border-radius: 999px;
          background: rgba(255,255,255,.96);
          color: #061a3f;
          cursor: pointer;
          display: inline-flex;
          font-weight: 950;
          justify-content: center;
          min-height: 42px;
          padding: 0 14px;
          text-decoration: none;
          transition: transform .18s ease, box-shadow .18s ease;
          width: fit-content;
        }

        .tournamentSignupPage__paymentStatusCard button:hover,
        .tournamentSignupPage__statusAction:hover {
          box-shadow: 0 16px 34px rgba(14,165,233,.24);
          transform: translateY(-2px);
        }

        .tournamentSignupPage__zoneAction {
          align-items: center;
          border: 1px solid rgba(14,165,233,.16);
          background: rgba(255,255,255,.80);
          border-radius: 20px;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 12px;
        }

        .tournamentSignupPage__zoneAction button {
          border: 1px solid rgba(14,165,233,.28);
          border-radius: 999px;
          background: #061a3f;
          color: #fff;
          font-weight: 950;
          min-height: 42px;
          padding: 0 18px;
          box-shadow: 0 14px 30px rgba(14,165,233,.18);
        }

        .tournamentSignupPage__zoneAction button:disabled {
          cursor: not-allowed;
          opacity: .52;
        }

        .tournamentSignupPage__zoneAction span {
          color: #64748b;
          font-size: 13px;
          font-weight: 850;
        }

        .tournamentSignupPage__withdrawalInline {
          display: flex;
          justify-content: flex-end;
        }

        .tournamentSignupPage__withdrawalInline button {
          border: 1px solid rgba(244,63,94,.18);
          border-radius: 999px;
          background: rgba(255,255,255,.76);
          color: #9f1239;
          cursor: pointer;
          font-weight: 950;
          min-height: 38px;
          padding: 0 14px;
        }

        .tournamentSignupPage__withdrawalInline button:hover {
          background: rgba(255,228,230,.76);
        }

        @media (max-width: 860px) {
          .tournamentSignupPage {
            width: min(100% - 22px, 1180px);
          }

          .tournamentSignupPage.is-guest-signup {
            align-content: center;
            display: grid;
            min-height: calc(100dvh - 96px);
            padding-bottom: 44px;
            padding-top: 14px;
          }

          .tournamentSignupPage.is-guest-signup .pampraxHero,
          .tournamentSignupPage.is-guest-signup .tournamentSignupPage__message {
            display: none;
          }

          .tournamentSignupPage__state {
            align-content: center;
            align-items: center;
            box-sizing: border-box;
            display: grid;
            justify-items: center;
            margin: 0 auto;
            min-height: calc(100dvh - 128px);
            padding: 16px 12px;
            text-align: center;
            width: min(100%, 360px);
          }

          .tournamentSignupPage__loader {
            justify-self: center;
            margin-inline: auto;
            max-width: 320px;
            width: min(100%, 320px);
          }

          .tournamentSignupPage__panel--wide {
            grid-row: auto;
          }

          .tournamentSignupPage__panel--payment {
            grid-column: auto;
          }

          .tournamentSignupPage__steps,
          .tournamentSignupPage__partnerGrid,
          .tournamentSignupPage__paymentGrid,
          .tournamentSignupPage__paymentMethods,
          .tournamentSignupPage__slots,
          .tournamentSignupPage__summaryGrid {
            grid-template-columns: 1fr;
          }

          .tournamentSignupPage__insideColumns {
            grid-template-columns: 1fr;
          }

          .tournamentSignupPage__zoneAction {
            align-items: stretch;
            flex-direction: column;
          }

          .tournamentSignupPage__withdrawalInline {
            justify-content: stretch;
          }

          .tournamentSignupPage__withdrawalInline button {
            width: 100%;
          }

          .tournamentSignupPage__steps button {
            justify-content: flex-start;
          }

          .tournamentSignupPage__partnerSummary {
            grid-template-columns: 28px 48px minmax(0, 1fr);
          }

          .tournamentSignupPage__partnerSummary button {
            grid-column: 1 / -1;
          }

          .tournamentSignupPage__actions {
            justify-content: stretch;
          }

          .tournamentSignupPage__actions .is-secondary {
            margin-right: 0;
          }

          .tournamentSignupPage__actions button,
          .tournamentSignupPage__continueBox button {
            width: 100%;
          }

          .tournamentSignupPage__modal {
            max-height: calc(100dvh - 20px);
            overflow-y: auto;
            padding: 14px;
          }

          .tournamentSignupPage__modalActions {
            flex-direction: row;
          }

          .tournamentSignupPage__modalActions button {
            flex: 1 1 0;
            min-height: 42px;
          }

          .tournamentSignupPage__modal--compact {
            border-radius: 18px;
            gap: 10px;
            padding: 12px;
          }

          .tournamentSignupPage__modal--compact .tournamentSignupPage__modalHeader h3 {
            font-size: 20px;
          }

          .tournamentSignupPage__modal--compact .tournamentSignupPage__modalHeader > button {
            font-size: 20px;
            height: 34px;
            width: 34px;
          }

          .tournamentSignupPage__modal--compact .tournamentSignupPage__modalText {
            font-size: 13px;
            line-height: 1.35;
          }

          .tournamentSignupPage__modal--compact .tournamentSignupPage__withdrawalReason {
            gap: 5px;
          }

          .tournamentSignupPage__modal--compact .tournamentSignupPage__withdrawalReason textarea {
            border-radius: 13px;
            min-height: 78px;
            padding: 10px;
          }

          .tournamentSignupPage__panel--center {
            background: rgba(255, 255, 255, .82);
            border-radius: 18px;
            box-shadow: none;
            gap: 7px;
            margin-top: 8px;
            padding: 12px;
          }

          .tournamentSignupPage__panel--center h2 {
            font-size: 19px;
            line-height: 1.05;
          }

          .tournamentSignupPage__panel--center p {
            font-size: 12.5px;
            line-height: 1.25;
            max-width: 310px;
          }

          .tournamentSignupPage__guestGate {
            border-color: color-mix(in srgb, var(--tournament-signup-accent, #22d3ee) 28%, rgba(15,23,42,.09));
            box-shadow: 0 18px 40px rgba(15,23,42,.08);
            gap: 7px;
            margin: 0 auto;
            padding: 17px 16px 15px;
            width: min(100%, 334px);
          }

          .tournamentSignupPage__guestGate > span {
            font-size: 9.5px;
          }

          .tournamentSignupPage__guestTournament {
            display: -webkit-box;
            font-size: 12px;
            max-width: 260px;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .tournamentSignupPage__guestGate h2 {
            font-size: 20px;
          }

          .tournamentSignupPage__guestGate p {
            max-width: 250px;
          }

          .tournamentSignupPage__panel--center .tournamentSignupPage__primary {
            font-size: 12.5px;
            min-height: 38px;
            min-width: 196px;
            padding: 0 18px;
            width: auto;
          }

          .tournamentSignupPage__guestBack {
            margin-top: 1px;
          }

          .tournamentSignupPage__toast {
            bottom: 18px;
            left: 16px;
            right: 16px;
            justify-content: flex-start;
          }

          .tournamentSignupPage__checkoutSummary dl div {
            grid-template-columns: 1fr;
            gap: 3px;
          }

          .tournamentSignupPage__checkoutSummary dd {
            text-align: left;
          }
        }
      `}</style>
    </main>
  )
}
