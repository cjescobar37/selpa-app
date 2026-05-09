'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import {
  getTournamentDisplayStatus,
  getTournamentDisplayStatusTone,
  isTournamentRegistrationClosed,
  type OperationalStage,
} from '@/lib/tournamentDisplayStatus'

type Tournament = {
  id: string
  name: string
  status: string
  start_date: string | null
  category_name: string | null
}

type Registration = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  admission_status: 'NONE' | 'MANUAL_PAYMENT_VALIDATED' | 'PAY_AT_VENUE_APPROVED' | 'EXCEPTION_APPROVED' | 'BLOCKED'
  admission_reason: string | null
  admission_at: string | null
  eligibility_blocked_reason: string | null
  payment_status: 'SIN_PAGO' | 'PENDIENTE' | 'PAGADO' | 'FALLIDO'
  eligible: boolean
  alerts: string[]
  seed_snapshot: {
    seed: number
    team_score: number
    seed_source: string
    snapshot_at: string
  } | null
  created_at: string
  team: {
    id: string
    players: Array<{
      user_id: string
      full_name: string
      email: string | null
      avatar_url: string | null
    }>
  } | null
}

type SeedMeta = {
  hasSeedSnapshot: boolean
  seededTeamsCount: number
  hasGroups: boolean
  groupCount: number
  hasGroupMatches: boolean
  groupMatchesCount: number
}

type TournamentGroup = {
  id: string
  name: string
  size: number
  order: number
  teams: Array<{
    id: string
    team_id: string
    seed: number
    position: number | null
    team_score: number | null
    team: {
      id: string
      players: Array<{
        user_id: string
        full_name: string
      }>
    } | null
  }>
}

type PaymentMode = 'PAID' | 'VENUE' | 'NONE'

type ManualRegistrationForm = {
  player1: string
  player2: string
  autoConfirm: boolean
  paymentMode: PaymentMode
}

type PlayerSuggestion = {
  club_player_id: string
  user_id: string
  full_name: string
  category: number | null
  gender: string | null
}

type ManualPlayerField = 'player1' | 'player2'

type RegistrationDetailModal = {
  registration: Registration
} | null

type RegistrationPaymentModal = {
  registration: Registration
} | null

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
}

const paymentLabels: Record<Registration['payment_status'], string> = {
  SIN_PAGO: 'Sin pago',
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  FALLIDO: 'Fallido',
}

const admissionLabels: Record<Registration['admission_status'], string> = {
  NONE: 'Sin admisión',
  MANUAL_PAYMENT_VALIDATED: 'Pago validado',
  PAY_AT_VENUE_APPROVED: 'Pago en predio',
  EXCEPTION_APPROVED: 'Excepción',
  BLOCKED: 'Bloqueada',
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status
}

function statusTone(status: string) {
  if (status === 'CONFIRMED') return 'confirmed'
  if (status === 'CANCELLED') return 'cancelled'
  return 'pending'
}

function paymentTone(status: Registration['payment_status']) {
  if (status === 'PAGADO') return 'paid'
  if (status === 'PENDIENTE') return 'pending'
  if (status === 'FALLIDO') return 'failed'
  return 'empty'
}

function teamName(registration: Registration) {
  const players = registration.team?.players ?? []
  if (!players.length) return 'Equipo sin datos'
  return players.map((player) => player.full_name).join(' / ')
}

function buildManualPlayer(value: string) {
  const cleanValue = value.trim()
  return uuidPattern.test(cleanValue)
    ? { user_id: cleanValue }
    : { full_name: cleanValue }
}

function buildManualPlayerPayload(value: string, selectedPlayer: PlayerSuggestion | null) {
  if (selectedPlayer) {
    return {
      club_player_id: selectedPlayer.club_player_id,
      user_id: selectedPlayer.user_id,
      full_name: selectedPlayer.full_name,
    }
  }
  return buildManualPlayer(value)
}

function formatPlayerCategory(value?: number | null) {
  const labels: Record<number, string> = {
    1: '1ra',
    2: '2da',
    3: '3ra',
    4: '4ta',
    5: '5ta',
    6: '6ta',
    7: '7ma',
  }
  return value ? labels[value] ?? `${value}` : 'Sin categoría'
}

function formatPlayerGender(value?: string | null) {
  const cleanValue = (value ?? '').toUpperCase()
  if (cleanValue === 'M' || cleanValue === 'MALE') return 'Masculino'
  if (cleanValue === 'F' || cleanValue === 'FEMALE') return 'Femenino'
  if (cleanValue === 'MIXED') return 'Mixto'
  return value ?? 'Sin género'
}

function otherManualField(field: ManualPlayerField): ManualPlayerField {
  return field === 'player1' ? 'player2' : 'player1'
}

