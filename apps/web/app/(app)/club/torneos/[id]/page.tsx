'use client'

import Link from 'next/link'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TournamentFlyerPreviewCard, defaultFlyerConfig, readFlyerConfigFromRules, type FlyerConfig } from '../_components/TournamentFlyerConfigurator'
import { calculateTournamentGroupStandings } from '@/lib/tournamentStandings'
import { isValidNormalSet, validateStructuredMatchScore, type ScoreValidationResult, type StructuredMatchScore } from '@/lib/tournamentScore'
import {
  getTournamentDisplayStatus,
  getTournamentDisplayStatusTone,
  isTournamentRegistrationClosed,
} from '@/lib/tournamentDisplayStatus'

type OperationalStage =
  | 'BORRADOR'
  | 'INSCRIPCIONES'
  | 'LISTO_PARA_INICIAR'
  | 'GRUPOS'
  | 'PLAYOFF'
  | 'FINALIZADO'

type TournamentSummary = {
  tournament: {
    id: string
    club_id: string
    name: string
    status: string
    type: string | null
    tournament_type?: string | null
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
    points_total: number | null
    created_at: string
    updated_at: string
    rules_json?: Record<string, unknown> | null
    points_scheme?: {
      name?: string | null
      rules?: Array<{
        rule_key: string
        points: number
      }>
    } | null
  }
  counts: {
    registrations: {
      total: number
      pending: number
      confirmed: number
      cancelled: number
    }
    teams: number
    groups: number
    groupMatches: {
      played: number
      total: number
    }
    playoffMatches: number
  }
  final: {
    id: string
    status: string | null
    team1_id?: string | null
    team2_id?: string | null
    team1_name?: string | null
    team2_name?: string | null
    winner_team_id: string | null
    score: Record<string, unknown> | null
  } | null
  champion: {
    team_id: string
    name: string
  } | null
  runnerUp?: {
    team_id: string
    name: string
  } | null
  operationalStage: OperationalStage
  nextStep: string
}

type TournamentRulesLookup = {
  tournaments?: Array<{
    id: string
    rules_json?: Record<string, unknown> | null
  }>
}

type TournamentTab = 'general' | 'inscriptos' | 'seed' | 'grupos' | 'playoff'

type Registration = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  admission_status: 'NONE' | 'MANUAL_PAYMENT_VALIDATED' | 'PAY_AT_VENUE_APPROVED' | 'EXCEPTION_APPROVED' | 'BLOCKED'
  admission_reason: string | null
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

type TournamentMatch = {
  id: string
  group_id: string | null
  phase: string | null
  status: string | null
  scheduled_at?: string | null
  team1_id: string
  team2_id: string
  team1_name?: string | null
  team2_name?: string | null
  winner_team_id: string | null
  score: Record<string, unknown> | null
  round: number
  match_order: number
}

type ResultSetInput = {
  team1: string
  team2: string
}

type ResultForm = {
  matchId: string
  sets: [ResultSetInput, ResultSetInput, ResultSetInput]
  superTiebreak: ResultSetInput
}

type ConfirmAction = {
  title: string
  body: string
  confirmLabel: string
  tone?: 'cyan' | 'magenta'
  confirmationKeyword?: string
  onConfirm: () => Promise<void>
} | null

type GenerateOpenResponse = {
  error?: string
  code?: string
  phase?: string
  createdCount?: number
  count?: number
  blockedCount?: number
  meta?: {
    assignedByes?: number
    warnings?: Array<{ code?: string; message?: string }>
  }
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

const stageOrder: OperationalStage[] = [
  'BORRADOR',
  'INSCRIPCIONES',
  'LISTO_PARA_INICIAR',
  'GRUPOS',
  'PLAYOFF',
  'FINALIZADO',
]

const stageLabels: Record<OperationalStage, string> = {
  BORRADOR: 'Borrador',
  INSCRIPCIONES: 'Inscripciones',
  LISTO_PARA_INICIAR: 'Listo',
  GRUPOS: 'Grupos',
  PLAYOFF: 'Playoff',
  FINALIZADO: 'Finalizado',
}

const genderLabels: Record<string, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
  MIXED: 'Mixto',
}

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