export default function ClubInscripcionesPage() {
  const searchParams = useSearchParams()
  const { activeClub } = useSession()
  const [loadingTournaments, setLoadingTournaments] = useState(true)
  const [loadingRegistrations, setLoadingRegistrations] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [generatingSeed, setGeneratingSeed] = useState(false)
  const [generatingGroups, setGeneratingGroups] = useState(false)
  const [generatingGroupMatches, setGeneratingGroupMatches] = useState(false)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [creatingManual, setCreatingManual] = useState(false)
  const [manualError, setManualError] = useState('')
  const [manualForm, setManualForm] = useState<ManualRegistrationForm>({
    player1: '',
    player2: '',
    autoConfirm: true,
    paymentMode: 'VENUE',
  })
  const [manualSelectedPlayers, setManualSelectedPlayers] = useState<Record<ManualPlayerField, PlayerSuggestion | null>>({
    player1: null,
    player2: null,
  })
  const [playerSuggestions, setPlayerSuggestions] = useState<Record<ManualPlayerField, PlayerSuggestion[]>>({
    player1: [],
    player2: [],
  })
  const [searchingPlayers, setSearchingPlayers] = useState<Record<ManualPlayerField, boolean>>({
    player1: false,
    player2: false,
  })
  const [message, setMessage] = useState('')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState('')
  const [registrationDetailModal, setRegistrationDetailModal] = useState<RegistrationDetailModal>(null)
  const [registrationPaymentModal, setRegistrationPaymentModal] = useState<RegistrationPaymentModal>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [, setGroups] = useState<TournamentGroup[]>([])
  const [selectedTournamentStage, setSelectedTournamentStage] = useState<OperationalStage | null>(null)
  const [selectedTournamentDeadline, setSelectedTournamentDeadline] = useState<string | null>(null)
  const [selectedTournamentMinPairs, setSelectedTournamentMinPairs] = useState<number | null>(null)
  const [seedMeta, setSeedMeta] = useState<SeedMeta>({
    hasSeedSnapshot: false,
    seededTeamsCount: 0,
    hasGroups: false,
    groupCount: 0,
    hasGroupMatches: false,
    groupMatchesCount: 0,
  })

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments]
  )
  const requestedTournamentId = searchParams.get('tournamentId')?.trim() ?? ''

  const registrationClosed = isTournamentRegistrationClosed({ registrationDeadline: selectedTournamentDeadline })
  const selectedTournamentIsOpen = selectedTournament?.status?.toUpperCase() === 'OPEN' && !registrationClosed
  const isFinalizado =
    selectedTournamentStage === 'FINALIZADO' ||
    ['FINALIZADO', 'FINISHED'].includes(selectedTournament?.status?.toUpperCase() ?? '')
  const canAddPair = selectedTournamentIsOpen && !isFinalizado && !seedMeta.hasSeedSnapshot

  const counts = useMemo(() => ({
    pending: registrations.filter((row) => row.status === 'PENDING').length,
    confirmed: registrations.filter((row) => row.status === 'CONFIRMED').length,
    cancelled: registrations.filter((row) => row.status === 'CANCELLED').length,
    eligible: registrations.filter((row) => row.eligible).length,
    withoutPayment: registrations.filter((row) => row.payment_status === 'SIN_PAGO').length,
    paymentPending: registrations.filter((row) => row.payment_status === 'PENDIENTE').length,
    blocked: registrations.filter((row) => row.admission_status === 'BLOCKED').length,
  }), [registrations])
  const requiredEligibleTeamsForSeed = Math.max(2, selectedTournamentMinPairs ?? 2)
  const canGenerateSeed = !seedMeta.hasSeedSnapshot && counts.eligible >= requiredEligibleTeamsForSeed
  const sortedRegistrations = useMemo(() => {
    if (!seedMeta.hasSeedSnapshot) return registrations

    return [...registrations].sort((left, right) => {
      const leftSeed = left.seed_snapshot?.seed ?? Number.MAX_SAFE_INTEGER
      const rightSeed = right.seed_snapshot?.seed ?? Number.MAX_SAFE_INTEGER
      if (leftSeed !== rightSeed) return leftSeed - rightSeed
      return left.created_at.localeCompare(right.created_at)
    })
  }, [registrations, seedMeta.hasSeedSnapshot])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadTournaments() {
    if (!activeClub?.id) {
      setTournaments([])
      setSelectedTournamentId('')
      setLoadingTournaments(false)
      return
    }

    setLoadingTournaments(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoadingTournaments(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar torneos.')
      setLoadingTournaments(false)
      return
    }

    const rows = (json?.tournaments ?? []) as Tournament[]
    setTournaments(rows)
    setSelectedTournamentId((current) => {
      if (requestedTournamentId && rows.some((row) => row.id === requestedTournamentId)) {
        return requestedTournamentId
      }
      if (current && rows.some((row) => row.id === current)) {
        return current
      }
      return rows[0]?.id || ''
    })
    setLoadingTournaments(false)
  }

  async function loadRegistrations(tournamentId: string) {
    if (!activeClub?.id || !tournamentId) {
      setRegistrations([])
      setGroups([])
      setSelectedTournamentStage(null)
      setSelectedTournamentDeadline(null)
      setSelectedTournamentMinPairs(null)
      setSeedMeta({ hasSeedSnapshot: false, seededTeamsCount: 0, hasGroups: false, groupCount: 0, hasGroupMatches: false, groupMatchesCount: 0 })
      return
    }

    setLoadingRegistrations(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setLoadingRegistrations(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude cargar inscripciones.')
      setRegistrations([])
      setGroups([])
      setSelectedTournamentStage(null)
      setSelectedTournamentDeadline(null)
      setSelectedTournamentMinPairs(null)
      setSeedMeta({ hasSeedSnapshot: false, seededTeamsCount: 0, hasGroups: false, groupCount: 0, hasGroupMatches: false, groupMatchesCount: 0 })
      setLoadingRegistrations(false)
      return
    }

    const summaryRes = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const summaryJson = await summaryRes.json().catch(() => ({}))
    setSelectedTournamentStage(summaryRes.ok && summaryJson?.operationalStage ? summaryJson.operationalStage as OperationalStage : null)
    setSelectedTournamentDeadline(summaryRes.ok ? summaryJson?.tournament?.registration_deadline ?? null : null)
    setSelectedTournamentMinPairs(summaryRes.ok ? Number(summaryJson?.tournament?.min_pairs ?? 2) : null)

    setRegistrations((json?.registrations ?? []) as Registration[])
    setGroups((json?.groups ?? []) as TournamentGroup[])
    setSeedMeta({
      hasSeedSnapshot: Boolean(json?.meta?.hasSeedSnapshot),
      seededTeamsCount: Number(json?.meta?.seededTeamsCount ?? 0),
      hasGroups: Boolean(json?.meta?.hasGroups),
      groupCount: Number(json?.meta?.groupCount ?? 0),
      hasGroupMatches: Boolean(json?.meta?.hasGroupMatches),
      groupMatchesCount: Number(json?.meta?.groupMatchesCount ?? 0),
    })
    setLoadingRegistrations(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTournaments())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    void Promise.resolve().then(() => loadRegistrations(selectedTournamentId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId])

  useEffect(() => {
    if (!requestedTournamentId || tournaments.length === 0) return
    if (tournaments.some((tournament) => tournament.id === requestedTournamentId)) {
      setSelectedTournamentId(requestedTournamentId)
    }
  }, [requestedTournamentId, tournaments])

  useEffect(() => {
    if (!manualModalOpen) return

    const timeout = window.setTimeout(() => {
      void searchManualPlayers('player1', manualForm.player1)
    }, 220)

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModalOpen, manualForm.player1, selectedTournamentId, manualSelectedPlayers.player2?.user_id])

  useEffect(() => {
    if (!manualModalOpen) return

    const timeout = window.setTimeout(() => {
      void searchManualPlayers('player2', manualForm.player2)
    }, 220)

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModalOpen, manualForm.player2, selectedTournamentId, manualSelectedPlayers.player1?.user_id])

  useEffect(() => {
    if (manualModalOpen && !canAddPair) {
      setManualModalOpen(false)
      setManualError('')
      setMessage('')
    }
  }, [canAddPair, manualModalOpen])

  async function updateRegistrationPayment(
    registration: Registration,
    action: 'validate_payment' | 'approve_pay_at_venue'
  ) {
    if (!activeClub?.id || !selectedTournamentId) return

    setSavingId(registration.id)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingId(null)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/registrations/${registration.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
    })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude actualizar el pago de la pareja.')
      return
    }

    setRegistrationPaymentModal(null)
    setMessage(action === 'validate_payment' ? 'Pago validado manualmente.' : 'Pago en predio aprobado.')
    await loadRegistrations(selectedTournamentId)
  }

  function openManualRegistration() {
    if (!canAddPair) {
      setManualModalOpen(false)
      setManualError('')
      setMessage('')
      return
    }

    setManualForm({
      player1: '',
      player2: '',
      autoConfirm: true,
      paymentMode: 'VENUE',
    })
    setManualSelectedPlayers({ player1: null, player2: null })
    setPlayerSuggestions({ player1: [], player2: [] })
    setManualError('')
    setManualModalOpen(true)
    setMessage('')
  }

  function updateManualPlayerField(field: ManualPlayerField, value: string) {
    setManualForm((current) => ({ ...current, [field]: value }))
    setManualSelectedPlayers((current) => ({ ...current, [field]: null }))
    setManualError('')
  }

  function selectManualPlayer(field: ManualPlayerField, player: PlayerSuggestion) {
    setManualForm((current) => ({ ...current, [field]: player.full_name }))
    setManualSelectedPlayers((current) => ({ ...current, [field]: player }))
    setPlayerSuggestions((current) => ({ ...current, [field]: [] }))
    setManualError('')
  }

  async function searchManualPlayers(field: ManualPlayerField, query: string) {
    if (!activeClub?.id || !selectedTournamentId || query.trim().length < 1) {
      setPlayerSuggestions((current) => ({ ...current, [field]: [] }))
      return
    }

    setSearchingPlayers((current) => ({ ...current, [field]: true }))

    const token = await getToken()
    if (!token) {
      setSearchingPlayers((current) => ({ ...current, [field]: false }))
      return
    }

    const res = await fetch(
      `/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/registrations/manual?q=${encodeURIComponent(query.trim())}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    )
    const json = await res.json().catch(() => ({})) as { players?: PlayerSuggestion[] }
    const otherPlayerId = manualSelectedPlayers[otherManualField(field)]?.user_id ?? null

    setPlayerSuggestions((current) => ({
      ...current,
      [field]: res.ok ? (json.players ?? []).filter((player) => player.user_id !== otherPlayerId) : [],
    }))
    setSearchingPlayers((current) => ({ ...current, [field]: false }))
  }

  async function submitManualRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !selectedTournamentId) return

    const player1 = manualForm.player1.trim()
    const player2 = manualForm.player2.trim()
    if (!player1 || !player2) {
      setManualError('Completá los dos jugadores para agregar la pareja.')
      return
    }

    const selectedPlayer1 = manualSelectedPlayers.player1
    const selectedPlayer2 = manualSelectedPlayers.player2

    if (
      (selectedPlayer1 && selectedPlayer2 && selectedPlayer1.user_id === selectedPlayer2.user_id) ||
      (!selectedPlayer1 && !selectedPlayer2 && player1.toLowerCase() === player2.toLowerCase())
    ) {
      setManualError('Los jugadores de la pareja deben ser distintos.')
      return
    }

    setCreatingManual(true)
    setManualError('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setManualError('Sesión inválida.')
      setCreatingManual(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/registrations/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        player1: buildManualPlayerPayload(player1, selectedPlayer1),
        player2: buildManualPlayerPayload(player2, selectedPlayer2),
        auto_confirm: manualForm.autoConfirm,
        payment_mode: manualForm.paymentMode,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setCreatingManual(false)

    if (!res.ok) {
      const errorMessages: Record<string, string> = {
        UNAUTHORIZED: 'No tenés permisos para agregar parejas.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        TOURNAMENT_NOT_OPEN: 'Publicá el torneo para que puedan anotarse parejas.',
        REGISTRATION_CLOSED: 'La fecha de cierre de inscripción ya venció.',
        INVALID_PLAYER: 'Completá los datos de ambos jugadores.',
        INVALID_PLAYER_NAME: 'Completá el nombre del jugador.',
        INVALID_PLAYER_CLUB_PLAYER_ID: 'El jugador seleccionado no es válido. Volvé a buscarlo y seleccionarlo.',
        INVALID_PLAYER_USER_ID: 'El user_id de jugador no es válido.',
        PLAYER_USER_NOT_FOUND: 'No encontré uno de los usuarios indicados.',
        PLAYER_NOT_IN_CLUB: 'Seleccioná un jugador aprobado del club.',
        PLAYER_CATEGORY_MISMATCH: 'El jugador seleccionado no corresponde a la categoría del torneo.',
        PLAYER_GENDER_MISMATCH: 'El jugador seleccionado no corresponde al género del torneo.',
        PLAYER_AUTH_REQUIRED: 'El jugador seleccionado no tiene un usuario Auth válido. Para jugadores sin Auth hace falta una migración del modelo.',
        SAME_PLAYER: 'Los jugadores de la pareja deben ser distintos.',
        PLAYER_ALREADY_REGISTERED_IN_TOURNAMENT: 'Uno de los jugadores ya está inscripto en este torneo.',
        TEAM_ALREADY_REGISTERED: 'Esta pareja ya está cargada para el torneo.',
        REGISTRATION_ALREADY_EXISTS: 'Esta pareja ya tiene inscripción para el torneo.',
        INVALID_PAYMENT_MODE: 'Modo de pago inválido.',
        MANUAL_PLAYER_CREATE_FAILED: 'No pude crear el jugador manual.',
      }
      setManualError(errorMessages[json?.code as string] ?? json?.error ?? 'No pude agregar la pareja.')
      return
    }

    setManualModalOpen(false)
    setManualError('')
    setMessage('Pareja agregada correctamente.')
    await loadRegistrations(selectedTournamentId)
  }

  async function generateSeed() {
    if (!activeClub?.id || !selectedTournamentId || !canGenerateSeed) return

    const ok = window.confirm('¿Generar el seed del torneo? Esta acción congela el orden competitivo actual.')
    if (!ok) return

    setGeneratingSeed(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingSeed(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/seed/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({}))
    setGeneratingSeed(false)

    if (!res.ok) {
      const errorMessages: Record<string, string> = {
        SEED_SNAPSHOT_ALREADY_EXISTS: 'Este torneo ya tiene seed generado.',
        NO_ELIGIBLE_TEAMS: 'No hay parejas elegibles para generar seed.',
        INSUFFICIENT_ELIGIBLE_TEAMS_FOR_SEED: `Necesitás al menos ${requiredEligibleTeamsForSeed} parejas elegibles para generar seed.`,
        TEAM_DATA_INCOMPLETE: 'Faltan datos de una pareja para generar seed.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar seed.',
      }
      setMessage(errorMessages[json?.code as string] ?? json?.error ?? 'No pude generar el seed.')
      return
    }

    setMessage(`Seed generado correctamente. ${Number(json?.seededTeamsCount ?? 0)} parejas seedadas.`)
    await loadRegistrations(selectedTournamentId)
  }

  async function generateGroups() {
    if (!activeClub?.id || !selectedTournamentId || !seedMeta.hasSeedSnapshot || seedMeta.hasGroups) return

    const ok = window.confirm('¿Generar grupos desde el seed congelado? Esta acción asigna las parejas a grupos.')
    if (!ok) return

    setGeneratingGroups(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingGroups(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/groups/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({}))
    setGeneratingGroups(false)

    if (!res.ok) {
      const errorMessages: Record<string, string> = {
        SEED_SNAPSHOT_REQUIRED: 'Primero generá el seed del torneo.',
        GROUPS_ALREADY_EXIST: 'Este torneo ya tiene grupos generados.',
        NO_ELIGIBLE_TEAMS: 'No hay parejas elegibles para generar grupos.',
        INVALID_GROUP_CONFIGURATION: 'No se pudo resolver una estructura válida de grupos.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar grupos.',
      }
      setMessage(errorMessages[json?.code as string] ?? json?.error ?? 'No pude generar los grupos.')
      return
    }

    setMessage(`Grupos generados correctamente. ${Number(json?.groupCount ?? 0)} grupos y ${Number(json?.teamsAssigned ?? 0)} parejas asignadas.`)
    await loadRegistrations(selectedTournamentId)
  }

  async function generateGroupMatches() {
    if (!activeClub?.id || !selectedTournamentId || !seedMeta.hasGroups || seedMeta.hasGroupMatches) return

    const ok = window.confirm('¿Generar los partidos de fase de grupos? Se crearán cruces pendientes para cada grupo.')
    if (!ok) return

    setGeneratingGroupMatches(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingGroupMatches(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${selectedTournamentId}/groups/generate-matches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({}))
    setGeneratingGroupMatches(false)

    if (!res.ok) {
      const errorMessages: Record<string, string> = {
        GROUPS_NOT_FOUND: 'Primero generá los grupos del torneo.',
        GROUP_MATCHES_ALREADY_EXIST: 'Este torneo ya tiene partidos de grupos generados.',
        GROUP_NOT_COMPLETE: 'Hay un grupo incompleto.',
        INVALID_GROUP_SIZE: 'Hay un grupo con tamaño inválido.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar partidos.',
      }
      setMessage(errorMessages[json?.code as string] ?? json?.error ?? 'No pude generar los partidos de grupos.')
      return
    }

    setMessage(`Partidos de grupos generados correctamente. ${Number(json?.matchesCreated ?? 0)} partidos creados.`)
    await loadRegistrations(selectedTournamentId)
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-registrations">
        <div className="club-detailTopbar">
          {selectedTournamentId ? (
            <Link href={`/club/torneos/${selectedTournamentId}`} className="club-backBtn">
              Volver al torneo
            </Link>
          ) : (
            <span />
          )}
          <div className="club-topbarActions">
            <button
              className="club-editBtn"
              type="button"
              disabled={!selectedTournamentId || loadingRegistrations}
              onClick={() => {
                if (!selectedTournamentId) return
                void loadRegistrations(selectedTournamentId)
              }}
            >
              {loadingRegistrations ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div className="club-registrationsHead">
          <div>
            <h1 className="club-title">Inscripciones</h1>
            <p className="club-sub">Seguimiento y aprobación de equipos inscriptos en torneos de {activeClub?.name ?? 'tu club'}.</p>
          </div>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loadingTournaments ? (
          <div className="px-empty">Cargando torneos...</div>
        ) : tournaments.length === 0 ? (
          <div className="px-empty">Todavía no hay torneos para gestionar inscripciones.</div>
        ) : (
          <>
            <section className="club-toolbar">
              <label className="club-selectLabel">
                <span>Torneo</span>
                <select className="px-input" value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)}>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="club-counts">
                <span><b>{counts.pending}</b> pendientes</span>
                <span><b>{counts.confirmed}</b> confirmadas</span>
                <span><b>{counts.cancelled}</b> canceladas</span>
              </div>
              <button
                type="button"
                className="club-addPairBtn"
                disabled={!selectedTournamentId || !selectedTournamentIsOpen || !canAddPair || loadingRegistrations}
                title={
                  isFinalizado
                    ? 'El torneo ya está finalizado.'
                    : seedMeta.hasSeedSnapshot
                      ? 'El seed del torneo ya fue generado.'
                      : registrationClosed
                        ? 'La fecha de cierre de inscripción ya venció.'
                      : selectedTournamentIsOpen
                        ? 'Agregar pareja manual'
                        : 'Publicá el torneo para que puedan anotarse parejas.'
                }
                onClick={openManualRegistration}
              >
                Agregar pareja
              </button>
            </section>

            <section className="club-card">
              <div className="club-cardHead">
                <div>
                  <span className="club-kicker">Torneo seleccionado</span>
                  <h2>{selectedTournament?.name ?? 'Sin torneo'}</h2>
                  <p>{selectedTournament ? `${formatDate(selectedTournament.start_date)} · ${selectedTournament.category_name ?? 'Sin categoría'}` : ''}</p>
                </div>
                {selectedTournament ? (
                  <span className={`club-tournamentStatusBadge club-tournamentStatusBadge--${getTournamentDisplayStatusTone({ operationalStage: selectedTournamentStage, status: selectedTournament.status, registrationDeadline: selectedTournamentDeadline })}`}>
                    {getTournamentDisplayStatus({ operationalStage: selectedTournamentStage, status: selectedTournament.status, registrationDeadline: selectedTournamentDeadline })}
                  </span>
                ) : null}
              </div>

              <div className="club-readiness">
                <div className="club-readinessItem club-readinessItem--ready">
                  <span>Aptas</span>
                  <b>{counts.eligible}</b>
                </div>
                <div className="club-readinessItem">
                  <span>Sin pago</span>
                  <b>{counts.withoutPayment}</b>
                </div>
                <div className="club-readinessItem">
                  <span>Pendientes</span>
                  <b>{counts.paymentPending}</b>
                </div>
                <div className="club-readinessItem club-readinessItem--blocked">
                  <span>Bloqueadas</span>
                  <b>{counts.blocked}</b>
                </div>
              </div>

              <div className={`club-seedStatus ${seedMeta.hasSeedSnapshot ? 'club-seedStatus--ready' : 'club-seedStatus--missing'}`}>
                <div>
                  <strong>{seedMeta.hasSeedSnapshot ? 'Seed generado' : 'Todavía no se generó el seed del torneo'}</strong>
                  <span>
                    {seedMeta.hasSeedSnapshot
                      ? `${seedMeta.seededTeamsCount} parejas con orden competitivo congelado.${seedMeta.hasGroups ? ` ${seedMeta.groupCount} grupos generados.` : ''}${seedMeta.hasGroupMatches ? ` ${seedMeta.groupMatchesCount} partidos de grupos.` : ''}`
                      : 'Cuando exista el snapshot, cada pareja elegible mostrará su seed y score.'}
                  </span>
                </div>
                <div className="club-seedActions">
                  {!seedMeta.hasSeedSnapshot && selectedTournamentId ? (
                    <button
                      type="button"
                      className="club-generateSeedBtn"
                      disabled={!canGenerateSeed || generatingSeed || loadingRegistrations}
                      title={
                        counts.eligible < requiredEligibleTeamsForSeed
                          ? `Necesitás al menos ${requiredEligibleTeamsForSeed} parejas elegibles para generar seed.`
                          : undefined
                      }
                      onClick={generateSeed}
                    >
                      {generatingSeed ? 'Generando...' : 'Generar seed'}
                    </button>
                  ) : null}
                  {seedMeta.hasSeedSnapshot && !seedMeta.hasGroups && selectedTournamentId ? (
                    <button
                      type="button"
                      className="club-generateGroupsBtn"
                      disabled={generatingGroups || loadingRegistrations}
                      onClick={generateGroups}
                    >
                      {generatingGroups ? 'Generando...' : 'Generar grupos'}
                    </button>
                  ) : null}
                  {seedMeta.hasGroups && !seedMeta.hasGroupMatches && selectedTournamentId ? (
                    <button
                      type="button"
                      className="club-generateMatchesBtn"
                      disabled={generatingGroupMatches || loadingRegistrations}
                      onClick={generateGroupMatches}
                    >
                      {generatingGroupMatches ? 'Generando...' : 'Generar partidos de grupos'}
                    </button>
                  ) : null}
                </div>
              </div>

              {loadingRegistrations ? (
                <div className="px-empty">Cargando inscripciones...</div>
              ) : registrations.length === 0 ? (
                <div className="px-empty">Este torneo todavía no tiene inscripciones.</div>
              ) : (
                <div className="club-registrationList">
                  <div className="club-registrationHeader" aria-hidden="true">
                    <span>Equipo</span>
                    <span>Estado</span>
                    <span>Pago</span>
                    <span>Seed</span>
                    <span>Score</span>
                    <span>Acciones</span>
                  </div>
                  {sortedRegistrations.map((registration) => (
                    <article key={registration.id} className="club-registrationRow">
                      <div className="club-teamMain">
                        <strong>{teamName(registration)}</strong>
                        <span>Inscripto el {formatDate(registration.created_at)}</span>
                      </div>

                      <span className={`club-statusBadge club-statusBadge--${statusTone(registration.status)}`}>
                        {statusLabel(registration.status)}
                      </span>

                      <span className={`club-paymentBadge club-paymentBadge--${paymentTone(registration.payment_status)}`}>
                        {paymentLabels[registration.payment_status]}
                      </span>

                      <div className="club-seedCell">
                        <span
                          className={`club-seedBadge ${registration.seed_snapshot ? 'club-seedBadge--ready' : 'club-seedBadge--empty'}`}
                          title="El seed define el orden inicial de las parejas para armar grupos equilibrados"
                        >
                          {registration.seed_snapshot ? `#${registration.seed_snapshot.seed}` : 'Sin seed'}
                        </span>
                        <small>Orden inicial</small>
                      </div>

                      <div className="club-scoreCell">
                        <strong>{registration.seed_snapshot?.team_score ?? 'Sin score'}</strong>
                        <span>
                          {registration.seed_snapshot
                            ? `Snapshot ${formatDate(registration.seed_snapshot.snapshot_at)}`
                            : 'Sin score congelado'}
                        </span>
                      </div>

                      <div className="club-rowActions">
                        <button
                          type="button"
                          className="club-primaryBtn"
                          disabled={registration.status === 'CANCELLED' || savingId === registration.id}
                          onClick={() => setRegistrationPaymentModal({ registration })}
                        >
                          Pago
                        </button>
                        <button
                          type="button"
                          className="club-secondaryBtn"
                          onClick={() => setRegistrationDetailModal({ registration })}
                        >
                          Ver
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {manualModalOpen ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !creatingManual && setManualModalOpen(false)}>
          <form className="club-manualModal" onSubmit={submitManualRegistration} onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-manualHead">
              <div>
                <span className="club-kicker">Inscripción manual</span>
                <h2>Agregar pareja</h2>
                <p>Buscá jugadores compatibles con el torneo o escribí un nombre completo para crearlo rápido.</p>
              </div>
              <button type="button" className="club-modalClose" disabled={creatingManual} onClick={() => setManualModalOpen(false)}>
                Cerrar
              </button>
            </div>

            {manualError ? (
              <div className="club-manualError" role="alert">
                {manualError}
              </div>
            ) : null}

            <div className="club-manualGrid">
              <label className="club-manualField">
                <span>Jugador 1</span>
                <div className="club-autocomplete">
                  <input
                    className="px-input"
                    value={manualForm.player1}
                    placeholder="Buscar por nombre o apellido"
                    disabled={creatingManual}
                    autoComplete="off"
                    onChange={(event) => updateManualPlayerField('player1', event.target.value)}
                  />
                  {manualSelectedPlayers.player1 ? (
                    <div className="club-selectedPlayer">
                      <span>Seleccionado: {formatPlayerCategory(manualSelectedPlayers.player1.category)} · {formatPlayerGender(manualSelectedPlayers.player1.gender)}</span>
                      <button type="button" disabled={creatingManual} onClick={() => updateManualPlayerField('player1', manualForm.player1)}>
                        Cambiar
                      </button>
                    </div>
                  ) : null}
                  {!manualSelectedPlayers.player1 && manualForm.player1.trim().length >= 1 ? (
                    <div className="club-suggestionBox">
                      {searchingPlayers.player1 ? <div className="club-suggestionHint">Buscando...</div> : null}
                      {playerSuggestions.player1.map((player) => (
                        <button
                          key={player.user_id}
                          type="button"
                          className="club-suggestionItem"
                          disabled={creatingManual || manualSelectedPlayers.player2?.user_id === player.user_id}
                          onClick={() => selectManualPlayer('player1', player)}
                        >
                          <strong>{player.full_name}</strong>
                          <span>{formatPlayerCategory(player.category)} · {formatPlayerGender(player.gender)}</span>
                        </button>
                      ))}
                      {!searchingPlayers.player1 && playerSuggestions.player1.length === 0 ? (
                        <div className="club-suggestionHint">Sin coincidencias. Se creará como jugador manual.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="club-manualField">
                <span>Jugador 2</span>
                <div className="club-autocomplete">
                  <input
                    className="px-input"
                    value={manualForm.player2}
                    placeholder="Buscar por nombre o apellido"
                    disabled={creatingManual}
                    autoComplete="off"
                    onChange={(event) => updateManualPlayerField('player2', event.target.value)}
                  />
                  {manualSelectedPlayers.player2 ? (
                    <div className="club-selectedPlayer">
                      <span>Seleccionado: {formatPlayerCategory(manualSelectedPlayers.player2.category)} · {formatPlayerGender(manualSelectedPlayers.player2.gender)}</span>
                      <button type="button" disabled={creatingManual} onClick={() => updateManualPlayerField('player2', manualForm.player2)}>
                        Cambiar
                      </button>
                    </div>
                  ) : null}
                  {!manualSelectedPlayers.player2 && manualForm.player2.trim().length >= 1 ? (
                    <div className="club-suggestionBox">
                      {searchingPlayers.player2 ? <div className="club-suggestionHint">Buscando...</div> : null}
                      {playerSuggestions.player2.map((player) => (
                        <button
                          key={player.user_id}
                          type="button"
                          className="club-suggestionItem"
                          disabled={creatingManual || manualSelectedPlayers.player1?.user_id === player.user_id}
                          onClick={() => selectManualPlayer('player2', player)}
                        >
                          <strong>{player.full_name}</strong>
                          <span>{formatPlayerCategory(player.category)} · {formatPlayerGender(player.gender)}</span>
                        </button>
                      ))}
                      {!searchingPlayers.player2 && playerSuggestions.player2.length === 0 ? (
                        <div className="club-suggestionHint">Sin coincidencias. Se creará como jugador manual.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="club-manualField">
                <span>Pago</span>
                <select
                  className="px-input"
                  value={manualForm.paymentMode}
                  disabled={creatingManual}
                  onChange={(event) => setManualForm((current) => ({ ...current, paymentMode: event.target.value as PaymentMode }))}
                >
                  <option value="VENUE">Pago en predio aprobado</option>
                  <option value="PAID">Pago validado</option>
                  <option value="NONE">Sin admisión de pago</option>
                </select>
              </label>
              <label className="club-checkRow">
                <input
                  type="checkbox"
                  checked={manualForm.autoConfirm}
                  disabled={creatingManual}
                  onChange={(event) => setManualForm((current) => ({ ...current, autoConfirm: event.target.checked }))}
                />
                <span>Confirmar inscripción automáticamente</span>
              </label>
            </div>

            <div className="club-modalActions">
              <button type="button" className="club-secondaryBtn" disabled={creatingManual} onClick={() => setManualModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="club-primaryBtn" disabled={creatingManual}>
                {creatingManual ? 'Agregando...' : 'Guardar pareja'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {registrationPaymentModal ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingId && setRegistrationPaymentModal(null)}>
          <div className="club-manualModal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-manualHead">
              <div>
                <span className="club-kicker">Medio de pago</span>
                <h2>{teamName(registrationPaymentModal.registration)}</h2>
                <p>Elegí cómo querés dejar registrado el pago de esta pareja.</p>
              </div>
              <button
                type="button"
                className="club-modalClose"
                disabled={Boolean(savingId)}
                onClick={() => setRegistrationPaymentModal(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="club-paymentActionsGrid">
              <button
                type="button"
                className="club-primaryBtn"
                disabled={savingId === registrationPaymentModal.registration.id}
                onClick={() => updateRegistrationPayment(registrationPaymentModal.registration, 'validate_payment')}
              >
                {savingId === registrationPaymentModal.registration.id ? 'Guardando...' : 'Validar pago'}
              </button>
              <button
                type="button"
                className="club-secondaryBtn"
                disabled={savingId === registrationPaymentModal.registration.id}
                onClick={() => updateRegistrationPayment(registrationPaymentModal.registration, 'approve_pay_at_venue')}
              >
                Pago en predio
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {registrationDetailModal ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => setRegistrationDetailModal(null)}>
          <div className="club-manualModal club-registrationDetailModal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-manualHead">
              <div>
                <span className="club-kicker">Detalle de la pareja</span>
                <h2>{teamName(registrationDetailModal.registration)}</h2>
                <p>Resumen operativo de la inscripción dentro del torneo.</p>
              </div>
              <button type="button" className="club-modalClose" onClick={() => setRegistrationDetailModal(null)}>
                Cerrar
              </button>
            </div>

            <div className="club-registrationDetailGrid">
              <div className="club-registrationDetailCard">
                <span>Jugadores</span>
                <strong>{teamName(registrationDetailModal.registration)}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Fecha de inscripción</span>
                <strong>{formatDate(registrationDetailModal.registration.created_at)}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Estado</span>
                <strong>{statusLabel(registrationDetailModal.registration.status)}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Pago</span>
                <strong>{paymentLabels[registrationDetailModal.registration.payment_status]}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Medio de pago</span>
                <strong>{admissionLabels[registrationDetailModal.registration.admission_status]}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Seed</span>
                <strong>
                  {registrationDetailModal.registration.seed_snapshot
                    ? `#${registrationDetailModal.registration.seed_snapshot.seed}`
                    : 'Sin seed'}
                </strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Score</span>
                <strong>
                  {registrationDetailModal.registration.seed_snapshot
                    ? `${registrationDetailModal.registration.seed_snapshot.team_score} pts`
                    : 'Sin score'}
                </strong>
              </div>
            </div>

            {registrationDetailModal.registration.alerts.length > 0 ? (
              <div className="club-registrationAlerts">
                {registrationDetailModal.registration.alerts.map((alert) => (
                  <span key={alert}>{alert}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <style>{`
        .club-registrations { overflow: hidden; }
        .club-detailTopbar { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
        .club-topbarActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-backBtn { align-items: center; background: #fff1f7; border: 1px solid rgba(190,24,93,.34); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-backBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.52); box-shadow: 0 8px 18px rgba(190,24,93,.14); transform: translateY(-1px); }
        .club-editBtn { align-items: center; background: #f0fcff; border: 1px solid rgba(83,199,217,.40); border-radius: 8px; color: #0f8ea0; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-editBtn:hover { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-editBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-editBtn:disabled:hover { background: #f0fcff; border-color: rgba(83,199,217,.40); box-shadow: none; transform: none; }
        .club-registrationsHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; border-radius: 12px; color: #164e63; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-toolbar { align-items: end; display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr) auto auto; margin-top: 14px; min-width: 0; }
        .club-selectLabel { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-counts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-counts span { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #475569; font-size: 13px; font-weight: 800; padding: 8px 10px; white-space: nowrap; }
        .club-counts b { color: #17253f; }
        .club-addPairBtn { background: #e9fbff; border: 1px solid rgba(83,199,217,.42); border-radius: 8px; color: #0f7180; cursor: pointer; font-size: 12px; font-weight: 950; min-height: 38px; padding: 9px 12px; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-addPairBtn:hover:not(:disabled) { background: #d7f8ff; border-color: rgba(15,142,160,.62); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-addPairBtn:disabled { cursor: not-allowed; opacity: .6; }
        .club-backTournamentBtn { align-items: center; background: #fff1f8; border: 1px solid rgba(190,24,93,.22); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; justify-content: center; min-height: 38px; padding: 9px 12px; text-decoration: none; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-backTournamentBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.38); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-card { background: rgba(255,255,255,.94); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 14px; }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .club-cardHead > div { min-width: 0; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardHead p { color: #64748b; font-size: 13px; margin: 5px 0 0; }
        .club-tournamentStatusBadge { border-radius: 999px; flex: 0 0 auto; font-size: 11px; font-weight: 950; padding: 6px 9px; white-space: nowrap; }
        .club-tournamentStatusBadge--active { background: #ecfdf3; color: #166534; }
        .club-tournamentStatusBadge--ready { background: #fff7df; color: #854d0e; }
        .club-tournamentStatusBadge--done { background: #eef8ff; color: #164e63; }
        .club-tournamentStatusBadge--draft { background: #fff7df; color: #854d0e; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-readiness { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .club-readinessItem { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 3px; min-width: 0; padding: 9px 10px; }
        .club-readinessItem span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-readinessItem b { color: #17253f; font-size: 22px; line-height: 1; }
        .club-readinessItem--ready { background: #ecfdf3; border-color: rgba(22,101,52,.12); }
        .club-readinessItem--blocked { background: #fff1f2; border-color: rgba(159,18,57,.12); }
        .club-seedStatus { align-items: center; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: flex; justify-content: space-between; min-width: 0; padding: 10px 12px; }
        .club-seedStatus--ready { background: #f0fcff; border-color: rgba(15,118,128,.14); }
        .club-seedStatus--missing { background: #f8fafc; }
        .club-seedStatus div { display: grid; gap: 3px; min-width: 0; }
        .club-seedStatus strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-seedStatus span { color: #64748b; font-size: 12px; font-weight: 750; }
        .club-seedActions { align-items: center; display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-generateSeedBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); border-radius: 8px; color: #102538; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 950; min-height: 34px; padding: 8px 11px; transition: transform .16s ease, box-shadow .16s ease, background .16s ease; white-space: nowrap; }
        .club-generateSeedBtn:hover:not(:disabled) { background: #79edf0; box-shadow: 0 10px 22px rgba(15,23,42,.10); transform: translateY(-1px); }
        .club-generateSeedBtn:disabled { cursor: not-allowed; opacity: .62; }
        .club-generateGroupsBtn { background: #fff; border: 1px solid rgba(83,199,217,.42); border-radius: 8px; color: #0f8ea0; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 950; min-height: 34px; padding: 8px 11px; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; white-space: nowrap; }
        .club-generateGroupsBtn:hover:not(:disabled) { border-color: rgba(15,142,160,.62); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-generateGroupsBtn:disabled { cursor: not-allowed; opacity: .62; }
        .club-generateMatchesBtn { background: #fff1f8; border: 1px solid rgba(190,24,93,.20); border-radius: 8px; color: #be185d; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 950; min-height: 34px; padding: 8px 11px; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; white-space: nowrap; }
        .club-generateMatchesBtn:hover:not(:disabled) { border-color: rgba(190,24,93,.36); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-generateMatchesBtn:disabled { cursor: not-allowed; opacity: .62; }
        .club-groupsPanel { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 10px; min-width: 0; padding: 12px; }
        .club-groupsHead { align-items: center; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-groupsHead h3 { color: #17253f; font-size: 16px; line-height: 1.1; margin: 2px 0 0; }
        .club-groupsHead > span { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 999px; color: #475569; flex: 0 0 auto; font-size: 12px; font-weight: 900; padding: 6px 9px; }
        .club-groupsGrid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); min-width: 0; }
        .club-groupCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
        .club-groupTitle { align-items: center; border-bottom: 1px solid rgba(15,23,42,.07); display: flex; justify-content: space-between; padding-bottom: 8px; }
        .club-groupTitle strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-groupTitle span { color: #64748b; font-size: 11px; font-weight: 900; }
        .club-groupTeams { display: grid; gap: 6px; }
        .club-groupTeamRow { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.06); border-radius: 10px; display: grid; gap: 8px; grid-template-columns: auto minmax(0, 1fr); min-width: 0; padding: 8px; }
        .club-groupSeed { background: #e9fbff; border-radius: 999px; color: #0f7180; font-size: 11px; font-weight: 950; padding: 5px 7px; }
        .club-groupTeamRow div { display: grid; gap: 2px; min-width: 0; }
        .club-groupTeamRow strong { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-groupTeamRow small { color: #64748b; font-size: 11px; font-weight: 850; }
        .club-groupsEmpty { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #64748b; font-size: 12px; font-weight: 850; padding: 10px 12px; }
        .club-registrationList { display: grid; gap: 6px; min-width: 0; }
        .club-registrationHeader { display: none; }
        .club-registrationRow { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 7px; min-width: 0; padding: 7px 8px; }
        .club-teamMain { min-width: 0; }
        .club-teamMain { display: grid; gap: 2px; }
        .club-teamMain strong, .club-teamMain span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-teamMain strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-teamMain span { color: #64748b; font-size: 11px; }
        .club-statusBadge { border-radius: 999px; font-size: 10px; font-weight: 950; justify-self: start; padding: 5px 7px; white-space: nowrap; }
        .club-statusBadge--pending { background: #fff7df; color: #854d0e; }
        .club-statusBadge--confirmed { background: #ecfdf3; color: #166534; }
        .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-paymentBadge { border-radius: 999px; font-size: 10px; font-weight: 950; justify-self: start; padding: 5px 7px; white-space: nowrap; }
        .club-paymentBadge--paid { background: #ecfdf3; color: #166534; }
        .club-paymentBadge--pending { background: #fff7df; color: #854d0e; }
        .club-paymentBadge--failed { background: #fff1f2; color: #9f1239; }
        .club-paymentBadge--empty { background: #f1f5f9; color: #475569; }
        .club-seedCell, .club-scoreCell { display: grid; gap: 2px; min-width: 0; }
        .club-seedCell small, .club-scoreCell span { color: #64748b; font-size: 10px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-seedBadge { border-radius: 999px; font-size: 10px; font-weight: 950; justify-self: start; padding: 5px 7px; white-space: nowrap; }
        .club-seedBadge--ready { background: #e9fbff; color: #0f7180; }
        .club-seedBadge--empty { background: #f1f5f9; color: #64748b; }
        .club-scoreCell strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1; }
        .club-rowActions { display: grid; gap: 5px; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: stretch; }
        .club-primaryBtn, .club-secondaryBtn { border-radius: 8px; cursor: pointer; font-weight: 950; min-height: 28px; padding: 5px 7px; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-primaryBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-secondaryBtn { background: #e9fbff; border: 1px solid rgba(83,199,217,.36); color: #0f8ea0; }
        .club-primaryBtn:hover:not(:disabled) { background: #79edf0; box-shadow: 0 10px 22px rgba(15,23,42,.10); transform: translateY(-1px); }
        .club-secondaryBtn:hover:not(:disabled) { background: #d7f8ff; border-color: rgba(15,142,160,.62); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-primaryBtn:disabled, .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.38); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-manualModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 14px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 620px; min-width: 0; padding: 16px; width: min(620px, 100%); }
        .club-manualHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
        .club-manualHead h2 { color: #17253f; font-size: 20px; line-height: 1.1; margin: 2px 0 0; }
        .club-manualHead p { color: #64748b; font-size: 13px; font-weight: 750; margin: 6px 0 0; }
        .club-modalClose { background: #fff1f8; border: 1px solid rgba(190,24,93,.22); border-radius: 8px; color: #be185d; cursor: pointer; font-size: 12px; font-weight: 950; min-height: 34px; padding: 7px 10px; transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-modalClose:hover:not(:disabled) { background: #ffe4f1; border-color: rgba(190,24,93,.36); box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-modalClose:disabled { cursor: not-allowed; opacity: .6; }
        .club-manualError { background: #fff1f2; border: 1px solid rgba(220,38,38,.24); border-radius: 10px; color: #b91c1c; font-size: 12px; font-weight: 900; line-height: 1.35; padding: 10px 11px; }
        .club-manualGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-manualField { color: #17253f; display: grid; font-size: 12px; font-weight: 950; gap: 6px; min-width: 0; }
        .club-manualField:nth-child(3), .club-checkRow { grid-column: 1 / -1; }
        .club-autocomplete { display: grid; gap: 6px; min-width: 0; position: relative; }
        .club-selectedPlayer { align-items: center; background: #ecfdf3; border: 1px solid rgba(22,101,52,.14); border-radius: 10px; display: flex; gap: 8px; justify-content: space-between; min-width: 0; padding: 7px 8px; }
        .club-selectedPlayer span { color: #166534; font-size: 11px; font-weight: 900; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-selectedPlayer button { background: #fff; border: 1px solid rgba(22,101,52,.16); border-radius: 8px; color: #166534; cursor: pointer; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 5px 7px; }
        .club-selectedPlayer button:disabled { cursor: not-allowed; opacity: .6; }
        .club-suggestionBox { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 12px; box-shadow: 0 14px 34px rgba(15,23,42,.10); display: grid; gap: 4px; max-height: 238px; overflow: auto; padding: 6px; z-index: 2; }
        .club-suggestionItem { align-items: center; background: #fff; border: 1px solid transparent; border-radius: 10px; cursor: pointer; display: flex; gap: 8px; justify-content: space-between; min-width: 0; padding: 8px; text-align: left; transition: background .16s ease, border-color .16s ease, transform .16s ease; }
        .club-suggestionItem:hover:not(:disabled) { background: #f0fcff; border-color: rgba(83,199,217,.28); transform: translateY(-1px); }
        .club-suggestionItem:disabled { cursor: not-allowed; opacity: .45; }
        .club-suggestionItem strong { color: #17253f; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-suggestionItem span { color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-suggestionHint { background: #f8fafc; border-radius: 9px; color: #64748b; font-size: 11px; font-weight: 850; padding: 8px; }
        .club-checkRow { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 10px; color: #334155; cursor: pointer; display: flex; font-size: 13px; font-weight: 850; gap: 9px; min-height: 42px; padding: 10px; }
        .club-checkRow input { accent-color: #53c7d9; height: 16px; width: 16px; }
        .club-modalActions { align-items: center; display: flex; gap: 8px; justify-content: flex-end; }
        .club-registrationDetailModal { max-width: 620px; width: min(620px, 100%); }
        .club-registrationDetailGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-registrationDetailCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; min-width: 0; padding: 10px; }
        .club-registrationDetailCard span { color: #64748b; font-size: 11px; font-weight: 900; }
        .club-registrationDetailCard strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-registrationAlerts { display: flex; flex-wrap: wrap; gap: 6px; }
        .club-registrationAlerts span { background: #fff7df; border: 1px solid rgba(202,138,4,.16); border-radius: 999px; color: #854d0e; font-size: 11px; font-weight: 900; padding: 5px 8px; }
        .club-paymentActionsGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 1180px) {
          .club-registrationHeader { color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 7px; grid-template-columns: minmax(240px, 1.4fr) minmax(82px, .38fr) minmax(82px, .38fr) minmax(84px, .36fr) minmax(102px, .44fr) minmax(164px, .7fr); padding: 0 8px; text-transform: uppercase; }
          .club-registrationRow { grid-template-columns: minmax(240px, 1.4fr) minmax(82px, .38fr) minmax(82px, .38fr) minmax(84px, .36fr) minmax(102px, .44fr) minmax(164px, .7fr); }
        }
        @media (max-width: 780px) {
          .club-detailTopbar { align-items: flex-start; flex-direction: column; }
          .club-topbarActions { justify-content: flex-start; }
          .club-toolbar { grid-template-columns: 1fr; }
          .club-addPairBtn { justify-self: start; }
          .club-readiness { grid-template-columns: 1fr; }
          .club-manualHead { flex-direction: column; }
          .club-manualGrid { grid-template-columns: 1fr; }
          .club-modalActions { justify-content: stretch; }
          .club-modalActions button { flex: 1 1 0; }
          .club-paymentActionsGrid { grid-template-columns: 1fr; }
          .club-registrationDetailGrid { grid-template-columns: 1fr; }
          .club-groupsHead { align-items: flex-start; flex-direction: column; }
          .club-seedStatus { align-items: flex-start; flex-direction: column; gap: 10px; }
          .club-seedActions { justify-content: flex-start; }
          .club-counts { justify-content: flex-start; }
          .club-teamMain strong, .club-teamMain span { white-space: normal; }
        }
      `}</style>
    </div>
  )
}