const emptySeedMeta: SeedMeta = {
  hasSeedSnapshot: false,
  seededTeamsCount: 0,
  hasGroups: false,
  groupCount: 0,
  hasGroupMatches: false,
  groupMatchesCount: 0,
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function formatMoney(value?: number | null) {
  if (!value) return 'Sin costo'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatScore(score?: Record<string, unknown> | null) {
  if (!score || Object.keys(score).length === 0) return 'Sin resultado'
  if (typeof score.text === 'string' && score.text.trim()) return score.text.trim()
  if (Array.isArray(score.sets)) {
    const sets = score.sets
      .map((set) => {
        if (!set || typeof set !== 'object') return ''
        const row = set as Record<string, unknown>
        const team1 = row.team1 ?? row.team1_games ?? row.a
        const team2 = row.team2 ?? row.team2_games ?? row.b
        return team1 !== undefined && team2 !== undefined ? `${team1}-${team2}` : ''
      })
      .filter(Boolean)
    if (sets.length > 0) return sets.join(' ')
  }
  return 'Resultado cargado'
}

function emptyResultSet(): ResultSetInput {
  return { team1: '', team2: '' }
}

function toScoreNumber(value: string) {
  if (value.trim() === '') return Number.NaN
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function hasAnyScoreValue(set: ResultSetInput) {
  return set.team1.trim() !== '' || set.team2.trim() !== ''
}

function toStructuredSet(set: ResultSetInput) {
  return {
    team1: toScoreNumber(set.team1),
    team2: toScoreNumber(set.team2),
    type: 'SET' as const,
  }
}

function toSuperTiebreak(set: ResultSetInput) {
  return {
    team1: toScoreNumber(set.team1),
    team2: toScoreNumber(set.team2),
    type: 'SUPER_TIEBREAK_10' as const,
  }
}

function getThirdPartialState(form: ResultForm) {
  const first = toStructuredSet(form.sets[0])
  const second = toStructuredSet(form.sets[1])
  if (!isValidNormalSet(first.team1, first.team2) || !isValidNormalSet(second.team1, second.team2)) {
    return { enabled: false, split: false }
  }

  const firstWinner = first.team1 > first.team2 ? 'team1' : 'team2'
  const secondWinner = second.team1 > second.team2 ? 'team1' : 'team2'
  const split = firstWinner !== secondWinner
  return { enabled: split, split }
}

function buildStructuredScore(form: ResultForm, phase?: string | null): StructuredMatchScore {
  const group = String(phase ?? '').toUpperCase() === 'GROUP'
  const score: StructuredMatchScore = {
    sets: [toStructuredSet(form.sets[0]), toStructuredSet(form.sets[1])],
  }
  const thirdState = getThirdPartialState(form)

  if (thirdState.enabled && group) {
    if (hasAnyScoreValue(form.superTiebreak)) score.super_tiebreak = toSuperTiebreak(form.superTiebreak)
  } else if (thirdState.enabled) {
    if (hasAnyScoreValue(form.sets[2])) score.sets.push(toStructuredSet(form.sets[2]))
  } else {
    if (hasAnyScoreValue(form.superTiebreak)) score.super_tiebreak = toSuperTiebreak(form.superTiebreak)
    if (hasAnyScoreValue(form.sets[2])) score.sets.push(toStructuredSet(form.sets[2]))
  }

  return score
}

function isStructuredScore(score?: Record<string, unknown> | null) {
  return Boolean(score && Array.isArray(score.sets))
}

function getScoreSetValue(scoreSet: unknown, side: 'team1' | 'team2') {
  if (!scoreSet || typeof scoreSet !== 'object') return ''
  const row = scoreSet as Record<string, unknown>
  const value = row[side]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function buildResultFormFromScore(match: TournamentMatch): ResultForm {
  const form: ResultForm = {
    matchId: match.id,
    sets: [emptyResultSet(), emptyResultSet(), emptyResultSet()],
    superTiebreak: emptyResultSet(),
  }

  if (!isStructuredScore(match.score)) return form

  const sets = Array.isArray(match.score?.sets) ? match.score.sets : []
  for (const index of [0, 1, 2] as const) {
    form.sets[index] = {
      team1: getScoreSetValue(sets[index], 'team1'),
      team2: getScoreSetValue(sets[index], 'team2'),
    }
  }

  if (match.score?.super_tiebreak) {
    form.superTiebreak = {
      team1: getScoreSetValue(match.score.super_tiebreak, 'team1'),
      team2: getScoreSetValue(match.score.super_tiebreak, 'team2'),
    }
  }

  return form
}

function formatPointRuleKey(value: string) {
  const map: Record<string, string> = {
    champion: '1° puesto',
    winner: '1° puesto',
    finalist: '2° puesto',
    runner_up: '2° puesto',
    semifinalist: 'Semifinalistas',
    quarterfinalist: 'Cuartos de final',
    round_of_16: 'Octavos',
    round_of_32: '16avos',
  }
  const cleanValue = value.toLowerCase()
  return map[cleanValue] ?? value.replaceAll('_', ' ')
}

function formatPlayoffPhaseLabel(value?: string | null) {
  const cleanValue = String(value ?? '').trim().toUpperCase()
  const map: Record<string, string> = {
    FINAL: 'Final',
    SEMI: 'Semifinal',
    QUARTER: 'Cuartos',
    EIGHTHS: 'Octavos',
    ROUND_OF_16: '16avos',
    ROUND_OF_32: '32avos',
  }
  return map[cleanValue] ?? (value ? value.replaceAll('_', ' ') : 'Playoff')
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
  const trimmed = value.trim()
  if (!trimmed) return {}

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidPattern.test(trimmed)) return { user_id: trimmed }
  return { full_name: trimmed }
}

function buildManualPlayerPayload(value: string, selectedPlayer: PlayerSuggestion | null) {
  if (selectedPlayer) {
    return {
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

function isOpenCompatibleTournament(summary?: TournamentSummary | null) {
  if (!summary) return false
  const format = String(summary.tournament.format ?? '').toUpperCase()
  const type = String(summary.tournament.type ?? summary.tournament.tournament_type ?? '').toUpperCase()
  return type === 'OPEN' && ['ZONE_PLAYOFF', 'GROUPS_ELIMINATION', 'GROUPS_ELIM'].includes(format)
}

export default function ClubTournamentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const tournamentId = params?.id
  const { activeClub } = useSession()
  const [summary, setSummary] = useState<TournamentSummary | null>(null)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [deletingTournament, setDeletingTournament] = useState(false)
  const [activeTab, setActiveTab] = useState<TournamentTab>('general')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [seedMeta, setSeedMeta] = useState<SeedMeta>(emptySeedMeta)
  const [loadingRegistrations, setLoadingRegistrations] = useState(false)
  const [generatingSeed, setGeneratingSeed] = useState(false)
  const [generatingGroups, setGeneratingGroups] = useState(false)
  const [generatingGroupMatches, setGeneratingGroupMatches] = useState(false)
  const [generatingOpenPlayoff, setGeneratingOpenPlayoff] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [confirmKeywordInput, setConfirmKeywordInput] = useState('')
  const [pointsModalOpen, setPointsModalOpen] = useState(false)
  const [flyerModalOpen, setFlyerModalOpen] = useState(false)
  const [registrationDetailModal, setRegistrationDetailModal] = useState<RegistrationDetailModal>(null)
  const [registrationPaymentModal, setRegistrationPaymentModal] = useState<RegistrationPaymentModal>(null)
  const [savingRegistrationId, setSavingRegistrationId] = useState<string | null>(null)
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [groupMatches, setGroupMatches] = useState<TournamentMatch[]>([])
  const [resultForm, setResultForm] = useState<ResultForm | null>(null)
  const [savingResult, setSavingResult] = useState(false)
  const [expandedGroupMatches, setExpandedGroupMatches] = useState<string[]>([])
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [creatingManual, setCreatingManual] = useState(false)
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
  const [actionMessage, setActionMessage] = useState('')

  const stageIndex = useMemo(
    () => (summary ? stageOrder.indexOf(summary.operationalStage) : -1),
    [summary]
  )
  const isDraft = summary?.tournament.status?.toUpperCase() === 'DRAFT'
  const runnerUp = useMemo(() => {
    if (!summary?.champion) return null
    if (summary.runnerUp?.name) return summary.runnerUp

    const final = summary.final
    if (!final?.winner_team_id || !final.team1_id || !final.team2_id) return null

    const loserTeamId = final.winner_team_id === final.team1_id ? final.team2_id : final.team1_id
    const loserName = loserTeamId === final.team1_id ? final.team1_name : final.team2_name
    return loserName ? { team_id: loserTeamId, name: loserName } : null
  }, [summary])
  const pointRules = useMemo(
    () => summary?.tournament.points_scheme?.rules ?? [],
    [summary]
  )
  const championPointRule = useMemo(
    () => pointRules.find((rule) => ['champion', 'winner', 'first_place', 'position_1', '1'].includes(rule.rule_key.toLowerCase())) ?? null,
    [pointRules]
  )
  const registrationStats = useMemo(() => ({
    total: registrations.length,
    pending: registrations.filter((row) => row.status === 'PENDING').length,
    confirmed: registrations.filter((row) => row.status === 'CONFIRMED').length,
    eligible: registrations.filter((row) => row.eligible).length,
    withoutPayment: registrations.filter((row) => row.payment_status === 'SIN_PAGO').length,
    paymentPending: registrations.filter((row) => row.payment_status === 'PENDIENTE').length,
    blocked: registrations.filter((row) => row.admission_status === 'BLOCKED').length,
  }), [registrations])
  const sortedRegistrations = useMemo(() => {
    if (!seedMeta.hasSeedSnapshot) return registrations

    return [...registrations].sort((left, right) => {
      const leftSeed = left.seed_snapshot?.seed ?? Number.MAX_SAFE_INTEGER
      const rightSeed = right.seed_snapshot?.seed ?? Number.MAX_SAFE_INTEGER
      if (leftSeed !== rightSeed) return leftSeed - rightSeed
      return left.created_at.localeCompare(right.created_at)
    })
  }, [registrations, seedMeta.hasSeedSnapshot])
  const canUseSeedTab = seedMeta.hasSeedSnapshot
  const canUseGroupsTab = seedMeta.hasGroups
  const canUsePlayoffTab = seedMeta.hasGroupMatches &&
    Boolean(summary?.counts.groupMatches.total) &&
    summary?.counts.groupMatches.played === summary?.counts.groupMatches.total
  const registrationClosed = isTournamentRegistrationClosed({
    registrationDeadline: summary?.tournament.registration_deadline,
  })
  const requiredEligibleTeamsForSeed = Math.max(2, summary?.tournament.min_pairs ?? 2)
  const canGenerateSeed = !seedMeta.hasSeedSnapshot && registrationStats.eligible >= requiredEligibleTeamsForSeed
  const canGenerateGroups = seedMeta.hasSeedSnapshot && !seedMeta.hasGroups
  const canGenerateGroupMatches = seedMeta.hasGroups && !seedMeta.hasGroupMatches
  const canGenerateOpenPlayoff = isOpenCompatibleTournament(summary) &&
    canUsePlayoffTab &&
    (summary?.counts.playoffMatches ?? 0) === 0 &&
      summary?.operationalStage !== 'FINALIZADO'
  const playoffMatchesCount = summary?.counts.playoffMatches ?? 0
  const playoffStateLabel = summary?.champion
    ? 'Finalizado'
    : playoffMatchesCount > 0
      ? 'En curso'
      : canGenerateOpenPlayoff
        ? 'Listo para generar'
        : 'Pendiente'
  const playoffStateDescription = summary?.champion
    ? 'Ya hay campeón definido y el cierre competitivo quedó registrado.'
    : playoffMatchesCount > 0
      ? 'El playoff ya tiene partidos creados y está listo para seguir operándose.'
      : canGenerateOpenPlayoff
        ? 'Los grupos ya están completos. Ya podés generar la primera ronda del playoff.'
        : seedMeta.hasGroupMatches && summary?.counts.groupMatches.total
          ? 'Todavía faltan resultados de grupos para habilitar el playoff.'
          : 'Primero necesitás grupos completos y partidos de grupos resueltos.'
  const canRequestDeleteTournament = ['DRAFT', 'OPEN'].includes(summary?.tournament.status?.toUpperCase() ?? '')
  const isTournamentOpen = summary?.tournament.status?.toUpperCase() === 'OPEN' && !registrationClosed
  const isTournamentFinished =
    summary?.operationalStage === 'FINALIZADO' ||
    ['FINALIZADO', 'FINISHED'].includes(summary?.tournament.status?.toUpperCase() ?? '')
  const canAddPair = Boolean(summary) && isTournamentOpen && !isTournamentFinished && !seedMeta.hasSeedSnapshot
  const sortedGroups = useMemo(
    () => [...groups].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    [groups]
  )
  const assignedGroupTeamsCount = useMemo(
    () => groups.reduce((acc, group) => acc + group.teams.length, 0),
    [groups]
  )
  const groupsReadyCount = useMemo(
    () => groups.filter((group) => group.teams.length === group.size).length,
    [groups]
  )
  const groupMatchesByGroup = useMemo(
    () =>
      groupMatches.reduce<Record<string, TournamentMatch[]>>((acc, match) => {
        if (!match.group_id || String(match.phase ?? '').toUpperCase() !== 'GROUP') return acc
        if (!acc[match.group_id]) acc[match.group_id] = []
        acc[match.group_id].push(match)
        return acc
      }, {}),
    [groupMatches]
  )
  const groupStandings = useMemo(() => {
    if (!tournamentId || sortedGroups.length === 0) return []

    return calculateTournamentGroupStandings({
      groups: sortedGroups.map((group) => ({
        id: group.id,
        tournament_id: tournamentId,
        name: group.name,
        order: group.order,
        size: group.size,
      })),
      groupTeams: sortedGroups.flatMap((group) =>
        group.teams.map((team) => ({
          group_id: group.id,
          tournament_id: tournamentId,
          team_id: team.team_id,
          seed: team.seed,
          position: team.position,
        }))
      ),
      matches: groupMatches.map((match) => ({
        id: match.id,
        group_id: match.group_id,
        phase: match.phase,
        status: match.status,
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        winner_team_id: match.winner_team_id,
        score: match.score,
      })),
    })
  }, [groupMatches, sortedGroups, tournamentId])
  const standingsByGroupId = useMemo(
    () =>
      groupStandings.reduce<Record<string, (typeof groupStandings)[number]>>((acc, item) => {
        acc[item.group.id] = item
        return acc
      }, {}),
    [groupStandings]
  )
  const resultMatch = useMemo(
    () => resultForm ? groupMatches.find((match) => match.id === resultForm.matchId) ?? null : null,
    [groupMatches, resultForm]
  )
  const flyerPreviewData = useMemo(() => ({
    clubName: activeClub?.name ?? '',
    name: summary?.tournament.name ?? '',
    type: summary?.tournament.type ?? summary?.tournament.tournament_type ?? 'Open',
    gender: summary?.tournament.gender ? genderLabels[summary.tournament.gender] ?? summary.tournament.gender : 'Genero por definir',
    categoryLabel: summary?.tournament.category_name ?? (summary?.tournament.category_id ? `Categoria ${summary.tournament.category_id}` : 'Categoria por definir'),
    startDate: summary?.tournament.start_date ?? '',
    endDate: summary?.tournament.end_date ?? '',
    registrationDeadline: summary?.tournament.registration_deadline ?? '',
    pricePerPlayer: summary?.tournament.price_per_player ? String(summary.tournament.price_per_player) : '0',
    minPairs: summary?.tournament.min_pairs ? String(summary.tournament.min_pairs) : '0',
  }), [activeClub?.name, summary])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadSummary() {
    if (!activeClub?.id || !tournamentId) {
      setSummary(null)
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

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setSummary(null)
      setMessage(json?.error ?? 'No pude cargar el resumen del torneo.')
      setLoading(false)
      return
    }

    setSummary(json as TournamentSummary)

    const rulesRes = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const rulesJson = await rulesRes.json().catch(() => ({})) as TournamentRulesLookup
    const currentTournament = (rulesJson.tournaments ?? []).find((item) => item.id === tournamentId)
    setFlyerConfig(readFlyerConfigFromRules(currentTournament?.rules_json))
    setLoading(false)
  }

  async function loadRegistrations() {
    if (!activeClub?.id || !tournamentId) {
      setRegistrations([])
      setGroups([])
      setGroupMatches([])
      setExpandedGroupMatches([])
      setSeedMeta(emptySeedMeta)
      return
    }

    setLoadingRegistrations(true)

    const token = await getToken()
    if (!token) {
      setRegistrations([])
      setGroups([])
      setGroupMatches([])
      setExpandedGroupMatches([])
      setSeedMeta(emptySeedMeta)
      setLoadingRegistrations(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setRegistrations([])
      setGroups([])
      setGroupMatches([])
      setExpandedGroupMatches([])
      setSeedMeta(emptySeedMeta)
      setLoadingRegistrations(false)
      return
    }

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

    const matchesRes = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/matches`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const matchesJson = await matchesRes.json().catch(() => ({})) as { matches?: TournamentMatch[] }
    const matches = matchesRes.ok ? (matchesJson.matches ?? []) : []
    setGroupMatches(
      matches
        .filter((match) => String(match.phase ?? '').toUpperCase() === 'GROUP')
        .sort((left, right) => {
          const leftOrder = left.round * 100 + left.match_order
          const rightOrder = right.round * 100 + right.match_order
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          return left.id.localeCompare(right.id)
        })
    )
    setLoadingRegistrations(false)
  }

  async function refreshTournamentExperience() {
    await Promise.all([loadSummary(), loadRegistrations()])
  }

  function toggleGroupMatches(groupId: string) {
    setExpandedGroupMatches((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId]
    )
  }

  function teamNameById(group: TournamentGroup, teamId: string) {
    const team = group.teams.find((item) => item.team_id === teamId)?.team
    return team?.players?.map((player) => player.full_name).join(' / ') || 'Pareja sin datos'
  }

  function matchStatusLabel(status?: string | null) {
    const cleanStatus = String(status ?? '').toUpperCase()
    if (cleanStatus === 'PLAYED') return 'Jugado'
    if (cleanStatus === 'PENDING') return 'Pendiente'
    return cleanStatus ? cleanStatus.replaceAll('_', ' ') : 'Pendiente'
  }

  function renderGroupMatchSchedule(match: TournamentMatch) {
    if (!match.scheduled_at) {
      return (
        <>
          <strong>Sin fecha</strong>
          <span>Hora sin asignar</span>
          <span>Cancha sin asignar</span>
        </>
      )
    }

    const date = new Date(match.scheduled_at)
    return (
      <>
        <strong>{formatDate(match.scheduled_at)}</strong>
        <span>
          {Number.isNaN(date.getTime())
            ? 'Hora sin asignar'
            : new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)}
        </span>
        <span>Cancha sin asignar</span>
      </>
    )
  }

  function getResultValidation(match: TournamentMatch): ScoreValidationResult | null {
    if (!resultForm || resultForm.matchId !== match.id) return null
    return validateStructuredMatchScore(buildStructuredScore(resultForm, match.phase), match.phase ?? 'GROUP')
  }

  function updateResultSet(index: 0 | 1 | 2, side: 'team1' | 'team2', value: string) {
    setResultForm((current) => {
      if (!current) return current
      const sets = current.sets.map((set) => ({ ...set })) as ResultForm['sets']
      sets[index] = { ...sets[index], [side]: value }
      if (index === 0 || index === 1) {
        const nextForm = { ...current, sets }
        const thirdState = getThirdPartialState(nextForm)
        if (!thirdState.enabled) {
          sets[2] = emptyResultSet()
          return { ...nextForm, sets, superTiebreak: emptyResultSet() }
        }
      }
      return { ...current, sets }
    })
  }

  function updateSuperTiebreak(side: 'team1' | 'team2', value: string) {
    setResultForm((current) => current ? { ...current, superTiebreak: { ...current.superTiebreak, [side]: value } } : current)
  }

  function openResultForm(match: TournamentMatch) {
    setResultForm(buildResultFormFromScore(match))
  }

  async function submitResult(match: TournamentMatch) {
    if (!activeClub?.id || !tournamentId || !resultForm || resultForm.matchId !== match.id) return

    const validation = getResultValidation(match)
    if (!validation?.ok) {
      setMessage(validation?.error ?? 'Cargá un resultado válido.')
      return
    }

    setSavingResult(true)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingResult(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/matches/${match.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        score: validation.score,
      }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }

    if (!res.ok) {
      setMessage(json.error ?? 'No pude cargar el resultado.')
      setSavingResult(false)
      return
    }

    setResultForm(null)
    setSavingResult(false)
    setActionMessage('Resultado cargado correctamente.')
    await refreshTournamentExperience()
  }

  function renderTournamentGroupStandings(group: TournamentGroup, standingBlock?: (typeof groupStandings)[number]) {
    if (!standingBlock) {
      return <div className="club-inlineNote">Todavía no hay standings calculables.</div>
    }

    const qualifierIds = new Set(standingBlock.qualifiers.map((row) => row.team_id))

    return (
      <div className="club-groupStandings" role="table" aria-label={`Standings Grupo ${group.name}`}>
        <div className="club-groupStandingRow club-groupStandingRow--head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Equipo</span>
          <span role="columnheader">PJ</span>
          <span role="columnheader">G</span>
          <span role="columnheader">P</span>
          <span role="columnheader">PTS</span>
          <span role="columnheader">DS</span>
          <span role="columnheader">DG</span>
        </div>
        {standingBlock.standings.map((row, index) => (
          <div key={row.team_id} className="club-groupStandingRow" role="row">
            <span role="cell">{index + 1}</span>
            <span className="club-groupStandingTeam" role="cell">
              <span>{teamNameById(group, row.team_id)}</span>
              {qualifierIds.has(row.team_id) ? <b>Clasifica</b> : null}
            </span>
            <span role="cell">{row.played}</span>
            <span role="cell">{row.wins}</span>
            <span role="cell">{row.losses}</span>
            <span role="cell">{row.match_points}</span>
            <span role="cell">{row.set_difference}</span>
            <span role="cell">{row.game_difference}</span>
          </div>
        ))}
      </div>
    )
  }

  function renderTournamentGroupMatchResult(match: TournamentMatch) {
    if (String(match.status ?? '').toUpperCase() !== 'PLAYED') {
      return <strong className="club-result club-result--muted">Sin resultado</strong>
    }

    const sets = Array.isArray(match.score?.sets) ? match.score.sets : []
    const structuredSets = [
      ...sets,
      match.score?.super_tiebreak,
    ]
      .map((set) => {
        if (!set || typeof set !== 'object') return null
        const row = set as Record<string, unknown>
        const team1 = row.team1
        const team2 = row.team2
        return typeof team1 === 'number' && typeof team2 === 'number' ? { team1, team2 } : null
      })
      .filter((set): set is { team1: number; team2: number } => Boolean(set))

    if (structuredSets.length > 0) {
      return (
        <div className="club-scoreBoard" aria-label={formatScore(match.score)}>
          <div className="club-scoreBoardLabels">
            {structuredSets.map((_, index) => (
              <span className="club-scoreLabel" key={`label-${match.id}-${index}`}>
                {index < 2 ? `S${index + 1}` : 'TB'}
              </span>
            ))}
          </div>
          <div className="club-scoreBoardRow">
            {structuredSets.map((set, index) => (
              <span className={`club-scoreSet ${set.team1 > set.team2 ? 'club-scoreSet--won' : 'club-scoreSet--lost'}`} key={`team1-${match.id}-${index}`}>
                {set.team1}
              </span>
            ))}
          </div>
          <div className="club-scoreBoardRow">
            {structuredSets.map((set, index) => (
              <span className={`club-scoreSet ${set.team2 > set.team1 ? 'club-scoreSet--won' : 'club-scoreSet--lost'}`} key={`team2-${match.id}-${index}`}>
                {set.team2}
              </span>
            ))}
          </div>
        </div>
      )
    }

    return <strong className="club-result">{formatScore(match.score)}</strong>
  }

  function renderResultForm(match: TournamentMatch) {
    if (!resultForm || resultForm.matchId !== match.id) return null

    const validation = getResultValidation(match)
    const thirdState = getThirdPartialState(resultForm)
    const group = String(match.phase ?? '').toUpperCase() === 'GROUP'
    const legacyScore = match.status === 'PLAYED' && !isStructuredScore(match.score) && typeof match.score?.text === 'string' && match.score.text.trim()
    const winnerName = validation?.ok
      ? validation.winnerSide === 'team1'
        ? match.team1_name ?? 'Equipo 1'
        : match.team2_name ?? 'Equipo 2'
      : null

    return (
      <div className="club-resultForm">
        {legacyScore ? (
          <div className="club-legacyScoreNotice">
            Resultado anterior: <b>{match.score?.text as string}</b>. Para editarlo, recargalo con sets estructurados.
          </div>
        ) : null}

        <div className="club-scoreGrid">
          <span className="club-scoreHead">Parcial</span>
          <span className="club-scoreHead">{match.team1_name ?? 'Equipo 1'}</span>
          <span className="club-scoreHead">{match.team2_name ?? 'Equipo 2'}</span>

          {[0, 1].map((index) => (
            <div className="club-scoreRow" key={index}>
              <span>Set {index + 1}</span>
              <input
                className="px-input club-scoreInput"
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[index as 0 | 1].team1}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[index as 0 | 1].team2}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team2', event.target.value)}
              />
            </div>
          ))}

          {group ? (
            <div className="club-scoreRow">
              <span>Super TB</span>
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.superTiebreak.team1}
                onChange={(event) => updateSuperTiebreak('team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.superTiebreak.team2}
                onChange={(event) => updateSuperTiebreak('team2', event.target.value)}
              />
            </div>
          ) : (
            <div className="club-scoreRow">
              <span>Set 3</span>
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[2].team1}
                onChange={(event) => updateResultSet(2, 'team1', event.target.value)}
              />
              <input
                className="px-input club-scoreInput"
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                type="number"
                value={resultForm.sets[2].team2}
                onChange={(event) => updateResultSet(2, 'team2', event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="club-resultSummary">
          {winnerName ? (
            <span>Ganador calculado: <b>{winnerName}</b></span>
          ) : (
            <span>{validation?.ok === false ? validation.error : 'Completá los sets para calcular el ganador.'}</span>
          )}
        </div>

        <div className="club-resultActions">
          <button
            type="button"
            className="club-primaryBtn"
            disabled={savingResult || !validation?.ok}
            onClick={() => submitResult(match)}
          >
            {savingResult ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            className="club-editBtn"
            disabled={savingResult}
            onClick={() => setResultForm(null)}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  function renderTournamentGroupMatchTable(group: TournamentGroup, matches: TournamentMatch[]) {
    return (
      <div className="club-matchTable" role="table" aria-label={`Partidos del Grupo ${group.name}`}>
        <div className="club-matchTableHead" role="row">
          <span role="columnheader">Info</span>
          <span role="columnheader">Partido</span>
          <span role="columnheader">Resultado</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader">Acciones</span>
        </div>
        {matches.map((match) => {
          const played = String(match.status ?? '').toUpperCase() === 'PLAYED'
          const team1Winner = played && match.winner_team_id === match.team1_id
          const team2Winner = played && match.winner_team_id === match.team2_id
          return (
            <div key={match.id} className="club-matchTableRow" role="row">
              <div className="club-matchInfoCell" role="cell">
                {renderGroupMatchSchedule(match)}
              </div>
              <div className="club-matchPairCell" role="cell">
                <div className="club-matchTeams" title={`${match.team1_name ?? 'Equipo 1'} vs ${match.team2_name ?? 'Equipo 2'}`}>
                  <strong className={team1Winner ? 'club-matchTeamWinner' : undefined}>
                    {match.team1_name ?? teamNameById(group, match.team1_id)}
                  </strong>
                  <span aria-hidden="true" />
                  <strong className={team2Winner ? 'club-matchTeamWinner' : undefined}>
                    {match.team2_name ?? teamNameById(group, match.team2_id)}
                  </strong>
                </div>
              </div>
              <div className="club-matchResultCell" role="cell">
                {renderTournamentGroupMatchResult(match)}
              </div>
              <div className="club-matchStatusCell" role="cell">
                <span className={`club-statusBadge club-statusBadge--${played ? 'played' : 'pending'}`}>
                  {matchStatusLabel(match.status)}
                </span>
              </div>
              <div className="club-matchActionCell" role="cell">
                <button
                  type="button"
                  className={`club-groupResultBtn ${played ? 'club-groupResultBtn--secondary' : 'club-groupResultBtn--primary'}`}
                  onClick={() => openResultForm(match)}
                >
                  {played ? 'Editar' : 'Cargar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  async function publishTournament() {
    if (!activeClub?.id || !tournamentId || !summary) return

    setPublishing(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setPublishing(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'publish' }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    if (!res.ok) {
      const messages: Record<string, string> = {
        INVALID_STATUS_TRANSITION: 'Solo podés publicar torneos en borrador.',
        UNAUTHORIZED: 'No tenés permisos para publicar este torneo.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude publicar el torneo.' : json.error ?? 'No pude publicar el torneo.')
      setPublishing(false)
      return
    }

    setActionMessage('Torneo publicado correctamente. Las inscripciones ya están abiertas.')
    setPublishing(false)
    await refreshTournamentExperience()
  }

  async function deleteTournament() {
    if (!activeClub?.id || !tournamentId || !summary) return

    setDeletingTournament(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setDeletingTournament(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'delete_tournament' }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string; blockers?: string[] }

    if (!res.ok) {
      const messages: Record<string, string> = {
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para eliminar este torneo.',
        TOURNAMENT_DELETE_NOT_ALLOWED: 'No se puede eliminar este torneo porque ya tiene actividad competitiva.',
        INVALID_ACTION: 'Acción inválida.',
      }
      const blockers = Array.isArray(json.blockers) && json.blockers.length > 0
        ? ` Bloqueos: ${json.blockers.join(', ')}.`
        : ''
      setMessage(`${json.code ? messages[json.code] ?? json.error ?? 'No pude eliminar el torneo.' : json.error ?? 'No pude eliminar el torneo.'}${blockers}`)
      setDeletingTournament(false)
      return
    }

    setActionMessage('Torneo eliminado correctamente.')
    setDeletingTournament(false)
    router.push('/club/torneos')
  }

  async function updateRegistrationPayment(
    registration: Registration,
    action: 'validate_payment' | 'approve_pay_at_venue'
  ) {
    if (!activeClub?.id || !tournamentId) return

    setSavingRegistrationId(registration.id)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingRegistrationId(null)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations/${registration.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }
    setSavingRegistrationId(null)

    if (!res.ok) {
      setMessage(json.error ?? 'No pude actualizar el pago de la pareja.')
      return
    }

    setRegistrationPaymentModal(null)
    setActionMessage(action === 'validate_payment' ? 'Pago validado manualmente.' : 'Pago en predio aprobado.')
    await refreshTournamentExperience()
  }

  async function confirmRegistration(registration: Registration) {
    if (!activeClub?.id || !tournamentId) return

    setSavingRegistrationId(registration.id)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingRegistrationId(null)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations/${registration.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }
    setSavingRegistrationId(null)

    if (!res.ok) {
      const messages: Record<string, string> = {
        REGISTRATION_CLOSED: 'La inscripción de este torneo ya cerró.',
        TOURNAMENT_FULL: 'El torneo ya alcanzó el cupo máximo de parejas.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude confirmar la inscripción.' : json.error ?? 'No pude confirmar la inscripción.')
      return
    }

    setRegistrationDetailModal(null)
    setActionMessage('Inscripción confirmada correctamente.')
    await refreshTournamentExperience()
  }

  async function generateSeed() {
    if (!activeClub?.id || !tournamentId || !canGenerateSeed) return

    setGeneratingSeed(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingSeed(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/seed/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string; seededTeamsCount?: number }

    if (!res.ok) {
      const messages: Record<string, string> = {
        SEED_SNAPSHOT_ALREADY_EXISTS: 'Este torneo ya tiene seed generado.',
        NO_ELIGIBLE_TEAMS: 'No hay parejas elegibles para generar seed.',
        INSUFFICIENT_ELIGIBLE_TEAMS_FOR_SEED: `Necesitás al menos ${requiredEligibleTeamsForSeed} parejas elegibles para generar seed.`,
        TEAM_DATA_INCOMPLETE: 'Faltan datos de una pareja para generar seed.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar seed.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar el seed.' : json.error ?? 'No pude generar el seed.')
      setGeneratingSeed(false)
      return
    }

    setActionMessage(`Seed generado correctamente${json.seededTeamsCount ? `: ${json.seededTeamsCount} parejas` : ''}.`)
    setGeneratingSeed(false)
    await refreshTournamentExperience()
  }

  async function generateGroups() {
    if (!activeClub?.id || !tournamentId || !canGenerateGroups) return

    setGeneratingGroups(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingGroups(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/groups/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string; groupCount?: number; teamsAssigned?: number }

    if (!res.ok) {
      const messages: Record<string, string> = {
        SEED_SNAPSHOT_REQUIRED: 'Primero generá el seed del torneo.',
        GROUPS_ALREADY_EXIST: 'Este torneo ya tiene grupos generados.',
        NO_ELIGIBLE_TEAMS: 'No hay parejas elegibles para generar grupos.',
        INVALID_GROUP_CONFIGURATION: 'No se pudo resolver una estructura válida de grupos.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar grupos.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar los grupos.' : json.error ?? 'No pude generar los grupos.')
      setGeneratingGroups(false)
      return
    }

    setActionMessage(`Grupos generados correctamente${json.groupCount ? `: ${json.groupCount} grupos` : ''}${json.teamsAssigned ? ` · ${json.teamsAssigned} parejas` : ''}.`)
    setGeneratingGroups(false)
    await refreshTournamentExperience()
  }

  async function generateGroupMatches() {
    if (!activeClub?.id || !tournamentId || !canGenerateGroupMatches) return

    setGeneratingGroupMatches(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingGroupMatches(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/groups/generate-matches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string; matchesCreated?: number }

    if (!res.ok) {
      const messages: Record<string, string> = {
        GROUPS_NOT_FOUND: 'Primero generá los grupos.',
        GROUP_MATCHES_ALREADY_EXIST: 'Este torneo ya tiene partidos de grupos.',
        GROUP_NOT_COMPLETE: 'Hay grupos incompletos.',
        INVALID_GROUP_SIZE: 'Hay un grupo con tamaño inválido.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar partidos.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar los partidos de grupos.' : json.error ?? 'No pude generar los partidos de grupos.')
      setGeneratingGroupMatches(false)
      return
    }

    setActionMessage(`Partidos de grupos generados correctamente${json.matchesCreated ? `: ${json.matchesCreated} partidos` : ''}.`)
    setGeneratingGroupMatches(false)
    await refreshTournamentExperience()
  }

  async function generateOpenPlayoff() {
    if (!activeClub?.id || !tournamentId || !canGenerateOpenPlayoff) return

    setGeneratingOpenPlayoff(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingOpenPlayoff(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/playoff/generate-open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as GenerateOpenResponse

    if (!res.ok) {
      const messages: Record<string, string> = {
        GROUP_NOT_COMPLETE: 'Completá todos los partidos de grupos antes de generar el playoff OPEN.',
        PLAYOFF_ALREADY_EXISTS_OR_STARTED: 'El playoff ya fue generado o ya tiene partidos iniciados.',
        OPEN_REQUIRES_MANUAL_RESOLUTION: 'El playoff OPEN requiere una resolución manual antes de generar partidos.',
        REGISTRATION_ELIGIBILITY_BLOCKED: `Hay ${json.count ?? json.blockedCount ?? 0} parejas que no pueden competir todavía. Revisá inscripciones para resolver pagos, excepciones o bloqueos.`,
        UNSUPPORTED_TOURNAMENT_FORMAT: 'Disponible solo para torneos OPEN por grupos.',
        UNAUTHORIZED: 'No tenés permisos para generar el playoff OPEN.',
        OPEN_GENERATION_ROLLED_BACK: 'Falló la generación OPEN y se revirtieron los partidos creados.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar el playoff OPEN.' : json.error ?? 'No pude generar el playoff OPEN.')
      setGeneratingOpenPlayoff(false)
      return
    }

    const warning = json.meta?.warnings?.find((item) => item.code === 'SAME_GROUP_CONFLICTS')
    const details = [
      json.phase ? `Fase: ${json.phase}` : null,
      typeof json.createdCount === 'number' ? `${json.createdCount} partidos` : null,
      json.meta?.assignedByes ? `${json.meta.assignedByes} byes` : null,
    ].filter(Boolean).join(' · ')

    setActionMessage(
      `Playoff OPEN generado correctamente${details ? ` (${details})` : ''}.` +
      (warning ? ' Se generó el playoff, pero quedaron cruces entre equipos del mismo grupo.' : '')
    )
    setGeneratingOpenPlayoff(false)
    await refreshTournamentExperience()
  }

  function openManualRegistration() {
    if (!canAddPair) {
      setManualModalOpen(false)
      setMessage('')
      setActionMessage('')
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
    setManualModalOpen(true)
    setMessage('')
    setActionMessage('')
  }

  function updateManualPlayerField(field: ManualPlayerField, value: string) {
    setManualForm((current) => ({ ...current, [field]: value }))
    setManualSelectedPlayers((current) => ({ ...current, [field]: null }))
  }

  function selectManualPlayer(field: ManualPlayerField, player: PlayerSuggestion) {
    setManualForm((current) => ({ ...current, [field]: player.full_name }))
    setManualSelectedPlayers((current) => ({ ...current, [field]: player }))
    setPlayerSuggestions((current) => ({ ...current, [field]: [] }))
  }

  async function searchManualPlayers(field: ManualPlayerField, query: string) {
    if (!activeClub?.id || !tournamentId || query.trim().length < 1) {
      setPlayerSuggestions((current) => ({ ...current, [field]: [] }))
      setSearchingPlayers((current) => ({ ...current, [field]: false }))
      return
    }

    setSearchingPlayers((current) => ({ ...current, [field]: true }))

    const token = await getToken()
    if (!token) {
      setSearchingPlayers((current) => ({ ...current, [field]: false }))
      return
    }

    const res = await fetch(
      `/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations/manual?q=${encodeURIComponent(query.trim())}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    )
    const json = await res.json().catch(() => ({})) as { players?: PlayerSuggestion[] }
    const otherSelectedPlayer = manualSelectedPlayers[otherManualField(field)]
    const players = res.ok
      ? (json.players ?? []).filter((player) => player.user_id !== otherSelectedPlayer?.user_id)
      : []

    setPlayerSuggestions((current) => ({ ...current, [field]: players }))
    setSearchingPlayers((current) => ({ ...current, [field]: false }))
  }

  async function submitManualRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClub?.id || !tournamentId || !canAddPair) return

    const player1 = manualForm.player1.trim()
    const player2 = manualForm.player2.trim()
    const selectedPlayer1 = manualSelectedPlayers.player1
    const selectedPlayer2 = manualSelectedPlayers.player2

    if (!player1 || !player2) {
      setMessage('Completá los datos de ambos jugadores.')
      return
    }

    if (
      (selectedPlayer1 && selectedPlayer2 && selectedPlayer1.user_id === selectedPlayer2.user_id) ||
      (!selectedPlayer1 && !selectedPlayer2 && player1.toLowerCase() === player2.toLowerCase())
    ) {
      setMessage('Los jugadores de la pareja deben ser distintos.')
      return
    }

    setCreatingManual(true)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setCreatingManual(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/registrations/manual`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        player1: buildManualPlayerPayload(player1, selectedPlayer1),
        player2: buildManualPlayerPayload(player2, selectedPlayer2),
        auto_confirm: manualForm.autoConfirm,
        payment_mode: manualForm.paymentMode,
      }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }
    setCreatingManual(false)

    if (!res.ok) {
      const messages: Record<string, string> = {
        UNAUTHORIZED: 'No tenés permisos para agregar parejas.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        TOURNAMENT_NOT_OPEN: 'Publicá el torneo para que puedan anotarse parejas.',
        REGISTRATION_CLOSED: 'La fecha de cierre de inscripción ya venció.',
        INVALID_PLAYER: 'Completá los datos de ambos jugadores.',
        INVALID_PLAYER_NAME: 'Completá el nombre del jugador.',
        INVALID_PLAYER_USER_ID: 'El user_id de jugador no es válido.',
        PLAYER_USER_NOT_FOUND: 'No encontré uno de los usuarios indicados.',
        SAME_PLAYER: 'Los jugadores de la pareja deben ser distintos.',
        PLAYER_ALREADY_REGISTERED_IN_TOURNAMENT: 'Uno de los jugadores ya está inscripto en este torneo.',
        TEAM_ALREADY_REGISTERED: 'Esta pareja ya está cargada para el torneo.',
        REGISTRATION_ALREADY_EXISTS: 'Esta pareja ya tiene inscripción para el torneo.',
        INVALID_PAYMENT_MODE: 'Modo de pago inválido.',
        MANUAL_PLAYER_CREATE_FAILED: 'No pude crear el jugador manual.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude agregar la pareja.' : json.error ?? 'No pude agregar la pareja.')
      return
    }

    setManualModalOpen(false)
    setActionMessage('Pareja agregada correctamente.')
    setActiveTab('inscriptos')
    await refreshTournamentExperience()
  }

  function requestConfirmation(action: NonNullable<ConfirmAction>) {
    setConfirmAction(action)
  }

  async function runConfirmedAction() {
    if (!confirmAction) return
    const requiredKeyword = confirmAction.confirmationKeyword?.trim()
    if (requiredKeyword && confirmKeywordInput.trim() !== requiredKeyword) return
    setConfirmingAction(true)
    await confirmAction.onConfirm()
    setConfirmingAction(false)
    setConfirmAction(null)
    setConfirmKeywordInput('')
  }

  useEffect(() => {
    void Promise.resolve().then(() => refreshTournamentExperience())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, tournamentId])

  useEffect(() => {
    if (manualModalOpen && !canAddPair) {
      setManualModalOpen(false)
      setMessage('')
      setActionMessage('')
    }
  }, [canAddPair, manualModalOpen])

  useEffect(() => {
    if (!manualModalOpen) return
    const timeout = window.setTimeout(() => {
      void searchManualPlayers('player1', manualForm.player1)
    }, 220)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModalOpen, manualForm.player1, activeClub?.id, tournamentId, manualSelectedPlayers.player2?.user_id])

  useEffect(() => {
    if (!manualModalOpen) return
    const timeout = window.setTimeout(() => {
      void searchManualPlayers('player2', manualForm.player2)
    }, 220)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModalOpen, manualForm.player2, activeClub?.id, tournamentId, manualSelectedPlayers.player1?.user_id])

  useEffect(() => {
    if (confirmAction) return
    setConfirmKeywordInput('')
  }, [confirmAction])

  return (
    <div className="px-wrap">
      <div className="club-panel club-tournamentDetail">
        <div className="club-detailTopbar">
          <Link href="/club/torneos" className="club-backBtn">Volver a torneos</Link>
          <div className="club-topbarActions">
            {isDraft ? (
              <Link href={`/club/torneos/${tournamentId}/editar`} className="club-editBtn">
                Editar torneo
              </Link>
            ) : null}
            {canRequestDeleteTournament ? (
              <button
                className="club-deleteBtn"
                type="button"
                onClick={() => requestConfirmation({
                  title: 'Eliminar torneo',
                  body: '¿Eliminar este torneo? Esta acción es irreversible. Para continuar, escribí exactamente ACEPTAR.',
                  confirmLabel: 'Eliminar torneo',
                  tone: 'magenta',
                  confirmationKeyword: 'ACEPTAR',
                  onConfirm: deleteTournament,
                })}
                disabled={loading || publishing || deletingTournament}
              >
                {deletingTournament ? 'Eliminando...' : 'Eliminar torneo'}
              </button>
            ) : null}
            <button className="club-editBtn" type="button" onClick={refreshTournamentExperience} disabled={loading || publishing || deletingTournament}>
              {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
            {isDraft ? (
              <button
                className="club-primaryBtn club-publishBtn"
                type="button"
                onClick={() => requestConfirmation({
                  title: 'Publicar torneo',
                  body: 'Esto abre las inscripciones del torneo. Podés seguir gestionándolo desde este centro de control.',
                  confirmLabel: 'Publicar torneo',
                  onConfirm: publishTournament,
                })}
                disabled={publishing || loading || deletingTournament}
              >
                {publishing ? 'Publicando...' : 'Publicar torneo'}
              </button>
            ) : null}
          </div>
        </div>

        {actionMessage ? <div className="club-actionMessage">{actionMessage}</div> : null}

        {!activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : loading ? (
          <div className="px-empty">Cargando torneo...</div>
        ) : message ? (
          <div className="club-message">{message}</div>
        ) : summary ? (
          <>
            <header className="club-detailHero">
              <div className="club-detailMain">
                <span className="club-kicker">Centro de control</span>
                <h1 className="club-title">{summary.tournament.name}</h1>
                <div className="club-metaLine">
                  <span>{summary.tournament.type ?? 'Sin tipo'}</span>
                  <span>{summary.tournament.category_name ?? 'Sin categoría'}</span>
                  <span>{summary.tournament.gender ? genderLabels[summary.tournament.gender] ?? summary.tournament.gender : 'Sin género'}</span>
                  <span>{summary.tournament.format ?? 'Sin formato'}</span>
                </div>
              </div>

              <div className="club-detailBadges">
                <span className={`club-statusBadge club-statusBadge--${getTournamentDisplayStatusTone({ operationalStage: summary.operationalStage, status: summary.tournament.status, registrationDeadline: summary.tournament.registration_deadline })}`}>
                  {getTournamentDisplayStatus({ operationalStage: summary.operationalStage, status: summary.tournament.status, registrationDeadline: summary.tournament.registration_deadline })}
                </span>
              </div>
            </header>

            <section className="club-stepper" aria-label="Progreso operativo">
              {stageOrder.map((stage, index) => {
                const state = summary.operationalStage === 'FINALIZADO' && index <= stageIndex
                  ? 'done'
                  : index < stageIndex
                    ? 'done'
                    : index === stageIndex
                      ? 'current'
                      : 'pending'
                return (
                  <div key={stage} className={`club-step club-step--${state}`}>
                    <span>{index + 1}</span>
                    <strong>{stageLabels[stage]}</strong>
                  </div>
                )
              })}
            </section>

            <section className="club-tabsShell">
              <div className="club-tabs" role="tablist" aria-label="Operación del torneo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'general'}
                  className={`club-tab ${activeTab === 'general' ? 'club-tab--active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  General
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'inscriptos'}
                  className={`club-tab ${activeTab === 'inscriptos' ? 'club-tab--active' : ''}`}
                  onClick={() => setActiveTab('inscriptos')}
                >
                  Inscriptos ({registrationStats.total})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'seed'}
                  className={`club-tab ${activeTab === 'seed' ? 'club-tab--active' : ''}`}
                  disabled={!canUseSeedTab}
                  title={!canUseSeedTab ? 'Primero generá el seed del torneo.' : undefined}
                  onClick={() => canUseSeedTab && setActiveTab('seed')}
                >
                  Seed
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'grupos'}
                  className={`club-tab ${activeTab === 'grupos' ? 'club-tab--active' : ''}`}
                  disabled={!canUseGroupsTab}
                  title={!canUseGroupsTab ? 'Primero generá los grupos del torneo.' : undefined}
                  onClick={() => canUseGroupsTab && setActiveTab('grupos')}
                >
                  Grupos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'playoff'}
                  className={`club-tab ${activeTab === 'playoff' ? 'club-tab--active' : ''}`}
                  disabled={!canUsePlayoffTab}
                  title={!canUsePlayoffTab ? 'Completá la fase de grupos para habilitar playoff.' : undefined}
                  onClick={() => canUsePlayoffTab && setActiveTab('playoff')}
                >
                  Playoff
                </button>
              </div>

              <div className="club-tabPanel">
                {activeTab === 'general' ? (
                  <div className="club-tabContent">
                    <section className="club-summaryGrid">
                      <div className="club-summaryMain">
                        <article className="club-nextCard">
                          <span className="club-kicker">Próximo paso</span>
                          <h2>{summary.nextStep}</h2>
                          <p>La etapa se deriva de estado, inscripciones, grupos, partidos y final jugada.</p>
                        </article>

                        <section className="club-metrics club-metrics--detail">
                          <div className="club-metric"><span>Inicio</span><strong>{formatDate(summary.tournament.start_date)}</strong></div>
                          <div className="club-metric"><span>Fin</span><strong>{formatDate(summary.tournament.end_date)}</strong></div>
                          <div className="club-metric"><span>Cierre inscripción</span><strong>{formatDate(summary.tournament.registration_deadline)}</strong></div>
                          <div className="club-metric"><span>Precio</span><strong>{formatMoney(summary.tournament.price_per_player)}</strong></div>
                          <div className="club-metric"><span>Parejas</span><strong>{summary.tournament.min_pairs ?? '-'}{summary.tournament.max_pairs ? `/${summary.tournament.max_pairs}` : ''}</strong></div>
                          <div className="club-metric"><span>Confirmadas</span><strong>{summary.counts.registrations.confirmed}</strong></div>
                          <div className="club-metric"><span>Pendientes</span><strong>{summary.counts.registrations.pending}</strong></div>
                          <div className="club-metric"><span>Canceladas</span><strong>{summary.counts.registrations.cancelled}</strong></div>
                          <div className="club-metric"><span>Grupos</span><strong>{summary.counts.groups}</strong></div>
                          <div className="club-metric"><span>Partidos en Grupos</span><strong>{summary.counts.groupMatches.played}/{summary.counts.groupMatches.total}</strong></div>
                          <div className="club-metric"><span>Partidos en PlayOff</span><strong>{summary.counts.playoffMatches}</strong></div>
                          <button type="button" className="club-metric club-metricButton" onClick={() => setPointsModalOpen(true)}>
                            <span>Puntos a Repartir</span>
                            <strong>{championPointRule ? `Campeón: ${championPointRule.points} pts` : 'Sin esquema de puntos'}</strong>
                          </button>
                        </section>
                      </div>

                      <article className="club-flyerSlot">
                        <div className="club-flyerSlotHead">
                          <span className="club-kicker">Flyer del torneo</span>
                          <span className="club-flyerHint">Click para verlo grande</span>
                        </div>
                        <button type="button" className="club-flyerPreviewButton" onClick={() => setFlyerModalOpen(true)}>
                          <TournamentFlyerPreviewCard value={flyerConfig} previewData={flyerPreviewData} variant="sidebar" />
                        </button>
                      </article>
                    </section>

                    {summary.champion ? (
                      <section className="club-championCard">
                        <div className="club-podiumMain">
                          <div className="club-podiumBadge">1°</div>
                          <div className="club-championMain">
                            <span className="club-kicker">Campeón</span>
                            <h2>{summary.champion.name}</h2>
                            <p>Final: {formatScore(summary.final?.score)}</p>
                          </div>
                        </div>
                        {runnerUp ? (
                          <div className="club-runnerUp">
                            <span>2° · Subcampeón</span>
                            <strong>{runnerUp.name}</strong>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === 'inscriptos' ? (
                  <div className="club-tabContent">
                    <section className="club-inscriptionsOps">
                      <div className="club-readinessGrid">
                        <div className="club-readinessItem club-readinessItem--ready">
                          <span>Listas para competir</span>
                          <b>{registrationStats.eligible}</b>
                        </div>
                        <div className="club-readinessItem">
                          <span>Sin pago</span>
                          <b>{registrationStats.withoutPayment}</b>
                        </div>
                        <div className="club-readinessItem">
                          <span>Pendientes</span>
                          <b>{registrationStats.paymentPending}</b>
                        </div>
                        <div className="club-readinessItem club-readinessItem--blocked">
                          <span>Bloqueadas</span>
                          <b>{registrationStats.blocked}</b>
                        </div>
                      </div>

                      <div className={`club-seedStatus ${seedMeta.hasSeedSnapshot ? 'club-seedStatus--ready' : 'club-seedStatus--missing'}`}>
                        <div>
                          <strong>{seedMeta.hasSeedSnapshot ? 'Seed generado' : 'Todavía no se generó el seed del torneo'}</strong>
                          <span>
                            {seedMeta.hasSeedSnapshot
                              ? `${seedMeta.seededTeamsCount} parejas con seed.${seedMeta.hasGroups ? ` ${seedMeta.groupCount} grupos generados.` : ''}${seedMeta.hasGroupMatches ? ` ${seedMeta.groupMatchesCount} partidos de grupos.` : ''}`
                              : 'El seed congela el orden competitivo antes de generar grupos.'}
                          </span>
                        </div>
                        <div className="club-seedActions">
                          <button
                            type="button"
                            className="club-generateGroupsBtn"
                            disabled={!canAddPair || creatingManual}
                            onClick={openManualRegistration}
                            title={
                              registrationClosed
                                ? 'La fecha de cierre de inscripción ya venció.'
                                : !isTournamentOpen
                                ? 'Publicá el torneo para que puedan anotarse parejas.'
                                : isTournamentFinished
                                  ? 'El torneo ya está finalizado.'
                                  : seedMeta.hasSeedSnapshot
                                    ? 'El seed del torneo ya fue generado.'
                                    : 'Agregar pareja manual'
                            }
                          >
                            Agregar pareja
                          </button>
                          {!seedMeta.hasSeedSnapshot ? (
                            <button
                              type="button"
                              className="club-generateSeedBtn"
                              disabled={!canGenerateSeed || generatingSeed || loadingRegistrations}
                              title={
                                registrationStats.eligible < requiredEligibleTeamsForSeed
                                  ? `Necesitás al menos ${requiredEligibleTeamsForSeed} parejas elegibles para generar seed.`
                                  : undefined
                              }
                              onClick={() => requestConfirmation({
                                title: 'Generar seed',
                                body: 'Esta acción congela el orden competitivo actual de las parejas elegibles.',
                                confirmLabel: 'Generar seed',
                                onConfirm: generateSeed,
                              })}
                            >
                              {generatingSeed ? 'Generando...' : 'Generar seed'}
                            </button>
                          ) : null}
                          {seedMeta.hasSeedSnapshot && !seedMeta.hasGroups ? (
                            <button
                              type="button"
                              className="club-generateGroupsBtn"
                              disabled={!canGenerateGroups || generatingGroups || loadingRegistrations}
                              onClick={() => requestConfirmation({
                                title: 'Generar grupos',
                                body: 'Se van a asignar las parejas a grupos usando el seed congelado del torneo.',
                                confirmLabel: 'Generar grupos',
                                onConfirm: generateGroups,
                              })}
                            >
                              {generatingGroups ? 'Generando...' : 'Generar grupos'}
                            </button>
                          ) : null}
                          {seedMeta.hasGroups && !seedMeta.hasGroupMatches ? (
                            <button
                              type="button"
                              className="club-generateMatchesBtn"
                              disabled={!canGenerateGroupMatches || generatingGroupMatches || loadingRegistrations}
                                onClick={() => requestConfirmation({
                                  title: 'Generar partidos de grupos',
                                  body: 'Se crearán los cruces pendientes de fase de grupos para cargar resultados desde Partidos.',
                                  confirmLabel: 'Generar partidos',
                                  tone: 'magenta',
                                  onConfirm: generateGroupMatches,
                                })}
                            >
                              {generatingGroupMatches ? 'Generando...' : 'Generar partidos de grupos'}
                            </button>
                          ) : null}
                          <Link href={`/club/inscripciones?tournamentId=${summary.tournament.id}`} className="club-editBtn">
                            Vista completa
                          </Link>
                        </div>
                      </div>
                    </section>

                    <section className="club-registrationsPanel">
                      <div className="club-sectionHead">
                        <div>
                          <span className="club-kicker">Inscriptos</span>
                          <h2>Parejas inscriptas</h2>
                        </div>
                        {loadingRegistrations ? <span className="club-miniHint">Actualizando...</span> : null}
                      </div>
                      {registrations.length > 0 ? (
                        <div className="club-registrationList">
                          <div className="club-registrationMiniHead" aria-hidden="true">
                            <span>Equipo</span>
                            <span>Fecha inscripción</span>
                            <span>Estado</span>
                            <span>Pago</span>
                            <span>Seed</span>
                            <span>Score</span>
                            <span>Acciones</span>
                          </div>
                          {sortedRegistrations.map((registration) => (
                            <article key={registration.id} className="club-registrationMiniRow">
                              <div className="club-teamMini">
                                <div className="club-teamLinks">
                                  {(registration.team?.players ?? []).map((player, index) => (
                                    <span key={player.user_id} className="club-teamLinkItem">
                                      {index > 0 ? <span className="club-teamSeparator">/</span> : null}
                                      <Link href={`/club/jugadores/${player.user_id}`} className="club-teamLink">
                                        {player.full_name}
                                      </Link>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="club-dateMini">
                                <strong>{formatDate(registration.created_at)}</strong>
                                <span>Inscripción</span>
                              </div>
                              <span className={`club-statusBadge club-statusBadge--${statusTone(registration.status)}`}>
                                {statusLabels[registration.status] ?? registration.status}
                              </span>
                              <span className={`club-paymentBadge club-paymentBadge--${paymentTone(registration.payment_status)}`}>
                                {paymentLabels[registration.payment_status]}
                              </span>
                              <div className="club-seedMini">
                                <strong title="El seed define el orden inicial de las parejas para armar grupos equilibrados">
                                  {registration.seed_snapshot ? `#${registration.seed_snapshot.seed}` : 'Sin seed'}
                                </strong>
                              </div>
                              <div className="club-scoreMini">
                                <strong>{registration.seed_snapshot ? registration.seed_snapshot.team_score : 'Sin score'}</strong>
                                <span>{registration.seed_snapshot ? 'pts' : ''}</span>
                              </div>
                              <div className="club-registrationActions">
                                <button
                                  type="button"
                                  className="club-editBtn club-viewBtn"
                                  disabled={savingRegistrationId === registration.id}
                                  onClick={() => setRegistrationPaymentModal({ registration })}
                                >
                                  Pago
                                </button>
                                <button
                                  type="button"
                                  className="club-editBtn club-viewBtn"
                                  onClick={() => setRegistrationDetailModal({ registration })}
                                >
                                  Ver
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="club-tabEmpty">
                          {isTournamentOpen
                            ? 'Todavía no hay parejas inscriptas para este torneo.'
                            : 'Todavía no hay parejas inscriptas. Para que las parejas puedan anotarse, primero publicá el torneo.'}
                        </div>
                      )}
                    </section>
                  </div>
                ) : null}

                {activeTab === 'seed' ? (
                  <div className="club-tabContent">
                    {!seedMeta.hasSeedSnapshot ? (
                      <section className="club-placeholderPanel">
                        <span className="club-kicker">Seed</span>
                        <h2>Todavía no se generó el seed del torneo</h2>
                        <p>Cuando congeles el orden competitivo, acá vas a ver el armado base del torneo y la distribución por grupos.</p>
                        <button
                          type="button"
                          className="club-generateSeedBtn"
                          disabled={!canGenerateSeed || generatingSeed || loadingRegistrations}
                          title={
                            registrationStats.eligible < requiredEligibleTeamsForSeed
                              ? `Necesitás al menos ${requiredEligibleTeamsForSeed} parejas elegibles para generar seed.`
                              : undefined
                          }
                          onClick={() => requestConfirmation({
                            title: 'Generar seed',
                            body: 'Esta acción congela el orden competitivo actual de las parejas elegibles.',
                            confirmLabel: 'Generar seed',
                            onConfirm: generateSeed,
                          })}
                        >
                          {generatingSeed ? 'Generando...' : 'Generar seed'}
                        </button>
                      </section>
                    ) : !seedMeta.hasGroups || sortedGroups.length === 0 ? (
                      <section className="club-placeholderPanel">
                        <span className="club-kicker">Seed</span>
                        <h2>Todavía no se generaron grupos</h2>
                        <p>Cuando armes los grupos desde Inscriptos, vas a ver acá el reparto completo de parejas y seeds.</p>
                        <button
                          type="button"
                          className="club-generateGroupsBtn"
                          disabled={!canGenerateGroups || generatingGroups || loadingRegistrations}
                          onClick={() => requestConfirmation({
                            title: 'Generar grupos',
                            body: 'Se van a asignar las parejas a grupos usando el seed congelado del torneo.',
                            confirmLabel: 'Generar grupos',
                            onConfirm: generateGroups,
                          })}
                        >
                          {generatingGroups ? 'Generando...' : 'Generar grupos'}
                        </button>
                      </section>
                    ) : (
                      <>
                        <section className="club-registrationsPanel">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Resumen</span>
                              <h2>Armado de grupos</h2>
                            </div>
                          </div>
                          <div className="club-groupSummaryGrid">
                            <div className="club-groupSummaryCard">
                              <span>Grupos</span>
                              <strong>{sortedGroups.length}</strong>
                            </div>
                            <div className="club-groupSummaryCard">
                              <span>Parejas asignadas</span>
                              <strong>{assignedGroupTeamsCount}</strong>
                            </div>
                            <div className={`club-groupSummaryCard ${groupsReadyCount === sortedGroups.length ? 'club-groupSummaryCard--ready' : ''}`}>
                              <span>Estado del armado</span>
                              <strong>{groupsReadyCount === sortedGroups.length ? 'Completo' : `${groupsReadyCount}/${sortedGroups.length} completos`}</strong>
                            </div>
                          </div>
                        </section>

                        <div className="club-groupsCardsGrid">
                          {sortedGroups.map((group) => (
                            <section key={group.id} className="club-groupCardDetailed">
                              <div className="club-groupCardHead">
                                <div>
                                  <span className="club-kicker">Grupo</span>
                                  <h2>{group.name}</h2>
                                </div>
                                <span className="club-groupCapacity">{group.teams.length}/{group.size}</span>
                              </div>

                              <div className="club-groupTeamsList">
                                {group.teams.map((entry) => (
                                  <article key={entry.id} className="club-groupTeamItem">
                                    <div className="club-groupTeamMain">
                                      <strong>
                                        {entry.team?.players?.map((player) => player.full_name).join(' / ') || 'Pareja sin datos'}
                                      </strong>
                                    </div>
                                    <div className="club-groupTeamMeta">
                                      <span className="club-groupMetaPill">Seed #{entry.seed}</span>
                                      <span className="club-groupMetaPill club-groupMetaPill--neutral">
                                        {entry.team_score !== null ? `${entry.team_score} pts` : 'Sin score'}
                                      </span>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {activeTab === 'grupos' ? (
                  <div className="club-tabContent">
                    {!seedMeta.hasGroups || sortedGroups.length === 0 ? (
                      <section className="club-placeholderPanel">
                        <span className="club-kicker">Grupos</span>
                        <h2>Todavía no se generaron grupos</h2>
                        <p>Cuando armes los grupos desde Seed, acá vas a ver la parte competitiva de cada grupo.</p>
                        </section>
                      ) : (
                        <div className="club-matchList">
                          {sortedGroups.map((group) => {
                            const standingBlock = standingsByGroupId[group.id]
                            const matches = groupMatchesByGroup[group.id] ?? []
                            const sectionKey = group.id
                            const isExpanded = expandedGroupMatches.includes(group.id)

                            return (
                              <section key={`${group.id}-competition`} className="club-matchSection">
                                <div className="club-matchSectionHead">
                                  <div>
                                    <strong>{`Grupo ${group.name}`}</strong>
                                    <span>{matches.length} partido{matches.length === 1 ? '' : 's'}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="club-showMatchesBtn"
                                    onClick={() => toggleGroupMatches(sectionKey)}
                                  >
                                    {isExpanded ? 'Ocultar partidos' : 'Mostrar partidos'}
                                  </button>
                                </div>

                                {renderTournamentGroupStandings(group, standingBlock)}

                                {!seedMeta.hasGroupMatches || matches.length === 0 ? (
                                  <div className="club-inlineNote">
                                    Todavía no hay partidos de grupos para mostrar en este grupo.
                                  </div>
                                ) : null}

                                {isExpanded && matches.length > 0 ? (
                                  <div className="club-matchSectionRows">
                                    {renderTournamentGroupMatchTable(group, matches)}
                                  </div>
                                ) : null}
                              </section>
                            )
                          })}

                          {!seedMeta.hasGroupMatches || groupMatches.length === 0 ? (
                            <section className="club-registrationsPanel">
                              <div className="club-sectionHead">
                                <div>
                                  <span className="club-kicker">Partidos</span>
                                  <h2>Todavía no hay competencia de grupos</h2>
                                </div>
                              </div>
                              <div className="club-inlineNote">
                                Los grupos ya están armados. Cuando generes partidos de grupos y cargues resultados,
                                acá vas a ver la tabla competitiva y los cruces sin salir de esta pantalla.
                              </div>
                            </section>
                          ) : null}
                        </div>
                      )}
                  </div>
                ) : null}

                {activeTab === 'playoff' ? (
                  <div className="club-tabContent">
                    {playoffMatchesCount === 0 ? (
                      <section className="club-placeholderPanel">
                        <span className="club-kicker">Playoff</span>
                        <h2>Todavía no se generó el playoff</h2>
                        <p>{canGenerateOpenPlayoff
                          ? 'Los grupos ya están completos y el torneo está listo para generar la primera ronda del playoff.'
                          : 'Completá la fase de grupos para habilitar la generación del playoff y ver los cruces acá.'}</p>
                        {canGenerateOpenPlayoff ? (
                          <button
                            type="button"
                            className="club-generateSeedBtn"
                            disabled={!canGenerateOpenPlayoff || generatingOpenPlayoff}
                            onClick={() => requestConfirmation({
                              title: 'Generar playoff OPEN',
                              body: 'Se generará la primera ronda real del playoff OPEN con los standings actuales.',
                              confirmLabel: 'Generar playoff OPEN',
                              onConfirm: generateOpenPlayoff,
                            })}
                          >
                            {generatingOpenPlayoff ? 'Generando...' : 'Generar playoff OPEN'}
                          </button>
                        ) : null}
                      </section>
                    ) : (
                      <>
                        <section className="club-registrationsPanel">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Resumen</span>
                              <h2>Estado del playoff</h2>
                            </div>
                          </div>

                          <div className="club-groupSummaryGrid">
                            <div className="club-groupSummaryCard">
                              <span>Partidos</span>
                              <strong>{playoffMatchesCount}</strong>
                            </div>
                            <div className={`club-groupSummaryCard ${summary.champion ? 'club-groupSummaryCard--ready' : ''}`}>
                              <span>Estado</span>
                              <strong>{playoffStateLabel}</strong>
                            </div>
                            <div className="club-groupSummaryCard">
                              <span>Campeón</span>
                              <strong>{summary.champion?.name ?? 'Por definirse'}</strong>
                            </div>
                          </div>

                          {runnerUp ? (
                            <div className="club-playoffPodium">
                              <div className="club-playoffPodiumCard club-playoffPodiumCard--winner">
                                <span>Campeón</span>
                                <strong>{summary.champion?.name ?? 'Por definirse'}</strong>
                              </div>
                              <div className="club-playoffPodiumCard">
                                <span>Subcampeón</span>
                                <strong>{runnerUp.name}</strong>
                              </div>
                            </div>
                          ) : null}

                          <p className="club-playoffSummaryText">{playoffStateDescription}</p>
                        </section>

                        <section className="club-playoffMatchesSection">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Partidos</span>
                              <h2>Playoff del torneo</h2>
                            </div>
                          </div>

                          <div className="club-playoffMatchesList">
                            {summary.final ? (
                              <article className="club-playoffMatchCard">
                                <div className="club-playoffMatchHead">
                                  <span className="club-playoffPhase">{formatPlayoffPhaseLabel('FINAL')}</span>
                                  <span className={`club-statusBadge club-statusBadge--${summary.final.status === 'PLAYED' ? 'confirmed' : 'pending'}`}>
                                    {summary.final.status === 'PLAYED' ? 'Jugado' : 'Pendiente'}
                                  </span>
                                </div>
                                <div className="club-playoffTeams">
                                  <strong>{summary.final.team1_name ?? 'Equipo 1'}</strong>
                                  <span>vs</span>
                                  <strong>{summary.final.team2_name ?? 'Equipo 2'}</strong>
                                </div>
                                <div className="club-playoffFooter">
                                  <span>{formatScore(summary.final.score)}</span>
                                  {summary.final.winner_team_id ? <b>Ganador definido</b> : <b>Sin ganador todavía</b>}
                                </div>
                              </article>
                            ) : null}

                            {playoffMatchesCount > (summary.final ? 1 : 0) ? (
                              <article className="club-playoffMatchCard club-playoffMatchCard--summary">
                                <div className="club-playoffMatchHead">
                                  <span className="club-playoffPhase">Ronda activa</span>
                                  <span className="club-statusBadge club-statusBadge--ready">Operativa</span>
                                </div>
                                <div className="club-playoffTeams">
                                  <strong>{playoffMatchesCount - (summary.final ? 1 : 0)} partido(s) adicionales</strong>
                                  <span>El cuadro ya fue generado</span>
                                </div>
                                <div className="club-playoffFooter">
                                  <span>La vista actual ya resume el estado general del playoff.</span>
                                  <b>Seguimiento desde Partidos</b>
                                </div>
                              </article>
                            ) : null}
                          </div>
                        </section>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {pointsModalOpen && summary ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => setPointsModalOpen(false)}>
          <section className="club-pointsModal" role="dialog" aria-modal="true" aria-labelledby="points-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-pointsHead">
              <div>
                <span className="club-kicker">Puntos a repartir</span>
                <h2 id="points-modal-title">{summary.tournament.points_scheme?.name ?? summary.tournament.name}</h2>
              </div>
              <button type="button" className="club-editBtn" onClick={() => setPointsModalOpen(false)}>
                Cerrar
              </button>
            </div>

            {pointRules.length > 0 ? (
              <div className="club-pointsList">
                {pointRules.map((rule) => (
                  <div key={rule.rule_key} className="club-pointsRow">
                    <span>{formatPointRuleKey(rule.rule_key)}</span>
                    <strong>{rule.points} pts</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="club-pointsEmpty">
                <strong>Sin esquema de puntos</strong>
                <p>Todavía no hay detalle cargado para mostrar el reparto por posición.</p>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {flyerModalOpen ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => setFlyerModalOpen(false)}>
          <section className="club-confirmModal club-flyerModal" role="dialog" aria-modal="true" aria-labelledby="flyer-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-pointsHead">
              <div>
                <span className="club-kicker">Flyer del torneo</span>
                <h2 id="flyer-modal-title">{summary?.tournament.name ?? 'Vista previa'}</h2>
              </div>
              <button type="button" className="club-editBtn" onClick={() => setFlyerModalOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="club-flyerModalBody">
              <TournamentFlyerPreviewCard value={flyerConfig} previewData={flyerPreviewData} variant="modal" />
            </div>
          </section>
        </div>
      ) : null}

      {resultForm && resultMatch ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingResult && setResultForm(null)}>
          <section
            className="club-confirmModal club-resultModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-match-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="club-pointsHead">
              <div>
                <span className="club-kicker">{resultMatch.status === 'PLAYED' ? 'Editar resultado' : 'Cargar resultado'}</span>
                <h2 id="result-match-title">
                  {resultMatch.team1_name ?? 'Equipo 1'} vs {resultMatch.team2_name ?? 'Equipo 2'}
                </h2>
              </div>
              <button
                type="button"
                className="club-editBtn"
                disabled={savingResult}
                onClick={() => setResultForm(null)}
              >
                Cerrar
              </button>
            </div>
            {renderResultForm(resultMatch)}
          </section>
        </div>
      ) : null}

      {manualModalOpen ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !creatingManual && setManualModalOpen(false)}>
          <form className="club-manualModal" onSubmit={submitManualRegistration} onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-manualHead">
              <div>
                <span className="club-kicker">Inscripción manual</span>
                <h2>Agregar pareja</h2>
                <p>Buscá jugadores existentes o escribí un nombre nuevo para crearlo como jugador manual.</p>
              </div>
              <button type="button" className="club-modalClose" disabled={creatingManual} onClick={() => setManualModalOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="club-manualGrid">
              <label className="club-manualField">
                <span>Jugador 1</span>
                <div className="club-autocomplete">
                  <input
                    value={manualForm.player1}
                    onChange={(event) => updateManualPlayerField('player1', event.target.value)}
                    placeholder="Buscar por nombre o apellido"
                    disabled={creatingManual}
                  />
                  {manualSelectedPlayers.player1 ? (
                    <div className="club-selectedPlayer">
                      {formatPlayerCategory(manualSelectedPlayers.player1.category)} · {formatPlayerGender(manualSelectedPlayers.player1.gender)}
                    </div>
                  ) : null}
                  {manualForm.player1.trim().length >= 1 && !manualSelectedPlayers.player1 ? (
                    <div className="club-suggestionBox">
                      {searchingPlayers.player1 ? <div className="club-suggestionHint">Buscando...</div> : null}
                      {!searchingPlayers.player1 && playerSuggestions.player1.map((player) => (
                        <button
                          key={player.user_id}
                          type="button"
                          className="club-suggestionItem"
                          disabled={player.user_id === manualSelectedPlayers.player2?.user_id}
                          onClick={() => selectManualPlayer('player1', player)}
                        >
                          <strong>{player.full_name}</strong>
                          <span>{formatPlayerCategory(player.category)} · {formatPlayerGender(player.gender)}</span>
                        </button>
                      ))}
                      {!searchingPlayers.player1 && playerSuggestions.player1.length === 0 ? (
                        <div className="club-suggestionHint">Sin coincidencias disponibles. Se creará como jugador manual.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="club-manualField">
                <span>Jugador 2</span>
                <div className="club-autocomplete">
                  <input
                    value={manualForm.player2}
                    onChange={(event) => updateManualPlayerField('player2', event.target.value)}
                    placeholder="Buscar por nombre o apellido"
                    disabled={creatingManual}
                  />
                  {manualSelectedPlayers.player2 ? (
                    <div className="club-selectedPlayer">
                      {formatPlayerCategory(manualSelectedPlayers.player2.category)} · {formatPlayerGender(manualSelectedPlayers.player2.gender)}
                    </div>
                  ) : null}
                  {manualForm.player2.trim().length >= 1 && !manualSelectedPlayers.player2 ? (
                    <div className="club-suggestionBox">
                      {searchingPlayers.player2 ? <div className="club-suggestionHint">Buscando...</div> : null}
                      {!searchingPlayers.player2 && playerSuggestions.player2.map((player) => (
                        <button
                          key={player.user_id}
                          type="button"
                          className="club-suggestionItem"
                          disabled={player.user_id === manualSelectedPlayers.player1?.user_id}
                          onClick={() => selectManualPlayer('player2', player)}
                        >
                          <strong>{player.full_name}</strong>
                          <span>{formatPlayerCategory(player.category)} · {formatPlayerGender(player.gender)}</span>
                        </button>
                      ))}
                      {!searchingPlayers.player2 && playerSuggestions.player2.length === 0 ? (
                        <div className="club-suggestionHint">Sin coincidencias disponibles. Se creará como jugador manual.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="club-checkRow">
                <input
                  type="checkbox"
                  checked={manualForm.autoConfirm}
                  onChange={(event) => setManualForm((current) => ({ ...current, autoConfirm: event.target.checked }))}
                  disabled={creatingManual}
                />
                Confirmar inscripción automáticamente
              </label>

              <label className="club-manualField">
                <span>Pago</span>
                <select
                  value={manualForm.paymentMode}
                  onChange={(event) => setManualForm((current) => ({ ...current, paymentMode: event.target.value as PaymentMode }))}
                  disabled={creatingManual}
                >
                  <option value="VENUE">Pago en predio aprobado</option>
                  <option value="PAID">Pago validado manualmente</option>
                  <option value="NONE">Sin admisión de pago</option>
                </select>
              </label>
            </div>

            <div className="club-modalActions">
              <button type="button" className="club-editBtn" disabled={creatingManual} onClick={() => setManualModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="club-primaryBtn" disabled={creatingManual}>
                {creatingManual ? 'Agregando...' : 'Agregar pareja'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !confirmingAction && setConfirmAction(null)}>
          <section className="club-confirmModal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <span className="club-kicker">Confirmación</span>
              <h2 id="confirm-modal-title">{confirmAction.title}</h2>
              <p>{confirmAction.body}</p>
            </div>
            {confirmAction.confirmationKeyword ? (
              <label className="club-confirmField">
                <span>Escribí <strong>{confirmAction.confirmationKeyword}</strong> para habilitar la acción final.</span>
                <input
                  value={confirmKeywordInput}
                  onChange={(event) => setConfirmKeywordInput(event.target.value)}
                  placeholder={confirmAction.confirmationKeyword}
                  disabled={confirmingAction}
                  autoFocus
                />
              </label>
            ) : null}
            <div className="club-confirmActions">
              <button type="button" className="club-editBtn" disabled={confirmingAction} onClick={() => setConfirmAction(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`club-primaryBtn ${confirmAction.tone === 'magenta' ? 'club-dangerConfirmBtn' : ''}`}
                disabled={confirmingAction || Boolean(confirmAction.confirmationKeyword && confirmKeywordInput.trim() !== confirmAction.confirmationKeyword)}
                onClick={runConfirmedAction}
              >
                {confirmingAction ? 'Procesando...' : confirmAction.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {registrationPaymentModal ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingRegistrationId && setRegistrationPaymentModal(null)}>
          <section className="club-confirmModal club-registrationDetailModal" role="dialog" aria-modal="true" aria-labelledby="registration-payment-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <span className="club-kicker">Medio de pago</span>
              <h2 id="registration-payment-title">{teamName(registrationPaymentModal.registration)}</h2>
              <p>Elegí cómo querés registrar el pago de esta pareja.</p>
            </div>
            <div className="club-paymentActionsGrid">
              <button
                type="button"
                className="club-primaryBtn"
                disabled={savingRegistrationId === registrationPaymentModal.registration.id}
                onClick={() => updateRegistrationPayment(registrationPaymentModal.registration, 'validate_payment')}
              >
                {savingRegistrationId === registrationPaymentModal.registration.id ? 'Guardando...' : 'Validar pago'}
              </button>
              <button
                type="button"
                className="club-secondaryBtn"
                disabled={savingRegistrationId === registrationPaymentModal.registration.id}
                onClick={() => updateRegistrationPayment(registrationPaymentModal.registration, 'approve_pay_at_venue')}
              >
                Pago en predio
              </button>
            </div>
            <div className="club-confirmActions">
              <button type="button" className="club-editBtn" disabled={savingRegistrationId === registrationPaymentModal.registration.id} onClick={() => setRegistrationPaymentModal(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {registrationDetailModal ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => setRegistrationDetailModal(null)}>
          <section className="club-confirmModal club-registrationDetailModal" role="dialog" aria-modal="true" aria-labelledby="registration-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <span className="club-kicker">Pareja</span>
              <h2 id="registration-detail-title">{teamName(registrationDetailModal.registration)}</h2>
              <p>Detalle operativo de la inscripción.</p>
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
                <strong>{statusLabels[registrationDetailModal.registration.status] ?? registrationDetailModal.registration.status}</strong>
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
                <strong>{registrationDetailModal.registration.seed_snapshot ? `#${registrationDetailModal.registration.seed_snapshot.seed}` : 'Sin seed'}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Score</span>
                <strong>{registrationDetailModal.registration.seed_snapshot ? `${registrationDetailModal.registration.seed_snapshot.team_score} pts` : 'Sin score'}</strong>
              </div>
            </div>
            {registrationDetailModal.registration.alerts.length > 0 ? (
              <div className="club-registrationAlerts">
                {registrationDetailModal.registration.alerts.map((alert) => (
                  <span key={alert}>{alert}</span>
                ))}
              </div>
            ) : null}
            <div className="club-confirmActions">
              {registrationDetailModal.registration.status === 'PENDING' ? (
                <button
                  type="button"
                  className="club-primaryBtn"
                  disabled={savingRegistrationId === registrationDetailModal.registration.id}
                  onClick={() => confirmRegistration(registrationDetailModal.registration)}
                >
                  {savingRegistrationId === registrationDetailModal.registration.id ? 'Confirmando...' : 'Confirmar inscripción'}
                </button>
              ) : null}
              <button type="button" className="club-editBtn" onClick={() => setRegistrationDetailModal(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <style>{`
        .club-tournamentDetail { overflow: hidden; }
        .club-detailTopbar { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
        .club-topbarActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-backBtn { align-items: center; background: #fff1f7; border: 1px solid rgba(190,24,93,.34); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-backBtn:hover { background: #ffe4f1; border-color: rgba(190,24,93,.52); box-shadow: 0 8px 18px rgba(190,24,93,.14); transform: translateY(-1px); }
        .club-editBtn { align-items: center; background: #f0fcff; border: 1px solid rgba(83,199,217,.40); border-radius: 8px; color: #0f8ea0; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-editBtn:hover { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-editBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-editBtn:disabled:hover { background: #f0fcff; border-color: rgba(83,199,217,.40); box-shadow: none; transform: none; }
        .club-deleteBtn { align-items: center; background: #fff1f2; border: 1px solid rgba(190,18,60,.22); border-radius: 8px; color: #be123c; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-deleteBtn:hover { background: #ffe4e6; border-color: rgba(190,18,60,.42); box-shadow: 0 8px 18px rgba(190,18,60,.12); transform: translateY(-1px); }
        .club-deleteBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-deleteBtn:disabled:hover { background: #fff1f2; border-color: rgba(190,18,60,.22); box-shadow: none; transform: none; }
        .club-detailHero { align-items: flex-start; background: transparent; border: 0; border-radius: 0; box-shadow: none; display: flex; gap: 16px; justify-content: space-between; min-width: 0; padding: 14px 0 12px; }
        .club-detailMain { min-width: 0; padding-left: 18px; }
        .club-title { color: #17253f; font-size: 30px; font-weight: 950; letter-spacing: 0; line-height: 1.05; margin: 4px 0 8px; }
        .club-metaLine { color: #64748b; display: flex; flex-wrap: wrap; font-size: 13px; font-weight: 800; gap: 8px 12px; min-width: 0; }
        .club-metaLine span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-detailBadges { align-items: flex-end; display: flex; flex-direction: column; gap: 8px; }
        .club-statusBadge { border-radius: 999px; box-shadow: 0 8px 18px rgba(15,23,42,.05); font-size: 11px; font-weight: 950; padding: 6px 9px; white-space: nowrap; }
        .club-statusBadge--active { background: #ecfdf3; color: #166534; }
        .club-statusBadge--ready { background: #fff7df; color: #854d0e; }
        .club-statusBadge--done { background: #eef8ff; color: #164e63; }
        .club-statusBadge--danger { background: #fff1f2; color: #9f1239; }
        .club-statusBadge--draft { background: #fff7df; color: #854d0e; }
        .club-stepper { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 8px; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 12px; padding: 10px; }
        .club-step { align-items: center; border-radius: 12px; display: flex; gap: 7px; min-width: 0; padding: 8px; }
        .club-step span { align-items: center; border-radius: 999px; display: inline-flex; flex: 0 0 auto; font-size: 11px; font-weight: 950; height: 22px; justify-content: center; width: 22px; }
        .club-step strong { color: #475569; font-size: 11px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-step--done { background: #f0fdf4; }
        .club-step--done span { background: #16a34a; color: #fff; }
        .club-step--current { background: #e8fbff; outline: 1px solid rgba(15,142,160,.18); }
        .club-step--current span { background: #69dfe3; color: #102538; }
        .club-step--pending { background: #f8fafc; }
        .club-step--pending span { background: #e2e8f0; color: #64748b; }
        .club-summaryGrid { align-items: start; display: grid; gap: 10px; grid-template-columns: minmax(0, 1.04fr) minmax(320px, .96fr); margin-top: 6px; }
        .club-summaryMain { display: grid; gap: 8px; min-width: 0; }
        .club-nextCard, .club-flyerSlot, .club-championCard, .club-card { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; min-width: 0; padding: 14px; }
        .club-nextCard { align-content: start; align-self: start; border-color: rgba(83,199,217,.22); box-shadow: inset 3px 0 0 #69dfe3; display: grid; gap: 3px; min-height: 0; padding: 9px 12px; }
        .club-nextCard h2, .club-championCard h2, .club-actionsCard h2 { color: #17253f; font-size: 18px; line-height: 1.2; margin: 4px 0 6px; }
        .club-nextCard p, .club-flyerSlot p, .club-championCard p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-nextCard h2 { font-size: 14px; line-height: 1.14; margin: 1px 0 0; max-width: 28ch; }
        .club-nextCard p { font-size: 10px; line-height: 1.28; max-width: 48ch; }
        .club-flyerSlot { align-content: start; background: linear-gradient(135deg, #f8fafc, #eef8ff); display: grid; gap: 7px; min-height: 0; padding: 10px; }
        .club-flyerSlotHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .club-flyerHint { color: #64748b; font-size: 11px; font-weight: 850; }
        .club-flyerPreviewButton { background: transparent; border: 0; border-radius: 18px; cursor: pointer; display: block; padding: 0; text-align: left; transition: transform .18s ease, box-shadow .18s ease; width: 100%; }
        .club-flyerPreviewButton:hover { transform: translateY(-1px); }
        .club-flyerPreviewButton:focus-visible { outline: 2px solid #53c7d9; outline-offset: 3px; }
        .flyerPreviewShell { min-width: 0; }
        .flyerPreview { border-radius: 18px; box-shadow: 0 16px 34px rgba(15,23,42,.13); min-height: 100%; overflow: hidden; padding: 14px; position: relative; }
        .flyerPreview::after { background: linear-gradient(180deg, rgba(255,255,255,.05) 0%, rgba(2,6,23,.22) 100%); content: ''; inset: 0; pointer-events: none; position: absolute; }
        .flyerPreview > * { position: relative; z-index: 1; }
        .flyerPreviewTop { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .flyerPreviewClub { color: rgba(255,255,255,.86); font-size: 10px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }
        .flyerPreviewType { backdrop-filter: blur(10px); background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); border-radius: 999px; font-size: 9px; font-weight: 950; padding: 5px 8px; text-transform: uppercase; }
        .flyerPreviewBody { display: grid; gap: 8px; margin-top: 12px; }
        .flyerPreviewEyebrow { font-size: 9px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
        .flyerPreviewMain h3 { font-size: 22px; line-height: .98; margin: 4px 0 6px; max-width: 10ch; }
        .flyerPreviewMain p { color: inherit; font-size: 12px; font-weight: 800; line-height: 1.22; margin: 0; opacity: .94; }
        .flyerPreviewDate { background: rgba(15,23,42,.22); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.2); border-radius: 12px; display: inline-grid; gap: 4px; justify-self: start; min-width: 0; padding: 10px 12px; }
        .flyerPreviewDate span, .flyerPreviewMeta span { color: rgba(226,232,240,.82); font-size: 9px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
        .flyerPreviewDate strong, .flyerPreviewMeta strong { color: #f8fafc; font-size: 13px; line-height: 1.15; }
        .flyerPreviewMeta { display: grid; gap: 7px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
        .flyerPreviewMeta > div { backdrop-filter: blur(12px); background: rgba(15,23,42,.2); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; display: grid; gap: 4px; padding: 10px 11px; }
        .flyerManualOverlay, .flyerNoneOverlay { backdrop-filter: blur(14px); background: rgba(15,23,42,.5); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; bottom: 16px; display: grid; gap: 4px; left: 16px; padding: 10px; position: absolute; right: 16px; z-index: 2; }
        .flyerManualOverlay strong, .flyerNoneOverlay strong { color: #f8fafc; font-size: 13px; }
        .flyerManualOverlay span, .flyerNoneOverlay span { color: rgba(226,232,240,.88); font-size: 10px; font-weight: 700; line-height: 1.35; }
        .flyerPreview--sidebar { min-height: 248px; }
        .flyerPreview--modal { min-height: 620px; }
        .flyerPreview--modal .flyerPreviewMain h3 { font-size: 38px; max-width: 12ch; }
        .flyerPreview--modal .flyerPreviewMain p { font-size: 16px; }
        .flyerPreview--modal .flyerPreviewDate strong, .flyerPreview--modal .flyerPreviewMeta strong { font-size: 18px; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-metrics--detail { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 0; }
        .club-metric { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 13px; display: grid; gap: 3px; min-width: 0; padding: 10px; }
        .club-metric span { color: #64748b; font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-metric strong { color: #17253f; font-size: 17px; font-weight: 950; line-height: 1.1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-metricButton { cursor: pointer; text-align: left; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .club-metricButton:hover { background: #f0fcff; border-color: rgba(83,199,217,.34); box-shadow: 0 10px 24px rgba(15,142,160,.08); transform: translateY(-1px); }
        .club-metricButton strong { font-size: 15px; }
        .club-championCard { align-items: stretch; background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%); border-color: rgba(22,163,74,.22); display: grid; gap: 10px; grid-template-columns: minmax(0, 1.45fr) minmax(220px, .55fr); margin-top: 12px; position: relative; }
        .club-championCard::before { background: linear-gradient(180deg, #16a34a, #69dfe3); border-radius: 999px; bottom: 12px; content: ''; left: 10px; position: absolute; top: 12px; width: 5px; }
        .club-podiumMain { align-items: center; display: grid; gap: 12px; grid-template-columns: auto minmax(0, 1fr); min-width: 0; padding-left: 12px; }
        .club-podiumBadge { align-items: center; background: #16a34a; border: 1px solid rgba(20,83,45,.12); border-radius: 14px; box-shadow: 0 10px 22px rgba(22,163,74,.14); color: #fff; display: inline-flex; font-size: 20px; font-weight: 950; height: 54px; justify-content: center; width: 54px; }
        .club-championMain { min-width: 0; }
        .club-championMain h2 { color: #14532d; font-size: 24px; line-height: 1.08; margin: 4px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-runnerUp { align-self: center; background: rgba(255,255,255,.82); border: 1px solid rgba(15,23,42,.08); border-radius: 14px; box-shadow: 0 10px 24px rgba(15,23,42,.04); display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-runnerUp span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-runnerUp strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.12; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-actionsCard { align-items: center; background: linear-gradient(135deg, #fff, #f8fafc); display: flex; gap: 12px; justify-content: space-between; margin-top: 12px; }
        .club-actionGrid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.club-tabsShell { margin: 14px -18px 0; }
.club-tabs { align-items: center; background: linear-gradient(180deg, #f2fcff 0%, #eef8fb 100%); border-bottom: 1px solid rgba(83,199,217,.24); border-top: 1px solid rgba(83,199,217,.14); box-shadow: inset 0 1px 0 rgba(255,255,255,.74); display: flex; gap: 20px; min-width: 0; overflow-x: auto; padding: 5px 18px 0; }
.club-tab { background: transparent; border: 0; border-bottom: 3px solid transparent; border-radius: 0; color: #64748b; cursor: pointer; flex: 0 0 auto; font-size: 13px; font-weight: 850; min-height: 36px; padding: 8px 2px 9px; transition: border-color .18s ease, color .18s ease, opacity .18s ease; white-space: nowrap; }
.club-tab:hover:not(:disabled) { color: #0f8ea0; opacity: .92; }
.club-tab--active { border-bottom-color: #69dfe3; color: #0f8ea0; font-weight: 950; }
.club-tab:disabled { cursor: not-allowed; opacity: .48; }
.club-tabPanel { margin-top: 12px; padding: 0 18px; }
        .club-tabContent { display: grid; gap: 12px; min-width: 0; }
        .club-inscriptionsOps { display: grid; gap: 10px; }
        .club-readinessGrid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .club-readinessItem { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 13px; display: grid; gap: 4px; min-width: 0; padding: 10px; }
        .club-readinessItem span { color: #64748b; font-size: 11px; font-weight: 900; }
        .club-readinessItem b { color: #17253f; font-size: 20px; font-weight: 950; line-height: 1; }
        .club-readinessItem--ready { background: #f0fdf4; border-color: rgba(22,163,74,.18); }
        .club-readinessItem--blocked { background: #fff1f2; border-color: rgba(190,18,60,.12); }
        .club-seedStatus { align-items: center; border-radius: 14px; display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 12px; }
        .club-seedStatus--ready { background: #ecfdf3; border: 1px solid rgba(22,163,74,.20); }
        .club-seedStatus--missing { background: #fff7df; border: 1px solid rgba(202,138,4,.18); }
        .club-seedStatus div:first-child { display: grid; gap: 4px; min-width: 0; }
        .club-seedStatus strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-seedStatus span { color: #64748b; font-size: 12px; font-weight: 750; line-height: 1.35; }
        .club-seedActions { align-items: center; display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-generateSeedBtn, .club-generateGroupsBtn, .club-generateMatchesBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; justify-content: center; min-height: 34px; padding: 8px 11px; transition: transform .16s ease, box-shadow .16s ease, background .16s ease, border-color .16s ease; white-space: nowrap; }
        .club-generateSeedBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-generateGroupsBtn { background: #f0fcff; border: 1px solid rgba(83,199,217,.42); color: #0f8ea0; }
        .club-generateMatchesBtn { background: #fff1f8; border: 1px solid rgba(190,24,93,.20); color: #be185d; }
        .club-generateSeedBtn:hover:not(:disabled), .club-generateGroupsBtn:hover:not(:disabled), .club-generateMatchesBtn:hover:not(:disabled) { box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-generateSeedBtn:hover:not(:disabled) { background: #79edf0; }
        .club-generateGroupsBtn:hover:not(:disabled) { background: #d9f8ff; border-color: rgba(15,142,160,.54); }
        .club-generateMatchesBtn:hover:not(:disabled) { background: #ffe4f1; border-color: rgba(190,24,93,.36); }
        .club-generateSeedBtn:disabled, .club-generateGroupsBtn:disabled, .club-generateMatchesBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-registrationsPanel, .club-placeholderPanel { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 10px; min-width: 0; padding: 12px; }
        .club-sectionHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .club-sectionHead h2, .club-placeholderPanel h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 3px 0 0; }
        .club-matchList { display: grid; gap: 12px; min-width: 0; }
        .club-matchSection { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 9px; min-width: 0; padding: 10px; }
        .club-matchSectionHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-matchSectionHead > div { display: grid; gap: 2px; min-width: 0; }
        .club-matchSectionHead strong { color: #17253f; font-size: 14px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchSectionHead span { color: #64748b; font-size: 12px; font-weight: 850; }
        .club-showMatchesBtn { background: #ecfeff; border: 1px solid rgba(6,182,212,.28); border-radius: 8px; color: #0e7490; cursor: pointer; flex: 0 0 auto; font-size: 12px; font-weight: 950; min-height: 32px; padding: 7px 10px; white-space: nowrap; }
        .club-showMatchesBtn:hover { background: #cffafe; }
        .club-matchSectionRows { display: grid; min-width: 0; }
        .club-groupStandings { background: #f8fafc; border: 1px solid rgba(15,23,42,.06); border-radius: 10px; display: grid; justify-self: center; max-width: 760px; min-width: 0; overflow: hidden; width: min(100%, 760px); }
        .club-groupStandingRow { align-items: center; border-bottom: 1px solid rgba(15,23,42,.06); display: grid; gap: 4px; grid-template-columns: 24px minmax(250px, 1fr) repeat(6, 30px); min-width: 0; padding: 6px 8px; }
        .club-groupStandingRow:last-child { border-bottom: 0; }
        .club-groupStandingRow span { color: #334155; font-size: 12px; font-weight: 850; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
        .club-groupStandingRow span:nth-child(2) { text-align: left; }
        .club-groupStandingRow--head { background: #fff; }
        .club-groupStandingRow--head span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-groupStandingTeam { align-items: center; display: flex; gap: 4px; }
        .club-groupStandingTeam > span { text-align: left; }
        .club-groupStandingTeam b { background: #ecfdf3; border-radius: 999px; color: #166534; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 3px 6px; white-space: nowrap; }
        .club-inlineNote { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-matchTable { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 11px; display: grid; justify-self: center; max-width: 760px; min-width: 0; overflow: hidden; width: min(100%, 760px); }
        .club-matchTableHead, .club-matchTableRow { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(120px, .74fr) minmax(180px, 1.12fr) minmax(152px, .72fr) minmax(96px, .42fr) minmax(120px, .48fr); min-width: 0; }
        .club-matchTableHead { background: #f8fafc; border-bottom: 1px solid rgba(15,23,42,.07); padding: 6px 8px; text-align: center; }
        .club-matchTableHead span { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-matchTableRow { border-bottom: 1px solid rgba(15,23,42,.06); padding: 5px 8px; }
        .club-matchTableRow:last-child { border-bottom: 0; }
        .club-matchInfoCell, .club-matchPairCell, .club-matchResultCell, .club-matchStatusCell, .club-matchActionCell { min-width: 0; }
        .club-matchInfoCell { display: grid; gap: 1px; justify-items: center; text-align: center; }
        .club-matchInfoCell strong { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchInfoCell span { color: #64748b; font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchPairCell { display: grid; gap: 2px; justify-items: center; text-align: center; }
        .club-matchTeams { align-items: center; display: grid; gap: 2px; grid-template-rows: 10px 24px 1px 24px; justify-items: center; min-width: 0; width: 100%; }
        .club-matchTeams::before { content: ''; display: block; height: 10px; }
        .club-matchTeams strong { align-items: center; color: #17253f; display: inline-flex; font-size: 12px; font-weight: 950; gap: 5px; justify-content: center; line-height: 1.15; max-width: 100%; min-width: 0; overflow: hidden; padding: 3px 7px; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchTeams strong.club-matchTeamWinner { background: rgba(22,163,74,.08); border: 1px solid rgba(22,163,74,.16); border-radius: 8px; color: #166534; }
        .club-matchTeams strong.club-matchTeamWinner::before { color: #16a34a; content: '✓'; font-size: 11px; font-weight: 950; }
        .club-matchTeams span { background: linear-gradient(90deg, transparent, rgba(6,182,212,.42), transparent); display: block; height: 1px; width: min(150px, 78%); }
        .club-result { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-result--muted { color: #94a3b8; }
        .club-matchResultCell { align-items: center; display: flex; flex-wrap: nowrap; gap: 6px; justify-content: center; min-width: 152px; overflow: visible; text-align: center; }
        .club-matchStatusCell { align-content: center; align-items: center; display: grid; justify-items: center; min-height: 100%; text-align: center; }
        .club-matchActionCell { align-content: center; align-items: center; display: grid; justify-items: center; min-height: 100%; text-align: center; }
        .club-groupResultBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; gap: 5px; justify-content: center; min-height: 28px; padding: 0 10px; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, color .18s ease, transform .18s ease; white-space: nowrap; }
        .club-groupResultBtn--primary { background: #29aae1; border: 1px solid #29aae1; box-shadow: 0 4px 10px rgba(41,170,225,.14); color: #fff; }
        .club-groupResultBtn--primary:hover { background: #2499cb; border-color: #2499cb; box-shadow: 0 6px 14px rgba(41,170,225,.20); transform: translateY(-1px); }
        .club-groupResultBtn--secondary { background: transparent; border: 1px solid rgba(41,170,225,.76); color: #29aae1; }
        .club-groupResultBtn--secondary:hover { background: rgba(41,170,225,.07); border-color: #2499cb; box-shadow: 0 4px 10px rgba(41,170,225,.08); color: #157eae; transform: translateY(-1px); }
        .club-groupResultBtn:disabled { cursor: not-allowed; opacity: .58; transform: none; }
        .club-scoreBoard { color: #17253f; display: grid; gap: 3px; grid-template-rows: auto auto auto; justify-items: center; line-height: 1; min-width: 148px; width: max-content; }
        .club-scoreBoardLabels, .club-scoreBoardRow { align-items: center; display: flex; flex-wrap: nowrap; gap: 6px; justify-content: center; overflow: visible; white-space: nowrap; }
        .club-scoreLabel { color: #94a3b8; display: inline-flex; font-size: 9px; font-weight: 950; justify-content: center; letter-spacing: .02em; min-width: 30px; text-transform: uppercase; }
        .club-scoreBoard .club-scoreSet { align-items: center; background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 6px; color: #64748b; display: inline-flex; font-size: 13px; font-weight: 600; height: 28px; justify-content: center; min-width: 30px; width: 30px; }
        .club-scoreBoard .club-scoreSet--won { background: #f8fafc; border-color: #dbe3ea; color: #64748b; font-weight: 800; }
        .club-scoreBoard .club-scoreSet--lost { color: #64748b; font-weight: 600; }
        .club-miniHint { color: #64748b; font-size: 12px; font-weight: 850; white-space: nowrap; }
        .club-registrationList { border: 1px solid rgba(15,23,42,.07); border-radius: 13px; display: grid; overflow: hidden; }
        .club-registrationMiniHead { align-items: center; background: linear-gradient(180deg, #f8fbfd 0%, #f2f7fa 100%); border-bottom: 1px solid rgba(15,23,42,.07); color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 10px; grid-template-columns: minmax(240px, 1.45fr) minmax(116px, .52fr) minmax(94px, .42fr) minmax(94px, .42fr) minmax(78px, .3fr) minmax(88px, .34fr) minmax(152px, .62fr); letter-spacing: .02em; min-width: 0; padding: 9px 12px; text-transform: uppercase; }
        .club-registrationMiniHead span:nth-child(5), .club-registrationMiniHead span:nth-child(6), .club-registrationMiniHead span:nth-child(7) { justify-self: end; }
        .club-registrationMiniRow { align-items: center; background: #fff; border-bottom: 1px solid rgba(15,23,42,.07); display: grid; gap: 10px; grid-template-columns: minmax(240px, 1.45fr) minmax(116px, .52fr) minmax(94px, .42fr) minmax(94px, .42fr) minmax(78px, .3fr) minmax(88px, .34fr) minmax(152px, .62fr); min-width: 0; padding: 9px 12px; }
        .club-registrationMiniRow:last-child { border-bottom: 0; }
        .club-teamMini { display: grid; gap: 2px; min-width: 0; }
        .club-teamLinks { align-items: center; display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
        .club-teamLinkItem { align-items: center; display: inline-flex; gap: 4px; min-width: 0; }
        .club-teamLink { background: rgba(105,223,227,.08); border: 1px solid rgba(83,199,217,.18); border-radius: 999px; color: #0f7180; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 950; line-height: 1.1; overflow: hidden; padding: 4px 8px; text-decoration: none; text-overflow: ellipsis; transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease; white-space: nowrap; }
        .club-teamLink:hover { background: #effcff; border-color: rgba(15,142,160,.34); box-shadow: 0 0 0 1px rgba(15,142,160,.06); color: #0f8ea0; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
        .club-teamSeparator { color: #94a3b8; flex: 0 0 auto; font-size: 12px; font-weight: 900; }
        .club-teamMini span, .club-seedMini span, .club-scoreMini span { color: #64748b; font-size: 11px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-dateMini { display: grid; gap: 2px; min-width: 0; }
        .club-dateMini strong { color: #17253f; font-size: 12px; font-weight: 900; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-dateMini span { color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .club-statusBadge--confirmed { background: #ecfdf3; color: #166534; }
        .club-statusBadge--pending { background: #fff7df; color: #854d0e; }
        .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-statusBadge--played { background: #ecfdf3; color: #166534; }
        .club-paymentBadge { border-radius: 999px; font-size: 10px; font-weight: 950; justify-self: start; padding: 5px 7px; white-space: nowrap; }
        .club-paymentBadge--paid { background: #ecfdf3; color: #166534; }
        .club-paymentBadge--pending { background: #fff7df; color: #854d0e; }
        .club-paymentBadge--failed { background: #fff1f2; color: #9f1239; }
        .club-paymentBadge--empty { background: #f1f5f9; color: #475569; }
        .club-seedMini { display: grid; gap: 2px; justify-items: end; min-width: 0; }
        .club-seedMini strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-scoreMini { display: grid; gap: 2px; justify-items: end; min-width: 0; }
        .club-scoreMini strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-registrationActions { display: flex; gap: 6px; justify-content: flex-end; justify-self: end; }
        .club-viewBtn { min-height: 32px; padding: 7px 10px; }
        .club-tabEmpty { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 850; padding: 12px; }
        .club-placeholderPanel p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-groupSummaryGrid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-groupSummaryCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-groupSummaryCard span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-groupSummaryCard strong { color: #17253f; font-size: 20px; font-weight: 950; line-height: 1.1; }
        .club-groupSummaryCard--ready { background: #ecfdf3; border-color: rgba(22,163,74,.16); }
        .club-groupsCardsGrid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .club-groupCardDetailed { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-groupCardHead { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
        .club-groupCardHead h2 { color: #17253f; font-size: 18px; line-height: 1.1; margin: 3px 0 0; }
        .club-groupCapacity { background: #f0fcff; border: 1px solid rgba(83,199,217,.24); border-radius: 999px; color: #0f7180; flex: 0 0 auto; font-size: 12px; font-weight: 950; padding: 6px 9px; }
        .club-groupTeamsList { display: grid; gap: 8px; }
        .club-groupTeamItem { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
        .club-groupTeamMain { min-width: 0; }
        .club-groupTeamMain strong { color: #17253f; display: block; font-size: 13px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-groupTeamMeta { display: flex; flex-wrap: wrap; gap: 6px; }
        .club-groupMetaPill { background: #e9fbff; border: 1px solid rgba(83,199,217,.22); border-radius: 999px; color: #0f7180; font-size: 11px; font-weight: 900; padding: 5px 8px; }
        .club-groupMetaPill--neutral { background: #fff; border-color: rgba(15,23,42,.08); color: #475569; }
        .club-playoffPodium { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-playoffPodiumCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-playoffPodiumCard--winner { background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%); border-color: rgba(22,163,74,.16); }
        .club-playoffPodiumCard span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-playoffPodiumCard strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffSummaryText { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.4; margin: 0; }
        .club-playoffMatchesSection { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; padding: 12px; }
        .club-playoffMatchesList { display: grid; gap: 10px; }
        .club-playoffMatchCard { background: linear-gradient(135deg, #ffffff 0%, #f8fbfd 100%); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-playoffMatchCard--summary { background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); }
        .club-playoffMatchHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
        .club-playoffPhase { background: #e9fbff; border: 1px solid rgba(83,199,217,.24); border-radius: 999px; color: #0f7180; display: inline-flex; font-size: 11px; font-weight: 950; padding: 6px 9px; text-transform: uppercase; }
        .club-playoffTeams { display: grid; gap: 4px; justify-items: start; min-width: 0; }
        .club-playoffTeams strong { color: #17253f; font-size: 15px; font-weight: 950; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffTeams span { color: #64748b; font-size: 12px; font-weight: 850; text-transform: uppercase; }
        .club-playoffFooter { align-items: center; color: #475569; display: flex; flex-wrap: wrap; gap: 8px 14px; justify-content: space-between; }
        .club-playoffFooter span { font-size: 13px; font-weight: 850; }
        .club-playoffFooter b { color: #17253f; font-size: 12px; font-weight: 950; white-space: nowrap; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-primaryBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-primaryBtn:hover { background: #7be8eb; border-color: rgba(15,23,42,.18); box-shadow: 0 8px 18px rgba(15,142,160,.14); transform: translateY(-1px); }
        .club-primaryBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-primaryBtn:disabled:hover { background: #69dfe3; border-color: rgba(15,23,42,.10); box-shadow: none; transform: none; }
        .club-secondaryBtn { background: #f0fcff; border: 1px solid rgba(83,199,217,.40); color: #0f8ea0; }
        .club-secondaryBtn:hover { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-secondaryBtn:disabled:hover { background: #f0fcff; border-color: rgba(83,199,217,.40); box-shadow: none; transform: none; }
        .club-secondaryBtn--compact { min-height: 30px; padding: 6px 10px; }
        .club-publishBtn { border-color: rgba(15,23,42,.16); box-shadow: 0 10px 22px rgba(15,142,160,.16); }
        .club-publishBtn:hover:not(:disabled) { box-shadow: 0 12px 26px rgba(15,142,160,.20); }
        .club-publishBtn:disabled { cursor: not-allowed; opacity: .62; transform: none; }
        .club-message { background: #eef8ff; border: 1px solid #b8dff1; border-radius: 12px; color: #164e63; font-weight: 850; padding: 10px 12px; }
        .club-actionMessage { background: #ecfdf3; border: 1px solid rgba(22,163,74,.22); border-radius: 12px; color: #166534; font-size: 13px; font-weight: 900; margin-bottom: 12px; padding: 10px 12px; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.42); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-pointsModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 520px; min-width: 0; padding: 16px; width: min(520px, 100%); }
        .club-pointsHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-pointsHead h2 { color: #17253f; font-size: 20px; line-height: 1.1; margin: 4px 0 0; }
        .club-pointsList { border: 1px solid rgba(15,23,42,.08); border-radius: 12px; overflow: hidden; }
        .club-pointsRow { align-items: center; background: #fff; border-bottom: 1px solid rgba(15,23,42,.07); display: flex; gap: 12px; justify-content: space-between; padding: 10px 12px; }
        .club-pointsRow:last-child { border-bottom: 0; }
        .club-pointsRow span { color: #334155; font-size: 13px; font-weight: 900; text-transform: capitalize; }
        .club-pointsRow strong { color: #0f8ea0; font-size: 14px; font-weight: 950; white-space: nowrap; }
        .club-pointsEmpty { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 6px; padding: 12px; }
        .club-pointsEmpty strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-pointsEmpty p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-manualModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 620px; min-width: 0; padding: 16px; width: min(620px, 100%); }
        .club-manualHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-manualHead h2 { color: #17253f; font-size: 22px; line-height: 1.1; margin: 4px 0 6px; }
        .club-manualHead p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-modalClose { align-items: center; background: #f0fcff; border: 1px solid rgba(83,199,217,.40); border-radius: 8px; color: #0f8ea0; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; justify-content: center; min-height: 34px; padding: 8px 11px; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .club-modalClose:hover:not(:disabled) { background: #d9f8ff; border-color: rgba(15,142,160,.56); box-shadow: 0 8px 18px rgba(15,142,160,.12); transform: translateY(-1px); }
        .club-modalClose:disabled { cursor: not-allowed; opacity: .58; }
        .club-manualGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-manualField { display: grid; gap: 6px; min-width: 0; }
        .club-manualField > span, .club-checkRow { color: #334155; font-size: 12px; font-weight: 950; }
        .club-manualField input, .club-manualField select { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font-size: 13px; font-weight: 850; min-height: 38px; outline: none; padding: 9px 10px; width: 100%; }
        .club-manualField input:focus, .club-manualField select:focus { border-color: rgba(83,199,217,.70); box-shadow: 0 0 0 3px rgba(83,199,217,.12); }
        .club-autocomplete { display: grid; gap: 6px; min-width: 0; position: relative; }
        .club-selectedPlayer { background: #ecfdf3; border: 1px solid rgba(22,163,74,.18); border-radius: 9px; color: #166534; font-size: 11px; font-weight: 900; padding: 7px 8px; }
        .club-suggestionBox { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 12px; box-shadow: 0 14px 34px rgba(15,23,42,.10); display: grid; gap: 4px; max-height: 238px; overflow: auto; padding: 6px; z-index: 2; }
        .club-suggestionItem { align-items: center; background: #fff; border: 1px solid transparent; border-radius: 10px; cursor: pointer; display: flex; gap: 8px; justify-content: space-between; min-width: 0; padding: 8px; text-align: left; transition: background .16s ease, border-color .16s ease, transform .16s ease; }
        .club-suggestionItem:hover:not(:disabled) { background: #f0fcff; border-color: rgba(83,199,217,.28); transform: translateY(-1px); }
        .club-suggestionItem:disabled { cursor: not-allowed; opacity: .45; }
        .club-suggestionItem strong { color: #17253f; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-suggestionItem span { color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-suggestionHint { background: #f8fafc; border-radius: 9px; color: #64748b; font-size: 11px; font-weight: 850; padding: 8px; }
        .club-checkRow { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: flex; gap: 8px; padding: 10px; }
        .club-checkRow input { accent-color: #0f8ea0; }
        .club-modalActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-confirmModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 460px; min-width: 0; padding: 16px; width: min(460px, 100%); }
        .club-confirmModal h2 { color: #17253f; font-size: 20px; line-height: 1.1; margin: 4px 0 8px; }
        .club-confirmModal p { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.4; margin: 0; }
        .club-confirmField { display: grid; gap: 8px; }
        .club-confirmField span { color: #475569; font-size: 12px; font-weight: 850; line-height: 1.4; }
        .club-confirmField input { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font-size: 13px; font-weight: 850; min-height: 38px; outline: none; padding: 9px 10px; width: 100%; }
        .club-confirmField input:focus { border-color: rgba(190,24,93,.50); box-shadow: 0 0 0 3px rgba(244,114,182,.12); }
        .club-confirmActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-dangerConfirmBtn { background: #ffe4f1; border-color: rgba(190,24,93,.28); color: #be185d; }
        .club-dangerConfirmBtn:hover:not(:disabled) { background: #ffd6ea; border-color: rgba(190,24,93,.42); box-shadow: 0 8px 18px rgba(190,24,93,.14); }
        .club-registrationDetailModal { max-width: 620px; width: min(620px, 100%); }
        .club-registrationDetailGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-registrationDetailCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; min-width: 0; padding: 10px; }
        .club-registrationDetailCard span { color: #64748b; font-size: 11px; font-weight: 900; }
        .club-registrationDetailCard strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-registrationAlerts { display: flex; flex-wrap: wrap; gap: 6px; }
        .club-registrationAlerts span { background: #fff7df; border: 1px solid rgba(202,138,4,.16); border-radius: 999px; color: #854d0e; font-size: 11px; font-weight: 900; padding: 5px 8px; }
        .club-paymentActionsGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-resultModal { max-width: 680px; width: min(680px, 100%); }
        .club-resultForm { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 10px; min-width: 0; padding: 10px; }
        .club-legacyScoreNotice { background: #fff7df; border: 1px solid rgba(202,138,4,.22); border-radius: 9px; color: #854d0e; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-legacyScoreNotice b { color: #713f12; }
        .club-scoreGrid { display: grid; gap: 6px; grid-template-columns: minmax(86px, .5fr) minmax(0, 1fr) minmax(0, 1fr); min-width: 0; }
        .club-scoreHead { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-scoreRow { display: contents; }
        .club-scoreRow > span { align-self: center; color: #17253f; font-size: 12px; font-weight: 950; }
        .club-scoreInput { min-height: 34px; min-width: 0; }
        .club-resultSummary { background: #fff; border: 1px solid rgba(15,23,42,.06); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-resultSummary b { color: #0f766e; }
        .club-resultActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-flyerModal { max-width: 780px; width: min(780px, 100%); }
        .club-flyerModalBody { min-width: 0; }
        @media (max-width: 900px) {
          .club-detailHero, .club-actionsCard { display: grid; }
          .club-championCard { grid-template-columns: 1fr; }
          .club-runnerUp { width: 100%; }
          .club-detailBadges, .club-actionGrid { align-items: flex-start; justify-content: flex-start; }
          .club-stepper { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .club-summaryGrid { grid-template-columns: 1fr; }
          .club-metrics--detail { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-readinessGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-groupSummaryGrid { grid-template-columns: 1fr; }
          .club-playoffPodium { grid-template-columns: 1fr; }
          .club-seedStatus { align-items: flex-start; flex-direction: column; }
          .club-manualGrid { grid-template-columns: 1fr; }
          .club-registrationMiniHead { display: none; }
          .club-registrationMiniRow { grid-template-columns: minmax(0, 1fr) repeat(3, auto); }
          .club-dateMini { justify-items: start; }
          .club-seedMini, .club-scoreMini { justify-items: start; }
          .club-registrationActions { justify-self: start; }
          .club-registrationDetailGrid { grid-template-columns: 1fr; }
          .club-paymentActionsGrid { grid-template-columns: 1fr; }
          .club-matchSectionHead { align-items: flex-start; flex-direction: column; }
        }
        @media (max-width: 560px) {
          .club-title { font-size: 24px; }
          .club-stepper, .club-metrics--detail { grid-template-columns: 1fr; }
          .club-detailTopbar { align-items: flex-start; flex-direction: column; }
          .club-topbarActions { justify-content: flex-start; }
          .flyerPreview--modal { min-height: 460px; }
          .flyerPreview--modal .flyerPreviewMain h3 { font-size: 28px; }
          .club-matchTableHead { display: none; }
          .club-matchTableRow { align-items: start; gap: 6px; grid-template-columns: 1fr; padding: 7px; }
          .club-matchInfoCell { background: #f8fafc; border-radius: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 7px; }
          .club-matchInfoCell strong { grid-column: 1 / -1; }
          .club-matchTeams strong, .club-result { white-space: normal; }
          .club-matchResultCell, .club-matchActionCell { justify-items: center; }
          .club-groupStandings { width: 100%; }
          .club-groupStandingRow { gap: 2px; grid-template-columns: 20px minmax(112px, 1fr) repeat(6, 23px); padding: 6px 5px; }
          .club-groupStandingRow span { font-size: 11px; }
          .club-groupStandingTeam b { display: none; }
        }
      `}</style>
    </div>
  )
}
