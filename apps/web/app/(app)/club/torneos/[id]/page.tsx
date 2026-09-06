'use client'

import Link from 'next/link'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, MoreVertical, Repeat2 } from 'lucide-react'
import MobilePlayoff from '../_components/MobilePlayoff'
import { hasClubCapability } from '@/lib/clubPermissions'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { ActionFeedbackNotice, type ActionFeedbackTone } from '@/components/ui/ActionFeedbackNotice'
import {
  calculateScheduleCapacity,
  normalizeScheduleConfig,
  normalizeTournamentCourts,
  type ScheduleConfig,
  type TournamentCourtConfig,
} from '@/lib/tournamentSchedule'
import { TournamentFlyerPreviewCard, defaultFlyerConfig, readFlyerConfigFromRules, type FlyerConfig } from '../_components/TournamentFlyerConfigurator'
import { TournamentLiveAgendaTab } from '../_components/TournamentLiveAgendaTab'
import { calculateTournamentGroupStandings, resolveTournamentClassificationRules } from '@/lib/tournamentStandings'
import { getOpenGroupMatchDisplayCode } from '@/lib/tournamentOpen/groupFixtures'
import { isValidNormalSet, isValidSuperTiebreak, validateStructuredMatchScore, type ScoreValidationResult, type StructuredMatchScore } from '@/lib/tournamentScore'
import { buildTournamentOperationalNotices, type TournamentOperationalNotice, type TournamentOperationalNoticeScope } from '@/lib/tournamentOperationalNotices'
import {
  getTournamentOperationalStatus,
  isTournamentRegistrationClosed,
  isTournamentRegistrationOpen,
  type OperationalStage,
} from '@/lib/tournamentDisplayStatus'
import {
  formatBranchLabel,
  formatTournamentSystemLabel,
  formatTournamentTypeLabel,
} from '@/lib/tournamentLabels'

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
    circuit?: {
      series_id: string
      series_name: string
      event_id: string
      event_number: number | null
      planned_events_count: number | null
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

type TournamentRuleSchedule = {
  scheduleConfig: ScheduleConfig
  tournamentCourts: TournamentCourtConfig[]
}

type TournamentTab = 'general' | 'agenda' | 'inscriptos' | 'seed' | 'grupos' | 'playoff'

type Registration = {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  admission_status: 'NONE' | 'MANUAL_PAYMENT_VALIDATED' | 'PAY_AT_VENUE_APPROVED' | 'EXCEPTION_APPROVED' | 'BLOCKED'
  admission_reason: string | null
  payment_status: 'SIN_PAGO' | 'PENDIENTE' | 'PAGADO' | 'FALLIDO'
  payment_method?: string | null
  operational_payment?: null | {
    id: string
    method: string | null
    status: string | null
    amount: number | null
    requested_at: string | null
    approved_at: string | null
    paid_at: string | null
    created_at: string
  }
  registration_change_request?: null | {
    id: string
    type: string
    status: string
    reason: string | null
    refund_percent: number | null
    refund_policy_label: string | null
    created_at: string
    resolved_at: string | null
  }
  eligible: boolean
  alerts: string[]
  estimated_team_score: number
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
      ranking_points?: number | null
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
  court_name?: string | null
  court_id?: string | null
  court_source?: string | null
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

type ScheduleSwapModal = {
  sourceMatchId: string
  targetMatchId: string
  error: string
} | null

type ConfirmAction = {
  title: string
  body: string
  confirmLabel: string
  tone?: 'cyan' | 'magenta'
  confirmationKeyword?: string
  onConfirm: () => Promise<void>
} | null

type CancelTournamentModalState = {
  warning?: string | null
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

type TournamentDisplayConfig = {
  segmentType: 'LIBRES' | 'MENORES' | 'VETERANOS'
  publicDescription: string | null
  competitionSystem: 'GROUPS_PLAYOFF' | 'ROUND_ROBIN' | 'SINGLE_ELIMINATION'
  venueName: string | null
  pointsConfig: {
    enabled: boolean
    winner: number
    finalist: number
    semifinalist: number
    quarterfinalist: number
    eighthFinalist: number
    participation: number
  }
}

type PlayoffRoundColumn = {
  phase: string
  label: string
  matches: TournamentMatch[]
  slots: PlayoffVisualSlot[]
  placeholder?: string | null
  teamsCount: number
  visualRows: number
}

type PlayoffVisualSlot = {
  id: string
  kind: 'match' | 'placeholder' | 'bye'
  label: string
  match?: TournamentMatch
  placeholderTeams?: [PlayoffVisualTeamSlot | null, PlayoffVisualTeamSlot | null]
  byeTeam?: PlayoffVisualTeamSlot | null
  slotOrder: number
  visualRowSpan: number
  visualRowStart: number
}

type PlayoffVisualTeamSlot = {
  teamId: string
  teamName: string
  seed?: number | null
}

type GeneralPlayoffPlanSlot = {
  position?: number
  pair_order?: number
  pair_slot?: number
  advances_to_match_order?: number
  is_bye_slot?: boolean
  team_id?: string | null
  global_seed?: number | null
}

type GeneralPlayoffPlanFirstRoundMatch = {
  phase?: string | null
  match_order?: number | null
  bracket_pair_order?: number | null
  slot_positions?: number[] | null
  team1_id?: string | null
  team2_id?: string | null
}

type GeneralPlayoffPlan = {
  version?: number
  source?: string
  bracket_size?: number
  byes?: number
  bracket_slots?: GeneralPlayoffPlanSlot[]
  first_round_matches?: GeneralPlayoffPlanFirstRoundMatch[]
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

type CourtSource = 'OWN_CLUB' | 'EXTERNAL_COMPLEX'

type ComplexOption = {
  id: string
  name: string
  courtsCount: number
}

type CourtDraft = {
  complexId: string
  courtName: string
}

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

function paymentLabel(registration: Registration) {
  if (registration.payment_status === 'PENDIENTE' && registration.payment_method === 'CASH_ON_SITE_REQUEST') {
    return 'Pago en club pendiente'
  }
  return paymentLabels[registration.payment_status]
}

function paymentMethodLabel(method?: string | null) {
  const key = String(method ?? '').toUpperCase()
  if (key === 'CASH_ON_SITE_REQUEST') return 'Pago en club'
  if (key === 'BANK_TRANSFER') return 'Transferencia'
  if (key === 'MERCADO_PAGO') return 'Mercado Pago'
  return method || 'Sin método'
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

function parseTournamentDate(value?: string | null) {
  if (!value) return null
  const localDateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (localDateTimeMatch) {
    const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] = localDateTimeMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    )
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = parseTournamentDate(value)
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  const date = parseTournamentDate(value)
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', ' ·')
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

function getResultScoreInputKey(index: 0 | 1 | 2, side: 'team1' | 'team2') {
  return `set-${index}-${side}`
}

function getResultSuperTiebreakInputKey(side: 'team1' | 'team2') {
  return `super-${side}`
}

function markResultSetError(invalidInputs: Set<string>, index: 0 | 1 | 2) {
  invalidInputs.add(getResultScoreInputKey(index, 'team1'))
  invalidInputs.add(getResultScoreInputKey(index, 'team2'))
}

function markResultSuperTiebreakError(invalidInputs: Set<string>) {
  invalidInputs.add(getResultSuperTiebreakInputKey('team1'))
  invalidInputs.add(getResultSuperTiebreakInputKey('team2'))
}

function hasAnyResultFormScoreValue(form: ResultForm) {
  return form.sets.some(hasAnyScoreValue) || hasAnyScoreValue(form.superTiebreak)
}

function getResultErrorState(form: ResultForm, phase: string | null | undefined, validation: ScoreValidationResult | null) {
  const invalidInputs = new Set<string>()
  if (!validation || validation.ok || !hasAnyResultFormScoreValue(form)) {
    return { hasError: false, invalidInputs }
  }

  const group = String(phase ?? '').toUpperCase() === 'GROUP'
  const code = validation.code

  for (const index of [0, 1] as const) {
    const set = toStructuredSet(form.sets[index])
    if (!isValidNormalSet(set.team1, set.team2)) {
      markResultSetError(invalidInputs, index)
    }
  }

  const thirdSet = toStructuredSet(form.sets[2])
  if (hasAnyScoreValue(form.sets[2]) && !isValidNormalSet(thirdSet.team1, thirdSet.team2)) {
    markResultSetError(invalidInputs, 2)
  }

  const superTiebreak = toSuperTiebreak(form.superTiebreak)
  if (hasAnyScoreValue(form.superTiebreak) && !isValidSuperTiebreak(superTiebreak.team1, superTiebreak.team2)) {
    markResultSuperTiebreakError(invalidInputs)
  }

  if (code === 'THIRD_PARTIAL_REQUIRED') {
    if (group) markResultSuperTiebreakError(invalidInputs)
    else markResultSetError(invalidInputs, 2)
  }

  if (code === 'THIRD_PARTIAL_NOT_ALLOWED') {
    if (hasAnyScoreValue(form.superTiebreak)) markResultSuperTiebreakError(invalidInputs)
    if (hasAnyScoreValue(form.sets[2])) markResultSetError(invalidInputs, 2)
  }

  if (code === 'INVALID_SUPER_TIEBREAK') {
    markResultSuperTiebreakError(invalidInputs)
  }

  if (invalidInputs.size === 0) {
    markResultSetError(invalidInputs, 0)
    markResultSetError(invalidInputs, 1)
  }

  return { hasError: true, invalidInputs }
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
    participation: 'Participación / zona',
  }
  const cleanValue = value.toLowerCase()
  return map[cleanValue] ?? value.replaceAll('_', ' ')
}

function formatPlayoffPhaseLabel(value?: string | null) {
  const cleanValue = String(value ?? '').trim().toUpperCase()
  const map: Record<string, string> = {
    FINAL: 'Final',
    SEMI: 'Semifinales',
    QUARTER: 'Cuartos',
    EIGHTHS: 'Octavos',
    ROUND_OF_16: '16avos',
    ROUND_OF_32: '32avos',
  }
  return map[cleanValue] ?? (value ? value.replaceAll('_', ' ') : 'Playoff')
}

const playoffPhaseOrder = ['ROUND_OF_32', 'ROUND_OF_16', 'EIGHTHS', 'QUARTER', 'SEMI', 'FINAL'] as const
type PlayoffPhase = (typeof playoffPhaseOrder)[number]
const PLAYOFF_CARD_HEIGHT = 156
const PLAYOFF_ROUND_GAP = 18
const PLAYOFF_CONNECTOR_WIDTH = 44
const BRACKET_LINE_WIDTH = 2
const BRACKET_LINE_COLOR = 'var(--club-admin-accent)'

function getPlayoffPhaseIndex(phase?: string | null) {
  const cleanPhase = String(phase ?? '').trim().toUpperCase()
  const foundIndex = playoffPhaseOrder.indexOf(cleanPhase as (typeof playoffPhaseOrder)[number])
  return foundIndex >= 0 ? foundIndex : Number.MAX_SAFE_INTEGER
}

function getPlayoffStartPhaseFromBracketSize(bracketSize: number): PlayoffPhase | null {
  if (bracketSize === 64) return 'ROUND_OF_32'
  if (bracketSize === 32) return 'ROUND_OF_16'
  if (bracketSize === 16) return 'EIGHTHS'
  if (bracketSize === 8) return 'QUARTER'
  if (bracketSize === 4) return 'SEMI'
  if (bracketSize === 2) return 'FINAL'
  return null
}

function readGeneralPlayoffPlan(rules?: Record<string, unknown> | null): GeneralPlayoffPlan | null {
  const plan = rules?.playoff_plan
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null
  const safePlan = plan as GeneralPlayoffPlan
  if (safePlan.source !== 'general_engine') return null
  if (!safePlan.bracket_size || !Array.isArray(safePlan.bracket_slots) || !Array.isArray(safePlan.first_round_matches)) {
    return null
  }
  return safePlan
}

function sortPlayoffMatchesForBracket(matches: TournamentMatch[]) {
  return [...matches].sort((a, b) => {
    const orderA = a.match_order || a.round || 0
    const orderB = b.match_order || b.round || 0
    if (orderA !== orderB) return orderA - orderB
    return String(a.id).localeCompare(String(b.id))
  })
}

function getPlayoffSourceOrders(slotOrder: number) {
  return [(slotOrder * 2) - 1, slotOrder * 2] as const
}

function splitTeamPlayerNames(name: string) {
  const parts = name
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length > 1 ? parts.slice(0, 2) : [name]
}

function extractStructuredScoreSets(score?: Record<string, unknown> | null) {
  if (!score) return []

  return [
    ...(Array.isArray(score.sets) ? score.sets : []),
    score.super_tiebreak,
  ]
    .map((set) => {
      if (!set || typeof set !== 'object') return null
      const row = set as Record<string, unknown>
      const team1 = row.team1
      const team2 = row.team2
      return typeof team1 === 'number' && typeof team2 === 'number' ? { team1, team2 } : null
    })
    .filter((set): set is { team1: number; team2: number } => Boolean(set))
}

function readTournamentDisplayConfig(rules?: Record<string, unknown> | null): TournamentDisplayConfig {
  const safeRules = rules ?? {}
  const pointsConfig = typeof safeRules.points_config === 'object' && safeRules.points_config && !Array.isArray(safeRules.points_config)
    ? safeRules.points_config as Record<string, unknown>
    : {}

  const segmentType = safeRules.segment_type === 'MENORES' || safeRules.segment_type === 'VETERANOS'
    ? safeRules.segment_type
    : 'LIBRES'

  const competitionSystem = safeRules.competition_system === 'ROUND_ROBIN' || safeRules.competition_system === 'SINGLE_ELIMINATION'
    ? safeRules.competition_system
    : 'GROUPS_PLAYOFF'

  return {
    segmentType,
    publicDescription: typeof safeRules.public_description === 'string' && safeRules.public_description.trim()
      ? safeRules.public_description.trim()
      : null,
    competitionSystem,
    venueName: typeof safeRules.venue_name === 'string' && safeRules.venue_name.trim()
      ? safeRules.venue_name.trim()
      : null,
    pointsConfig: {
      enabled: Boolean(pointsConfig.enabled),
      winner: Number(pointsConfig.winner ?? 0) || 0,
      finalist: Number(pointsConfig.finalist ?? 0) || 0,
      semifinalist: Number(pointsConfig.semifinalist ?? 0) || 0,
      quarterfinalist: Number(pointsConfig.quarterfinalist ?? 0) || 0,
      eighthFinalist: Number(pointsConfig.eighthFinalist ?? 0) || 0,
      participation: Number(pointsConfig.participation ?? 0) || 0,
    },
  }
}

function readTournamentRuleSchedule(
  rules?: Record<string, unknown> | null,
  fallback?: { startDate?: string | null; endDate?: string | null }
): TournamentRuleSchedule {
  const safeRules = rules ?? {}
  return {
    scheduleConfig: normalizeScheduleConfig(safeRules.schedule_config, fallback),
    tournamentCourts: normalizeTournamentCourts(safeRules.tournament_courts),
  }
}

function formatSegmentLabel(value: TournamentDisplayConfig['segmentType']) {
  if (value === 'MENORES') return 'Menores'
  if (value === 'VETERANOS') return 'Veteranos'
  return 'Libres'
}

function formatCompetitionSystemLabel(value: TournamentDisplayConfig['competitionSystem']) {
  return formatTournamentSystemLabel(value)
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

function getRegistrationOfficialScore(registration: Registration) {
  return registration.seed_snapshot?.team_score ?? null
}

function getRegistrationEstimatedScore(registration: Registration) {
  return registration.estimated_team_score ?? 0
}

function getRegistrationDisplayScore(registration: Registration) {
  return getRegistrationOfficialScore(registration) ?? getRegistrationEstimatedScore(registration)
}

function getRegistrationScoreLabel(registration: Registration) {
  return registration.seed_snapshot ? 'oficial' : 'estimado'
}

function buildManualPlayer(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return {}

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidPattern.test(trimmed)) return { user_id: trimmed }
  return { full_name: trimmed }
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
  return formatBranchLabel(value)
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
  const searchParams = useSearchParams()
  const tournamentId = params?.id
  const { activeClub, clubRole, isPlatformAdmin } = useSession()
  const [summary, setSummary] = useState<TournamentSummary | null>(null)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [finalizingTournament, setFinalizingTournament] = useState(false)
  const [deletingTournament, setDeletingTournament] = useState(false)
  const [pausingTournament, setPausingTournament] = useState(false)
  const [activeTab, setActiveTab] = useState<TournamentTab>('general')
  const [actionFeedback, setActionFeedback] = useState<{ tone: ActionFeedbackTone; title: string; message: string } | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [seedMeta, setSeedMeta] = useState<SeedMeta>(emptySeedMeta)
  const [loadingRegistrations, setLoadingRegistrations] = useState(false)
  const [generatingSeed, setGeneratingSeed] = useState(false)
  const [generatingGroups, setGeneratingGroups] = useState(false)
  const [generatingGroupMatches, setGeneratingGroupMatches] = useState(false)
  const [generatingOpenPlayoff, setGeneratingOpenPlayoff] = useState(false)
  const [generatingPlayoffFinal, setGeneratingPlayoffFinal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [confirmKeywordInput, setConfirmKeywordInput] = useState('')
  const [cancelTournamentModal, setCancelTournamentModal] = useState<CancelTournamentModalState>(null)
  const [cancelTournamentKeyword, setCancelTournamentKeyword] = useState('')
  const [cancelTournamentReason, setCancelTournamentReason] = useState('')
  const [cancellingTournament, setCancellingTournament] = useState(false)
  const [pointsModalOpen, setPointsModalOpen] = useState(false)
  const [flyerModalOpen, setFlyerModalOpen] = useState(false)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [tournamentDisplayConfig, setTournamentDisplayConfig] = useState<TournamentDisplayConfig>(() => readTournamentDisplayConfig(null))
  const [tournamentRules, setTournamentRules] = useState<Record<string, unknown> | null>(null)
  const [registrationDetailModal, setRegistrationDetailModal] = useState<RegistrationDetailModal>(null)
  const [registrationPaymentModal, setRegistrationPaymentModal] = useState<RegistrationPaymentModal>(null)
  const [savingRegistrationId, setSavingRegistrationId] = useState<string | null>(null)
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [groupMatches, setGroupMatches] = useState<TournamentMatch[]>([])
  const [playoffMatches, setPlayoffMatches] = useState<TournamentMatch[]>([])
  const [resultForm, setResultForm] = useState<ResultForm | null>(null)
  const [savingResult, setSavingResult] = useState(false)
  const [scheduleSwapModal, setScheduleSwapModal] = useState<ScheduleSwapModal>(null)
  const [savingScheduleSwap, setSavingScheduleSwap] = useState(false)
  const playoffBracketViewportRef = useRef<HTMLDivElement | null>(null)
  const playoffBracketScrollRef = useRef<HTMLDivElement | null>(null)
  const playoffBracketHoldRef = useRef<{
    direction: 'left' | 'right' | null
    timeoutId: number | null
    intervalId: number | null
  }>({ direction: null, timeoutId: null, intervalId: null })
  const playoffBracketDragRef = useRef<{
    isDragging: boolean
    pointerId: number | null
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
  }>({ isDragging: false, pointerId: null, startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0 })
  const [playoffBracketScrollState, setPlayoffBracketScrollState] = useState({ canScrollLeft: false, canScrollRight: false })
  const [playoffBracketNavState, setPlayoffBracketNavState] = useState({ isVisible: false, top: 0 })
  const [isDraggingPlayoffBracket, setIsDraggingPlayoffBracket] = useState(false)
  const [playoffBracketPreferredColumns, setPlayoffBracketPreferredColumns] = useState(3)
  const [playoffBracketZoom, setPlayoffBracketZoom] = useState(1)
  const [activePlayoffTeamId, setActivePlayoffTeamId] = useState<string | null>(null)
  const [expandedGroupMatches, setExpandedGroupMatches] = useState<string[]>([])
  const [bracketView, setBracketView] = useState<'tree' | 'compact'>('tree')
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [courtConfigModalOpen, setCourtConfigModalOpen] = useState(false)
  const [savingCourtConfig, setSavingCourtConfig] = useState(false)
  const [loadingComplexes, setLoadingComplexes] = useState(false)
  const [complexOptions, setComplexOptions] = useState<ComplexOption[]>([])
  const [tournamentCourtsDraft, setTournamentCourtsDraft] = useState<TournamentCourtConfig[]>([])
  const [courtDraft, setCourtDraft] = useState<CourtDraft>({ complexId: '', courtName: '' })
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
  const [actionMessage, setActionMessage] = useState('')
  const requestedTab = searchParams.get('tab')
  const highlightedRegistrationId = searchParams.get('registrationId')
  const highlightedChangeRequestId = searchParams.get('requestId')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (requestedTab === 'inscriptos' || highlightedRegistrationId || highlightedChangeRequestId) setActiveTab('inscriptos')
      const targetId = highlightedChangeRequestId
        ? `change-request-${highlightedChangeRequestId}`
        : highlightedRegistrationId
          ? `registration-${highlightedRegistrationId}`
          : null
      if (!targetId) return
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightedChangeRequestId, highlightedRegistrationId, requestedTab])

  const stageIndex = useMemo(
    () => (summary ? stageOrder.indexOf(summary.operationalStage) : -1),
    [summary]
  )
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () =>
      ({
        '--club-admin-accent': theme.vars.accent,
        '--club-admin-accent-2': theme.vars.accent2,
        '--club-admin-soft': theme.vars.soft,
        '--club-admin-glow': theme.vars.glow,
      }) as CSSProperties,
    [theme]
  )
  const isDraft = summary?.tournament.status?.toUpperCase() === 'DRAFT'
  const circuitBackTarget = summary?.tournament.circuit
    ? `/club/competition/series/${summary.tournament.circuit.series_id}?tab=dates`
    : '/club/torneos'
  const circuitBackLabel = summary?.tournament.circuit?.series_name ?? null
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
  const configuredPointRules = useMemo(
    () => tournamentDisplayConfig.pointsConfig.enabled
      ? [
          { rule_key: 'winner', points: tournamentDisplayConfig.pointsConfig.winner },
          { rule_key: 'finalist', points: tournamentDisplayConfig.pointsConfig.finalist },
          { rule_key: 'semifinalist', points: tournamentDisplayConfig.pointsConfig.semifinalist },
          { rule_key: 'quarterfinalist', points: tournamentDisplayConfig.pointsConfig.quarterfinalist },
          { rule_key: 'round_of_16', points: tournamentDisplayConfig.pointsConfig.eighthFinalist },
          { rule_key: 'participation', points: tournamentDisplayConfig.pointsConfig.participation },
        ]
      : [],
    [tournamentDisplayConfig]
  )
  const visiblePointRules = useMemo(
    () => configuredPointRules.length > 0 ? configuredPointRules : pointRules,
    [configuredPointRules, pointRules]
  )
  const championPointRule = useMemo(
    () => visiblePointRules.find((rule) => ['champion', 'winner', 'first_place', 'position_1', '1'].includes(rule.rule_key.toLowerCase())) ?? null,
    [visiblePointRules]
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
  const pendingOperationalPayments = useMemo(
    () => registrations.filter((row) => String(row.operational_payment?.status ?? '').toUpperCase() === 'PENDING'),
    [registrations]
  )
  const pendingChangeRequests = useMemo(
    () => registrations.filter((row) => String(row.registration_change_request?.status ?? '').toUpperCase() === 'PENDING'),
    [registrations]
  )
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
  const semifinalMatches = useMemo(
    () => playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === 'SEMI'),
    [playoffMatches]
  )
  const finalMatches = useMemo(
    () => playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === 'FINAL'),
    [playoffMatches]
  )
  const canGeneratePlayoffFinal = semifinalMatches.length >= 2 &&
    semifinalMatches.every((match) => String(match.status ?? '').toUpperCase() === 'PLAYED') &&
    finalMatches.length === 0 &&
    !summary?.champion
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
  const hasCompetitiveActivity = Boolean(
    summary &&
    (
      summary.counts.groups > 0 ||
      summary.counts.groupMatches.total > 0 ||
      summary.counts.playoffMatches > 0 ||
      summary.champion ||
      String(summary.final?.status ?? '').toUpperCase() === 'PLAYED'
    )
  )
  const deleteTournamentWarning = hasCompetitiveActivity
    ? 'Este torneo tiene grupos/partidos/resultados asociados. Se eliminarán datos vinculados.'
    : null
  const canCancelTournament = Boolean(summary) && String(summary?.tournament.status ?? '').toUpperCase() !== 'CANCELLED'
  const isTournamentPaused = String(summary?.tournament.status ?? '').toUpperCase() === 'PAUSED'
  const canPauseTournament = Boolean(summary) && ['OPEN', 'PAUSED'].includes(String(summary?.tournament.status ?? '').toUpperCase())
  const isTournamentOpen = Boolean(summary) && isTournamentRegistrationOpen({
    status: summary?.tournament.status,
    registrationDeadline: summary?.tournament.registration_deadline,
  })
  const isTournamentFinished =
    summary?.operationalStage === 'FINALIZADO' ||
    ['FINALIZADO', 'FINISHED'].includes(summary?.tournament.status?.toUpperCase() ?? '')
  const canFinalizeTournament = Boolean(summary?.champion) && !isTournamentFinished &&
    ['OPEN', 'RUNNING'].includes(String(summary?.tournament.status ?? '').toUpperCase())
  const canAddPair = Boolean(summary) && isTournamentOpen && !isTournamentFinished && !seedMeta.hasSeedSnapshot
  const sortedGroups = useMemo(
    () => [...groups].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
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
  const teamSeedLookup = useMemo(() => {
    const lookup = new Map<string, number>()

    groups.forEach((group) => {
      group.teams.forEach((entry) => {
        lookup.set(entry.team_id, entry.seed)
      })
    })

    registrations.forEach((registration) => {
      if (registration.team?.id && registration.seed_snapshot?.seed && !lookup.has(registration.team.id)) {
        lookup.set(registration.team.id, registration.seed_snapshot.seed)
      }
    })

    return lookup
  }, [groups, registrations])
  const teamNameLookup = useMemo(() => {
    const lookup = new Map<string, string>()

    groups.forEach((group) => {
      group.teams.forEach((entry) => {
        const players = entry.team?.players?.map((player) => player.full_name).join(' / ')
        if (players) lookup.set(entry.team_id, players)
      })
    })

    registrations.forEach((registration) => {
      const players = registration.team?.players?.map((player) => player.full_name).join(' / ')
      if (registration.team?.id && players && !lookup.has(registration.team.id)) {
        lookup.set(registration.team.id, players)
      }
    })

    return lookup
  }, [groups, registrations])
  const getPlayoffVisualWinner = (match?: TournamentMatch | null): PlayoffVisualTeamSlot | null => {
    if (!match || String(match.status ?? '').toUpperCase() !== 'PLAYED' || !match.winner_team_id) return null

    const teamName =
      match.winner_team_id === match.team1_id
        ? match.team1_name ?? teamNameLookup.get(match.team1_id) ?? 'Equipo 1'
        : match.winner_team_id === match.team2_id
          ? match.team2_name ?? teamNameLookup.get(match.team2_id) ?? 'Equipo 2'
          : teamNameLookup.get(match.winner_team_id) ?? 'Equipo'

    return {
      teamId: match.winner_team_id,
      teamName,
      seed: teamSeedLookup.get(match.winner_team_id) ?? null,
    }
  }
  const generalPlayoffPlan = useMemo(
    () => readGeneralPlayoffPlan(tournamentRules),
    [tournamentRules]
  )
  const getGeneralPlanTeamSlot = (teamId?: string | null, seed?: number | null): PlayoffVisualTeamSlot | null => {
    if (!teamId) return null
    return {
      teamId,
      teamName: teamNameLookup.get(teamId) ?? 'Por definir',
      seed: teamSeedLookup.get(teamId) ?? seed ?? null,
    }
  }
  const getPlayoffVisualAdvancer = (slot?: PlayoffVisualSlot | null): PlayoffVisualTeamSlot | null => {
    if (!slot) return null
    if (slot.kind === 'bye') return slot.byeTeam ?? null
    if (slot.kind === 'match') return getPlayoffVisualWinner(slot.match ?? null)
    return null
  }
  const playoffRounds = useMemo<PlayoffRoundColumn[]>(
    () => {
      if (generalPlayoffPlan) {
        const bracketSize = Number(generalPlayoffPlan.bracket_size)
        const firstRoundPhase = getPlayoffStartPhaseFromBracketSize(bracketSize)
        if (!firstRoundPhase) return []

        const visiblePhases = playoffPhaseOrder.slice(getPlayoffPhaseIndex(firstRoundPhase)) as PlayoffPhase[]
        const firstRoundPairCount = Math.max(1, bracketSize / 2)
        const firstRoundPlanMatches = new Map(
          (generalPlayoffPlan.first_round_matches ?? [])
            .map((match) => [Number(match.bracket_pair_order ?? match.match_order ?? 0), match] as const)
            .filter(([pairOrder]) => Number.isInteger(pairOrder) && pairOrder > 0)
        )
        const firstRoundRealMatchesByPairOrder = new Map<number, TournamentMatch>()

        for (const planMatch of generalPlayoffPlan.first_round_matches ?? []) {
          const planMatchOrder = Number(planMatch.match_order ?? 0)
          const bracketPairOrder = Number(planMatch.bracket_pair_order ?? planMatchOrder)
          const phase = String(planMatch.phase ?? firstRoundPhase).toUpperCase()
          const match = playoffMatches.find((candidate) =>
            String(candidate.phase ?? '').toUpperCase() === phase &&
            (candidate.match_order || candidate.round || 0) === planMatchOrder
          )
          if (match && bracketPairOrder > 0) firstRoundRealMatchesByPairOrder.set(bracketPairOrder, match)
        }

        const rounds = visiblePhases.reduce<PlayoffRoundColumn[]>((acc, phase, roundIndex) => {
          const matches = sortPlayoffMatchesForBracket(
            playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === phase)
          )
          const matchesByOrder = new Map(matches.map((match, matchIndex) => [
            match.match_order || match.round || matchIndex + 1,
            match,
          ]))
          const expectedMatches = Math.max(1, Math.ceil(firstRoundPairCount / 2 ** roundIndex))
          const visualRowSpan = Math.max(1, 2 ** roundIndex)
          const previousRound = acc[roundIndex - 1]
          const slots: PlayoffVisualSlot[] = Array.from({ length: expectedMatches }, (_, slotIndex) => {
            const slotOrder = slotIndex + 1
            const visualRowStart = slotIndex * visualRowSpan + 1

            if (roundIndex === 0) {
              const match = firstRoundRealMatchesByPairOrder.get(slotOrder) ?? null
              if (match) {
                return {
                  id: `match-${match.id}`,
                  kind: 'match',
                  label: `Partido ${slotOrder}`,
                  match,
                  slotOrder,
                  visualRowSpan,
                  visualRowStart,
                }
              }

              const planSlots = (generalPlayoffPlan.bracket_slots ?? [])
                .filter((slot) => Number(slot.pair_order) === slotOrder)
                .sort((left, right) => Number(left.pair_slot ?? 0) - Number(right.pair_slot ?? 0))
              const teamSlot = planSlots.find((slot) => slot.team_id)
              const hasByeSlot = planSlots.some((slot) => Boolean(slot.is_bye_slot))
              if (teamSlot?.team_id && hasByeSlot) {
                const byeTeam = getGeneralPlanTeamSlot(teamSlot.team_id, teamSlot.global_seed ?? null)
                return {
                  id: `bye-${phase}-${slotOrder}`,
                  kind: 'bye',
                  label: `Partido ${slotOrder}`,
                  placeholderTeams: [byeTeam, null],
                  byeTeam,
                  slotOrder,
                  visualRowSpan,
                  visualRowStart,
                }
              }

              const planMatch = firstRoundPlanMatches.get(slotOrder)
              return {
                id: `placeholder-${phase}-${slotOrder}`,
                kind: 'placeholder',
                label: `Partido ${slotOrder}`,
                placeholderTeams: [
                  getGeneralPlanTeamSlot(planMatch?.team1_id ?? null),
                  getGeneralPlanTeamSlot(planMatch?.team2_id ?? null),
                ],
                slotOrder,
                visualRowSpan,
                visualRowStart,
              }
            }

            const match = matchesByOrder.get(slotOrder) ?? null
            if (match) {
              return {
                id: `match-${match.id}`,
                kind: 'match',
                label: `Partido ${slotOrder}`,
                match,
                slotOrder,
                visualRowSpan,
                visualRowStart,
              }
            }

            const [firstSourceOrder, secondSourceOrder] = getPlayoffSourceOrders(slotOrder)
            return {
              id: `placeholder-${phase}-${slotOrder}`,
              kind: 'placeholder',
              label: `Partido ${slotOrder}`,
              placeholderTeams: [
                getPlayoffVisualAdvancer(previousRound?.slots[firstSourceOrder - 1]),
                getPlayoffVisualAdvancer(previousRound?.slots[secondSourceOrder - 1]),
              ],
              slotOrder,
              visualRowSpan,
              visualRowStart,
            }
          })

          acc.push({
            phase,
            label: formatPlayoffPhaseLabel(phase),
            matches,
            slots,
            placeholder: matches.length > 0 ? null : 'Pendiente de ganadores',
            teamsCount: expectedMatches * 2,
            visualRows: firstRoundPairCount,
          })
          return acc
        }, [])

        return rounds
      }

      const firstExistingPhaseIndex = playoffMatches.length > 0
        ? Math.min(...playoffMatches.map((match) => getPlayoffPhaseIndex(match.phase)))
        : -1

      if (firstExistingPhaseIndex < 0 || firstExistingPhaseIndex === Number.MAX_SAFE_INTEGER) return []

      const visiblePhases = playoffPhaseOrder.slice(firstExistingPhaseIndex) as PlayoffPhase[]
      const firstRoundPhase = visiblePhases[0]
      const firstRoundMatches = sortPlayoffMatchesForBracket(
        playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === firstRoundPhase)
      )
      const firstRoundMatchCount = Math.max(1, firstRoundMatches.length)

      return visiblePhases.map((phase, roundIndex) => {
        const matches = sortPlayoffMatchesForBracket(
          playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === phase)
        )
        const matchesByOrder = new Map(matches.map((match, matchIndex) => [
          match.match_order || match.round || matchIndex + 1,
          match,
        ]))
        const previousPhase = visiblePhases[roundIndex - 1]
        const previousMatches = previousPhase
          ? sortPlayoffMatchesForBracket(
            playoffMatches.filter((match) => String(match.phase ?? '').toUpperCase() === previousPhase)
          )
          : []
        const previousMatchesByOrder = new Map(previousMatches.map((match, matchIndex) => [
          match.match_order || match.round || matchIndex + 1,
          match,
        ]))
        const expectedMatches = Math.max(1, Math.ceil(firstRoundMatchCount / 2 ** roundIndex))
        const slotCount = Math.max(expectedMatches, matches.length)
        const visualRowSpan = Math.max(1, 2 ** roundIndex)
        const slots: PlayoffVisualSlot[] = Array.from({ length: slotCount }, (_, slotIndex) => {
          const slotOrder = slotIndex + 1
          const match = matchesByOrder.get(slotOrder) ?? null
          const visualRowStart = slotIndex * visualRowSpan + 1

          if (match) {
            return {
              id: `match-${match.id}`,
              kind: 'match',
              label: `Partido ${match.match_order || match.round || slotOrder}`,
              match,
              slotOrder,
              visualRowSpan,
              visualRowStart,
            }
          }

          const [firstSourceOrder, secondSourceOrder] = getPlayoffSourceOrders(slotOrder)
          const firstSourceWinner = getPlayoffVisualWinner(previousMatchesByOrder.get(firstSourceOrder) ?? null)
          const secondSourceWinner = getPlayoffVisualWinner(previousMatchesByOrder.get(secondSourceOrder) ?? null)

          return {
            id: `placeholder-${phase}-${slotOrder}`,
            kind: 'placeholder',
            label: `Partido ${slotOrder}`,
            placeholderTeams: [firstSourceWinner, secondSourceWinner],
            slotOrder,
            visualRowSpan,
            visualRowStart,
          }
        })

        return {
          phase,
          label: formatPlayoffPhaseLabel(phase),
          matches,
          slots,
          placeholder: matches.length > 0 ? null : 'Pendiente de ganadores',
          teamsCount: expectedMatches * 2,
          visualRows: firstRoundMatchCount,
        }
      })
    },
    [generalPlayoffPlan, getGeneralPlanTeamSlot, getPlayoffVisualAdvancer, playoffMatches, teamNameLookup, teamSeedLookup]
  )
  const playoffMatchesTotal = playoffMatches.length || (summary?.counts.playoffMatches ?? 0)
  const playoffPlayedCount = useMemo(
    () => playoffMatches.filter((match) => String(match.status ?? '').toUpperCase() === 'PLAYED').length,
    [playoffMatches]
  )
  const currentPlayoffRound = useMemo(() => {
    const firstPendingRound = playoffRounds.find((round) =>
      round.matches.some((match) => String(match.status ?? '').toUpperCase() !== 'PLAYED')
    )
    return firstPendingRound ?? playoffRounds.at(-1) ?? null
  }, [playoffRounds])
  const currentPlayoffRoundLabel = currentPlayoffRound
    ? formatPlayoffPhaseLabel(currentPlayoffRound.phase)
    : null
  const tournamentOperationalBadge = useMemo(() => {
    if (!summary) return getTournamentOperationalStatus({ operationalStage: 'INSCRIPCIONES', status: 'OPEN' })

    return getTournamentOperationalStatus({
      operationalStage: summary.operationalStage,
      status: summary.tournament.status,
      registrationDeadline: summary.tournament.registration_deadline,
      counts: {
        ...summary.counts,
        groupMatches: groupMatches.length || summary.counts.groupMatches,
        playoffMatches: playoffMatches.length || summary.counts.playoffMatches,
      },
      final: summary.final,
      champion: summary.champion,
      currentPlayoffPhase: currentPlayoffRound?.phase,
    })
  }, [currentPlayoffRound?.phase, groupMatches.length, playoffMatches.length, summary])
  const nextPlayoffMatch = useMemo(() => {
    for (const round of playoffRounds) {
      const pending = round.matches.find((match) => String(match.status ?? '').toUpperCase() !== 'PLAYED')
      if (pending) return pending
    }
    return null
  }, [playoffRounds])
  const pendingPlayoffMatches = useMemo(
    () => playoffMatches.filter((match) => String(match.status ?? '').toUpperCase() !== 'PLAYED'),
    [playoffMatches]
  )
  const shouldUseFluidPlayoffGrid = playoffRounds.length > 0 && playoffRounds.length <= 3
  const playoffBracketVisibleColumns = Math.min(playoffBracketPreferredColumns, Math.max(1, playoffRounds.length))
  const playoffBracketCanNavigate = playoffRounds.length > playoffBracketVisibleColumns
  const playoffBracketGridStyle = useMemo<CSSProperties>(() => {
    const visibleColumns = Math.min(playoffBracketPreferredColumns, Math.max(1, playoffRounds.length))
    const visibleGap = Math.max(0, visibleColumns - 1) * PLAYOFF_CONNECTOR_WIDTH

    return {
      ['--playoff-visible-columns' as string]: String(visibleColumns),
      ['--playoff-column-gap' as string]: `${PLAYOFF_CONNECTOR_WIDTH}px`,
      gridTemplateColumns: `repeat(${playoffRounds.length}, minmax(0, calc((100% - ${visibleGap}px) / ${visibleColumns})))`,
      minWidth: playoffRounds.length > visibleColumns
        ? `calc(${playoffRounds.length} * ((100% - ${visibleGap}px) / ${visibleColumns}) + ${(playoffRounds.length - 1) * PLAYOFF_CONNECTOR_WIDTH}px)`
        : '0',
    }
  }, [playoffBracketPreferredColumns, playoffRounds.length])

  function getPlayoffBracketScrollStep() {
    const scrollEl = playoffBracketScrollRef.current
    if (!scrollEl) return 320
    return (scrollEl.clientWidth / playoffBracketVisibleColumns) + PLAYOFF_CONNECTOR_WIDTH
  }

  function scrollPlayoffBracket(direction: 'left' | 'right', behavior: ScrollBehavior = 'smooth') {
    const scrollEl = playoffBracketScrollRef.current
    if (!scrollEl) return
    const sign = direction === 'left' ? -1 : 1
    scrollEl.scrollBy({ left: sign * getPlayoffBracketScrollStep(), behavior })
  }

  function startPlayoffBracketDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea')) return

    const scrollEl = playoffBracketScrollRef.current
    if (!scrollEl) return

    playoffBracketDragRef.current = {
      isDragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scrollEl.scrollLeft,
      startScrollTop: scrollEl.scrollTop,
    }
    setIsDraggingPlayoffBracket(true)
    scrollEl.setPointerCapture(event.pointerId)
  }

  function movePlayoffBracketDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = playoffBracketDragRef.current
    const scrollEl = playoffBracketScrollRef.current
    if (!drag.isDragging || drag.pointerId !== event.pointerId || !scrollEl) return

    event.preventDefault()
    scrollEl.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX)
    scrollEl.scrollTop = drag.startScrollTop - (event.clientY - drag.startY)
    updatePlayoffBracketScrollState()
  }

  function stopPlayoffBracketDrag(event?: ReactPointerEvent<HTMLDivElement>) {
    const drag = playoffBracketDragRef.current
    const scrollEl = playoffBracketScrollRef.current
    if (event && drag.pointerId === event.pointerId && scrollEl?.hasPointerCapture(event.pointerId)) {
      scrollEl.releasePointerCapture(event.pointerId)
    }

    playoffBracketDragRef.current = { isDragging: false, pointerId: null, startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0 }
    setIsDraggingPlayoffBracket(false)
    updatePlayoffBracketScrollState()
  }

  function setPlayoffBracketZoomLevel(nextZoom: number) {
    setPlayoffBracketZoom(Math.min(1.3, Math.max(0.7, Number(nextZoom.toFixed(2)))))
    window.requestAnimationFrame(() => {
      updatePlayoffBracketScrollState()
      updatePlayoffBracketNavState()
    })
  }

  function updatePlayoffBracketScrollState() {
    const scrollEl = playoffBracketScrollRef.current
    if (!scrollEl) {
      setPlayoffBracketScrollState({ canScrollLeft: false, canScrollRight: false })
      return
    }

    const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
    const nextState = {
      canScrollLeft: scrollEl.scrollLeft > 4,
      canScrollRight: scrollEl.scrollLeft < maxScrollLeft - 4,
    }

    setPlayoffBracketScrollState((current) => (
      current.canScrollLeft === nextState.canScrollLeft && current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    ))
  }

  function updatePlayoffBracketNavState() {
    const bracketEl = playoffBracketViewportRef.current
    if (!bracketEl) {
      setPlayoffBracketNavState({ isVisible: false, top: 0 })
      return
    }

    const rect = bracketEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight || 0
    const visibleTop = Math.max(rect.top, 92)
    const visibleBottom = Math.min(rect.bottom, viewportHeight - 24)
    const isVisible = activeTab === 'playoff' && bracketView === 'tree' && playoffBracketCanNavigate && visibleBottom - visibleTop > 160
    const centeredTop = Math.min(
      Math.max(viewportHeight * 0.52, visibleTop + 112),
      Math.max(visibleTop + 112, visibleBottom - 112)
    )
    const nextState = {
      isVisible,
      top: Math.round(centeredTop),
    }

    setPlayoffBracketNavState((current) => (
      current.isVisible === nextState.isVisible && current.top === nextState.top
        ? current
        : nextState
    ))
  }

  function stopPlayoffBracketHold(triggerClick = true) {
    const hold = playoffBracketHoldRef.current
    const direction = hold.direction
    const wasHolding = Boolean(hold.intervalId)

    if (hold.timeoutId) window.clearTimeout(hold.timeoutId)
    if (hold.intervalId) window.clearInterval(hold.intervalId)

    playoffBracketHoldRef.current = { direction: null, timeoutId: null, intervalId: null }

    if (triggerClick && direction && !wasHolding) {
      scrollPlayoffBracket(direction)
    }
  }

  function startPlayoffBracketHold(direction: 'left' | 'right') {
    stopPlayoffBracketHold(false)

    const hold = playoffBracketHoldRef.current
    hold.direction = direction
    hold.timeoutId = window.setTimeout(() => {
      hold.intervalId = window.setInterval(() => {
        const scrollEl = playoffBracketScrollRef.current
        if (!scrollEl) return
        scrollEl.scrollBy({ left: direction === 'left' ? -18 : 18, behavior: 'auto' })
      }, 16)
    }, 220)
  }

  useEffect(() => () => stopPlayoffBracketHold(false), [])

  useEffect(() => {
    const updatePreferredColumns = () => {
      const width = window.innerWidth || 0
      setPlayoffBracketPreferredColumns(width < 640 ? 1 : width < 980 ? 2 : 3)
    }

    updatePreferredColumns()
    window.addEventListener('resize', updatePreferredColumns)
    return () => window.removeEventListener('resize', updatePreferredColumns)
  }, [])

  useEffect(() => {
    const refreshPlayoffBracketControls = () => {
      updatePlayoffBracketScrollState()
      updatePlayoffBracketNavState()
    }

    refreshPlayoffBracketControls()
    const animationFrameId = window.requestAnimationFrame(refreshPlayoffBracketControls)
    const secondAnimationFrameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(refreshPlayoffBracketControls)
    })
    const timeoutId = window.setTimeout(refreshPlayoffBracketControls, 220)
    const lateTimeoutId = window.setTimeout(refreshPlayoffBracketControls, 700)
    const handleResize = () => refreshPlayoffBracketControls()
    window.addEventListener('resize', handleResize)
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null

    if (resizeObserver) {
      if (playoffBracketViewportRef.current) resizeObserver.observe(playoffBracketViewportRef.current)
      if (playoffBracketScrollRef.current) resizeObserver.observe(playoffBracketScrollRef.current)
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.cancelAnimationFrame(secondAnimationFrameId)
      window.clearTimeout(timeoutId)
      window.clearTimeout(lateTimeoutId)
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [activeTab, playoffRounds.length, bracketView, playoffBracketGridStyle])

  useEffect(() => {
    const refreshPlayoffBracketControls = () => {
      updatePlayoffBracketScrollState()
      updatePlayoffBracketNavState()
    }

    refreshPlayoffBracketControls()
    const animationFrameId = window.requestAnimationFrame(refreshPlayoffBracketControls)
    const timeoutId = window.setTimeout(refreshPlayoffBracketControls, 120)
    const handleViewportChange = () => refreshPlayoffBracketControls()
    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true })
    window.addEventListener('resize', handleViewportChange)
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleViewportChange)
      : null

    if (resizeObserver) {
      if (playoffBracketViewportRef.current) resizeObserver.observe(playoffBracketViewportRef.current)
      if (playoffBracketScrollRef.current) resizeObserver.observe(playoffBracketScrollRef.current)
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.clearTimeout(timeoutId)
      window.removeEventListener('scroll', handleViewportChange, { capture: true })
      window.removeEventListener('resize', handleViewportChange)
      resizeObserver?.disconnect()
    }
  }, [activeTab, playoffRounds.length, bracketView, playoffBracketCanNavigate, playoffBracketPreferredColumns])

  const getPlayoffRoundLayoutStyle = (roundIndex: number, visualRows = 1): CSSProperties => {
    const roundFactor = Math.max(0, Math.pow(2, roundIndex) - 1)
    const columnOffset = 0
    return {
      ['--bracket-line-color' as string]: BRACKET_LINE_COLOR,
      ['--bracket-line-width' as string]: `${BRACKET_LINE_WIDTH}px`,
      ['--playoff-card-height' as string]: `${PLAYOFF_CARD_HEIGHT}px`,
      ['--playoff-connector-width' as string]: `${PLAYOFF_CONNECTOR_WIDTH}px`,
      ['--playoff-depth' as string]: String(roundIndex),
      ['--playoff-visual-rows' as string]: String(Math.max(1, visualRows)),
      ['--playoff-column-offset' as string]: `${columnOffset}px`,
      ['--playoff-round-gap' as string]: `${PLAYOFF_ROUND_GAP}px`,
    }
  }
  const getPlayoffSlotStyle = (slot: PlayoffVisualSlot, useTreePlacement?: boolean): CSSProperties | undefined => {
    if (!useTreePlacement) return undefined

    return {
      alignSelf: 'center',
      gridRow: `${slot.visualRowStart} / span ${slot.visualRowSpan}`,
    }
  }
  const getPlayoffSlotCenter = (slot: PlayoffVisualSlot) => {
    const top = (slot.visualRowStart - 1) * (PLAYOFF_CARD_HEIGHT + PLAYOFF_ROUND_GAP)
    const height = slot.visualRowSpan * PLAYOFF_CARD_HEIGHT + (slot.visualRowSpan - 1) * PLAYOFF_ROUND_GAP

    return top + (height / 2)
  }
  const getPlayoffConnectorStyle = (fromSlot: PlayoffVisualSlot, toSlot: PlayoffVisualSlot): CSSProperties => {
    const top = getPlayoffSlotCenter(fromSlot)
    const bottom = getPlayoffSlotCenter(toSlot)

    return {
      height: `${Math.max(0, bottom - top)}px`,
      top: `${top}px`,
    }
  }
  const getPlayoffSlotTeamIds = (slot: PlayoffVisualSlot) => {
    if (slot.kind === 'match' && slot.match) {
      return [slot.match.team1_id, slot.match.team2_id].filter(Boolean) as string[]
    }

    if (slot.kind === 'bye') {
      return [slot.byeTeam?.teamId, slot.placeholderTeams?.[0]?.teamId, slot.placeholderTeams?.[1]?.teamId].filter(Boolean) as string[]
    }

    return (slot.placeholderTeams ?? []).map((team) => team?.teamId).filter(Boolean) as string[]
  }
  const isPlayoffSlotInActivePath = (slot: PlayoffVisualSlot) => {
    if (!activePlayoffTeamId) return false
    return getPlayoffSlotTeamIds(slot).includes(activePlayoffTeamId)
  }
  const isPlayoffMatchInActivePath = (match: TournamentMatch) => {
    if (!activePlayoffTeamId) return false
    return match.team1_id === activePlayoffTeamId || match.team2_id === activePlayoffTeamId
  }
  const getPlayoffPathClass = (isActive: boolean, base = '') => {
    if (!activePlayoffTeamId) return base
    return `${base} ${isActive ? 'club-playoffPathActive' : 'club-playoffPathDimmed'}`
  }
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
      classificationRules: resolveTournamentClassificationRules(null, tournamentRules),
    })
  }, [groupMatches, sortedGroups, tournamentId, tournamentRules])
  const standingsByGroupId = useMemo(
    () =>
      groupStandings.reduce<Record<string, (typeof groupStandings)[number]>>((acc, item) => {
        acc[item.group.id] = item
        return acc
      }, {}),
    [groupStandings]
  )
  const operationalNotices = useMemo(
    () => buildTournamentOperationalNotices({
      standings: groupStandings,
      registrations,
      matches: [...groupMatches, ...playoffMatches],
      playoffRounds,
    }),
    [groupMatches, groupStandings, playoffMatches, playoffRounds, registrations]
  )
  const resultMatch = useMemo(
    () => resultForm
      ? groupMatches.find((match) => match.id === resultForm.matchId) ??
        playoffMatches.find((match) => match.id === resultForm.matchId) ??
        null
      : null,
    [groupMatches, playoffMatches, resultForm]
  )
  const allScheduledMatches = useMemo(
    () => [...groupMatches, ...playoffMatches],
    [groupMatches, playoffMatches]
  )
  const scheduleSwapSourceMatch = useMemo(
    () => scheduleSwapModal
      ? allScheduledMatches.find((match) => match.id === scheduleSwapModal.sourceMatchId) ?? null
      : null,
    [allScheduledMatches, scheduleSwapModal]
  )
  const scheduleSwapCandidates = useMemo(
    () => scheduleSwapSourceMatch
      ? allScheduledMatches
          .filter((match) => match.id !== scheduleSwapSourceMatch.id)
          .filter(canSwapScheduleMatch)
      : [],
    [allScheduledMatches, scheduleSwapSourceMatch]
  )
  const flyerPreviewData = useMemo(() => ({
    clubName: activeClub?.name ?? '',
    name: summary?.tournament.name ?? '',
    type: formatTournamentTypeLabel(summary?.tournament.type ?? summary?.tournament.tournament_type ?? 'OPEN'),
    gender: formatBranchLabel(summary?.tournament.gender),
    categoryLabel: summary?.tournament.category_name ?? (summary?.tournament.category_id ? `Categoria ${summary.tournament.category_id}` : 'Categoria por definir'),
    segmentLabel: formatSegmentLabel(tournamentDisplayConfig.segmentType),
    competitionSystemLabel: formatCompetitionSystemLabel(tournamentDisplayConfig.competitionSystem),
    venueName: tournamentDisplayConfig.venueName ?? activeClub?.name ?? '',
    startDate: summary?.tournament.start_date ?? '',
    endDate: summary?.tournament.end_date ?? '',
    registrationDeadline: summary?.tournament.registration_deadline ?? '',
    pricePerPlayer: summary?.tournament.price_per_player ? String(summary.tournament.price_per_player) : '0',
  }), [activeClub?.name, summary, tournamentDisplayConfig])
  const tournamentRuleSchedule = useMemo(
    () =>
      readTournamentRuleSchedule(tournamentRules, {
        startDate: summary?.tournament.start_date,
        endDate: summary?.tournament.end_date ?? summary?.tournament.start_date,
      }),
    [summary?.tournament.end_date, summary?.tournament.start_date, tournamentRules]
  )
  const expectedGroupMatchesCount = useMemo(
    () =>
      sortedGroups.reduce((total, group) => total + (group.size === 4 ? 4 : group.size === 3 ? 3 : 0), 0),
    [sortedGroups]
  )
  const projectedGroupMatchesCount = Math.max(groupMatches.length, expectedGroupMatchesCount)
  const groupsPlanningCapacity = useMemo(
    () =>
      calculateScheduleCapacity({
        courtsCount: tournamentRuleSchedule.tournamentCourts.length,
        startTime: tournamentRuleSchedule.scheduleConfig.groups.start_time,
        endTime: tournamentRuleSchedule.scheduleConfig.groups.end_time,
        matchDurationMinutes: tournamentRuleSchedule.scheduleConfig.match_duration_minutes,
        totalMatches: projectedGroupMatchesCount,
      }),
    [projectedGroupMatchesCount, tournamentRuleSchedule]
  )
  const selectedComplex = useMemo(
    () => complexOptions.find((option) => option.id === courtDraft.complexId) ?? null,
    [complexOptions, courtDraft.complexId]
  )
  const selectedComplexCourts = useMemo(() => {
    const count = selectedComplex?.courtsCount ?? 0
    return Array.from({ length: Math.max(0, count) }, (_, index) => `Cancha ${index + 1}`)
  }, [selectedComplex])
  const availableSelectedComplexCourts = useMemo(() => {
    if (!selectedComplex) return []
    const selectedNames = new Set(
      tournamentCourtsDraft
        .filter((court) => (court.complex_name ?? '').trim().toLowerCase() === selectedComplex.name.trim().toLowerCase())
        .map((court) => court.name.trim().toLowerCase())
    )
    return selectedComplexCourts.filter((courtName) => !selectedNames.has(courtName.toLowerCase()))
  }, [selectedComplex, selectedComplexCourts, tournamentCourtsDraft])
  const draftPlanningCapacity = useMemo(
    () =>
      calculateScheduleCapacity({
        courtsCount: tournamentCourtsDraft.length,
        startTime: tournamentRuleSchedule.scheduleConfig.groups.start_time,
        endTime: tournamentRuleSchedule.scheduleConfig.groups.end_time,
        matchDurationMinutes: tournamentRuleSchedule.scheduleConfig.match_duration_minutes,
        totalMatches: projectedGroupMatchesCount,
      }),
    [projectedGroupMatchesCount, tournamentCourtsDraft.length, tournamentRuleSchedule]
  )
  const groupPlanningStatus = tournamentRuleSchedule.scheduleConfig.mode === 'MANUAL'
    ? 'Manual'
    : groupsPlanningCapacity.isEnough
      ? 'Suficiente'
      : 'Insuficiente'
  const autoPlanningBlocked = tournamentRuleSchedule.scheduleConfig.mode === 'AUTO' && !groupsPlanningCapacity.isEnough
  const groupMatchGenerationBody = [
    `Se generarán ${expectedGroupMatchesCount} partidos de grupos.`,
    tournamentRuleSchedule.scheduleConfig.mode === 'AUTO'
      ? `Con ${tournamentRuleSchedule.tournamentCourts.length} canchas entre ${tournamentRuleSchedule.scheduleConfig.groups.start_time} y ${tournamentRuleSchedule.scheduleConfig.groups.end_time} entran ${groupsPlanningCapacity.totalCapacity} partidos.`
      : 'La planificación quedó en modo manual, así que los partidos se crearán sin fecha, hora ni cancha asignada.',
    tournamentRuleSchedule.scheduleConfig.mode === 'AUTO'
      ? groupsPlanningCapacity.isEnough
        ? 'Capacidad suficiente para generar y planificar.'
        : `Capacidad insuficiente: faltan ${groupsPlanningCapacity.overflowMatches} partido${groupsPlanningCapacity.overflowMatches === 1 ? '' : 's'} por ubicar. Necesitás al menos ${groupsPlanningCapacity.requiredCourts} canchas o una ventana horaria más amplia.`
      : null,
  ].filter(Boolean).join(' ')

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadSummary() {
    if (!activeClub?.id || !tournamentId) {
      setSummary(null)
      setTournamentRules(null)
      setThemeKey(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setTournamentRules(null)
      setLoading(false)
      return
    }

    const [summaryResult, clubThemeResult] = await Promise.all([
      fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
    ])
    const res = summaryResult
    const json = await res.json().catch(() => ({}))
    setThemeKey((clubThemeResult.data?.theme_key as string | null) ?? null)

    if (!res.ok) {
      setSummary(null)
      setTournamentRules(null)
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
    setTournamentRules(currentTournament?.rules_json ?? null)
    setFlyerConfig(readFlyerConfigFromRules(currentTournament?.rules_json))
    setTournamentDisplayConfig(readTournamentDisplayConfig(currentTournament?.rules_json))
    setLoading(false)
  }

  async function loadRegistrations() {
    if (!activeClub?.id || !tournamentId) {
      setRegistrations([])
      setGroups([])
      setGroupMatches([])
      setPlayoffMatches([])
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
      setPlayoffMatches([])
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
      setPlayoffMatches([])
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
    const sortedMatches = [...matches].sort((left, right) => {
      const leftPhaseIndex = getPlayoffPhaseIndex(left.phase)
      const rightPhaseIndex = getPlayoffPhaseIndex(right.phase)
      if (leftPhaseIndex !== rightPhaseIndex) return leftPhaseIndex - rightPhaseIndex
      const leftOrder = left.round * 100 + left.match_order
      const rightOrder = right.round * 100 + right.match_order
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.id.localeCompare(right.id)
    })
    setGroupMatches(
      sortedMatches
        .filter((match) => String(match.phase ?? '').toUpperCase() === 'GROUP')
    )
    setPlayoffMatches(
      sortedMatches.filter((match) => playoffPhaseOrder.includes(String(match.phase ?? '').toUpperCase() as (typeof playoffPhaseOrder)[number]))
    )
    setLoadingRegistrations(false)
  }

  async function refreshTournamentExperience() {
    await Promise.all([loadSummary(), loadRegistrations()])
  }

  function scrollToTournamentMatch(matchId: string) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`group-match-${matchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }

  async function loadComplexOptions() {
    if (!activeClub?.id) {
      setComplexOptions([])
      setLoadingComplexes(false)
      return
    }

    setLoadingComplexes(true)
    const fallbackOption = {
      id: activeClub.id,
      name: activeClub.name ?? 'Club actual',
      courtsCount: 0,
    }

    const { data, error } = await supabase
      .from('clubs')
      .select('id,name,courts_count,is_active')
      .eq('is_active', true)
      .order('name')

    if (error) {
      setComplexOptions([fallbackOption])
      setLoadingComplexes(false)
      return
    }

    const nextOptions = ((data ?? []) as Array<{ id: string; name: string; courts_count: number | null }>)
      .map((club) => ({
        id: club.id,
        name: club.name,
        courtsCount: Number.isFinite(club.courts_count ?? NaN) ? Math.max(0, Number(club.courts_count ?? 0)) : 0,
      }))

    if (!nextOptions.some((option) => option.id === activeClub.id)) {
      nextOptions.unshift(fallbackOption)
    }

    setComplexOptions(nextOptions)
    setLoadingComplexes(false)
  }

  function openCourtConfigModal() {
    setTournamentCourtsDraft(tournamentRuleSchedule.tournamentCourts)
    setCourtDraft((current) => ({
      complexId:
        current.complexId ||
        activeClub?.id ||
        '',
      courtName: '',
    }))
    setCourtConfigModalOpen(true)
  }

  function addTournamentCourt() {
    const complex = complexOptions.find((option) => option.id === courtDraft.complexId)
    const name = courtDraft.courtName.trim()
    if (!complex || !name) return

    const alreadySelected = tournamentCourtsDraft.some(
      (court) => court.name.trim().toLowerCase() === name.toLowerCase()
        && (court.complex_name ?? '').trim().toLowerCase() === complex.name.trim().toLowerCase()
    )
    if (alreadySelected) return

    setTournamentCourtsDraft((current) => [
      ...current,
      {
        name,
        complex_name: complex.name,
        source: complex.id === activeClub?.id ? 'OWN_CLUB' : 'EXTERNAL_COMPLEX',
      },
    ])
    setCourtDraft((current) => ({ ...current, courtName: '' }))
  }

  function removeTournamentCourt(index: number) {
    setTournamentCourtsDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function saveTournamentCourts() {
    if (!activeClub?.id || !tournamentId) return

    const token = await getToken()
    if (!token) {
      setActionFeedback({ tone: 'error', title: 'No pudimos guardar las canchas', message: 'Tu sesión ya no es válida. Volvé a ingresar e intentá nuevamente.' })
      return
    }

    setSavingCourtConfig(true)
    setMessage('')
    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_tournament_courts',
        tournament_courts: tournamentCourtsDraft.map((court) => ({
          ...(court.id ? { id: court.id } : {}),
          name: court.name.trim(),
          complex_name: court.complex_name?.trim() || null,
          source: court.source,
        })),
      }),
    })

    if (!res.ok) {
      setSavingCourtConfig(false)
      setActionFeedback({ tone: 'error', title: 'No pudimos guardar las canchas', message: 'No pudimos guardar las canchas del torneo. Intentá nuevamente.' })
      return
    }

    setSavingCourtConfig(false)
    setCourtConfigModalOpen(false)
    setActionFeedback({ tone: 'success', title: 'Cambios guardados', message: 'Las canchas del torneo quedaron actualizadas.' })
    await refreshTournamentExperience()
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

  function matchHasLoadedScore(match: TournamentMatch) {
    return Boolean(match.winner_team_id) || Boolean(match.score && Object.keys(match.score).length > 0)
  }

  function canSwapScheduleMatch(match: TournamentMatch) {
    return String(match.status ?? '').toUpperCase() === 'PENDING' &&
      !matchHasLoadedScore(match) &&
      Boolean(match.scheduled_at) &&
      Boolean(match.court_name)
  }

  function getScheduleSwapDisabledReason(match: TournamentMatch) {
    if (String(match.status ?? '').toUpperCase() !== 'PENDING') return 'Solo se pueden mover partidos pendientes.'
    if (matchHasLoadedScore(match)) return 'Este partido ya tiene resultado cargado.'
    if (!match.scheduled_at) return 'Este partido no tiene horario asignado.'
    if (!match.court_name) return 'Este partido no tiene cancha asignada.'
    return ''
  }

  function getScheduleSwapOpenDisabledReason(match: TournamentMatch) {
    if (String(match.status ?? '').toUpperCase() !== 'PENDING') return 'Solo se pueden mover partidos pendientes.'
    if (matchHasLoadedScore(match)) return 'Este partido ya tiene resultado cargado.'
    return ''
  }

  function getMatchTeamsLabel(match: TournamentMatch) {
    return `${match.team1_name ?? 'Equipo 1'} vs ${match.team2_name ?? 'Equipo 2'}`
  }

  function getMatchScheduleLabel(match: TournamentMatch) {
    if (!match.scheduled_at) return 'Sin horario'
    const time = formatDateTime(match.scheduled_at)
    return `${time}${match.court_name ? ` · ${match.court_name}` : ' · Cancha sin asignar'}`
  }

  function openScheduleSwapModal(match: TournamentMatch) {
    setScheduleSwapModal({
      sourceMatchId: match.id,
      targetMatchId: '',
      error: getScheduleSwapDisabledReason(match),
    })
  }

  async function submitScheduleSwap() {
    if (!activeClub?.id || !tournamentId || !scheduleSwapModal) return

    if (!scheduleSwapModal.targetMatchId) {
      setScheduleSwapModal((current) => current ? { ...current, error: 'Seleccioná un partido para intercambiar.' } : current)
      return
    }

    const token = await getToken()
    if (!token) {
      setScheduleSwapModal((current) => current ? { ...current, error: 'Sesión inválida.' } : current)
      return
    }

    setSavingScheduleSwap(true)
    setScheduleSwapModal((current) => current ? { ...current, error: '' } : current)
    setMessage('')
    setActionMessage('')

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/matches/swap-schedule`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceMatchId: scheduleSwapModal.sourceMatchId,
        targetMatchId: scheduleSwapModal.targetMatchId,
      }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }

    if (!res.ok) {
      setSavingScheduleSwap(false)
      setScheduleSwapModal((current) => current ? { ...current, error: json.error ?? 'No pude intercambiar horario/cancha.' } : current)
      return
    }

    setSavingScheduleSwap(false)
    setScheduleSwapModal(null)
    setActionMessage('Horario/cancha intercambiados correctamente.')
    await refreshTournamentExperience()
  }

  function renderGroupMatchSchedule(match: TournamentMatch) {
    if (!match.scheduled_at) {
      return (
        <>
          <strong>Sin fecha</strong>
          <span>Cancha: sin asignar</span>
        </>
      )
    }

    const scheduledAt = parseTournamentDate(match.scheduled_at)
    const scheduleLabel = scheduledAt
      ? new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(scheduledAt).replace(',', ' a las')
      : formatDateTime(match.scheduled_at)

    return (
      <>
        <strong>{scheduleLabel}</strong>
        <span>Cancha: {match.court_name ?? 'sin asignar'}</span>
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
      setActionFeedback({
        tone: 'warning',
        title: 'Revisá el resultado',
        message: validation?.error ?? 'Cargá un resultado válido.',
      })
      return
    }

    setSavingResult(true)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setActionFeedback({ tone: 'error', title: 'No pudimos guardar el resultado', message: 'Tu sesión ya no es válida. Volvé a ingresar e intentá nuevamente.' })
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
    const json = await res.json().catch(() => ({})) as {
      error?: string
      match?: Pick<TournamentMatch, 'id' | 'status' | 'score' | 'winner_team_id'>
      groupDependency?: { status?: string }
      groupDependencyWarning?: string
    }

    if (!res.ok) {
      setActionFeedback({
        tone: 'error',
        title: 'No pudimos guardar el resultado',
        message: json.error ?? 'Revisá los sets e intentá nuevamente.',
      })
      setSavingResult(false)
      return
    }

    setResultForm(null)
    setSavingResult(false)
    const winnerTeamId = validation.winnerSide === 'team1' ? match.team1_id : match.team2_id
    setGroupMatches((current) => current.map((item) => item.id === match.id
      ? {
        ...item,
        status: json.match?.status ?? 'PLAYED',
        score: json.match?.score ?? validation.score,
        winner_team_id: json.match?.winner_team_id ?? winnerTeamId,
      }
      : item
    ))
    setActionFeedback({
      tone: json.groupDependencyWarning ? 'warning' : 'success',
      title: 'Resultado guardado',
      message: json.groupDependencyWarning
        ?? (json.groupDependency?.status === 'GENERATED'
        ? 'La tabla se actualizó y ya se definieron Ganadores vs Ganadores y Perdedores vs Perdedores.'
        : 'La tabla y los cruces se actualizaron con este resultado.'),
    })
    await refreshTournamentExperience()
    scrollToTournamentMatch(match.id)
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
          <div key={row.team_id} className={`club-groupStandingRow ${qualifierIds.has(row.team_id) ? 'club-groupStandingRow--qualified' : ''}`} role="row">
            <span className="club-groupStandingPosition" role="cell">{qualifierIds.has(row.team_id) ? <i aria-hidden="true">✓</i> : null}{index + 1}</span>
            <span className="club-groupStandingTeam" role="cell">
              <span className="club-groupStandingPlayerNames">
                {splitTeamPlayerNames(teamNameById(group, row.team_id)).map((playerName) => <span key={playerName}>{playerName}</span>)}
              </span>
              {qualifierIds.has(row.team_id) ? <b>Clasifica</b> : null}
            </span>
            <span role="cell">{row.played}</span>
            <span role="cell">{row.wins}</span>
            <span role="cell">{row.losses}</span>
            <span role="cell">{row.match_points}</span>
            <span
              role="cell"
              title={`Sets: ${row.sets_for} a favor / ${row.sets_against} en contra`}
            >
              {row.set_difference}
            </span>
            <span
              role="cell"
              title={`Games: ${row.games_for} a favor / ${row.games_against} en contra`}
            >
              {row.game_difference}
            </span>
          </div>
        ))}
      </div>
    )
  }

  function renderTournamentGroupMatchResult(match: TournamentMatch) {
    if (String(match.status ?? '').toUpperCase() !== 'PLAYED') {
      return (
        <>
          <strong className="club-result club-result--muted">Sin resultado</strong>
          <div className="club-scoreBoard club-scoreBoard--pending" aria-label="Resultado pendiente">
            <div className="club-scoreBoardLabels">
              {['S1', 'S2', 'TB'].map((label) => <span className="club-scoreLabel" key={`${match.id}-${label}`}>{label}</span>)}
            </div>
            {[0, 1].map((teamIndex) => (
              <div className="club-scoreBoardRow" key={`${match.id}-pending-${teamIndex}`}>
                {[0, 1, 2].map((setIndex) => <span className="club-scoreSet club-scoreSet--pending" key={`${match.id}-pending-${teamIndex}-${setIndex}`}>—</span>)}
              </div>
            ))}
          </div>
        </>
      )
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
    const errorState = getResultErrorState(resultForm, match.phase, validation)
    const scoreInputClass = (key: string) => [
      'px-input club-scoreInput',
      errorState.invalidInputs.has(key) ? 'club-scoreInput--danger' : '',
    ].filter(Boolean).join(' ')
    const scoreHeadClass = (keys: string[]) => [
      'club-scoreHead',
      keys.some((key) => errorState.invalidInputs.has(key)) ? 'club-scoreHead--danger' : '',
    ].filter(Boolean).join(' ')
    const legacyScore = match.status === 'PLAYED' && !isStructuredScore(match.score) && typeof match.score?.text === 'string' && match.score.text.trim()
    const winnerName = validation?.ok
      ? validation.winnerSide === 'team1'
        ? match.team1_name ?? 'Equipo 1'
        : match.team2_name ?? 'Equipo 2'
      : null

    return (
      <form
        className={`club-resultForm ${errorState.hasError ? 'club-resultForm--danger' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (!savingResult && validation?.ok) void submitResult(match)
        }}
      >
        {legacyScore ? (
          <div className="club-legacyScoreNotice">
            Resultado anterior: <b>{match.score?.text as string}</b>. Para editarlo, recargalo con sets estructurados.
          </div>
        ) : null}

        <div className="club-scoreGrid">
          <span className="club-scoreHead">Pareja</span>
          <span className={scoreHeadClass([getResultScoreInputKey(0, 'team1'), getResultScoreInputKey(0, 'team2')])}>Set 1</span>
          <span className={scoreHeadClass([getResultScoreInputKey(1, 'team1'), getResultScoreInputKey(1, 'team2')])}>Set 2</span>
          <span className={scoreHeadClass(group
            ? [getResultSuperTiebreakInputKey('team1'), getResultSuperTiebreakInputKey('team2')]
            : [getResultScoreInputKey(2, 'team1'), getResultScoreInputKey(2, 'team2')]
          )}>{group ? 'Super TB' : 'Set 3'}</span>

          <div className="club-scoreRow">
            <span title={match.team1_name ?? 'Equipo 1'}>{match.team1_name ?? 'Equipo 1'}</span>
            {[0, 1].map((index) => (
              <input
                key={`team1-set-${index}`}
                aria-invalid={errorState.invalidInputs.has(getResultScoreInputKey(index as 0 | 1, 'team1')) || undefined}
                className={scoreInputClass(getResultScoreInputKey(index as 0 | 1, 'team1'))}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={(index * 2) + 1}
                type="number"
                value={resultForm.sets[index as 0 | 1].team1}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team1', event.target.value)}
              />
            ))}
            {group ? (
              <input
                aria-invalid={errorState.invalidInputs.has(getResultSuperTiebreakInputKey('team1')) || undefined}
                className={scoreInputClass(getResultSuperTiebreakInputKey('team1'))}
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={5}
                type="number"
                value={resultForm.superTiebreak.team1}
                onChange={(event) => updateSuperTiebreak('team1', event.target.value)}
              />
            ) : (
              <input
                aria-invalid={errorState.invalidInputs.has(getResultScoreInputKey(2, 'team1')) || undefined}
                className={scoreInputClass(getResultScoreInputKey(2, 'team1'))}
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={5}
                type="number"
                value={resultForm.sets[2].team1}
                onChange={(event) => updateResultSet(2, 'team1', event.target.value)}
              />
            )}
          </div>

          <div className="club-scoreRow">
            <span title={match.team2_name ?? 'Equipo 2'}>{match.team2_name ?? 'Equipo 2'}</span>
            {[0, 1].map((index) => (
              <input
                key={`team2-set-${index}`}
                aria-invalid={errorState.invalidInputs.has(getResultScoreInputKey(index as 0 | 1, 'team2')) || undefined}
                className={scoreInputClass(getResultScoreInputKey(index as 0 | 1, 'team2'))}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={(index * 2) + 2}
                type="number"
                value={resultForm.sets[index as 0 | 1].team2}
                onChange={(event) => updateResultSet(index as 0 | 1, 'team2', event.target.value)}
              />
            ))}
            {group ? (
              <input
                aria-invalid={errorState.invalidInputs.has(getResultSuperTiebreakInputKey('team2')) || undefined}
                className={scoreInputClass(getResultSuperTiebreakInputKey('team2'))}
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={6}
                type="number"
                value={resultForm.superTiebreak.team2}
                onChange={(event) => updateSuperTiebreak('team2', event.target.value)}
              />
            ) : (
              <input
                aria-invalid={errorState.invalidInputs.has(getResultScoreInputKey(2, 'team2')) || undefined}
                className={scoreInputClass(getResultScoreInputKey(2, 'team2'))}
                disabled={!thirdState.enabled}
                inputMode="numeric"
                min="0"
                step="1"
                tabIndex={6}
                type="number"
                value={resultForm.sets[2].team2}
                onChange={(event) => updateResultSet(2, 'team2', event.target.value)}
              />
            )}
          </div>
        </div>

        <div className={`club-resultSummary ${errorState.hasError ? 'club-resultSummary--danger' : ''}`}>
          {winnerName ? (
            <span>Ganador calculado: <b>{winnerName}</b></span>
          ) : (
            <span>{validation?.ok === false ? validation.error : 'Completá los sets para calcular el ganador.'}</span>
          )}
        </div>

        <div className="club-resultActions">
          <button
            type="submit"
            className="club-primaryBtn"
            disabled={savingResult || !validation?.ok}
          >
            {savingResult ? 'Guardando...' : 'Guardar resultado'}
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
      </form>
    )
  }

  function renderOperationalNotices(scope: TournamentOperationalNoticeScope) {
    const notices = operationalNotices.filter((notice) => notice.scope === scope)
    if (notices.length === 0) return null

    return (
      <div className="club-operationalNotices" aria-label="Avisos operativos del torneo">
        {notices.map((notice) => (
          <article key={notice.id} className={`club-operationalNotice club-operationalNotice--${notice.type}`}>
            <span className="club-operationalNoticeIcon" aria-hidden="true">i</span>
            <div className="club-operationalNoticeBody">
              {notice.title === 'Desempate aplicado' ? (
                <details className="club-operationalNoticeDisclosure">
                  <summary><strong>{notice.title}</strong></summary>
                  <p>{notice.message}</p>
                </details>
              ) : (
                <>
                  <strong>{notice.title}</strong>
                  <p>{notice.message}</p>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    )
  }

  function renderGroupOperationalNotices(groupId: string) {
    const notices = operationalNotices.filter((notice) => notice.scope === 'group' && notice.groupId === groupId)
    if (notices.length === 0) return null

    return (
      <div className="club-operationalNotices club-operationalNotices--embedded" aria-label="Avisos operativos del grupo">
        {notices.map((notice) => (
          <article key={notice.id} className={`club-operationalNotice club-operationalNotice--${notice.type}`}>
            <span className="club-operationalNoticeIcon" aria-hidden="true">i</span>
            <div className="club-operationalNoticeBody">
              {notice.title === 'Desempate aplicado' ? (
                <details className="club-operationalNoticeDisclosure">
                  <summary><strong>{notice.title}</strong></summary>
                  <p>{notice.message}</p>
                </details>
              ) : (
                <>
                  <strong>{notice.title}</strong>
                  <p>{notice.message}</p>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    )
  }

  function renderTournamentGroupMatchTable(group: TournamentGroup, matches: TournamentMatch[]) {
    const orderedMatches = [...matches].sort((left, right) =>
      (left.round ?? 0) - (right.round ?? 0) ||
      (left.match_order ?? 0) - (right.match_order ?? 0) ||
      left.id.localeCompare(right.id)
    )
    return (
      <div className="club-matchTable" role="table" aria-label={`Partidos del Grupo ${group.name}`}>
        <div className="club-matchTableHead" role="row">
          <span role="columnheader" aria-label="Cambiar horario" />
          <span role="columnheader">Info</span>
          <span role="columnheader">Partido</span>
          <span role="columnheader">Resultado</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader">Acciones</span>
        </div>
        {orderedMatches.map((match, matchIndex) => {
          const played = String(match.status ?? '').toUpperCase() === 'PLAYED'
          const team1Winner = played && match.winner_team_id === match.team1_id
          const team2Winner = played && match.winner_team_id === match.team2_id
          const scheduleSwapOpenDisabledReason = getScheduleSwapOpenDisabledReason(match)
          const mobileScoreSets = extractStructuredScoreSets(match.score).slice(0, 3)
          const team1Name = match.team1_name ?? teamNameById(group, match.team1_id)
          const team2Name = match.team2_name ?? teamNameById(group, match.team2_id)
          const dependentMatchIndex = orderedMatches.filter((item) => Number(item.round) === 2).findIndex((item) => item.id === match.id)
          const dependentLabel = group.size === 4 && Number(match.round) === 2
            ? dependentMatchIndex === 0 ? 'Ganadores vs Ganadores' : 'Perdedores vs Perdedores'
            : null
          return (
            <div id={`group-match-${match.id}`} key={match.id} className={`club-matchTableRow ${played ? 'club-matchTableRow--played' : 'club-matchTableRow--pending'}`} role="row">
              <div className="club-matchScheduleActionCell" role="cell">
                <button
                  type="button"
                  className="club-scheduleSwapBtn"
                  title={scheduleSwapOpenDisabledReason || 'Cambiar fecha, hora o cancha'}
                  aria-label="Cambiar fecha, hora o cancha"
                  disabled={Boolean(scheduleSwapOpenDisabledReason)}
                  onClick={() => openScheduleSwapModal(match)}
                >
                  <Repeat2 size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="club-matchInfoCell" role="cell">
                {renderGroupMatchSchedule(match)}
              </div>
              <div className="club-matchPairCell" role="cell">
                <span className="club-groupMatchCode">{getOpenGroupMatchDisplayCode(group.order, matchIndex + 1)}{dependentLabel ? ` · ${dependentLabel}` : ''}</span>
                <div className="club-matchTeams" title={`${match.team1_name ?? 'Equipo 1'} vs ${match.team2_name ?? 'Equipo 2'}`}>
                  <strong className={team1Winner ? 'club-matchTeamWinner' : undefined}>
                    {match.team1_name ?? teamNameById(group, match.team1_id)}
                  </strong>
                  <span aria-hidden="true" />
                  <strong className={team2Winner ? 'club-matchTeamWinner' : undefined}>
                    {match.team2_name ?? teamNameById(group, match.team2_id)}
                  </strong>
                </div>
                <div className="club-mobileMatchScoreGrid" aria-label={`Resultado ${team1Name} versus ${team2Name}`}>
                  <span className="club-mobileScoreSpacer" aria-hidden="true" />
                  {['S1', 'S2', 'TB'].map((label) => <span className="club-mobileScoreLabel" key={`${match.id}-${label}`}>{label}</span>)}
                  <strong className={team1Winner ? 'club-mobileMatchTeam club-mobileMatchTeam--winner' : 'club-mobileMatchTeam'}>{team1Name}</strong>
                  {[0, 1, 2].map((index) => {
                    const set = mobileScoreSets[index]
                    return <span className={`club-mobileScoreValue ${set && set.team1 > set.team2 ? 'club-mobileScoreValue--winner' : ''}`} key={`${match.id}-team1-${index}`}>{set?.team1 ?? '—'}</span>
                  })}
                  <span className="club-mobileMatchDivider" aria-hidden="true" />
                  <strong className={team2Winner ? 'club-mobileMatchTeam club-mobileMatchTeam--winner' : 'club-mobileMatchTeam'}>{team2Name}</strong>
                  {[0, 1, 2].map((index) => {
                    const set = mobileScoreSets[index]
                    return <span className={`club-mobileScoreValue ${set && set.team2 > set.team1 ? 'club-mobileScoreValue--winner' : ''}`} key={`${match.id}-team2-${index}`}>{set?.team2 ?? '—'}</span>
                  })}
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

  function renderPlayoffMatchCard(match: TournamentMatch, roundLabel: string, matchIndex: number, options?: { style?: CSSProperties; label?: string }) {
    const played = String(match.status ?? '').toUpperCase() === 'PLAYED'
    const team1Winner = played && match.winner_team_id === match.team1_id
    const team2Winner = played && match.winner_team_id === match.team2_id
    const team1Seed = teamSeedLookup.get(match.team1_id)
    const team2Seed = teamSeedLookup.get(match.team2_id)
    const team1Name = match.team1_name ?? teamNameLookup.get(match.team1_id) ?? 'Equipo 1'
    const team2Name = match.team2_name ?? teamNameLookup.get(match.team2_id) ?? 'Equipo 2'
    const scoreSets = extractStructuredScoreSets(match.score)
    const hasStructuredScore = scoreSets.length > 0
    const scheduleSwapOpenDisabledReason = getScheduleSwapOpenDisabledReason(match)
    const matchInActivePath = isPlayoffMatchInActivePath(match)
    const team1InActivePath = activePlayoffTeamId === match.team1_id
    const team2InActivePath = activePlayoffTeamId === match.team2_id

    return (
      <article key={match.id} className={getPlayoffPathClass(matchInActivePath, 'club-playoffBracketMatch')} style={options?.style}>
        <div className="club-playoffBracketMatchHead">
          <div className="club-playoffMatchTitleStack">
            <div className="club-playoffMatchTitleLine">
              <span className="club-playoffMatchOrder">{options?.label ?? `Partido ${match.match_order || match.round}`}</span>
              <span className={`club-statusBadge club-statusBadge--${played ? 'played' : 'pending'}`}>
                {matchStatusLabel(match.status)}
              </span>
            </div>
            <span className="club-playoffScheduleLine">
              {match.scheduled_at ? formatDate(match.scheduled_at) : 'Sin fecha'} · {match.scheduled_at ? formatDateTime(match.scheduled_at).split(' · ')[1] ?? 'Sin hora' : 'Sin hora'} · {match.court_name ?? 'Sin cancha'}
            </span>
          </div>
          <div className="club-playoffCardHeadActions">
            <button
              type="button"
              className={`club-groupResultBtn club-groupResultBtn--mini ${played ? 'club-groupResultBtn--secondary' : 'club-groupResultBtn--primary'}`}
              onClick={() => openResultForm(match)}
            >
              {played ? 'Editar' : 'Cargar'}
            </button>
            <button
              type="button"
              className="club-scheduleSwapBtn club-scheduleSwapBtn--playoff"
              title={scheduleSwapOpenDisabledReason || 'Cambiar horario/cancha'}
              aria-label={`Cambiar horario/cancha de ${getMatchTeamsLabel(match)}`}
              disabled={Boolean(scheduleSwapOpenDisabledReason)}
              onClick={() => openScheduleSwapModal(match)}
            >
              <Repeat2 size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="club-playoffBracketBody">
          <div className="club-playoffBracketTeams">
            <div
              className={getPlayoffPathClass(team1InActivePath, `club-playoffBracketTeam ${team1Winner ? 'club-playoffBracketTeam--winner' : played ? 'club-playoffBracketTeam--loser' : ''}`)}
              onMouseEnter={() => match.team1_id && setActivePlayoffTeamId(match.team1_id)}
              onMouseLeave={() => setActivePlayoffTeamId(null)}
              title={match.team1_id ? 'Ver recorrido' : undefined}
            >
              <div className="club-playoffBracketTeamRow">
                {renderPlayoffTeamMain(team1Seed, team1Name)}
                <div className="club-playoffInlineScore" aria-label={hasStructuredScore ? `Score ${team1Name}` : 'Sin resultado'}>
                  {(hasStructuredScore ? scoreSets : [{ team1: '-', team2: '-' }, { team1: '-', team2: '-' }]).map((set, index) => (
                    <span
                      className={`club-playoffInlineSet ${hasStructuredScore && typeof set.team1 === 'number' && typeof set.team2 === 'number' && set.team1 > set.team2 ? 'club-playoffInlineSet--won' : ''}`}
                      key={`playoff-team1-${match.id}-${index}`}
                    >
                      {set.team1}
                    </span>
                  ))}
                </div>
              </div>
              <span className="club-playoffWinnerSlot" aria-hidden="true">
                {team1Winner ? <span className="club-playoffWinnerMark">✓</span> : null}
              </span>
            </div>
            <div
              className={getPlayoffPathClass(team2InActivePath, `club-playoffBracketTeam ${team2Winner ? 'club-playoffBracketTeam--winner' : played ? 'club-playoffBracketTeam--loser' : ''}`)}
              onMouseEnter={() => match.team2_id && setActivePlayoffTeamId(match.team2_id)}
              onMouseLeave={() => setActivePlayoffTeamId(null)}
              title={match.team2_id ? 'Ver recorrido' : undefined}
            >
              <div className="club-playoffBracketTeamRow">
                {renderPlayoffTeamMain(team2Seed, team2Name)}
                <div className="club-playoffInlineScore" aria-hidden="true">
                  {(hasStructuredScore ? scoreSets : [{ team1: '-', team2: '-' }, { team1: '-', team2: '-' }]).map((set, index) => (
                    <span
                      className={`club-playoffInlineSet ${hasStructuredScore && typeof set.team1 === 'number' && typeof set.team2 === 'number' && set.team2 > set.team1 ? 'club-playoffInlineSet--won' : ''}`}
                      key={`playoff-team2-${match.id}-${index}`}
                    >
                      {set.team2}
                    </span>
                  ))}
                </div>
              </div>
              <span className="club-playoffWinnerSlot" aria-hidden="true">
                {team2Winner ? <span className="club-playoffWinnerMark">✓</span> : null}
              </span>
            </div>
          </div>
        </div>
      </article>
    )
  }

  function renderPlayoffPlaceholderCard(
    label: string,
    options?: {
      finalColumn?: boolean
      key?: string
      style?: CSSProperties
      teams?: [PlayoffVisualTeamSlot | null, PlayoffVisualTeamSlot | null]
    }
  ) {
    const teams = options?.teams ?? [null, null]
    const slotTeamIds = teams.map((team) => team?.teamId).filter(Boolean) as string[]
    const cardInActivePath = Boolean(activePlayoffTeamId && slotTeamIds.includes(activePlayoffTeamId))

    return (
      <article
        key={options?.key}
        className={getPlayoffPathClass(cardInActivePath, 'club-playoffBracketMatch club-playoffBracketMatch--placeholder')}
        style={options?.style}
      >
        <div className="club-playoffBracketMatchHead">
          <span className="club-playoffMatchOrder">{label}</span>
          <span className="club-statusBadge club-statusBadge--pending">Pendiente</span>
        </div>

        <div className="club-playoffBracketTeams">
          {[1, 2].map((teamSlot) => (
            <div
              className={getPlayoffPathClass(activePlayoffTeamId === teams[teamSlot - 1]?.teamId, `club-playoffBracketTeam ${teams[teamSlot - 1] ? '' : 'club-playoffBracketTeam--empty'}`)}
              key={`placeholder-team-${options?.key ?? label}-${teamSlot}`}
              onMouseEnter={() => {
                const teamId = teams[teamSlot - 1]?.teamId
                if (teamId) setActivePlayoffTeamId(teamId)
              }}
              onMouseLeave={() => setActivePlayoffTeamId(null)}
              title={teams[teamSlot - 1]?.teamId ? 'Ver recorrido' : undefined}
            >
              <div className="club-playoffBracketTeamRow">
                {renderPlayoffTeamMain(
                  teams[teamSlot - 1]?.seed ?? null,
                  teams[teamSlot - 1]?.teamName ?? 'Por definir',
                  { empty: !teams[teamSlot - 1] }
                )}
                <div className="club-playoffInlineScore" aria-hidden="true">
                  {[1, 2].map((scoreSlot) => (
                    <span className="club-playoffInlineSet club-playoffInlineSet--empty" key={`placeholder-score-${options?.key ?? label}-${teamSlot}-${scoreSlot}`}>
                      -
                    </span>
                  ))}
                </div>
              </div>
              <span className="club-playoffWinnerSlot" aria-hidden="true" />
            </div>
          ))}
        </div>

      </article>
    )
  }

  function renderPlayoffByeCard(
    slot: PlayoffVisualSlot,
    options?: {
      key?: string
      style?: CSSProperties
    }
  ) {
    const team = slot.byeTeam ?? slot.placeholderTeams?.[0] ?? null
    const cardInActivePath = Boolean(activePlayoffTeamId && team?.teamId === activePlayoffTeamId)

    return (
      <article
        key={options?.key}
        className={getPlayoffPathClass(cardInActivePath, 'club-playoffBracketMatch club-playoffBracketMatch--bye')}
        style={options?.style}
      >
        <div className="club-playoffBracketMatchHead">
          <span className="club-playoffMatchOrder">{slot.label}</span>
          <span className="club-statusBadge club-statusBadge--pending">BYE</span>
        </div>

        <div className="club-playoffBracketTeams">
          <div
            className={getPlayoffPathClass(cardInActivePath, `club-playoffBracketTeam ${team ? '' : 'club-playoffBracketTeam--empty'}`)}
            onMouseEnter={() => team?.teamId && setActivePlayoffTeamId(team.teamId)}
            onMouseLeave={() => setActivePlayoffTeamId(null)}
            title={team?.teamId ? 'Ver recorrido' : undefined}
          >
            <div className="club-playoffBracketTeamRow">
              {renderPlayoffTeamMain(
                team?.seed ?? null,
                team?.teamName ?? 'Por definir',
                { empty: !team }
              )}
              <div className="club-playoffInlineScore" aria-hidden="true">
                <span className="club-playoffInlineSet club-playoffInlineSet--empty">-</span>
                <span className="club-playoffInlineSet club-playoffInlineSet--empty">-</span>
              </div>
            </div>
            <span className="club-playoffWinnerSlot" aria-hidden="true">
              <span className="club-playoffWinnerMark">✓</span>
            </span>
          </div>
          <div className="club-playoffBracketTeam club-playoffBracketTeam--empty">
            <div className="club-playoffBracketTeamRow">
              {renderPlayoffTeamMain(null, 'Pasa directo', { empty: true })}
              <div className="club-playoffInlineScore" aria-hidden="true">
                <span className="club-playoffInlineSet club-playoffInlineSet--empty">-</span>
                <span className="club-playoffInlineSet club-playoffInlineSet--empty">-</span>
              </div>
            </div>
            <span className="club-playoffWinnerSlot" aria-hidden="true" />
          </div>
        </div>
      </article>
    )
  }

  function renderPlayoffTeamMain(seed: number | null | undefined, teamName: string, options?: { empty?: boolean }) {
    return (
      <div className="club-playoffBracketTeamMain">
        <span className={`club-playoffSeedPill ${options?.empty || typeof seed !== 'number' ? 'club-playoffSeedPill--ghost' : ''}`}>
          {typeof seed === 'number' ? `(${seed})` : ''}
        </span>
        <strong className={`club-playoffTeamNames ${options?.empty ? 'club-playoffEmptyTeamName' : ''}`} title={teamName}>
          {splitTeamPlayerNames(teamName).map((playerName, index) => (
            <span key={`${teamName}-${index}`}>{playerName}</span>
          ))}
        </strong>
      </div>
    )
  }

  function renderPlayoffVisualSlot(
    slot: PlayoffVisualSlot,
    roundLabel: string,
    slotIndex: number,
    options?: { finalColumn?: boolean; useTreePlacement?: boolean }
  ) {
    const style = getPlayoffSlotStyle(slot, options?.useTreePlacement)

    if (slot.kind === 'match' && slot.match) {
      return renderPlayoffMatchCard(slot.match, roundLabel, slotIndex, { style, label: slot.label })
    }

    if (slot.kind === 'bye') {
      return renderPlayoffByeCard(slot, {
        key: slot.id,
        style,
      })
    }

    return renderPlayoffPlaceholderCard(slot.label, {
      finalColumn: options?.finalColumn,
      key: slot.id,
      style,
      teams: slot.placeholderTeams,
    })
  }

  function renderCompactPlayoffSlot(slot: PlayoffVisualSlot, roundLabel: string) {
    if (slot.kind === 'match' && slot.match) return renderCompactPlayoffRow(slot.match, roundLabel)
    if (slot.kind === 'bye') return renderPlayoffByeCard(slot, { key: `compact-${slot.id}` })

    return renderPlayoffPlaceholderCard(slot.label, {
      key: `compact-${slot.id}`,
      teams: slot.placeholderTeams,
    })
  }

  function renderPlayoffRoundConnectors(roundIndex: number) {
    const currentRound = playoffRounds[roundIndex]
    const nextRound = playoffRounds[roundIndex + 1]
    if (!currentRound || !nextRound) return null

    return nextRound.slots
      .map((slot, slotIndex) => {
        const firstChild = currentRound.slots[slotIndex * 2]
        const secondChild = currentRound.slots[(slotIndex * 2) + 1]
        if (!firstChild || !secondChild) return null
        const connectorActive = Boolean(
          activePlayoffTeamId &&
          (
            isPlayoffSlotInActivePath(firstChild) ||
            isPlayoffSlotInActivePath(secondChild) ||
            isPlayoffSlotInActivePath(slot)
          )
        )

        return (
          <div
            aria-hidden="true"
            className={getPlayoffPathClass(connectorActive, 'club-playoffBracketConnector')}
            key={`connector-${roundIndex}-${slot.id}`}
            style={getPlayoffConnectorStyle(firstChild, secondChild)}
          >
            <span className="club-playoffBracketConnectorLine club-playoffBracketConnectorLine--top" />
            <span className="club-playoffBracketConnectorLine club-playoffBracketConnectorLine--bottom" />
            <span className="club-playoffBracketConnectorLine club-playoffBracketConnectorLine--middle" />
            <span className="club-playoffBracketConnectorVerticalLine" />
          </div>
        )
      })
  }

  function renderCompactPlayoffRow(match: TournamentMatch, roundLabel: string) {
    const played = String(match.status ?? '').toUpperCase() === 'PLAYED'
    const team1Winner = played && match.winner_team_id === match.team1_id
    const team2Winner = played && match.winner_team_id === match.team2_id
    const team1Seed = teamSeedLookup.get(match.team1_id)
    const team2Seed = teamSeedLookup.get(match.team2_id)
    const team1Name = match.team1_name ?? teamNameLookup.get(match.team1_id) ?? 'Equipo 1'
    const team2Name = match.team2_name ?? teamNameLookup.get(match.team2_id) ?? 'Equipo 2'
    const scoreSets = extractStructuredScoreSets(match.score)
    const hasStructuredScore = scoreSets.length > 0

    return (
      <article key={`compact-${match.id}`} className="club-playoffCompactMatch">
        <div className="club-playoffCompactHead">
          <span className="club-playoffMatchOrder">Partido {match.match_order || match.round}</span>
          <div className="club-playoffCardHeadActions">
            <span className={`club-statusBadge club-statusBadge--${played ? 'played' : 'pending'}`}>
              {matchStatusLabel(match.status)}
            </span>
            <button
              type="button"
              className={`club-groupResultBtn club-groupResultBtn--mini ${played ? 'club-groupResultBtn--secondary' : 'club-groupResultBtn--primary'}`}
              onClick={() => openResultForm(match)}
            >
              {played ? 'Editar' : 'Cargar'}
            </button>
          </div>
        </div>

        <div className="club-playoffBracketTeams">
          <div className={`club-playoffBracketTeam ${team1Winner ? 'club-playoffBracketTeam--winner' : played ? 'club-playoffBracketTeam--loser' : ''}`}>
            <div className="club-playoffBracketTeamRow">
              {renderPlayoffTeamMain(team1Seed, team1Name)}
              <div className="club-playoffInlineScore">
                {(hasStructuredScore ? scoreSets : [{ team1: '-', team2: '-' }, { team1: '-', team2: '-' }]).map((set, index) => (
                  <span
                    className={`club-playoffInlineSet ${hasStructuredScore && typeof set.team1 === 'number' && typeof set.team2 === 'number' && set.team1 > set.team2 ? 'club-playoffInlineSet--won' : ''}`}
                    key={`compact-team1-${match.id}-${index}`}
                  >
                    {set.team1}
                  </span>
                ))}
              </div>
            </div>
            <span className="club-playoffWinnerSlot" aria-hidden="true">
              {team1Winner ? <span className="club-playoffWinnerMark">✓</span> : null}
            </span>
          </div>

          <div className={`club-playoffBracketTeam ${team2Winner ? 'club-playoffBracketTeam--winner' : played ? 'club-playoffBracketTeam--loser' : ''}`}>
            <div className="club-playoffBracketTeamRow">
              {renderPlayoffTeamMain(team2Seed, team2Name)}
              <div className="club-playoffInlineScore">
                {(hasStructuredScore ? scoreSets : [{ team1: '-', team2: '-' }, { team1: '-', team2: '-' }]).map((set, index) => (
                  <span
                    className={`club-playoffInlineSet ${hasStructuredScore && typeof set.team1 === 'number' && typeof set.team2 === 'number' && set.team2 > set.team1 ? 'club-playoffInlineSet--won' : ''}`}
                    key={`compact-team2-${match.id}-${index}`}
                  >
                    {set.team2}
                  </span>
                ))}
              </div>
            </div>
            <span className="club-playoffWinnerSlot" aria-hidden="true">
              {team2Winner ? <span className="club-playoffWinnerMark">✓</span> : null}
            </span>
          </div>
        </div>

      </article>
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
        TOURNAMENT_SCHEMA_SYNC_PENDING: 'La publicación se está preparando. Actualizá la página e intentá nuevamente en unos segundos.',
      }
      const fallback = 'No pudimos publicar el torneo. Intentá nuevamente.'
      const detail = json.code ? messages[json.code] ?? json.error : json.error
      setActionFeedback({ tone: 'error', title: 'No pudimos publicar el torneo', message: detail && detail !== 'No pudimos publicar el torneo.' ? detail : fallback })
      setPublishing(false)
      return
    }

    setActionFeedback({ tone: 'success', title: 'Torneo publicado', message: 'Las inscripciones ya están abiertas.' })
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
      setActionFeedback({ tone: 'error', title: 'No pudimos eliminar el torneo', message: 'Tu sesión ya no es válida. Volvé a ingresar e intentá nuevamente.' })
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
        INVALID_ACTION: 'Acción inválida.',
        TOURNAMENT_DELETE_BLOCKED: 'Este torneo ya tiene actividad vinculada y no puede eliminarse. Podés cancelarlo para conservar el historial.',
        TOURNAMENT_DELETE_FAILED: 'No pudimos eliminar el torneo. Intentá nuevamente.',
      }
      setActionFeedback({ tone: 'error', title: 'No pudimos eliminar el torneo', message: json.code ? messages[json.code] ?? 'No pudimos eliminar el torneo. Intentá nuevamente.' : 'No pudimos eliminar el torneo. Intentá nuevamente.' })
      setDeletingTournament(false)
      return
    }

    setActionFeedback({ tone: 'success', title: 'Torneo eliminado', message: 'Eliminamos el borrador y sus datos vinculados.' })
    setDeletingTournament(false)
    window.setTimeout(() => router.push('/club/torneos'), 900)
  }

  async function finalizeTournament() {
    if (!activeClub?.id || !tournamentId || !summary) return
    setFinalizingTournament(true)
    setActionFeedback(null)
    const token = await getToken()
    if (!token) {
      setActionFeedback({ tone: 'error', title: 'No pudimos finalizar el torneo', message: 'Tu sesión ya no es válida. Volvé a ingresar e intentá nuevamente.' })
      setFinalizingTournament(false)
      return
    }
    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize_tournament' }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }
    if (!res.ok) {
      setActionFeedback({
        tone: 'error',
        title: 'No pudimos finalizar el torneo',
        message: json.error ?? 'Revisá los partidos pendientes y el resultado de la final.',
      })
      setFinalizingTournament(false)
      return
    }
    setActionFeedback({ tone: 'success', title: 'Torneo finalizado', message: 'El campeón y toda la historia deportiva quedaron guardados.' })
    setFinalizingTournament(false)
    await refreshTournamentExperience()
  }

  async function setTournamentPaused(paused: boolean) {
    if (!activeClub?.id || !tournamentId || !summary) return
    setPausingTournament(true)
    const token = await getToken()
    if (!token) {
      setActionFeedback({ tone: 'error', title: 'No pudimos actualizar el torneo', message: 'Tu sesión ya no es válida. Volvé a ingresar e intentá nuevamente.' })
      setPausingTournament(false)
      return
    }
    const response = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: paused ? 'pause_tournament' : 'resume_tournament' }),
    })
    const json = await response.json().catch(() => ({})) as { error?: string; code?: string }
    if (!response.ok) {
      setActionFeedback({ tone: 'error', title: paused ? 'No pudimos pausar el torneo' : 'No pudimos reanudar el torneo', message: json.error ?? 'Intentá nuevamente.' })
      setPausingTournament(false)
      return
    }
    setActionFeedback({ tone: 'success', title: paused ? 'Torneo pausado' : 'Torneo reanudado', message: paused ? 'Las inscripciones quedaron temporalmente detenidas.' : 'El torneo vuelve a estar disponible según sus fechas de inscripción.' })
    setPausingTournament(false)
    await refreshTournamentExperience()
  }

  async function cancelTournament() {
    if (!activeClub?.id || !tournamentId || !summary) return

    const reason = cancelTournamentReason.trim()
    if (!reason) {
      setMessage('Necesitás indicar un motivo para cancelar o anular el torneo.')
      return
    }

    setCancellingTournament(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setCancellingTournament(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'cancel_tournament', reason }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    if (!res.ok) {
      const messages: Record<string, string> = {
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para cancelar este torneo.',
        INVALID_STATUS_TRANSITION: 'Este torneo ya no puede cancelarse desde este estado.',
        CANCELLATION_REASON_REQUIRED: 'Necesitás indicar un motivo para cancelar o anular el torneo.',
        INVALID_ACTION: 'Acción inválida.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude cancelar el torneo.' : json.error ?? 'No pude cancelar el torneo.')
      setCancellingTournament(false)
      return
    }

    setCancellingTournament(false)
    setCancelTournamentModal(null)
    setCancelTournamentKeyword('')
    setCancelTournamentReason('')
    setActionMessage('Torneo cancelado correctamente. Se conserva el historial, pero deja de estar operativo.')
    await refreshTournamentExperience()
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

  async function resolveOperationalPayment(registration: Registration, status: 'APPROVED' | 'REJECTED') {
    if (!activeClub?.id || !registration.operational_payment?.id) return

    setSavingRegistrationId(registration.id)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingRegistrationId(null)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/payments/${registration.operational_payment.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }
    setSavingRegistrationId(null)

    if (!res.ok) {
      setMessage(json.error ?? 'No pude resolver el pago.')
      return
    }

    setActionFeedback({
      tone: status === 'APPROVED' ? 'success' : 'warning',
      title: status === 'APPROVED' ? 'Pago aprobado' : 'Pago rechazado',
      message: status === 'APPROVED'
        ? 'La pareja ya está confirmada.'
        : 'La pareja fue notificada para revisar el pago.',
    })
    await refreshTournamentExperience()
  }

  async function resolveChangeRequest(registration: Registration, status: 'APPROVED' | 'REJECTED') {
    if (!activeClub?.id || !registration.registration_change_request?.id) return

    setSavingRegistrationId(registration.id)
    setMessage('')
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSavingRegistrationId(null)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/registration-change-requests/${registration.registration_change_request.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string }
    setSavingRegistrationId(null)

    if (!res.ok) {
      setMessage(json.error ?? 'No pude resolver la baja.')
      return
    }

    setActionMessage(status === 'APPROVED' ? 'Baja aprobada y notificada.' : 'Baja rechazada y notificada.')
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


  function requestGenerateGroups() {
    requestConfirmation({
      title: 'Generar grupos',
      body: 'Se van a asignar las parejas a grupos usando el seed congelado del torneo.',
      confirmLabel: 'Generar grupos',
      onConfirm: generateGroups,
    })
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
    const json = await res.json().catch(() => ({})) as {
      error?: string
      code?: string
      matchesCreated?: number
      scheduleApplied?: boolean
      scheduleCapacity?: { totalCapacity?: number }
    }

    if (!res.ok) {
      const messages: Record<string, string> = {
        GROUPS_NOT_FOUND: 'Primero generá los grupos.',
        GROUP_MATCHES_ALREADY_EXIST: 'Este torneo ya tiene partidos de grupos.',
        GROUP_NOT_COMPLETE: 'Hay grupos incompletos.',
        INVALID_GROUP_SIZE: 'Hay un grupo con tamaño inválido.',
        SCHEDULE_COURTS_REQUIRED: 'Para planificar automáticamente necesitás al menos una cancha seleccionada en el torneo.',
        SCHEDULE_CAPACITY_INSUFFICIENT: json.error ?? 'No alcanza la capacidad configurada para planificar todos los partidos de grupos.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        UNAUTHORIZED: 'No tenés permisos para generar partidos.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar los partidos de grupos.' : json.error ?? 'No pude generar los partidos de grupos.')
      setGeneratingGroupMatches(false)
      return
    }

    setActionMessage(
      `Partidos de grupos generados correctamente${json.matchesCreated ? `: ${json.matchesCreated} partidos` : ''}.` +
      (json.scheduleApplied ? ' La planificación automática quedó aplicada.' : '')
    )
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
        GROUP_NOT_COMPLETE: json.error ?? 'Completá todos los partidos de grupos antes de generar el playoff OPEN.',
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

  function requestGenerateOpenPlayoff() {
    requestConfirmation({
      title: 'Generar playoff OPEN',
      body: 'Se generará la primera ronda real del playoff OPEN con los standings actuales.',
      confirmLabel: 'Generar playoff OPEN',
      onConfirm: generateOpenPlayoff,
    })
  }

  async function generatePlayoffFinal() {
    if (!activeClub?.id || !tournamentId || !canGeneratePlayoffFinal) return

    setGeneratingPlayoffFinal(true)
    setActionMessage('')
    setMessage('')

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setGeneratingPlayoffFinal(false)
      return
    }

    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}/playoff/generate-final`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string; createdCount?: number }

    if (!res.ok) {
      const messages: Record<string, string> = {
        UNAUTHORIZED: 'No tenés permisos para generar la final.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude generar la final.' : json.error ?? 'No pude generar la final.')
      setGeneratingPlayoffFinal(false)
      return
    }

    setActionMessage(`Final generada correctamente${typeof json.createdCount === 'number' ? `: ${json.createdCount} partido` : ''}.`)
    setGeneratingPlayoffFinal(false)
    await refreshTournamentExperience()
  }

  function openManualRegistration() {
    if (!canAddPair) {
      setManualModalOpen(false)
      setManualError('')
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
    setManualError('')
    setManualModalOpen(true)
    setMessage('')
    setActionMessage('')
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
      setManualError('Completá los datos de ambos jugadores.')
      return
    }

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
    setActionMessage('')

    const token = await getToken()
    if (!token) {
      setManualError('Sesión inválida.')
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
        INVALID_PLAYER_CLUB_PLAYER_ID: 'El jugador seleccionado no es válido. Volvé a buscarlo y seleccionarlo.',
        INVALID_PLAYER_NAME: 'Completá el nombre del jugador.',
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
      setManualError(json.code ? messages[json.code] ?? json.error ?? 'No pude agregar la pareja.' : json.error ?? 'No pude agregar la pareja.')
      return
    }

    setManualModalOpen(false)
    setManualError('')
    setActionMessage('Pareja agregada correctamente.')
    setActiveTab('inscriptos')
    await refreshTournamentExperience()
  }

  function requestConfirmation(action: NonNullable<ConfirmAction>) {
    setConfirmAction(action)
  }

  async function runConfirmedAction() {
    if (!confirmAction) return
    if (confirmAction.confirmationKeyword === 'ACEPTAR' && confirmKeywordInput.trim() !== 'ACEPTAR') return
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
    void Promise.resolve().then(() => loadComplexOptions())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    if (manualModalOpen && !canAddPair) {
      queueMicrotask(() => {
        setManualModalOpen(false)
        setManualError('')
        setMessage('')
        setActionMessage('')
      })
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
    queueMicrotask(() => setConfirmKeywordInput(''))
  }, [confirmAction])


  useEffect(() => {
    if (cancelTournamentModal) return
    queueMicrotask(() => {
      setCancelTournamentKeyword('')
      setCancelTournamentReason('')
    })
  }, [cancelTournamentModal])

  return (
    <div className="px-wrap">
      <div className={`club-panel club-tournamentDetail ${activeTab === 'playoff' ? 'club-detail--playoff' : ''}`} style={themeStyle}>
        {actionFeedback ? <ActionFeedbackNotice {...actionFeedback} onDismiss={() => setActionFeedback(null)} autoDismissMs={actionFeedback.tone === 'success' ? 4000 : undefined} /> : null}
        <div className="club-detailTopbar">
          <Link href={circuitBackTarget} className="club-backBtn"><span className="club-backDesktop">{circuitBackLabel ? `Volver a ${circuitBackLabel}` : 'Volver a torneos'}</span><span className="club-backMobile"><ChevronLeft aria-hidden="true" size={18} />{circuitBackLabel ?? 'Volver'}</span></Link>
          <div className="club-topbarActions">
            <div className="club-mobileActionMenu">
              <button type="button" className="club-mobileMenuTrigger" aria-label="Más acciones" aria-expanded={mobileActionsOpen} onClick={() => setMobileActionsOpen((open) => !open)}>
                <MoreVertical aria-hidden="true" />
              </button>
              {mobileActionsOpen ? (
                <div className="club-mobileMenuPopover">
                  {isDraft ? <Link href={`/club/torneos/${tournamentId}/editar`}>Editar torneo</Link> : null}
                  <button type="button" onClick={() => { setMobileActionsOpen(false); void refreshTournamentExperience() }} disabled={loading || publishing || deletingTournament || cancellingTournament}>
                    {loading ? 'Actualizando...' : 'Actualizar'}
                  </button>
                </div>
              ) : null}
            </div>
            {isDraft ? <Link href={`/club/torneos/${tournamentId}/editar`} className="club-editBtn club-desktopAction">Editar torneo</Link> : null}
            <button className="club-editBtn club-desktopAction" type="button" onClick={refreshTournamentExperience} disabled={loading || publishing || deletingTournament || cancellingTournament}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
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
                disabled={publishing || loading || deletingTournament || cancellingTournament}
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
                  <span>{formatTournamentTypeLabel(summary.tournament.type ?? summary.tournament.tournament_type)}</span>
                  <span>{summary.tournament.category_name ?? 'Sin categoría'}</span>
                  <span>{formatBranchLabel(summary.tournament.gender)}</span>
                  <span>{formatTournamentSystemLabel(summary.tournament.format ?? tournamentDisplayConfig.competitionSystem)}</span>
                </div>
                <p className="club-detailSchedule">{formatDate(summary.tournament.start_date)}{summary.tournament.end_date ? ` · ${formatDate(summary.tournament.end_date)}` : ''} · {tournamentDisplayConfig.venueName ?? activeClub?.name ?? 'Sede por definir'}</p>
              </div>

              <div className="club-detailBadges">
                <span className={`club-statusBadge club-statusBadge--${tournamentOperationalBadge.tone}`}>
                  {tournamentOperationalBadge.label}
                </span>
              </div>
            </header>

            <section className="club-stepper" aria-label="Progreso operativo">
              <div className="club-stepperMobileLead">
                <span>Etapa {stageIndex + 1} de {stageOrder.length}</span>
                <strong>{stageLabels[stageOrder[Math.max(stageIndex, 0)]]}</strong>
              </div>
              {stageOrder.map((stage, index) => {
                const state = summary.operationalStage === 'FINALIZADO' && index <= stageIndex
                  ? 'done'
                  : index < stageIndex
                    ? 'done'
                    : index === stageIndex
                      ? 'current'
                      : 'pending'
                const label = stage === 'PLAYOFF' && currentPlayoffRoundLabel
                  ? `${stageLabels[stage]} (${currentPlayoffRoundLabel})`
                  : stageLabels[stage]
                return (
                  <div key={stage} className={`club-step club-step--${state}`}>
                    <span>{index + 1}</span>
                    <strong>{label}</strong>
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
                  aria-selected={activeTab === 'agenda'}
                  className={`club-tab ${activeTab === 'agenda' ? 'club-tab--active' : ''}`}
                  onClick={() => setActiveTab('agenda')}
                >
                  Agenda
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
                    {renderOperationalNotices('general')}
                    <section className="club-summaryGrid">
                      <div className="club-summaryMain">
                        <article className="club-nextCard">
                          <span className="club-kicker">Próximo paso</span>
                          <h2>{isTournamentPaused ? 'Este torneo está pausado.' : summary.nextStep}</h2>
                          <p>{isTournamentPaused ? 'Nadie puede inscribirse hasta que lo reanudes.' : isDraft ? 'Publicalo para abrir las inscripciones.' : 'Seguimos el estado operativo del torneo en tiempo real.'}</p>
                          {isDraft ? <button type="button" className="club-nextAction" onClick={() => requestConfirmation({ title: 'Publicar torneo', body: 'Esto abre las inscripciones del torneo. Podés seguir gestionándolo desde este centro de control.', confirmLabel: 'Publicar torneo', onConfirm: publishTournament })} disabled={publishing || loading || deletingTournament || cancellingTournament}>{publishing ? 'Publicando...' : 'Publicar ahora →'}</button> : null}
                        </article>

                        <section className="club-metrics club-metrics--detail">
                          <div className="club-metric"><span>Inicio</span><strong>{formatDate(summary.tournament.start_date)}</strong></div>
                          <div className="club-metric"><span>Fin</span><strong>{formatDate(summary.tournament.end_date)}</strong></div>
                          <div className="club-metric club-metric--deadline"><span>Cierre inscripción</span><strong>{formatDateTime(summary.tournament.registration_deadline)}</strong></div>
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
                            <strong>{championPointRule ? `Ganador: ${championPointRule.points} pts` : 'Sin esquema de puntos'}</strong>
                          </button>
                        </section>

                        <section className="club-sportConfigCard">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Configuración deportiva</span>
                              <h2>Datos de competencia</h2>
                            </div>
                          </div>
                          <div className="club-sportConfigGrid">
                            <div className="club-sportConfigItem">
                              <span>Segmento / Rama</span>
                              <strong>{formatSegmentLabel(tournamentDisplayConfig.segmentType)}</strong>
                            </div>
                            <div className="club-sportConfigItem">
                              <span>Sistema de competencia</span>
                              <strong>{formatCompetitionSystemLabel(tournamentDisplayConfig.competitionSystem)}</strong>
                            </div>
                            <div className="club-sportConfigItem">
                              <span>Sede / Complejo</span>
                              <strong>{tournamentDisplayConfig.venueName ?? activeClub?.name ?? 'Sin sede definida'}</strong>
                            </div>
                            <div className="club-sportConfigItem club-sportConfigItem--wide">
                              <span>Descripción / Observaciones públicas</span>
                              <p>{tournamentDisplayConfig.publicDescription ?? 'Todavía no se cargaron observaciones públicas para este torneo.'}</p>
                            </div>
                          </div>
                        </section>
                      </div>

                      <article className="club-flyerSlot">
                        <button type="button" className="club-flyerPreviewButton" onClick={() => setFlyerModalOpen(true)}>
                          <TournamentFlyerPreviewCard value={flyerConfig} previewData={flyerPreviewData} variant="card" />
                        </button>
                        <div className="club-flyerSlotCopy"><span className="club-kicker">Flyer del torneo</span><strong>{flyerConfig.mode === 'MANUAL' ? 'Personalizado' : flyerConfig.mode === 'NONE' ? 'Sin flyer' : 'Automático'}</strong><small>{flyerConfig.mode === 'NONE' ? 'Podés configurarlo cuando quieras.' : `Fondo ${flyerConfig.backgroundId.replace('fondo', '')}`}</small><button type="button" onClick={() => setFlyerModalOpen(true)}>Ver grande →</button></div>
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
                        {canFinalizeTournament ? (
                          <button
                            type="button"
                            className="club-nextAction"
                            disabled={finalizingTournament}
                            onClick={() => requestConfirmation({
                              title: 'Finalizar torneo',
                              body: 'Confirmá que todos los resultados están cargados. Se guardará el campeón y el torneo quedará finalizado.',
                              confirmLabel: 'Finalizar torneo',
                              onConfirm: finalizeTournament,
                            })}
                          >
                            {finalizingTournament ? 'Finalizando…' : 'Finalizar torneo →'}
                          </button>
                        ) : null}
                      </section>
                    ) : null}

                    <section className="club-dangerZone">
                      <div className="club-dangerZoneHead">
                        <div>
                          <span className="club-kicker">Zona de riesgo</span>
                          <h2>Administración avanzada</h2>
                        </div>
                        <p>Usá estas acciones solo cuando necesites cerrar o eliminar el torneo de forma explícita.</p>
                      </div>

                      <div className="club-dangerZoneGrid">
                        <article className="club-dangerCard club-pauseCard">
                          <div className="club-dangerCardBody">
                            <strong>{isTournamentPaused ? 'Reanudar torneo' : 'Pausar torneo'}</strong>
                            <p>{isTournamentPaused ? 'Volvé a habilitarlo sin perder parejas, agenda ni configuración.' : 'Detiene nuevas inscripciones temporalmente sin perder parejas ni configuración.'}</p>
                          </div>
                          <button
                            type="button"
                            className="club-pauseBtn"
                            disabled={pausingTournament || deletingTournament || cancellingTournament || loading || !canPauseTournament}
                            onClick={() => requestConfirmation({
                              title: isTournamentPaused ? 'Reanudar torneo' : 'Pausar torneo',
                              body: isTournamentPaused ? 'El torneo volverá a estar disponible según sus fechas y cierre de inscripción.' : 'Los jugadores no podrán seguir inscribiéndose hasta que lo reanudes. No se perderán parejas ni configuración.',
                              confirmLabel: isTournamentPaused ? 'Reanudar torneo' : 'Pausar torneo',
                              tone: 'cyan',
                              onConfirm: () => setTournamentPaused(!isTournamentPaused),
                            })}
                          >
                            {pausingTournament ? 'Actualizando...' : isTournamentPaused ? 'Reanudar torneo' : 'Pausar torneo'}
                          </button>
                        </article>
                        <article className="club-dangerCard">
                          <div className="club-dangerCardBody">
                            <strong>Cancelar / anular torneo</strong>
                            <p>Cancelar o anular conserva el historial, pero evita que el torneo siga operativo.</p>
                          </div>
                          <button
                            type="button"
                            className="club-dangerGhostBtn"
                            disabled={!canCancelTournament || deletingTournament || cancellingTournament || loading}
                            onClick={() => {
                              setCancelTournamentModal({ warning: hasCompetitiveActivity ? 'Este torneo tiene actividad competitiva cargada. El historial se conserva, pero dejará de estar operativo.' : null })
                              setMessage('')
                              setActionMessage('')
                            }}
                          >
                            {cancellingTournament ? 'Cancelando...' : 'Cancelar / anular'}
                          </button>
                        </article>

                        <article className="club-dangerCard">
                          <div className="club-dangerCardBody">
                            <strong>Eliminar torneo</strong>
                            <p>Elimina el torneo y sus datos vinculados. Esta acción es irreversible.</p>
                            {deleteTournamentWarning ? (
                              <span className="club-dangerWarning">{deleteTournamentWarning}</span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="club-deleteBtn"
                            disabled={deletingTournament || cancellingTournament || loading}
                            onClick={() => requestConfirmation({
                              title: 'Eliminar torneo',
                              body: `¿Eliminar este torneo? Esta acción es irreversible. Para continuar, escribí exactamente ACEPTAR.${deleteTournamentWarning ? ` ${deleteTournamentWarning}` : ''}`,
                              confirmLabel: 'Eliminar torneo',
                              tone: 'magenta',
                              confirmationKeyword: 'ACEPTAR',
                              onConfirm: deleteTournament,
                            })}
                          >
                            {deletingTournament ? 'Eliminando...' : 'Eliminar torneo'}
                          </button>
                        </article>
                      </div>
                    </section>
                  </div>
                ) : null}

                {activeTab === 'agenda' ? (
                  <div className="club-tabContent">
                    <TournamentLiveAgendaTab
                      clubId={activeClub?.id}
                      tournamentId={tournamentId}
                      tournamentStatus={summary.tournament.status}
                      registrationsCount={registrations.length}
                      hasGroups={seedMeta.hasGroups}
                      onPublish={isDraft ? () => requestConfirmation({ title: 'Publicar torneo', body: 'Esto abre las inscripciones del torneo. Podés seguir gestionándolo desde este centro de control.', confirmLabel: 'Publicar torneo', onConfirm: publishTournament }) : undefined}
                      onOpenGroups={() => setActiveTab('grupos')}
                    />
                  </div>
                ) : null}

                {activeTab === 'inscriptos' ? (
                  <div className="club-tabContent">
                    {registrations.length === 0 ? (
                      <section className="club-registrationEmptyState">
                        <span className="club-kicker">Inscriptos</span>
                        <h2>Todavía no hay parejas inscriptas</h2>
                        <p>{isDraft ? 'Publicá el torneo para abrir las inscripciones.' : 'Cuando una pareja se anote, vas a poder gestionar su estado y pago desde acá.'}</p>
                        <div>
                          {isDraft ? <button type="button" className="club-generateSeedBtn" onClick={() => requestConfirmation({ title: 'Publicar torneo', body: 'Esto abre las inscripciones del torneo. Podés seguir gestionándolo desde este centro de control.', confirmLabel: 'Publicar torneo', onConfirm: publishTournament })}>Publicar torneo</button> : null}
                          <button type="button" className="club-generateGroupsBtn" disabled={!canAddPair || creatingManual} onClick={openManualRegistration}>Agregar pareja manualmente</button>
                        </div>
                      </section>
                    ) : (<>
                    {renderOperationalNotices('registrations')}
                    <section className="club-inscriptionsOps">
                      <div className="club-readinessGrid">
                        <div className={`club-readinessItem ${registrationStats.eligible > 0 ? 'club-readinessItem--ready' : ''}`}>
                          <span>Listas para seed</span>
                          <b>{registrationStats.eligible}</b>
                        </div>
                        <div className={`club-readinessItem ${summary.counts.registrations.confirmed > 0 ? 'club-readinessItem--ready' : ''}`}>
                          <span>Confirmadas</span>
                          <b>{summary.counts.registrations.confirmed}</b>
                        </div>
                        <div className={`club-readinessItem ${registrationStats.withoutPayment > 0 ? 'club-readinessItem--attention' : ''}`}>
                          <span>Sin pago</span>
                          <b>{registrationStats.withoutPayment}</b>
                        </div>
                        <div className={`club-readinessItem ${registrationStats.paymentPending > 0 ? 'club-readinessItem--attention' : ''}`}>
                          <span>Pendientes</span>
                          <b>{registrationStats.paymentPending}</b>
                        </div>
                        <div className={`club-readinessItem ${registrationStats.blocked > 0 ? 'club-readinessItem--blocked' : ''}`}>
                          <span>Bloqueadas</span>
                          <b>{registrationStats.blocked}</b>
                        </div>
                        <div className="club-readinessItem">
                          <span>Cupo</span>
                          <b>{summary.counts.registrations.confirmed}{summary.tournament.max_pairs ? `/${summary.tournament.max_pairs}` : ''}</b>
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
                              onClick={requestGenerateGroups}
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

                    {(pendingChangeRequests.length + pendingOperationalPayments.length) > 0 ? <Link href="/club/solicitudes" className="club-pendingRequestsLink">
                      <span className="club-kicker">Solicitudes</span>
                      <strong>{pendingChangeRequests.length + pendingOperationalPayments.length} pendiente{pendingChangeRequests.length + pendingOperationalPayments.length === 1 ? '' : 's'} por resolver</strong>
                      <small>{pendingChangeRequests.length ? `${pendingChangeRequests.length} baja${pendingChangeRequests.length === 1 ? '' : 's'}` : ''}{pendingChangeRequests.length && pendingOperationalPayments.length ? ' · ' : ''}{pendingOperationalPayments.length ? `${pendingOperationalPayments.length} pago${pendingOperationalPayments.length === 1 ? '' : 's'}` : ''}</small>
                      <b>Ver solicitudes →</b>
                    </Link> : null}

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
                            <article
                              key={registration.id}
                              id={`registration-${registration.id}`}
                              className={`club-registrationMiniRow ${highlightedRegistrationId === registration.id ? 'is-highlighted' : ''}`}
                            >
                              <div className="club-teamCompactMobile" aria-label={`Pareja: ${teamName(registration)}`}>
                                <strong>{teamName(registration)}</strong>
                                <span>{formatDate(registration.created_at)}</span>
                              </div>
                              <div className="club-teamMini">
                                <div className="club-teamLinks">
                                  {(registration.team?.players ?? []).map((player) => (
                                    <div key={player.user_id} className="club-teamPlayerRow">
                                      <Link href={`/club/jugadores/${player.user_id}`} className="club-teamLink">
                                        {player.full_name}
                                      </Link>
                                      <small>{player.ranking_points ?? 0} pts</small>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="club-registrationMeta">
                                <div className="club-dateMini">
                                  <strong>{formatDate(registration.created_at)}</strong>
                                  <span>Inscripción</span>
                                </div>
                                <span className={`club-statusBadge club-statusBadge--${statusTone(registration.status)}`}>
                                  {statusLabels[registration.status] ?? registration.status}
                                </span>
                                <span className={`club-paymentBadge club-paymentBadge--${paymentTone(registration.payment_status)}`}>
                                  {paymentLabel(registration)}
                                </span>
                                {registration.registration_change_request?.status === 'PENDING' ? (
                                  <span className="club-statusBadge club-statusBadge--pending">
                                    Baja solicitada
                                    {registration.registration_change_request.refund_percent !== null ? ` · ${registration.registration_change_request.refund_percent}%` : ''}
                                  </span>
                                ) : null}
                              </div>
                              <div className="club-seedMini">
                                <strong title="El seed define el orden inicial de las parejas para armar grupos equilibrados">
                                  {registration.seed_snapshot ? `#${registration.seed_snapshot.seed}` : 'Sin seed'}
                                </strong>
                              </div>
                              <div className="club-scoreMini">
                                <strong>{getRegistrationDisplayScore(registration)} pts</strong>
                                <span>{getRegistrationScoreLabel(registration)}</span>
                              </div>
                              <div className="club-registrationActions">
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
                    </>)}
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
                    ) : (
                      <section className="club-registrationsPanel">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Orden competitivo congelado</span>
                              <h2>Parejas sembradas</h2>
                            </div>
                            <span className="club-groupCapacity">{seedMeta.seededTeamsCount}</span>
                          </div>
                          {!seedMeta.hasGroups ? (
                            <div className="club-nextSeedStep">
                              <div>
                                <span>Siguiente paso</span>
                                <p>Ya tenés {seedMeta.seededTeamsCount} parejas sembradas. Generá los grupos para continuar.</p>
                              </div>
                              <button
                                type="button"
                                className="club-generateGroupsBtn"
                                disabled={!canGenerateGroups || generatingGroups || loadingRegistrations}
                                onClick={requestGenerateGroups}
                              >
                                {generatingGroups ? 'Generando...' : 'Generar grupos'}
                              </button>
                            </div>
                          ) : null}
                          <div className="club-seededTeamsList">
                            {sortedRegistrations.filter((registration) => registration.seed_snapshot).map((registration) => (
                              <article key={registration.id} className="club-seededTeamItem">
                                <span className="club-seededTeamPosition">#{registration.seed_snapshot?.seed}</span>
                                <strong>{registration.team?.players?.map((player) => player.full_name).join(' / ') || 'Pareja sin datos'}</strong>
                                <span className="club-groupMetaPill club-groupMetaPill--neutral">
                                  {registration.seed_snapshot?.team_score ?? 0} pts
                                </span>
                              </article>
                            ))}
                          </div>
                      </section>
                    )}
                  </div>
                ) : null}

                {activeTab === 'grupos' ? (
                  <div className="club-tabContent club-groupsTabContent">
                    {renderOperationalNotices('groups')}
                    {!seedMeta.hasGroups || sortedGroups.length === 0 ? (
                      <section className="club-placeholderPanel">
                        <span className="club-kicker">Grupos</span>
                        <h2>Todavía no se generaron grupos</h2>
                        <p>Cuando armes los grupos desde Seed, acá vas a ver la parte competitiva de cada grupo.</p>
                        </section>
                      ) : (
                        <>
                          <section className="club-registrationsPanel">
                            <div className="club-sectionHead">
                              <div>
                                <span className="club-kicker">Planificación</span>
                                <h2>Ventana operativa de grupos</h2>
                              </div>
                              <button
                                type="button"
                                className="club-secondaryBtn club-secondaryBtn--compact"
                                onClick={openCourtConfigModal}
                              >
                                {tournamentRuleSchedule.tournamentCourts.length === 0 ? 'Agregar canchas' : 'Configurar canchas'}
                              </button>
                            </div>
                            <div className="club-planningMobileLayout">
                              <div className="club-planningSummary">
                                <div className="club-planningMetric">
                                  <span>Partidos de grupos</span>
                                  <strong>{projectedGroupMatchesCount}</strong>
                                </div>
                                <div className="club-planningMetric">
                                  <span>Canchas seleccionadas</span>
                                  <strong>{tournamentRuleSchedule.tournamentCourts.length}</strong>
                                </div>
                                <div className="club-planningMetric">
                                  <span>Duración estimada</span>
                                  <strong>{tournamentRuleSchedule.scheduleConfig.match_duration_minutes} min</strong>
                                </div>
                                <div className="club-planningMetric">
                                  <span>Capacidad disponible</span>
                                  <strong>{groupsPlanningCapacity.totalCapacity} partidos</strong>
                                </div>
                              </div>
                              <div className={`club-planningStatus ${groupPlanningStatus === 'Insuficiente' ? 'club-planningStatus--danger' : groupPlanningStatus === 'Suficiente' ? 'club-planningStatus--success' : ''}`}>
                                <span>Estado</span>
                                <strong>{groupPlanningStatus}</strong>
                                {tournamentRuleSchedule.scheduleConfig.mode === 'AUTO' ? (
                                  <small>{groupsPlanningCapacity.isEnough
                                    ? `Entran los ${projectedGroupMatchesCount} partidos.`
                                    : `Con ${tournamentRuleSchedule.tournamentCourts.length} canchas entran ${groupsPlanningCapacity.totalCapacity} de ${projectedGroupMatchesCount} partidos. Faltan ${groupsPlanningCapacity.overflowMatches}.`}</small>
                                ) : null}
                              </div>
                            </div>
                          </section>
                          {canGenerateOpenPlayoff ? (
                            <section className="club-nextGroupStep">
                              <div>
                                <span>Siguiente paso</span>
                                <h2>Los grupos están completos</h2>
                                <p>Ya cargaste todos los resultados. Generá el playoff para continuar el torneo.</p>
                              </div>
                              <button
                                type="button"
                                className="club-generateSeedBtn"
                                disabled={generatingOpenPlayoff}
                                onClick={requestGenerateOpenPlayoff}
                              >
                                {generatingOpenPlayoff ? 'Generando...' : 'Generar playoff'}
                              </button>
                            </section>
                          ) : null}
                          {!seedMeta.hasGroupMatches || groupMatches.length === 0 ? (
                            <section className="club-registrationsPanel">
                              <div className="club-sectionHead">
                                <div>
                                  <span className="club-kicker">Siguiente paso</span>
                                  <h2>Falta generar los partidos de grupos</h2>
                                </div>
                              </div>
                              <div className="club-inlineNote">
                                {groupMatchGenerationBody}
                              </div>
                              {autoPlanningBlocked ? (
                                <div className="club-inlineNote club-inlineNote--warning">
                                  Con la configuración actual no alcanza la capacidad. Sumá canchas o ampliá el horario de grupos antes de generar.
                                </div>
                              ) : null}
                              <div className="club-seedActions" style={{ marginTop: 10 }}>
                                <button
                                  type="button"
                                  className="club-generateMatchesBtn"
                                  disabled={!canGenerateGroupMatches || generatingGroupMatches || loadingRegistrations || autoPlanningBlocked}
                                  onClick={() => requestConfirmation({
                                    title: 'Generar partidos de grupos',
                                    body: groupMatchGenerationBody,
                                    confirmLabel: 'Generar partidos',
                                    tone: 'magenta',
                                    onConfirm: generateGroupMatches,
                                  })}
                                >
                                  {generatingGroupMatches ? 'Generando...' : 'Generar partidos de grupos'}
                                </button>
                              </div>
                            </section>
                          ) : null}

                        <div className="club-matchList">
                          {sortedGroups.map((group) => {
                            const standingBlock = standingsByGroupId[group.id]
                            const matches = groupMatchesByGroup[group.id] ?? []
                            const projectedMatches = group.size === 4 ? 4 : group.size === 3 ? 3 : matches.length
                            const secondRoundDefined = group.size === 4 && matches.filter((match) => Number(match.round) === 2).length === 2
                            const sectionKey = group.id
                            const isExpanded = expandedGroupMatches.includes(group.id)

                            return (
                              <section key={`${group.id}-competition`} className="club-matchSection">
                                <div className="club-matchSectionHead">
                                  <div>
                                    <strong>{`Grupo ${group.name}`}</strong>
                                    <span>{matches.length === projectedMatches ? `${projectedMatches} partidos` : `${matches.length} de ${projectedMatches} partidos`}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="club-showMatchesBtn"
                                    onClick={() => toggleGroupMatches(sectionKey)}
                                  >
                                    {isExpanded ? 'Ocultar partidos' : `Ver ${matches.length} partidos`}
                                  </button>
                                </div>

                                {renderTournamentGroupStandings(group, standingBlock)}
                                {group.size === 4 ? (
                                  <div className="club-groupFixtureHint">
                                    {secondRoundDefined
                                      ? 'Cruces Ganadores vs Ganadores y Perdedores vs Perdedores definidos.'
                                      : 'Se definirán 2 cruces después de completar los partidos iniciales.'}
                                  </div>
                                ) : null}
                                {renderGroupOperationalNotices(group.id)}

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
                        </>
                      )}
                  </div>
                ) : null}

                {activeTab === 'playoff' ? (
                  <div className="club-tabContent">
                    <div className="club-playoffNotices">{renderOperationalNotices('playoff')}</div>
                    {playoffMatchesTotal === 0 ? (
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
                            onClick={requestGenerateOpenPlayoff}
                          >
                            {generatingOpenPlayoff ? 'Generando...' : 'Generar playoff OPEN'}
                          </button>
                        ) : null}
                      </section>
                    ) : (
                      <>
                        {playoffRounds.length > 0 && <MobilePlayoff
                          rounds={playoffRounds}
                          currentPhase={currentPlayoffRound?.phase}
                          champion={summary.champion?.name}
                          nextMatch={nextPlayoffMatch}
                          teamNames={teamNameLookup}
                          teamSeeds={teamSeedLookup}
                          canEditResults={isPlatformAdmin || hasClubCapability(clubRole, 'matches:update')}
                          canSchedule={isPlatformAdmin || hasClubCapability(clubRole, 'matches:schedule')}
                          onResult={openResultForm}
                          onSchedule={openScheduleSwapModal}
                          scheduleDisabledReason={getScheduleSwapOpenDisabledReason}
                        />}
                        <div className="club-playoffDesktop">
                        <section className="club-registrationsPanel">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Resumen</span>
                              <h2>Playoff del torneo</h2>
                            </div>
                          </div>

                          <div className="club-playoffSummaryGrid">
                            <div className="club-groupSummaryCard">
                              <span>Partidos</span>
                              <strong>{playoffMatchesTotal}</strong>
                            </div>
                            <div className="club-groupSummaryCard">
                              <span>Ronda actual</span>
                              <strong>{currentPlayoffRound?.label ?? playoffStateLabel}</strong>
                            </div>
                            <div className={`club-groupSummaryCard ${playoffPlayedCount === playoffMatchesTotal ? 'club-groupSummaryCard--ready' : ''}`}>
                              <span>Jugados / total</span>
                              <strong>{playoffPlayedCount}/{playoffMatchesTotal}</strong>
                            </div>
                            <div className="club-groupSummaryCard">
                              <span>Campeón</span>
                              <strong>{summary.champion?.name ?? 'Por definirse'}</strong>
                            </div>
                            <div className="club-groupSummaryCard">
                              <span>Próximo partido</span>
                              <strong>
                                {nextPlayoffMatch
                                  ? `${formatPlayoffPhaseLabel(nextPlayoffMatch.phase)} · M${nextPlayoffMatch.match_order || nextPlayoffMatch.round}`
                                  : 'Sin pendientes'}
                              </strong>
                            </div>
                          </div>

                          {summary.champion ? (
                            <div className="club-playoffPodium">
                              <div className="club-playoffPodiumCard club-playoffPodiumCard--winner">
                                <span>Campeón</span>
                                <strong>{summary.champion?.name ?? 'Por definirse'}</strong>
                              </div>
                              <div className="club-playoffPodiumCard club-playoffPodiumCard--runnerUp">
                                <span>Subcampeón</span>
                                <strong>{runnerUp?.name ?? 'Por definirse'}</strong>
                              </div>
                            </div>
                          ) : null}

                          <p className="club-playoffSummaryText">{playoffStateDescription}</p>
                        </section>

                        <section className="club-playoffMatchesSection">
                          <div className="club-sectionHead">
                            <div>
                              <span className="club-kicker">Llaves</span>
                              <h2>Bracket profesional</h2>
                            </div>
                          </div>

                          {playoffRounds.length > 0 ? (
                            <>
                              <div className="club-playoffToolbar">
                                <div className="club-playoffToolbarLeft">
                                  <button
                                    type="button"
                                    className={`club-playoffViewChip ${bracketView === 'tree' ? 'club-playoffViewChip--active' : ''}`}
                                    onClick={() => setBracketView('tree')}
                                  >
                                    Vista de árbol
                                  </button>
                                  <button
                                    type="button"
                                    className={`club-playoffViewChip ${bracketView === 'compact' ? 'club-playoffViewChip--active' : ''}`}
                                    onClick={() => setBracketView('compact')}
                                  >
                                    Vista compacta
                                  </button>
                                </div>

                                <div className="club-playoffLegend" aria-label="Estados del playoff">
                                  <span><i className="club-playoffLegendDot club-playoffLegendDot--winner" />Ganador</span>
                                  <span><i className="club-playoffLegendDot club-playoffLegendDot--pending" />Por jugar</span>
                                  <span><i className="club-playoffLegendDot club-playoffLegendDot--walkover" />WO / Walkover</span>
                                </div>

                                <div className="club-playoffToolbarActions">
                                  {bracketView === 'tree' ? (
                                    <div className="club-playoffZoomControls" aria-label="Zoom del bracket">
                                      <button
                                        type="button"
                                        onClick={() => setPlayoffBracketZoomLevel(playoffBracketZoom - 0.1)}
                                        disabled={playoffBracketZoom <= 0.7}
                                        aria-label="Achicar bracket"
                                      >
                                        -
                                      </button>
                                      <button
                                        type="button"
                                        className="club-playoffZoomValue"
                                        onClick={() => setPlayoffBracketZoomLevel(1)}
                                        aria-label="Restablecer zoom del bracket"
                                      >
                                        {Math.round(playoffBracketZoom * 100)}%
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPlayoffBracketZoomLevel(playoffBracketZoom + 0.1)}
                                        disabled={playoffBracketZoom >= 1.3}
                                        aria-label="Agrandar bracket"
                                      >
                                        +
                                      </button>
                                    </div>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="club-secondaryBtn club-secondaryBtn--compact"
                                    onClick={() => {
                                      const target = document.getElementById('playoff-upcoming')
                                      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }}
                                  >
                                    Ver partidos
                                  </button>
                                </div>
                              </div>

                              {bracketView === 'tree' ? (
                                <div
                                  className={`club-playoffBracketViewport ${playoffBracketCanNavigate ? '' : 'club-playoffBracketViewport--simple'}`}
                                  ref={playoffBracketViewportRef}
                                >
                                  {playoffBracketNavState.isVisible && playoffBracketScrollState.canScrollLeft ? (
                                    <button
                                      type="button"
                                      className="club-playoffBracketNav club-playoffBracketNav--left"
                                      aria-label="Ver rondas anteriores"
                                      style={{ top: playoffBracketNavState.top }}
                                      onPointerDown={() => startPlayoffBracketHold('left')}
                                      onPointerUp={() => stopPlayoffBracketHold(true)}
                                      onPointerLeave={() => stopPlayoffBracketHold(false)}
                                      onPointerCancel={() => stopPlayoffBracketHold(false)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault()
                                          scrollPlayoffBracket('left')
                                        }
                                      }}
                                    >
                                      <ChevronLeft size={30} aria-hidden="true" />
                                    </button>
                                  ) : null}
                                  <div
                                    className={`club-playoffBracketScroll ${isDraggingPlayoffBracket ? 'club-playoffBracketScroll--dragging' : ''}`}
                                    ref={playoffBracketScrollRef}
                                    style={{ ['--playoff-bracket-zoom' as string]: String(playoffBracketZoom) }}
                                    onScroll={updatePlayoffBracketScrollState}
                                    onPointerDown={startPlayoffBracketDrag}
                                    onPointerMove={movePlayoffBracketDrag}
                                    onPointerUp={stopPlayoffBracketDrag}
                                    onPointerCancel={stopPlayoffBracketDrag}
                                    onPointerLeave={stopPlayoffBracketDrag}
                                  >
                                  <div
                                    className={`club-playoffBracketGrid ${shouldUseFluidPlayoffGrid ? 'club-playoffBracketGrid--fluid' : ''}`}
                                    style={playoffBracketGridStyle}
                                  >
                                    {playoffRounds.map((round, roundIndex) => (
                                      <section
                                        key={round.phase}
                                        className="club-playoffRoundColumn"
                                        style={getPlayoffRoundLayoutStyle(roundIndex, round.visualRows)}
                                      >
                                        <div className="club-playoffRoundHead">
                                          <div className="club-playoffRoundHeadContent">
                                            <span className="club-playoffRoundLabel">{round.label}</span>
                                            <b>{round.teamsCount} equipo{round.teamsCount === 1 ? '' : 's'}</b>
                                          </div>
                                          <span className="club-playoffRoundCount">
                                            {round.matches.length > 0
                                              ? `${round.matches.length} partido${round.matches.length === 1 ? '' : 's'}`
                                              : 'En espera'}
                                          </span>
                                        </div>
                                        <div className="club-playoffRoundMatches">
                                          {round.slots.map((slot, slotIndex) => renderPlayoffVisualSlot(slot, round.label, slotIndex, {
                                            finalColumn: round.phase === 'FINAL',
                                            useTreePlacement: true,
                                          }))}
                                          {renderPlayoffRoundConnectors(roundIndex)}
                                        </div>
                                      </section>
                                    ))}
                                  </div>
                                  </div>
                                  {playoffBracketNavState.isVisible && playoffBracketScrollState.canScrollRight ? (
                                    <button
                                      type="button"
                                      className="club-playoffBracketNav club-playoffBracketNav--right"
                                      aria-label="Ver rondas siguientes"
                                      style={{ top: playoffBracketNavState.top }}
                                      onPointerDown={() => startPlayoffBracketHold('right')}
                                      onPointerUp={() => stopPlayoffBracketHold(true)}
                                      onPointerLeave={() => stopPlayoffBracketHold(false)}
                                      onPointerCancel={() => stopPlayoffBracketHold(false)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault()
                                          scrollPlayoffBracket('right')
                                        }
                                      }}
                                    >
                                      <ChevronRight size={30} aria-hidden="true" />
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="club-playoffCompactLayout">
                                  {playoffRounds.map((round) => (
                                    <section key={`compact-round-${round.phase}`} className="club-playoffCompactRound">
                                      <div className="club-playoffRoundHead">
                                        <div className="club-playoffRoundHeadContent">
                                          <span className="club-playoffRoundLabel">{round.label}</span>
                                          <b>{round.teamsCount} equipo{round.teamsCount === 1 ? '' : 's'}</b>
                                        </div>
                                        <span className="club-playoffRoundCount">
                                          {round.matches.length > 0
                                            ? `${round.matches.length} partido${round.matches.length === 1 ? '' : 's'}`
                                            : 'En espera'}
                                        </span>
                                      </div>
                                      <div className="club-playoffCompactMatches">
                                        {round.slots.map((slot) => renderCompactPlayoffSlot(slot, round.label))}
                                      </div>
                                    </section>
                                  ))}
                                </div>
                              )}

                            </>
                          ) : (
                            <div className="club-inlineNote">
                              El playoff ya existe, pero todavía no pudimos ordenar visualmente las rondas con los datos disponibles.
                            </div>
                          )}
                        </section>


                        {pendingPlayoffMatches.length > 0 ? (
                          <section className="club-playoffUpcomingSection" id="playoff-upcoming">
                            <div className="club-sectionHead">
                              <div>
                                <span className="club-kicker">Agenda</span>
                                <h2>Próximos partidos</h2>
                              </div>
                            </div>

                            <div className="club-playoffUpcomingTable" role="table" aria-label="Próximos partidos de playoff">
                              <div className="club-playoffUpcomingHead" role="row">
                                <span role="columnheader">Ronda</span>
                                <span role="columnheader">Partido</span>
                                <span role="columnheader">Equipos</span>
                                <span role="columnheader">Programado</span>
                                <span role="columnheader">Acción</span>
                              </div>

                              {pendingPlayoffMatches.map((match) => (
                                <div key={`upcoming-${match.id}`} className="club-playoffUpcomingRow" role="row">
                                  <span role="cell">{formatPlayoffPhaseLabel(match.phase)}</span>
                                  <span role="cell">M{match.match_order || match.round}</span>
                                  <span role="cell">
                                    <strong>{match.team1_name ?? teamNameLookup.get(match.team1_id) ?? 'Equipo 1'}</strong>
                                    <em>vs</em>
                                    <strong>{match.team2_name ?? teamNameLookup.get(match.team2_id) ?? 'Equipo 2'}</strong>
                                  </span>
                                  <span role="cell">
                                    {match.scheduled_at
                                      ? `${formatDate(match.scheduled_at)} · ${new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(match.scheduled_at))}`
                                      : 'Por definir'}
                                  </span>
                                  <span role="cell">
                                    <button
                                      type="button"
                                      className="club-groupResultBtn club-groupResultBtn--secondary"
                                      onClick={() => openResultForm(match)}
                                    >
                                      Cargar
                                    </button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        </div>
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

            {visiblePointRules.length > 0 ? (
              <div className="club-pointsList">
                {visiblePointRules.map((rule) => (
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

      {scheduleSwapModal && scheduleSwapSourceMatch ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingScheduleSwap && setScheduleSwapModal(null)}>
          <section
            className="club-confirmModal club-scheduleSwapModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-swap-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="club-pointsHead">
              <div>
                <span className="club-kicker">Agenda operativa</span>
                <h2 id="schedule-swap-title">Cambiar horario/cancha</h2>
                <p>Intercambiá este turno con otro partido pendiente del torneo.</p>
              </div>
              <button
                type="button"
                className="club-editBtn"
                disabled={savingScheduleSwap}
                onClick={() => setScheduleSwapModal(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="club-scheduleSwapCurrent">
              <span>Partido actual</span>
              <strong>{getMatchTeamsLabel(scheduleSwapSourceMatch)}</strong>
              <small>{getMatchScheduleLabel(scheduleSwapSourceMatch)}</small>
            </div>

            {scheduleSwapModal.error ? (
              <div className="club-manualError" role="alert">
                {scheduleSwapModal.error}
              </div>
            ) : null}

            <label className="club-manualField">
              <span>Intercambiar con</span>
              <select
                value={scheduleSwapModal.targetMatchId}
                onChange={(event) => setScheduleSwapModal((current) => current ? { ...current, targetMatchId: event.target.value, error: '' } : current)}
                disabled={savingScheduleSwap || Boolean(getScheduleSwapDisabledReason(scheduleSwapSourceMatch))}
              >
                <option value="">Seleccioná un partido pendiente</option>
                {scheduleSwapCandidates.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchScheduleLabel(match)} - {getMatchTeamsLabel(match)}
                  </option>
                ))}
              </select>
            </label>

            {scheduleSwapCandidates.length === 0 ? (
              <div className="club-emptyInline">
                No hay otros partidos pendientes con horario y cancha asignados para intercambiar.
              </div>
            ) : null}

            <div className="club-modalActions">
              <button type="button" className="club-editBtn" disabled={savingScheduleSwap} onClick={() => setScheduleSwapModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="club-primaryBtn"
                disabled={savingScheduleSwap || !scheduleSwapModal.targetMatchId || Boolean(getScheduleSwapDisabledReason(scheduleSwapSourceMatch))}
                onClick={submitScheduleSwap}
              >
                {savingScheduleSwap ? 'Intercambiando...' : 'Intercambiar'}
              </button>
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

      {courtConfigModalOpen ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !savingCourtConfig && setCourtConfigModalOpen(false)}>
          <section className="club-manualModal club-courtConfigModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="club-manualHead">
              <div>
                <span className="club-kicker">Planificación</span>
                <h2>Configurar canchas del torneo</h2>
                <p>Elegí complejo y cancha para recalcular la capacidad de grupos sin salir de esta pantalla.</p>
              </div>
              <button type="button" className="club-modalClose" disabled={savingCourtConfig} onClick={() => setCourtConfigModalOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="club-manualGrid">
              <label className="club-manualField">
                <span>Complejo / Sede</span>
                <select
                  value={courtDraft.complexId}
                  onChange={(event) => setCourtDraft({ complexId: event.target.value, courtName: '' })}
                  disabled={loadingComplexes}
                >
                  <option value="">{loadingComplexes ? 'Cargando complejos...' : 'Seleccioná un complejo'}</option>
                  {complexOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>

              <label className="club-manualField">
                <span>Cancha</span>
                <select
                  value={courtDraft.courtName}
                  onChange={(event) => setCourtDraft((current) => ({ ...current, courtName: event.target.value }))}
                  disabled={!courtDraft.complexId || !availableSelectedComplexCourts.length}
                >
                  <option value="">
                    {!courtDraft.complexId
                      ? 'Elegí un complejo primero'
                      : availableSelectedComplexCourts.length
                        ? 'Seleccioná una cancha'
                        : 'No hay más canchas disponibles'}
                  </option>
                  {availableSelectedComplexCourts.map((courtName) => (
                    <option key={courtName} value={courtName}>{courtName}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="club-courtComposerRow">
              <button type="button" className="club-secondaryBtn club-secondaryBtn--compact" disabled={!courtDraft.courtName} onClick={addTournamentCourt}>
                + Agregar
              </button>
            </div>

            {courtDraft.complexId && !selectedComplexCourts.length ? (
              <div className="club-emptyInline">
                Este complejo todavía no tiene canchas cargadas.
              </div>
            ) : null}
            {courtDraft.complexId && selectedComplexCourts.length > 0 && !availableSelectedComplexCourts.length ? (
              <div className="club-emptyInline">
                No hay más canchas disponibles en este club.
              </div>
            ) : null}

            {tournamentCourtsDraft.length > 0 ? (
              <div className="club-courtDraftList">
                {tournamentCourtsDraft.map((court, index) => (
                  <div key={`${court.complex_name ?? 'club'}-${court.name}-${index}`} className="club-courtDraftCard">
                    <div>
                      <strong>{court.name}</strong>
                      <span>{court.complex_name || tournamentDisplayConfig.venueName || activeClub?.name || 'Complejo por definir'}</span>
                    </div>
                    <small>{court.source === 'EXTERNAL_COMPLEX' ? 'Otro complejo' : 'Club actual'}</small>
                    <button type="button" className="club-chipRemove" onClick={() => removeTournamentCourt(index)}>Quitar</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="club-emptyInline">Todavía no agregaste canchas para este torneo.</div>
            )}

            <div className="club-scheduleCapacity">
              <strong>
                Con {tournamentCourtsDraft.length} cancha{tournamentCourtsDraft.length === 1 ? '' : 's'} entre {tournamentRuleSchedule.scheduleConfig.groups.start_time} y {tournamentRuleSchedule.scheduleConfig.groups.end_time} entran {draftPlanningCapacity.totalCapacity} partidos.
              </strong>
              <small>
                {draftPlanningCapacity.isEnough
                  ? `Capacidad suficiente para ${projectedGroupMatchesCount} partido${projectedGroupMatchesCount === 1 ? '' : 's'} de grupos.`
                  : `Faltan ${draftPlanningCapacity.overflowMatches} partido${draftPlanningCapacity.overflowMatches === 1 ? '' : 's'} por ubicar. Agregá ${Math.max(0, draftPlanningCapacity.requiredCourts - tournamentCourtsDraft.length)} cancha${Math.max(0, draftPlanningCapacity.requiredCourts - tournamentCourtsDraft.length) === 1 ? '' : 's'} o ampliá la ventana horaria.`}
              </small>
            </div>

            <div className="club-confirmActions">
              <button type="button" className="club-editBtn" disabled={savingCourtConfig} onClick={() => setCourtConfigModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="club-primaryBtn" disabled={savingCourtConfig} onClick={saveTournamentCourts}>
                {savingCourtConfig ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
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

      {cancelTournamentModal ? (
        <div className="club-modalBackdrop" role="presentation" onMouseDown={() => !cancellingTournament && setCancelTournamentModal(null)}>
          <section className="club-confirmModal club-cancelModal" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <span className="club-kicker">Confirmación</span>
              <h2 id="cancel-modal-title">Cancelar o anular torneo</h2>
              <p>Cancelar o anular conserva el historial, pero evita que el torneo siga operativo.</p>
            </div>
            {cancelTournamentModal.warning ? (
              <div className="club-dangerInlineWarning">{cancelTournamentModal.warning}</div>
            ) : null}
            <label className="club-confirmField">
              <span>Motivo de cancelación</span>
              <textarea
                value={cancelTournamentReason}
                onChange={(event) => setCancelTournamentReason(event.target.value)}
                placeholder="Contanos brevemente por qué se cancela o anula."
                disabled={cancellingTournament}
                rows={4}
                autoFocus
              />
            </label>
            <label className="club-confirmField">
              <span>Escribí <strong>ACEPTAR</strong> para habilitar la acción final.</span>
              <input
                value={cancelTournamentKeyword}
                onChange={(event) => setCancelTournamentKeyword(event.target.value)}
                placeholder="ACEPTAR"
                disabled={cancellingTournament}
              />
            </label>
            <div className="club-confirmActions">
              <button type="button" className="club-editBtn" disabled={cancellingTournament} onClick={() => setCancelTournamentModal(null)}>
                Volver
              </button>
              <button
                type="button"
                className="club-primaryBtn club-dangerConfirmBtn"
                disabled={cancellingTournament || !cancelTournamentReason.trim() || cancelTournamentKeyword.trim() !== 'ACEPTAR'}
                onClick={cancelTournament}
              >
                {cancellingTournament ? 'Procesando...' : 'Cancelar torneo'}
              </button>
            </div>
          </section>
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
                disabled={confirmingAction || (confirmAction.confirmationKeyword === 'ACEPTAR' ? confirmKeywordInput.trim() !== 'ACEPTAR' : Boolean(confirmAction.confirmationKeyword && confirmKeywordInput.trim() !== confirmAction.confirmationKeyword))}
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
              <div className="club-registrationDetailCard club-registrationDetailCard--wide">
                <span>Puntos de los jugadores</span>
                <div className="club-registrationPointsList">
                  {(registrationDetailModal.registration.team?.players ?? []).map((player) => (
                    <div key={player.user_id} className="club-registrationPointsRow">
                      <b>{player.full_name}</b>
                      <strong>{player.ranking_points ?? 0} pts</strong>
                    </div>
                  ))}
                </div>
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
                <strong>{paymentLabel(registrationDetailModal.registration)}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Medio de pago</span>
                <strong>{admissionLabels[registrationDetailModal.registration.admission_status]}</strong>
              </div>
              {registrationDetailModal.registration.registration_change_request?.status === 'PENDING' ? (
                <div className="club-registrationDetailCard">
                  <span>Baja</span>
                  <strong>
                    Solicitada
                    {registrationDetailModal.registration.registration_change_request.refund_percent !== null
                      ? ` · ${registrationDetailModal.registration.registration_change_request.refund_percent}% estimado`
                      : ''}
                  </strong>
                </div>
              ) : null}
              <div className="club-registrationDetailCard">
                <span>Seed</span>
                <strong>{registrationDetailModal.registration.seed_snapshot ? `#${registrationDetailModal.registration.seed_snapshot.seed}` : 'Sin seed'}</strong>
              </div>
              <div className="club-registrationDetailCard">
                <span>Score</span>
                <strong>{getRegistrationDisplayScore(registrationDetailModal.registration)} pts</strong>
                <small>{registrationDetailModal.registration.seed_snapshot ? 'Score oficial congelado' : 'Score estimado por ranking actual'}</small>
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
        .club-playoffDesktop { display: contents; }
        @media (max-width: 900px) {
          .club-playoffDesktop { display: none !important; }
          .club-tournamentDetail.club-detail--playoff { overflow: visible; padding-top: 8px; }
          .club-detail--playoff .club-detailTopbar { position: static; box-shadow: none; }
          .club-detail--playoff .club-detailHero { padding-block: 8px; }
          .club-detail--playoff .club-tabPanel { padding-inline: 0; }
          .club-detail--playoff .club-tabPanel .club-tabContent { gap: 8px; }
          .club-playoffNotices .club-operationalNotice--info { display: none; }
          .club-playoffNotices:not(:has(.club-operationalNotice--warning, .club-operationalNotice--error)) { display: none; }
        }
        .club-tournamentDetail {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-tournamentDetail::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          pointer-events: none;
          position: absolute;
          right: 0;
          top: 0;
          z-index: 0;
        }
        .club-tournamentDetail::before { border-radius:23px 23px 0 0; left:0; right:0; }
        .club-detailTopbar { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
        .club-backMobile, .club-mobileActionMenu { display:none; }
        .club-topbarActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-backBtn { align-items: center; appearance: none; background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 28%, transparent); border-radius: 999px; color: #061b3a; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; line-height: 1.15; min-height: 38px; padding: 8px 13px; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-backBtn:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 46%, transparent); box-shadow: 0 10px 24px var(--club-admin-glow); transform: translateY(-1px); }
        .club-editBtn { align-items: center; appearance: none; background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); border-radius: 999px; color: #061b3a; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; line-height: 1.15; min-height: 38px; padding: 8px 13px; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-editBtn:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 50%, transparent); box-shadow: 0 10px 24px var(--club-admin-glow); transform: translateY(-1px); }
        .club-editBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-editBtn:disabled:hover { box-shadow: none; transform: none; }
        .club-mobileActionMenu { position:relative; }
        .club-mobileMenuTrigger { align-items:center; background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:999px; color:#061b3a; display:flex; height:42px; justify-content:center; padding:0; width:42px; }
        .club-mobileMenuTrigger svg { height:20px; width:20px; }
        .club-mobileMenuPopover { background:#fff; border:1px solid rgba(15,23,42,.10); border-radius:12px; box-shadow:0 16px 36px rgba(15,23,42,.16); display:grid; min-width:170px; padding:5px; position:absolute; right:0; top:48px; z-index:30; }
        .club-mobileMenuPopover a, .club-mobileMenuPopover button { background:transparent; border:0; border-radius:8px; color:#17253f; font:inherit; font-size:14px; font-weight:850; min-height:42px; padding:9px 10px; text-align:left; text-decoration:none; }
        .club-detailTopbar .club-backBtn,
        .club-topbarActions .club-editBtn {
          background: #fff;
          border-color: color-mix(in srgb, var(--club-admin-accent) 34%, rgba(15,23,42,.14));
          color: #061b3a;
          min-width: max-content;
        }
        .club-topbarActions .club-primaryBtn {
          background: var(--club-admin-accent);
          border-color: color-mix(in srgb, var(--club-admin-accent) 48%, rgba(255,255,255,.16));
          color: #fff;
          min-width: max-content;
        }
        .club-detailTopbar button:empty,
        .club-detailTopbar a:empty {
          display: none;
        }
        .club-deleteBtn { align-items: center; background: #fff1f2; border: 1px solid rgba(190,18,60,.22); border-radius: 8px; color: #be123c; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-pauseCard { background:#fffdf7; border-color:rgba(180,83,9,.18); }
        .club-pauseBtn { align-items:center; background:#fff8e7; border:1px solid rgba(180,83,9,.28); border-radius:8px; color:#9a5b09; cursor:pointer; display:inline-flex; font:inherit; font-size:13px; font-weight:900; justify-content:center; min-height:36px; padding:8px 12px; white-space:nowrap; }
        .club-pauseBtn:disabled { cursor:not-allowed; opacity:.55; }
        .club-deleteBtn:hover { background: #ffe4e6; border-color: rgba(190,18,60,.42); box-shadow: 0 8px 18px rgba(190,18,60,.12); transform: translateY(-1px); }
        .club-deleteBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-deleteBtn:disabled:hover { background: #fff1f2; border-color: rgba(190,18,60,.22); box-shadow: none; transform: none; }
        .club-dangerZone { border-top: 1px solid rgba(190,24,93,.12); display: grid; gap: 8px; margin-top: 6px; padding-top: 12px; }
        .club-dangerZoneHead { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
        .club-dangerZoneHead h2 { color: #17253f; font-size: 18px; line-height: 1.1; margin: 4px 0 0; }
        .club-dangerZoneHead p { color: #64748b; font-size: 13px; font-weight: 780; line-height: 1.4; margin: 0; max-width: 420px; }
        .club-dangerZoneGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-dangerCard { align-items: center; background: linear-gradient(180deg, #fff 0%, #fff8fa 100%); border: 1px solid rgba(190,24,93,.10); border-radius: 14px; display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 12px; }
        .club-dangerCardBody { display: grid; gap: 4px; min-width: 0; }
        .club-dangerCardBody strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.15; }
        .club-dangerCardBody p { color: #64748b; font-size: 12px; font-weight: 780; line-height: 1.35; margin: 0; }
        .club-dangerGhostBtn { align-items: center; background: #fff; border: 1px solid rgba(190,24,93,.18); border-radius: 8px; color: #be185d; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 13px; font-weight: 900; justify-content: center; min-height: 36px; padding: 8px 12px; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-dangerGhostBtn:hover:not(:disabled) { background: #fff1f2; border-color: rgba(190,24,93,.32); box-shadow: 0 8px 18px rgba(190,24,93,.10); transform: translateY(-1px); }
        .club-dangerGhostBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-dangerWarning { background: #fff1f2; border: 1px solid rgba(190,24,93,.14); border-radius: 10px; color: #9f1239; font-size: 11px; font-weight: 900; line-height: 1.35; padding: 7px 8px; }
        .club-detailHero { align-items: flex-start; background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft)); border: 1px solid rgba(15,23,42,.07); border-radius: 16px; box-shadow: none; display: flex; gap: 16px; justify-content: space-between; min-width: 0; padding: 13px 14px; }
        .club-detailMain { min-width: 0; }
        .club-title { color: #17253f; font-size: 28px; font-weight: 950; letter-spacing: 0; line-height: 1.05; margin: 3px 0 6px; }
        .club-metaLine { color: #64748b; display: flex; flex-wrap: wrap; font-size: 13px; font-weight: 800; gap: 8px 12px; min-width: 0; }
        .club-metaLine span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-detailSchedule { color:#52657a; font-size:12px; font-weight:800; line-height:1.3; margin:6px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-detailBadges { align-items: flex-end; display: flex; flex-direction: column; gap: 8px; }
        .club-statusBadge { align-items: center; border-radius: 999px; box-shadow: 0 8px 18px rgba(15,23,42,.05); display: inline-flex; font-size: 11px; font-weight: 950; gap: 6px; isolation: isolate; overflow: visible; padding: 6px 9px; position: relative; white-space: nowrap; z-index: 6; }
        .club-statusBadge--active,
        .club-statusBadge--registration { background: #ecfdf3; color: #166534; }
        .club-statusBadge--ready { background: #fff7df; color: #854d0e; }
        .club-statusBadge--done,
        .club-statusBadge--finished { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); color: #061b3a; }
        .club-statusBadge--operating,
        .club-statusBadge--running { animation: clubRunningPulse 1.65s ease-in-out infinite; background: #dff4ff; color: #075985; box-shadow: 0 0 0 1px rgba(14,165,233,.16), 0 8px 18px rgba(14,165,233,.18); }
        .club-statusBadge--running::after,
        .club-statusBadge--operating::after { animation: clubStatusPulseRing 1.65s ease-out infinite; background: rgba(14,165,233,.16); border: 1px solid rgba(14,165,233,.42); border-radius: inherit; content: ''; inset: -4px; pointer-events: none; position: absolute; z-index: -1; }
        .club-statusBadge--live { animation: clubLivePulse 1.45s ease-in-out infinite; background: #dc2626; color: #fff; box-shadow: 0 0 0 1px rgba(220,38,38,.18), 0 10px 22px rgba(220,38,38,.22); }
        .club-statusBadge--live::before { animation: clubLiveDot 1s ease-in-out infinite; background: #fff; border-radius: 999px; box-shadow: 0 0 0 2px rgba(255,255,255,.26), 0 0 8px rgba(255,255,255,.65); content: ''; flex: 0 0 auto; height: 6px; width: 6px; }
        .club-statusBadge--live::after { animation: clubLivePulseRing 1.45s ease-out infinite; background: rgba(220,38,38,.18); border: 1px solid rgba(220,38,38,.52); border-radius: inherit; content: ''; inset: -5px; pointer-events: none; position: absolute; z-index: -1; }
        @keyframes clubRunningPulse {
          0%, 100% { filter: saturate(1); }
          50% { filter: saturate(1.25); }
        }
        @keyframes clubStatusPulseRing {
          0% { opacity: .62; transform: scale(.96); }
          70% { opacity: 0; transform: scale(1.16); }
          100% { opacity: 0; transform: scale(1.16); }
        }
        @keyframes clubLivePulse {
          0%, 100% { filter: saturate(1); }
          50% { filter: saturate(1.35); }
        }
        @keyframes clubLivePulseRing {
          0% { opacity: .72; transform: scale(.95); }
          72% { opacity: 0; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(1.2); }
        }
        @keyframes clubLiveDot {
          0%, 100% { opacity: .74; transform: scale(.78); }
          50% { opacity: 1; transform: scale(1.18); }
        }
        .club-statusBadge--danger { background: #fff1f2; color: #9f1239; }
        .club-statusBadge--draft { background: #fff7df; color: #854d0e; }
        .club-statusBadge--paused { background: #fff8e7; color: #9a5b09; }
        .club-statusBadge--cancelled { background: #f1f5f9; color: #475569; }
        .club-stepper { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 6px; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 9px; padding: 7px; }
        .club-stepperMobileLead { display:none; }
        .club-step { align-items: center; border-radius: 10px; display: flex; gap: 6px; min-width: 0; padding: 6px; }
        .club-step span { align-items: center; border-radius: 999px; display: inline-flex; flex: 0 0 auto; font-size: 11px; font-weight: 950; height: 22px; justify-content: center; width: 22px; }
        .club-step strong { color: #475569; font-size: 11px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-step--done { background: #f0fdf4; }
        .club-step--done span { background: #16a34a; color: #fff; }
        .club-step--current { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); outline: 1px solid color-mix(in srgb, var(--club-admin-accent) 20%, transparent); }
        .club-step--current span { background: #061b3a; box-shadow: 0 8px 18px var(--club-admin-glow); color: #fff; }
        .club-step--pending { background: #f8fafc; }
        .club-step--pending span { background: #e2e8f0; color: #64748b; }
        .club-summaryGrid { align-items: stretch; display: grid; gap: 10px; grid-template-columns: minmax(0, 1.04fr) minmax(300px, .58fr); margin-top: 6px; }
        .club-summaryMain { display: grid; gap: 8px; min-width: 0; }
        .club-nextCard, .club-flyerSlot, .club-championCard, .club-card { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; min-width: 0; padding: 14px; }
        .club-sportConfigCard { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 8px; min-width: 0; padding: 11px 12px; }
        .club-sportConfigGrid { display: grid; gap: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-sportConfigItem { border-bottom: 1px solid rgba(15,23,42,.07); display: grid; gap: 3px; min-width: 0; padding: 8px 10px 8px 0; }
        .club-sportConfigItem:nth-child(even) { padding-left:10px; }
        .club-sportConfigItem:nth-last-child(-n+2) { border-bottom:0; }
        .club-sportConfigItem span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-sportConfigItem strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-sportConfigItem p { color: #475569; display: -webkit-box; font-size: 13px; font-weight: 780; line-height: 1.4; margin: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .club-sportConfigItem--wide { grid-column: 1 / -1; }
        .club-nextCard { align-content: start; align-self: start; border-color: color-mix(in srgb, var(--club-admin-accent) 22%, transparent); box-shadow: inset 3px 0 0 var(--club-admin-accent); display: grid; gap: 2px; min-height: 0; padding: 9px 11px; }
        .club-nextCard h2, .club-championCard h2, .club-actionsCard h2 { color: #17253f; font-size: 18px; line-height: 1.2; margin: 4px 0 6px; }
        .club-nextCard p, .club-flyerSlot p, .club-championCard p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-nextCard h2 { font-size: 14px; line-height: 1.14; margin: 1px 0 0; max-width: 28ch; }
        .club-nextCard p { font-size: 10px; line-height: 1.28; max-width: 48ch; }
        .club-nextAction { background:#061b3a; border:1px solid color-mix(in srgb,var(--club-admin-accent) 42%,transparent); border-radius:9px; box-shadow:0 10px 22px var(--club-admin-glow); color:#fff; cursor:pointer; font:inherit; font-size:12px; font-weight:950; justify-self:start; margin-top:5px; min-height:36px; padding:7px 11px; }
        .club-flyerSlot { align-content:center; align-self:stretch; background:linear-gradient(135deg,#f8fafc,color-mix(in srgb,var(--club-admin-accent) 8%,white)); border:1px solid rgba(15,23,42,.08); border-radius:14px; display:grid; gap:11px; grid-template-columns:116px minmax(0,1fr); min-height:0; padding:10px; }
        .club-flyerSlotCopy { align-content:center; display:grid; gap:3px; min-width:0; }
        .club-flyerSlotCopy strong { color:#17253f; font-size:14px; line-height:1.2; }
        .club-flyerSlotCopy small { color:#64748b; font-size:11px; font-weight:750; }
        .club-flyerSlotCopy button { background:transparent; border:0; color:var(--club-admin-accent); cursor:pointer; font:inherit; font-size:11px; font-weight:950; justify-self:start; margin-top:3px; padding:0; }
        .club-flyerPreviewButton { background:transparent; border:0; border-radius:12px; cursor:pointer; display:block; height:145px; min-height:0; overflow:hidden; padding:0; text-align:left; transition:transform .18s ease,box-shadow .18s ease; width:116px; }
        .club-flyerPreviewButton:hover { transform: translateY(-1px); }
        .club-flyerPreviewButton:focus-visible { outline: 2px solid var(--club-admin-accent); outline-offset: 3px; }
        .flyerPreviewShell { display: grid; height: 100%; min-width: 0; }
        .flyerPreview { border-radius: 18px; box-shadow: 0 16px 34px rgba(15,23,42,.13); min-height: 360px; overflow: hidden; padding: 18px; position: relative; }
        .club-flyerSlot .flyerPreview { aspect-ratio:4 / 5; border-radius:12px; box-sizing:border-box; height:145px; min-height:145px; padding:7px; width:116px; }
        .club-flyerSlot .flyerPreviewTop { gap:4px; }
        .club-flyerSlot .flyerPreviewClub,.club-flyerSlot .flyerPreviewType { font-size:6px; padding:3px 4px; }
        .club-flyerSlot .flyerPreviewBody { gap:3px; margin-top:6px; }
        .club-flyerSlot .flyerPreviewEyebrow { font-size:5px; }
        .club-flyerSlot .flyerPreviewMain h3 { font-size:14px; margin:2px 0; }
        .club-flyerSlot .flyerPreviewMain p { font-size:7px; }
        .club-flyerSlot .flyerPreviewDate { gap:2px; padding:3px 4px; }
        .club-flyerSlot .flyerPreviewDate strong { font-size:7px; }
        .club-flyerSlot .flyerPreviewDate span,.club-flyerSlot .flyerPreviewMeta { display:none; }
        .flyerPreview--manual { background-color: #020617; display: grid; place-items: center; }
        .flyerPreview::after { background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(2,6,23,.24) 100%); content: ''; inset: 0; pointer-events: none; position: absolute; }
        .flyerPreview--manual::after { background: radial-gradient(circle at center, rgba(255,255,255,.08), transparent 62%); }
        .flyerPreview > * { position: relative; z-index: 1; }
        .flyerManualImageFrame { align-items: center; display: flex; inset: 12px; justify-content: center; position: absolute; z-index: 1; }
        .flyerManualImageFrame img { border-radius: 14px; box-shadow: 0 18px 44px rgba(0,0,0,.34); display: block; height: 100%; max-height: 100%; max-width: 100%; object-fit: contain; width: 100%; }
        .flyerPreviewTop { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
        .flyerPreviewClub { backdrop-filter: blur(12px); background: rgba(15,23,42,.42); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; color: #f8fafc; display: inline-flex; font-size: 12px; letter-spacing: .04em; max-width: min(62%, 260px); overflow: hidden; padding: 7px 11px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .flyerPreviewType { backdrop-filter: blur(12px); background: rgba(15,23,42,.34); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; box-shadow: 0 10px 24px rgba(15,23,42,.16); font-size: 13px; letter-spacing: .04em; padding: 9px 14px; text-transform: uppercase; }
        .flyerPreviewBody { display: grid; gap: 14px; margin-top: 30px; }
        .flyerPreviewEyebrow { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; }
        .flyerPreviewMain h3 { font-size: clamp(30px, 4vw, 44px); letter-spacing: 0; line-height: 1.02; margin: 7px 0 8px; max-width: 10ch; text-wrap: balance; }
        .flyerPreviewMain p { color: inherit; font-size: 15px; line-height: 1.25; margin: 0; opacity: .92; }
        .flyerPreviewDate { background: rgba(15,23,42,.26); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.20); border-radius: 14px; box-shadow: 0 12px 32px rgba(15,23,42,.14); display: inline-grid; gap: 5px; justify-self: start; min-width: 0; padding: 11px 13px; }
        .flyerPreviewDate span, .flyerPreviewMeta span { color: rgba(226,232,240,.80); font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .flyerPreviewDate strong, .flyerPreviewMeta strong { color: #f8fafc; font-size: 16px; line-height: 1.15; }
        .flyerPreviewMeta { display: grid; gap: 9px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 24px; }
        .flyerPreviewMeta > div { backdrop-filter: blur(12px); background: rgba(15,23,42,.24); border: 1px solid rgba(255,255,255,.13); border-radius: 14px; box-shadow: 0 10px 26px rgba(15,23,42,.10); display: grid; gap: 5px; padding: 11px 13px; }
        .flyerManualOverlay, .flyerNoneOverlay { backdrop-filter: blur(14px); background: rgba(15,23,42,.48); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; bottom: 20px; display: grid; gap: 6px; left: 20px; padding: 14px; position: absolute; right: 20px; z-index: 2; }
        .flyerManualOverlay strong, .flyerNoneOverlay strong { color: #f8fafc; font-size: 15px; }
        .flyerManualOverlay span, .flyerNoneOverlay span { color: rgba(226,232,240,.88); font-size: 12px; font-weight: 700; line-height: 1.4; }
        .flyerPreview--detailLarge { min-height: 360px; }
        .flyerPreview--modal { min-height: 360px; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-metrics--detail { display: grid; gap: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 0; }
        .club-metric { background:#fff; border:0; border-bottom:1px solid rgba(15,23,42,.08); border-radius:0; display:grid; gap:3px; min-width:0; padding:9px 8px; }
        .club-metric:nth-child(3n+2) { border-left:1px solid rgba(15,23,42,.07); border-right:1px solid rgba(15,23,42,.07); }
        .club-metric span { color: #64748b; font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-metric strong { color: #17253f; font-size: 17px; font-weight: 950; line-height: 1.1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-metric--deadline strong { overflow:visible; text-overflow:clip; white-space:normal; }
        .club-metricButton { cursor: pointer; text-align: left; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .club-metricButton:hover { background: color-mix(in srgb, var(--club-admin-accent) 7%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); box-shadow: 0 10px 24px var(--club-admin-glow); transform: translateY(-1px); }
        .club-metricButton strong { font-size: 15px; }
        .club-championCard { align-items: stretch; background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%); border-color: rgba(22,163,74,.22); display: grid; gap: 10px; grid-template-columns: minmax(0, 1.45fr) minmax(220px, .55fr); margin-top: 12px; position: relative; }
        .club-championCard::before { background: linear-gradient(180deg, #16a34a, var(--club-admin-accent)); border-radius: 999px; bottom: 12px; content: ''; left: 10px; position: absolute; top: 12px; width: 5px; }
        .club-podiumMain { align-items: center; display: grid; gap: 12px; grid-template-columns: auto minmax(0, 1fr); min-width: 0; padding-left: 12px; }
        .club-podiumBadge { align-items: center; background: #16a34a; border: 1px solid rgba(20,83,45,.12); border-radius: 14px; box-shadow: 0 10px 22px rgba(22,163,74,.14); color: #fff; display: inline-flex; font-size: 20px; font-weight: 950; height: 54px; justify-content: center; width: 54px; }
        .club-championMain { min-width: 0; }
        .club-championMain h2 { color: #14532d; font-size: 24px; line-height: 1.08; margin: 4px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-runnerUp { align-self: center; background: rgba(255,255,255,.82); border: 1px solid rgba(15,23,42,.08); border-radius: 14px; box-shadow: 0 10px 24px rgba(15,23,42,.04); display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-runnerUp span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-runnerUp strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.12; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-actionsCard { align-items: center; background: linear-gradient(135deg, #fff, #f8fafc); display: flex; gap: 12px; justify-content: space-between; margin-top: 12px; }
        .club-actionGrid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.club-tabsShell { margin: 14px -22px 0; }
.club-tabs { align-items: center; background: linear-gradient(180deg, color-mix(in srgb, var(--club-admin-accent) 8%, white) 0%, #f8fafc 100%); border-bottom: 1px solid color-mix(in srgb, var(--club-admin-accent) 18%, transparent); border-top: 1px solid color-mix(in srgb, var(--club-admin-accent) 12%, transparent); box-shadow: inset 0 1px 0 rgba(255,255,255,.74); display: flex; gap: 20px; min-width: 0; overflow-x: auto; padding: 5px 22px 0; }
.club-tab { background: transparent; border: 0; border-bottom: 3px solid transparent; border-radius: 0; color: #64748b; cursor: pointer; flex: 0 0 auto; font-size: 13px; font-weight: 850; min-height: 36px; padding: 8px 2px 9px; transition: border-color .18s ease, color .18s ease, opacity .18s ease; white-space: nowrap; }
.club-tab:hover:not(:disabled) { color: #061b3a; opacity: .92; }
.club-tab--active { border-bottom-color: var(--club-admin-accent); color: #061b3a; font-weight: 950; }
.club-tab:disabled { cursor: not-allowed; opacity: .48; }
.club-tabPanel { margin-top: 12px; padding: 0 22px; }
        .club-tabContent { display: grid; gap: 12px; min-width: 0; }
        .club-operationalNotices { display: grid; gap: 6px; min-width: 0; }
        .club-operationalNotices--embedded { justify-self: center; max-width: 760px; width: min(100%, 760px); }
        .club-operationalNotice { align-items: center; background: rgba(238,251,255,.64); border: 1px solid rgba(14,165,233,.14); border-radius: 10px; color: #0f3f57; display: grid; gap: 6px; grid-template-columns: auto minmax(0, 1fr); min-width: 0; padding: 6px 8px; }
        .club-operationalNotice--warning { background: #fff7df; border-color: rgba(217,119,6,.22); color: #713f12; }
        .club-operationalNotice--success { background: #ecfdf3; border-color: rgba(22,163,74,.18); color: #14532d; }
        .club-operationalNoticeIcon { align-items: center; background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 16%, transparent); border-radius: 999px; color: #061b3a; display: inline-flex; flex: 0 0 auto; font-size: 10px; font-weight: 950; height: 18px; justify-content: center; line-height: 1; width: 18px; }
        .club-operationalNotice--warning .club-operationalNoticeIcon { background: rgba(217,119,6,.12); border-color: rgba(217,119,6,.20); color: #b45309; }
        .club-operationalNotice--success .club-operationalNoticeIcon { background: rgba(22,163,74,.12); border-color: rgba(22,163,74,.20); color: #15803d; }
        .club-operationalNoticeBody { align-items: baseline; display: flex; flex-wrap: wrap; gap: 3px 6px; min-width: 0; }
        .club-operationalNoticeBody strong { color: inherit; flex: 0 0 auto; font-size: 11px; font-weight: 950; line-height: 1.2; overflow-wrap: anywhere; }
        .club-operationalNoticeBody p { color: inherit; flex: 1 1 260px; font-size: 11px; font-weight: 780; line-height: 1.25; margin: 0; opacity: .86; overflow-wrap: anywhere; }
        .club-operationalNoticeDisclosure { min-width: 0; width: 100%; }
        .club-operationalNoticeDisclosure summary { align-items: center; cursor: pointer; display: flex; gap: 7px; justify-content: space-between; list-style: none; min-height: 20px; }
        .club-operationalNoticeDisclosure summary::-webkit-details-marker { display: none; }
        .club-operationalNoticeDisclosure summary::after { color: #0f3f57; content: '⌄'; font-size: 15px; font-weight: 950; line-height: 1; transition: transform .16s ease; }
        .club-operationalNoticeDisclosure[open] summary::after { transform: rotate(180deg); }
        .club-operationalNoticeDisclosure p { display: block; margin-top: 4px; }
        .club-inscriptionsOps { display: grid; gap: 10px; }
        .club-readinessGrid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .club-readinessItem { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 11px; display: grid; gap: 2px; min-width: 0; padding: 8px 9px; }
        .club-readinessItem span { color: #64748b; font-size: 10px; font-weight: 800; }
        .club-readinessItem b { color: #17253f; font-size: 18px; font-weight: 850; line-height: 1; }
        .club-readinessItem--ready { background: #f0fdf4; border-color: rgba(22,163,74,.18); }
        .club-readinessItem--attention { background:#fff7df; border-color:rgba(217,119,6,.20); }
        .club-readinessItem--blocked { background: #fff1f2; border-color: rgba(190,18,60,.12); }
        .club-registrationEmptyState { background:linear-gradient(135deg,#fff,color-mix(in srgb,var(--club-admin-accent) 8%,white)); border:1px solid color-mix(in srgb,var(--club-admin-accent) 22%,transparent); border-radius:14px; display:grid; gap:5px; padding:13px; }
        .club-registrationEmptyState h2 { color:#17253f; font-size:18px; line-height:1.15; margin:0; }
        .club-registrationEmptyState p { color:#64748b; font-size:13px; font-weight:760; line-height:1.38; margin:0; max-width:46ch; }
        .club-registrationEmptyState > div { display:flex; flex-wrap:wrap; gap:8px; margin-top:3px; }
        .club-seedStatus { align-items: center; border-radius: 14px; display: flex; gap: 12px; justify-content: space-between; min-width: 0; padding: 12px; }
        .club-seedStatus--ready { background: #ecfdf3; border: 1px solid rgba(22,163,74,.20); }
        .club-seedStatus--missing { background: #fff7df; border: 1px solid rgba(202,138,4,.18); }
        .club-seedStatus div:first-child { display: grid; gap: 4px; min-width: 0; }
        .club-seedStatus strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-seedStatus span { color: #64748b; font-size: 12px; font-weight: 750; line-height: 1.35; }
        .club-seedActions { align-items: center; display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-generateSeedBtn, .club-generateGroupsBtn, .club-generateMatchesBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; justify-content: center; min-height: 34px; padding: 8px 11px; transition: transform .16s ease, box-shadow .16s ease, background .16s ease, border-color .16s ease; white-space: nowrap; }
        .club-generateSeedBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 10px 22px var(--club-admin-glow); color: #fff; }
        .club-generateGroupsBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-generateMatchesBtn { background: #fff1f8; border: 1px solid rgba(190,24,93,.20); color: #be185d; }
        .club-generateSeedBtn:hover:not(:disabled), .club-generateGroupsBtn:hover:not(:disabled), .club-generateMatchesBtn:hover:not(:disabled) { box-shadow: 0 10px 22px rgba(15,23,42,.08); transform: translateY(-1px); }
        .club-generateSeedBtn:hover:not(:disabled) { box-shadow: 0 14px 30px var(--club-admin-glow); }
        .club-generateGroupsBtn:hover:not(:disabled) { background: color-mix(in srgb, var(--club-admin-accent) 8%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 48%, transparent); }
        .club-generateMatchesBtn:hover:not(:disabled) { background: #ffe4f1; border-color: rgba(190,24,93,.36); }
        .club-generateSeedBtn:disabled, .club-generateGroupsBtn:disabled, .club-generateMatchesBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-tournamentDetail .club-editBtn,
        .club-tournamentDetail .club-backBtn,
        .club-tournamentDetail .club-secondaryBtn,
        .club-tournamentDetail .club-generateGroupsBtn,
        .club-tournamentDetail .club-generateMatchesBtn,
        .club-tournamentDetail .club-viewBtn,
        .club-tournamentDetail .club-chipRemove,
        .club-tournamentDetail .club-modalClose {
          color: #061b3a !important;
          -webkit-text-fill-color: #061b3a !important;
        }
        .club-tournamentDetail .club-editBtn:disabled,
        .club-tournamentDetail .club-backBtn:disabled,
        .club-tournamentDetail .club-secondaryBtn:disabled,
        .club-tournamentDetail .club-generateGroupsBtn:disabled,
        .club-tournamentDetail .club-generateMatchesBtn:disabled,
        .club-tournamentDetail .club-viewBtn:disabled,
        .club-tournamentDetail .club-chipRemove:disabled,
        .club-tournamentDetail .club-modalClose:disabled {
          color: #061b3a !important;
          -webkit-text-fill-color: #061b3a !important;
          opacity: .72;
        }
        .club-tournamentDetail .club-primaryBtn:not(.club-publishBtn):not(.club-dangerConfirmBtn),
        .club-tournamentDetail .club-generateSeedBtn {
          color: #fff;
          -webkit-text-fill-color: #fff;
        }
        .club-registrationsPanel, .club-placeholderPanel { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 10px; min-width: 0; padding: 12px; }
        .club-pendingRequestsLink { align-items:center; background:linear-gradient(135deg,#fff,#f7fffb); border:1px solid color-mix(in srgb,var(--club-admin-accent) 24%,transparent); border-radius:13px; display:grid; gap:2px 10px; grid-template-columns:minmax(0,1fr) auto; min-width:0; padding:10px 11px; text-decoration:none; transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
        .club-pendingRequestsLink:hover { border-color:color-mix(in srgb,var(--club-admin-accent) 52%,transparent); box-shadow:0 10px 22px rgba(15,23,42,.08); transform:translateY(-1px); }
        .club-pendingRequestsLink .club-kicker { grid-column:1 / 2; }
        .club-pendingRequestsLink strong { color:#102340; font-size:14px; font-weight:850; line-height:1.15; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-pendingRequestsLink small { color:#64748b; font-size:11px; font-weight:700; grid-column:1 / 2; }
        .club-pendingRequestsLink > b { align-self:center; color:var(--club-admin-accent); font-size:11px; font-weight:850; grid-column:2; grid-row:1 / span 3; white-space:nowrap; }
        .club-cancellationRequests { background: linear-gradient(135deg, #fff 0%, #fff9fb 100%); border-color: rgba(236,72,153,.24); box-shadow: 0 14px 30px rgba(190,24,93,.08); scroll-margin-top: 96px; }
        .club-cancellationIntro { color: #52657f; font-size: 12px; font-weight: 650; line-height: 1.4; margin: -2px 0 0; }
        .club-cancellationRequestList { display: grid; gap: 9px; }
        .club-cancellationRequest { align-items: center; background: rgba(255,255,255,.92); border: 1px solid rgba(236,72,153,.18); border-radius: 13px; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) auto; min-width: 0; padding: 11px; transition: background .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .club-cancellationRequest.is-highlighted { background: #fff7fb; border-color: rgba(236,72,153,.62); box-shadow: 0 0 0 4px rgba(236,72,153,.10); }
        .club-cancellationRequestCopy { display: grid; gap: 6px; min-width: 0; }
        .club-cancellationRequestTopline { align-items: baseline; display: flex; flex-wrap: wrap; gap: 5px 10px; }
        .club-cancellationRequestTopline strong { color: #061b3a; font-size: 14px; font-weight: 850; line-height: 1.2; overflow-wrap: anywhere; }
        .club-cancellationRequestTopline span { color: #64748b; font-size: 10px; font-weight: 700; }
        .club-cancellationRequestCopy p { color: #52657f; font-size: 12px; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
        .club-cancellationRequestCopy p b { color: #263b58; font-weight: 800; }
        .club-cancellationMeta { display: flex; flex-wrap: wrap; gap: 5px 10px; }
        .club-cancellationMeta span { color: #6b7280; font-size: 10px; font-weight: 700; }
        .club-cancellationMeta b { color: #9d174d; font-weight: 850; }
        .club-cancellationActions { display: flex; gap: 7px; justify-content: flex-end; }
        .club-cancellationActions button { border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 800; min-height: 38px; padding: 8px 11px; white-space: nowrap; }
        .club-cancellationActions button:disabled { cursor: wait; opacity: .58; }
        .club-operationalCenter { background: linear-gradient(135deg, rgba(255,255,255,.98), color-mix(in srgb, var(--club-admin-accent) 8%, white)); border-color: color-mix(in srgb, var(--club-admin-accent) 18%, transparent); box-shadow: 0 16px 36px rgba(15,23,42,.06); }
        .club-operationalCenterGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
        .club-operationalQueue { background: rgba(255,255,255,.86); border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 9px; min-width: 0; padding: 10px; }
        .club-operationalQueueHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-operationalQueueHead strong { color: #061b3a; font-size: 13px; font-weight: 950; line-height: 1.1; }
        .club-operationalQueueHead span { align-items: center; background: #061b3a; border-radius: 999px; color: #fff; display: inline-flex; font-size: 11px; font-weight: 950; height: 24px; justify-content: center; min-width: 24px; padding: 0 8px; }
        .club-operationalQueueList { display: grid; gap: 8px; min-width: 0; }
        .club-operationalQueueItem { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; min-width: 0; padding: 9px; }
        .club-operationalQueueItem b { color: #061b3a; display: block; font-size: 12px; font-weight: 950; line-height: 1.2; overflow-wrap: anywhere; }
        .club-operationalQueueItem span { color: #38516f; display: block; font-size: 11px; font-weight: 820; line-height: 1.25; overflow-wrap: anywhere; }
        .club-operationalQueueItem small { color: #64748b; display: block; font-size: 10px; font-weight: 800; line-height: 1.2; margin-top: 3px; }
        .club-operationalQueueActions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; min-width: 0; }
        .club-operationalQueueActions button { border-radius: 999px; cursor: pointer; font-size: 10px; font-weight: 950; min-height: 30px; padding: 7px 10px; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; white-space: nowrap; }
        .club-operationalQueueActions button:hover:not(:disabled) { transform: translateY(-1px); }
        .club-operationalQueueActions button:disabled { cursor: wait; opacity: .58; }
        .club-operationalApprove { background: #061b3a; border: 1px solid rgba(14,165,233,.34); box-shadow: 0 8px 20px rgba(14,165,233,.14); color: #fff; }
        .club-operationalApprove:hover:not(:disabled) { box-shadow: 0 10px 26px rgba(14,165,233,.22); }
        .club-operationalReject { background: #fff; border: 1px solid rgba(244,63,94,.22); color: #9f1239; }
        .club-operationalReject:hover:not(:disabled) { box-shadow: 0 10px 22px rgba(244,63,94,.10); }
        .club-operationalEmpty { background: rgba(248,250,252,.86); border: 1px dashed rgba(100,116,139,.24); border-radius: 12px; color: #64748b; font-size: 12px; font-weight: 850; margin: 0; padding: 12px; }
        .club-sectionHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .club-sectionHead h2, .club-placeholderPanel h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 3px 0 0; }
        .club-matchList { display: grid; gap: 12px; min-width: 0; }
        .club-matchSection { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 9px; min-width: 0; padding: 10px; }
        .club-matchSectionHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-matchSectionHead > div { display: grid; flex: 1 1 auto; gap: 2px; min-width: 0; }
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
        .club-groupStandingPlayerNames > span + span::before { content: ' / '; }
        .club-groupStandingRow--qualified { background: #f3fcf5; box-shadow: inset 3px 0 0 #22c55e; }
        .club-groupStandingPosition i { color: #15803d; display: none; font-size: 10px; font-style: normal; font-weight: 950; margin-right: 2px; }
        .club-groupStandingTeam b { background: #ecfdf3; border-radius: 999px; color: #166534; flex: 0 0 auto; font-size: 10px; font-weight: 950; padding: 3px 6px; white-space: nowrap; }
        .club-inlineNote { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-inlineNote--warning { background: #fff7df; border-color: rgba(217,119,6,.24); color: #854d0e; }
        .club-matchTable { background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 11px; display: grid; justify-self: center; max-width: 800px; min-width: 0; overflow: hidden; width: min(100%, 800px); }
        .club-matchTableHead, .club-matchTableRow { align-items: center; display: grid; gap: 6px; grid-template-columns: 32px minmax(120px, .74fr) minmax(180px, 1.12fr) minmax(152px, .72fr) minmax(96px, .42fr) minmax(120px, .48fr); min-width: 0; }
        .club-matchTableHead { background: #f8fafc; border-bottom: 1px solid rgba(15,23,42,.07); padding: 6px 8px; text-align: center; }
        .club-matchTableHead span { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-align: center; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-matchTableRow { border-bottom: 1px solid rgba(15,23,42,.06); padding: 5px 8px; }
        .club-matchTableRow:last-child { border-bottom: 0; }
        .club-matchScheduleActionCell, .club-matchInfoCell, .club-matchPairCell, .club-matchResultCell, .club-matchStatusCell, .club-matchActionCell { min-width: 0; }
        .club-matchScheduleActionCell { display: flex; justify-content: center; }
        .club-scheduleSwapBtn { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 8px; color: #061b3a; cursor: pointer; display: inline-flex; height: 28px; justify-content: center; padding: 0; transition: background .16s ease, border-color .16s ease, color .16s ease, transform .16s ease; width: 28px; }
        .club-scheduleSwapBtn:hover:not(:disabled) { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 38%, transparent); color: #061b3a; transform: translateY(-1px); }
        .club-scheduleSwapBtn:disabled { color: #94a3b8; cursor: not-allowed; opacity: .55; }
        .club-matchInfoCell { display: grid; gap: 1px; justify-items: center; text-align: center; }
        .club-matchInfoCell strong { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchInfoCell span { color: #64748b; font-size: 11px; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-matchPairCell { display: grid; gap: 2px; justify-items: center; text-align: center; }
        .club-groupMatchCode { color: #64748b; font-size: 9px; font-weight: 900; line-height: 1.1; min-height: 10px; text-transform: uppercase; }
        .club-groupFixtureHint { color: #0f766e; font-size: 11px; font-weight: 800; line-height: 1.3; margin-top: 7px; }
        .club-mobileMatchScoreGrid { display: none; }
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
        .club-scoreBoard--pending { display: none; }
        .club-scoreBoardLabels, .club-scoreBoardRow { align-items: center; display: flex; flex-wrap: nowrap; gap: 6px; justify-content: center; overflow: visible; white-space: nowrap; }
        .club-scoreLabel { color: #94a3b8; display: inline-flex; font-size: 9px; font-weight: 950; justify-content: center; letter-spacing: .02em; min-width: 30px; text-transform: uppercase; }
        .club-scoreBoard .club-scoreSet { align-items: center; background: #f8fafc; border: 1px solid #dbe3ea; border-radius: 6px; color: #64748b; display: inline-flex; font-size: 13px; font-weight: 600; height: 28px; justify-content: center; min-width: 30px; width: 30px; }
        .club-scoreBoard .club-scoreSet--won { background: #f8fafc; border-color: #dbe3ea; color: #64748b; font-weight: 800; }
        .club-scoreBoard .club-scoreSet--lost { color: #64748b; font-weight: 600; }
        .club-scoreBoard .club-scoreSet--pending { background: #fff; border-color: rgba(148,163,184,.28); color: #94a3b8; font-weight: 700; }
        .club-miniHint { color: #64748b; font-size: 12px; font-weight: 850; white-space: nowrap; }
        .club-registrationList { border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 3px; overflow: hidden; padding: 3px; }
        .club-registrationMiniHead { align-items: center; background: linear-gradient(180deg, #f8fbfd 0%, #f2f7fa 100%); border-bottom: 1px solid rgba(15,23,42,.07); color: #64748b; display: grid; font-size: 10px; font-weight: 950; gap: 10px; grid-template-columns: minmax(240px, 1.45fr) minmax(116px, .52fr) minmax(94px, .42fr) minmax(94px, .42fr) minmax(78px, .3fr) minmax(88px, .34fr) minmax(152px, .62fr); letter-spacing: .02em; min-width: 0; padding: 6px 10px; text-transform: uppercase; }
        .club-registrationMiniHead span:nth-child(5), .club-registrationMiniHead span:nth-child(6), .club-registrationMiniHead span:nth-child(7) { justify-self: end; }
        .club-registrationMiniRow { align-items: center; background: rgba(41,170,225,.04); border: 1px solid rgba(15,23,42,.05); border-radius: 9px; display: grid; gap: 8px; grid-template-columns: minmax(240px, 1.45fr) minmax(116px, .52fr) minmax(94px, .42fr) minmax(94px, .42fr) minmax(78px, .3fr) minmax(88px, .34fr) minmax(152px, .62fr); min-width: 0; padding: 2px 8px; }
        .club-registrationMiniRow.is-highlighted { border-color: color-mix(in srgb, var(--club-admin-accent) 62%, #38bdf8); box-shadow: 0 0 0 3px color-mix(in srgb, var(--club-admin-accent) 16%, transparent); }
        .club-registrationMiniRow:nth-of-type(even) { background: rgba(148,163,184,.08); }
        .club-teamCompactMobile { display: none; }
        .club-teamMini { display: grid; gap: 0; min-width: 0; }
        .club-teamLinks { display: grid; min-width: 0; }
        .club-teamPlayerRow { align-items: center; display: inline-flex; gap: 3px; min-width: 0; padding: 0; }
        .club-teamPlayerRow + .club-teamPlayerRow { border-top: 1px solid rgba(100,116,139,.16); margin-top: 2px; padding-top: 2px; }
        .club-teamLink { background: color-mix(in srgb, var(--club-admin-accent) 8%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 18%, transparent); border-radius: 999px; color: #061b3a; cursor: pointer; display: inline-flex; font-size: 11px; font-weight: 800; line-height: 1.1; max-width: max-content; overflow: hidden; padding: 1px 6px; text-decoration: none; text-overflow: ellipsis; transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease; white-space: nowrap; }
        .club-teamLink:hover { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); box-shadow: 0 0 0 1px var(--club-admin-glow); color: #061b3a; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
        .club-teamPlayerRow small { color: #526277; font-size: 11px; font-weight: 900; margin-left: -1px; white-space: nowrap; }
        .club-teamMini span, .club-seedMini span, .club-scoreMini span { color: #64748b; font-size: 11px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-registrationMeta { display: contents; }
        .club-dateMini { display: grid; gap: 0; min-width: 0; }
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
        .club-seedMini { display: grid; gap: 0; justify-items: end; min-width: 0; }
        .club-seedMini strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-scoreMini { display: grid; gap: 0; justify-items: end; min-width: 0; }
        .club-scoreMini strong { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-registrationActions { display: flex; gap: 6px; justify-content: flex-end; justify-self: end; }
        .club-viewBtn { min-height: 29px; padding: 5px 9px; }
        .club-tabEmpty { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 850; padding: 12px; }
        .club-placeholderPanel p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-groupSummaryGrid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-groupSummaryCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-groupSummaryCard span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-groupSummaryCard strong { color: #17253f; font-size: 20px; font-weight: 950; line-height: 1.1; }
        .club-groupSummaryCard--ready { background: #ecfdf3; border-color: rgba(22,163,74,.16); }
        .club-planningMobileLayout { display: contents; }
        .club-planningSummary { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .club-planningMetric { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-planningMetric span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-planningMetric strong { color: #17253f; font-size: 18px; font-weight: 950; line-height: 1.1; }
        .club-planningMetric small { color: #64748b; display: none; font-size: 10px; font-weight: 780; line-height: 1.25; }
        .club-planningStatus { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 11px; display: grid; gap: 8px; grid-template-columns: auto auto minmax(0, 1fr); margin-top: 9px; min-width: 0; padding: 8px 10px; }
        .club-planningStatus > span { color: #64748b; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .club-planningStatus > strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-planningStatus > small { color: #64748b; font-size: 11px; font-weight: 800; line-height: 1.25; min-width: 0; }
        .club-planningStatus--danger { background: #fff8f8; border-color: rgba(185,28,28,.16); }
        .club-planningStatus--danger > strong { color: #b91c1c; }
        .club-planningStatus--success { background: #f0fdf4; border-color: rgba(22,163,74,.18); }
        .club-planningStatus--success > strong { color: #15803d; }
        .club-successText { color: #15803d !important; }
        .club-dangerText { color: #b91c1c !important; }
        .club-groupsCardsGrid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .club-groupCardDetailed { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 12px; min-width: 0; padding: 14px; }
        .club-groupCardHead { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
        .club-groupCardHead h2 { color: #17253f; font-size: 18px; line-height: 1.1; margin: 3px 0 0; }
        .club-groupCapacity { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); border-radius: 999px; color: #061b3a; flex: 0 0 auto; font-size: 12px; font-weight: 950; padding: 6px 9px; }
        .club-groupTeamsList { display: grid; gap: 8px; }
        .club-groupTeamItem { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
        .club-groupTeamMain { min-width: 0; }
        .club-groupTeamMain strong { color: #17253f; display: block; font-size: 13px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-groupTeamMeta { display: flex; flex-wrap: wrap; gap: 6px; }
        .club-groupMetaPill { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 22%, transparent); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 5px 8px; }
        .club-groupMetaPill--neutral { background: #fff; border-color: rgba(15,23,42,.08); color: #475569; }
        .club-seededTeamsList { display: grid; gap: 7px; margin-top: 10px; }
        .club-seededTeamItem { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 11px; display: grid; gap: 8px; grid-template-columns: auto minmax(0, 1fr) auto; min-width: 0; padding: 8px 9px; }
        .club-seededTeamPosition { align-items: center; background: color-mix(in srgb, var(--club-admin-accent) 13%, white); border-radius: 8px; color: #061b3a; display: inline-flex; font-size: 12px; font-weight: 950; justify-content: center; min-height: 30px; min-width: 34px; padding: 0 6px; }
        .club-seededTeamItem strong { color: #17253f; font-size: 13px; font-weight: 900; line-height: 1.25; min-width: 0; overflow-wrap: anywhere; }
        .club-nextSeedStep { align-items: center; background: color-mix(in srgb, var(--club-admin-accent) 7%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 18%, transparent); border-radius: 12px; display: flex; gap: 10px; justify-content: space-between; margin-top: 10px; min-width: 0; padding: 9px 10px; }
        .club-nextSeedStep > div { display: grid; gap: 2px; min-width: 0; }
        .club-nextSeedStep span { color: var(--club-admin-accent); font-size: 10px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-nextSeedStep p { color: #475569; font-size: 12px; font-weight: 780; line-height: 1.3; margin: 0; }
        .club-nextGroupStep { align-items: center; background: #f0fdf4; border: 1px solid rgba(22,163,74,.22); border-radius: 12px; display: flex; gap: 10px; justify-content: space-between; min-width: 0; padding: 10px 11px; }
        .club-nextGroupStep > div { display: grid; gap: 2px; min-width: 0; }
        .club-nextGroupStep > div > span { color: #15803d; font-size: 10px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-nextGroupStep h2 { color: #14532d; font-size: 16px; line-height: 1.15; margin: 0; }
        .club-nextGroupStep p { color: #166534; font-size: 12px; font-weight: 780; line-height: 1.3; margin: 0; }
        .club-playoffSummaryGrid { display: grid; gap: 10px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .club-playoffPodium { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-playoffPodiumCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 4px; min-width: 0; padding: 12px; }
        .club-playoffPodiumCard--winner { background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%); border-color: rgba(22,163,74,.16); }
        .club-playoffPodiumCard--runnerUp { background: linear-gradient(135deg, #fff 0%, #f8fafc 100%); }
        .club-playoffPodiumCard span { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-playoffPodiumCard strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffSummaryText { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.4; margin: 0; }
        .club-playoffMatchesSection { --bracket-line-color: var(--club-admin-accent); --bracket-line-width: 2px; background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 14px; padding: 12px; }
        .club-playoffToolbar { align-items: center; display: flex; flex-wrap: wrap; gap: 10px 14px; justify-content: space-between; }
        .club-playoffToolbarLeft { display: flex; gap: 8px; }
        .club-playoffToolbarActions { align-items: center; display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-playoffViewChip { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; color: #475569; cursor: pointer; display: inline-flex; font-size: 12px; font-weight: 900; justify-content: center; min-height: 34px; padding: 0 12px; }
        .club-playoffViewChip--active { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 38%, transparent); color: #061b3a; box-shadow: inset 0 0 0 1px var(--club-admin-glow); }
        .club-playoffZoomControls { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: inline-flex; gap: 3px; min-height: 34px; padding: 3px; }
        .club-playoffZoomControls button { align-items: center; background: transparent; border: 0; border-radius: 8px; color: #475569; cursor: pointer; display: inline-flex; font-size: 14px; font-weight: 950; height: 28px; justify-content: center; min-width: 30px; padding: 0 8px; transition: background .16s ease, color .16s ease; }
        .club-playoffZoomControls button:hover:not(:disabled) { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); color: #061b3a; }
        .club-playoffZoomControls button:disabled { color: #cbd5e1; cursor: not-allowed; }
        .club-playoffZoomControls .club-playoffZoomValue { color: #17253f; font-size: 11px; min-width: 48px; }
        .club-playoffLegend { align-items: center; display: flex; flex: 1 1 auto; flex-wrap: wrap; gap: 10px 16px; justify-content: center; min-width: 0; }
        .club-playoffLegend span { align-items: center; color: #64748b; display: inline-flex; font-size: 12px; font-weight: 900; gap: 6px; white-space: nowrap; }
        .club-playoffLegendDot { border-radius: 999px; display: inline-block; height: 10px; width: 10px; }
        .club-playoffLegendDot--winner { background: #22c55e; }
        .club-playoffLegendDot--pending { background: #94a3b8; }
        .club-playoffLegendDot--walkover { background: #facc15; }
        .club-playoffBracketViewport { display: block; min-width: 0; overflow: visible; position: relative; }
        .club-playoffBracketViewport--simple { overflow: hidden; }
        .club-playoffBracketScroll { cursor: grab; max-height: min(72vh, 760px); min-height: 260px; min-width: 0; overflow: auto; overscroll-behavior: contain; padding-bottom: 6px; scroll-behavior: smooth; scroll-snap-type: x proximity; scrollbar-color: var(--club-admin-accent) rgba(226,232,240,.78); scrollbar-width: thin; touch-action: none; }
        .club-playoffBracketScroll--dragging { cursor: grabbing; scroll-behavior: auto; scroll-snap-type: none; user-select: none; }
        .club-playoffBracketScroll--dragging * { user-select: none; }
        .club-playoffBracketGrid { align-items: start; display: grid; gap: var(--playoff-column-gap, 44px); grid-auto-flow: column; min-width: max-content; transform-origin: top left; zoom: var(--playoff-bracket-zoom, 1); }
        .club-playoffBracketGrid--fluid { grid-auto-columns: unset; grid-auto-flow: initial; width: 100%; }
        .club-playoffBracketNav { align-items: center; background: rgba(255,255,255,.42); backdrop-filter: blur(14px); border: 1px solid rgba(15,23,42,.08); border-radius: 999px; box-shadow: 0 18px 45px rgba(15,23,42,.12); color: rgba(15,29,51,.52); cursor: pointer; display: inline-flex; height: 220px; justify-content: center; padding: 0; position: fixed; touch-action: manipulation; transform: translateY(-50%); transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, color .16s ease, transform .16s ease; user-select: none; width: 42px; z-index: 80; }
        .club-playoffBracketNav:hover { background: rgba(255,255,255,.76); border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); box-shadow: 0 24px 54px rgba(15,23,42,.18); color: #061b3a; transform: translateY(-50%) scale(1.04); }
        .club-playoffBracketNav:active { transform: translateY(-50%) scale(.99); }
        .club-playoffBracketNav--left { left: max(10px, calc((100vw - 1180px) / 2)); }
        .club-playoffBracketNav--right { right: max(10px, calc((100vw - 1180px) / 2)); }
        .club-playoffRoundColumn { --playoff-card-height: 156px; --playoff-connector-width: 44px; --playoff-depth: 0; --playoff-visual-rows: 1; --playoff-column-offset: 0px; --playoff-round-gap: 18px; align-self: start; display: grid; gap: 12px; grid-template-rows: auto 1fr; min-width: 258px; min-width: 0; padding-top: var(--playoff-column-offset); position: relative; width: 100%; }
        .club-playoffBracketGrid--fluid .club-playoffRoundColumn { min-width: 0; }
        .club-playoffSemisFinalBracket { align-items: stretch; column-gap: 0; display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); row-gap: 12px; }
        .club-playoffSemisFinalSpacer { min-height: 1px; }
        .club-playoffSemisMatches { display: grid; gap: 18px; }
        .club-playoffFinalLane { align-items: center; display: flex; min-height: 432px; min-width: 0; width: 100%; }
        .club-playoffRoundMatches--finalLane { align-self: auto; display: grid; margin: 0; max-width: none; min-height: 0; min-width: 0; width: 100%; }
        .club-playoffConnectorColumn { min-height: 432px; position: relative; }
        .club-playoffConnectorVertical { background: var(--bracket-line-color); border-radius: 999px; height: 50%; left: 50%; position: absolute; top: 25%; transform: translateX(-50%); width: var(--bracket-line-width); }
        .club-playoffConnectorHorizontal { background: var(--bracket-line-color); border-radius: 999px; height: var(--bracket-line-width); left: 0; position: absolute; width: 20px; }
        .club-playoffConnectorHorizontal--top { top: 25%; }
        .club-playoffConnectorHorizontal--bottom { top: 75%; }
        .club-playoffConnectorToFinal { background: var(--bracket-line-color); border-radius: 999px; height: var(--bracket-line-width); left: 20px; position: absolute; top: 50%; width: 20px; }
        .club-playoffRoundHead { background: linear-gradient(180deg, #13233b 0%, #0f1d33 100%); border: 1px solid rgba(15,23,42,.24); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); color: #f8fbfd; display: grid; gap: 6px; min-width: 0; padding: 12px 13px; position: sticky; top: 0; z-index: 20; }
        .club-playoffRoundHeadContent { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-playoffRoundLabel { color: #f8fbfd; display: inline-flex; font-size: 12px; font-weight: 950; letter-spacing: .02em; text-transform: uppercase; }
        .club-playoffRoundHead b { color: rgba(233,251,255,.82); font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-playoffRoundCount { color: rgba(226,232,240,.78); font-size: 11px; font-weight: 900; line-height: 1.2; }
        .club-playoffRoundMatches { align-items: stretch; display: grid; gap: var(--playoff-round-gap); grid-template-rows: repeat(var(--playoff-visual-rows), var(--playoff-card-height)); min-width: 0; position: relative; width: 100%; }
        .club-playoffBracketConnector { pointer-events: none; position: absolute; right: calc(-1 * var(--playoff-connector-width)); width: var(--playoff-connector-width); z-index: 0; }
        .club-playoffBracketConnectorLine,
        .club-playoffBracketConnectorVerticalLine { background: var(--bracket-line-color); border-radius: 999px; position: absolute; }
        .club-playoffBracketConnectorVerticalLine { bottom: 0; left: 50%; top: 0; transform: translateX(-50%); width: var(--bracket-line-width); }
        .club-playoffBracketConnectorLine { height: var(--bracket-line-width); }
        .club-playoffBracketConnectorLine--top { left: 0; top: 0; width: 50%; }
        .club-playoffBracketConnectorLine--bottom { bottom: 0; left: 0; width: 50%; }
        .club-playoffBracketConnectorLine--middle { left: 50%; top: 50%; transform: translateY(-50%); width: 50%; }
        .club-playoffBracketMatch { background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; box-shadow: 0 12px 28px rgba(15,23,42,.06); display: grid; gap: 7px; min-height: var(--playoff-card-height); min-width: 0; padding: 9px; position: relative; }
        .club-playoffBracketMatch--placeholder { background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border-style: dashed; min-height: var(--playoff-card-height); }
        .club-playoffBracketMatch--bye { background: linear-gradient(180deg, #f0fdfa 0%, #ecfeff 100%); border-color: rgba(20,184,166,.26); min-height: var(--playoff-card-height); }
        .club-playoffBracketMatch .club-statusBadge,
        .club-playoffBracketMatch--placeholder .club-statusBadge { z-index: 1; }
        .club-playoffBracketGrid:has(.club-playoffPathActive) .club-playoffPathDimmed { opacity: .38; }
        .club-playoffBracketGrid:has(.club-playoffPathActive) .club-playoffPathActive { opacity: 1; }
        .club-playoffBracketMatch.club-playoffPathActive { border-color: rgba(6,182,212,.66); box-shadow: 0 16px 34px rgba(6,182,212,.16), inset 0 0 0 1px rgba(6,182,212,.12); }
        .club-playoffBracketTeam { cursor: pointer; }
        .club-playoffBracketTeam.club-playoffPathActive { background: linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%); border-color: rgba(6,182,212,.42); box-shadow: inset 0 0 0 1px rgba(6,182,212,.08); opacity: 1; }
        .club-playoffBracketConnector.club-playoffPathActive .club-playoffBracketConnectorLine,
        .club-playoffBracketConnector.club-playoffPathActive .club-playoffBracketConnectorVerticalLine { background: rgba(6,182,212,.98); box-shadow: 0 0 0 1px rgba(6,182,212,.10), 0 0 10px rgba(6,182,212,.24); }
        .club-playoffBracketMatch,
        .club-playoffBracketTeam,
        .club-playoffBracketConnector { transition: opacity .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease; }
        .club-playoffRoundMatches .club-playoffBracketMatch,
        .club-playoffRoundMatches .club-playoffBracketMatch--placeholder { align-self: stretch; max-width: none; min-width: 0; width: 100%; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketMatch,
        .club-playoffRoundMatches--finalLane .club-playoffBracketMatch--placeholder { align-self: stretch; flex: 0 0 auto; gap: 7px; height: auto; max-width: none; min-height: 0; padding: 9px; width: 100%; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketMatchHead { min-height: 20px; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketTeams { gap: 5px; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketTeam { padding: 7px 8px; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketMeta { margin-top: 2px; }
        .club-playoffRoundMatches--finalLane .club-playoffBracketActions { align-self: end; }
        .club-playoffRoundMatches--finalLane .club-groupResultBtn { flex: 0 0 auto; height: 32px; min-height: 32px; padding: 6px 11px; }
        .club-playoffBracketMatchHead { align-items: start; display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; justify-content: space-between; }
        .club-playoffCardHeadActions { align-items: center; display: inline-flex; flex: 0 0 auto; gap: 6px; justify-content: flex-end; }
        .club-playoffMatchTitleStack { display: grid; gap: 3px; min-width: 0; }
        .club-playoffMatchTitleLine { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
        .club-playoffMatchOrder { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .club-playoffScheduleLine { color: #64748b; display: block; font-size: 10px; font-weight: 850; line-height: 1.15; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffBracketBody { align-items: stretch; display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr); min-width: 0; }
        .club-playoffBracketTeams { display: grid; gap: 6px; }
        .club-playoffBracketTeam { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.06); border-radius: 12px; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 6px; min-width: 0; padding: 7px 8px; transition: background .18s ease, border-color .18s ease, opacity .18s ease; }
        .club-playoffBracketTeam--winner { background: linear-gradient(135deg, #eefcf2 0%, #f4fffb 100%); border-color: rgba(22,163,74,.18); }
        .club-playoffBracketTeam--empty { background: #f8fafc; border-color: rgba(148,163,184,.16); }
        .club-playoffBracketTeam--loser { opacity: .72; }
        .club-playoffBracketTeamRow { align-items: center; display: grid; gap: 6px; grid-template-columns: minmax(0, 1fr) auto; min-width: 0; width: 100%; }
        .club-playoffBracketTeamMain { align-items: start; display: grid; gap: 4px; grid-template-columns: auto minmax(0, 1fr); min-width: 0; }
        .club-playoffBracketTeamMain strong { color: #17253f; font-size: 11px; font-weight: 950; line-height: 1.08; min-width: 0; overflow: hidden; }
        .club-playoffTeamNames { display: grid; gap: 1px; min-width: 0; }
        .club-playoffTeamNames span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffEmptyTeamName { color: #94a3b8 !important; font-weight: 850 !important; }
        .club-playoffSeedPill { color: #64748b; display: inline-flex; font-size: 11px; font-weight: 900; justify-content: flex-start; line-height: 1.05; min-width: 18px; padding-top: 1px; white-space: nowrap; }
        .club-playoffSeedPill--active { color: var(--club-admin-accent); }
        .club-playoffSeedPill--ghost { color: transparent; }
        .club-playoffWinnerSlot { align-items: center; display: inline-flex; height: 16px; justify-content: center; width: 16px; }
        .club-playoffWinnerMark { color: #16a34a; font-size: 14px; font-weight: 950; }
        .club-playoffInlineScore { display: inline-grid; flex: 0 0 auto; gap: 2px; grid-auto-columns: 22px; grid-auto-flow: column; justify-content: end; min-width: 0; }
        .club-playoffInlineSet { align-items: center; background: #fff; border: 1px solid #dbe3ea; border-radius: 6px; color: #475569; display: inline-flex; font-size: 11px; font-weight: 850; height: 22px; justify-content: center; width: 22px; }
        .club-playoffInlineSet--empty { background: #f8fafc; color: #cbd5e1; }
        .club-playoffInlineSet--won { background: rgba(22,163,74,.08); color: #166534; font-weight: 950; }
        .club-scheduleSwapBtn--playoff { flex: 0 0 auto; height: 26px; width: 26px; }
        .club-playoffBracketMeta { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .club-playoffPhase { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); border-radius: 999px; color: #061b3a; display: inline-flex; font-size: 11px; font-weight: 950; padding: 6px 9px; text-transform: uppercase; white-space: nowrap; }
        .club-playoffBracketActions { display: flex; justify-content: flex-end; }
        .club-groupResultBtn--mini { font-size: 11px; min-height: 26px; padding: 5px 8px; }
        .club-playoffResultFormWrap { border-top: 1px solid rgba(15,23,42,.07); margin-top: 2px; padding-top: 10px; }
        .club-playoffPlaceholderBody { align-content: center; display: grid; gap: 8px; min-height: 0; }
        .club-playoffPlaceholderBody strong { color: #17253f; font-size: 16px; font-weight: 950; line-height: 1.1; }
        .club-playoffPlaceholderBody p { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.35; margin: 0; }
        .club-playoffPlaceholderActions { display: flex; justify-content: flex-start; }
        .club-playoffRoundMatches--finalLane .club-playoffPlaceholderBody strong { font-size: 14px; }
        .club-playoffRoundMatches--finalLane .club-playoffPlaceholderBody p { font-size: 12px; line-height: 1.3; }
        .club-playoffRoundMatches--finalLane .club-playoffPlaceholderActions .club-groupResultBtn { flex: 0 0 auto; height: 32px; min-height: 32px; padding: 6px 11px; }
        .club-playoffCompactLayout { display: grid; gap: 14px; }
        .club-playoffCompactRound { display: grid; gap: 10px; }
        .club-playoffCompactMatches { display: grid; gap: 10px; }
        .club-playoffCompactMatch { background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 8px; padding: 10px; }
        .club-playoffCompactHead { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .club-playoffCompactFoot { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
        .club-playoffUpcomingSection { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 16px; display: grid; gap: 10px; padding: 12px; }
        .club-playoffUpcomingTable { border: 1px solid rgba(15,23,42,.08); border-radius: 14px; overflow: hidden; }
        .club-playoffUpcomingHead, .club-playoffUpcomingRow { align-items: center; display: grid; gap: 10px; grid-template-columns: 110px 84px minmax(220px, 1.4fr) minmax(120px, .9fr) 92px; padding: 10px 12px; }
        .club-playoffUpcomingHead { background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-playoffUpcomingRow { background: #fff; border-top: 1px solid rgba(15,23,42,.06); }
        .club-playoffUpcomingRow span { color: #334155; font-size: 12px; font-weight: 850; min-width: 0; }
        .club-playoffUpcomingRow strong { color: #17253f; font-size: 12px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-playoffUpcomingRow em { color: #94a3b8; font-size: 11px; font-style: normal; font-weight: 900; text-transform: uppercase; }
        .club-playoffUpcomingRow span[role="cell"]:nth-child(3) { align-items: center; display: flex; gap: 8px; min-width: 0; }
        .club-playoffMobileBracket { display: none; gap: 10px; }
        .club-playoffRoundTabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
        .club-playoffRoundTab { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #64748b; cursor: pointer; font-size: 12px; font-weight: 900; min-height: 32px; padding: 0 10px; white-space: nowrap; }
        .club-playoffRoundTab--active { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-playoffRoundMatches--mobile { grid-template-columns: 1fr; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; appearance: none; border-radius: 999px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; line-height: 1.15; min-height: 38px; padding: 8px 14px; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-primaryBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 12px 28px var(--club-admin-glow); color: #fff; }
        .club-primaryBtn:hover { box-shadow: 0 16px 34px var(--club-admin-glow); transform: translateY(-1px); }
        .club-primaryBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-primaryBtn:disabled:hover { box-shadow: none; transform: none; }
        .club-secondaryBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-secondaryBtn:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 50%, transparent); box-shadow: 0 12px 28px var(--club-admin-glow); transform: translateY(-1px); }
        .club-secondaryBtn:disabled { cursor: not-allowed; opacity: .58; }
        .club-secondaryBtn:disabled:hover { box-shadow: none; transform: none; }
        .club-secondaryBtn--compact { min-height: 30px; padding: 6px 10px; }
        .club-publishBtn { background:var(--club-admin-accent); border-color:color-mix(in srgb,var(--club-admin-accent) 62%,rgba(255,255,255,.28)); box-shadow:0 12px 28px var(--club-admin-glow); }
        .club-publishBtn:hover:not(:disabled) { box-shadow: 0 16px 34px var(--club-admin-glow); }
        .club-publishBtn:disabled { cursor: not-allowed; opacity: .62; transform: none; }
        .club-message { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 24%, transparent); border-radius: 12px; color: #061b3a; font-weight: 850; padding: 10px 12px; }
        .club-actionMessage { background: #ecfdf3; border: 1px solid rgba(22,163,74,.22); border-radius: 12px; color: #166534; font-size: 13px; font-weight: 900; margin-bottom: 12px; padding: 10px 12px; }
        .club-modalBackdrop { align-items: center; background: rgba(15,23,42,.42); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 80; }
        .club-pointsModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 520px; min-width: 0; padding: 16px; width: min(520px, 100%); }
        .club-pointsHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-pointsHead h2 { color: #17253f; font-size: 20px; line-height: 1.1; margin: 4px 0 0; }
        .club-pointsList { border: 1px solid rgba(15,23,42,.08); border-radius: 12px; overflow: hidden; }
        .club-pointsRow { align-items: center; background: #fff; border-bottom: 1px solid rgba(15,23,42,.07); display: flex; gap: 12px; justify-content: space-between; padding: 10px 12px; }
        .club-pointsRow:last-child { border-bottom: 0; }
        .club-pointsRow span { color: #334155; font-size: 13px; font-weight: 900; text-transform: capitalize; }
        .club-pointsRow strong { color: var(--club-admin-accent); font-size: 14px; font-weight: 950; white-space: nowrap; }
        .club-pointsEmpty { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 6px; padding: 12px; }
        .club-pointsEmpty strong { color: #17253f; font-size: 14px; font-weight: 950; }
        .club-pointsEmpty p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-manualModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 620px; min-width: 0; padding: 16px; width: min(620px, 100%); }
        .club-courtConfigModal { max-width: 680px; width: min(680px, 100%); }
        .club-manualHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; min-width: 0; }
        .club-manualHead h2 { color: #17253f; font-size: 22px; line-height: 1.1; margin: 4px 0 6px; }
        .club-manualHead p { color: #64748b; font-size: 13px; font-weight: 750; line-height: 1.35; margin: 0; }
        .club-modalClose { align-items: center; background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); border-radius: 999px; color: #061b3a; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 12px; font-weight: 950; justify-content: center; min-height: 34px; padding: 8px 11px; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .club-modalClose:hover:not(:disabled) { border-color: color-mix(in srgb, var(--club-admin-accent) 50%, transparent); box-shadow: 0 10px 24px var(--club-admin-glow); transform: translateY(-1px); }
        .club-modalClose:disabled { cursor: not-allowed; opacity: .58; }
        .club-manualError { background: #fff1f2; border: 1px solid rgba(220,38,38,.24); border-radius: 10px; color: #b91c1c; font-size: 12px; font-weight: 900; line-height: 1.35; padding: 10px 11px; }
        .club-manualGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-manualField { display: grid; gap: 6px; min-width: 0; }
        .club-manualField > span, .club-checkRow { color: #334155; font-size: 12px; font-weight: 950; }
        .club-manualField input, .club-manualField select { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font-size: 13px; font-weight: 850; min-height: 38px; outline: none; padding: 9px 10px; width: 100%; }
        .club-manualField input:focus, .club-manualField select:focus { border-color: color-mix(in srgb, var(--club-admin-accent) 45%, transparent); box-shadow: 0 0 0 3px var(--club-admin-soft); }
        .club-autocomplete { display: grid; gap: 6px; min-width: 0; position: relative; }
        .club-selectedPlayer { background: #ecfdf3; border: 1px solid rgba(22,163,74,.18); border-radius: 9px; color: #166534; font-size: 11px; font-weight: 900; padding: 7px 8px; }
        .club-suggestionBox { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 12px; box-shadow: 0 14px 34px rgba(15,23,42,.10); display: grid; gap: 4px; max-height: 238px; overflow: auto; padding: 6px; z-index: 2; }
        .club-suggestionItem { align-items: center; background: #fff; border: 1px solid transparent; border-radius: 10px; cursor: pointer; display: flex; gap: 8px; justify-content: space-between; min-width: 0; padding: 8px; text-align: left; transition: background .16s ease, border-color .16s ease, transform .16s ease; }
        .club-suggestionItem:hover:not(:disabled) { background: color-mix(in srgb, var(--club-admin-accent) 8%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 28%, transparent); transform: translateY(-1px); }
        .club-suggestionItem:disabled { cursor: not-allowed; opacity: .45; }
        .club-suggestionItem strong { color: #17253f; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-suggestionItem span { color: #64748b; flex: 0 0 auto; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .club-suggestionHint { background: #f8fafc; border-radius: 9px; color: #64748b; font-size: 11px; font-weight: 850; padding: 8px; }
        .club-checkRow { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: flex; gap: 8px; padding: 10px; }
        .club-checkRow input { accent-color: var(--club-admin-accent); }
        .club-courtComposerRow { display: flex; justify-content: flex-start; }
        .club-courtDraftList { display: grid; gap: 8px; }
        .club-courtDraftCard { align-items: center; background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 6px 10px; grid-template-columns: minmax(0, 1fr) auto auto; min-width: 0; padding: 10px 12px; }
        .club-courtDraftCard strong { color: #17253f; display: block; font-size: 13px; font-weight: 950; line-height: 1.15; }
        .club-courtDraftCard span { color: #64748b; display: block; font-size: 12px; font-weight: 780; line-height: 1.3; margin-top: 2px; }
        .club-courtDraftCard small { color: var(--club-admin-accent); font-size: 11px; font-style: normal; font-weight: 900; white-space: nowrap; }
        .club-emptyInline { background: #f8fafc; border: 1px dashed rgba(15,23,42,.12); border-radius: 12px; color: #64748b; font-size: 12px; font-weight: 850; padding: 10px 11px; }
        .club-chipRemove { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 8px; color: #475569; cursor: pointer; display: inline-flex; font-size: 11px; font-weight: 900; justify-content: center; min-height: 28px; padding: 5px 9px; }
        .club-chipRemove:hover { background: #fff7f7; border-color: rgba(239,68,68,.18); color: #b91c1c; }
        .club-modalActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-confirmModal { background: #fff; border: 1px solid rgba(15,23,42,.10); border-radius: 16px; box-shadow: 0 24px 70px rgba(15,23,42,.24); display: grid; gap: 14px; max-width: 460px; min-width: 0; padding: 16px; width: min(460px, 100%); }
        .club-confirmModal h2 { color: #17253f; font-size: 20px; line-height: 1.1; margin: 4px 0 8px; }
        .club-confirmModal p { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.4; margin: 0; }
        .club-confirmField { display: grid; gap: 8px; }
        .club-confirmField span { color: #475569; font-size: 12px; font-weight: 850; line-height: 1.4; }
        .club-confirmField input, .club-confirmField textarea { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font-size: 13px; font-weight: 850; min-height: 38px; outline: none; padding: 9px 10px; width: 100%; }
        .club-confirmField textarea { min-height: 96px; resize: vertical; }
        .club-confirmField input:focus, .club-confirmField textarea:focus { border-color: rgba(190,24,93,.50); box-shadow: 0 0 0 3px rgba(244,114,182,.12); }
        .club-confirmActions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .club-dangerConfirmBtn { background:#fff1f5; border-color:rgba(190,24,93,.22); color:#be185d; }
        .club-dangerConfirmBtn:disabled { box-shadow:none; color:#be185d; opacity:.48; }
        .club-dangerConfirmBtn:not(:disabled) { background:#be123c; border-color:#be123c; box-shadow:0 10px 22px rgba(190,24,93,.22); color:#fff; }
        .club-dangerConfirmBtn:hover:not(:disabled) { background:#9f1239; border-color:#9f1239; box-shadow:0 12px 26px rgba(190,24,93,.28); }
        .club-cancelModal { max-width: 520px; width: min(520px, 100%); }
        .club-dangerInlineWarning { background: #fff1f2; border: 1px solid rgba(190,24,93,.14); border-radius: 10px; color: #9f1239; font-size: 12px; font-weight: 850; line-height: 1.4; padding: 10px 11px; }
        .club-registrationDetailModal { max-width: 620px; width: min(620px, 100%); }
        .club-registrationDetailGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-registrationDetailCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; min-width: 0; padding: 10px; }
        .club-registrationDetailCard--wide { grid-column: 1 / -1; }
        .club-registrationDetailCard span { color: #64748b; font-size: 11px; font-weight: 900; }
        .club-registrationDetailCard strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-registrationDetailCard small { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-registrationPointsList { display: grid; gap: 6px; }
        .club-registrationPointsRow { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 10px; display: flex; gap: 8px; justify-content: space-between; padding: 8px 9px; }
        .club-registrationPointsRow b { color: #17253f; font-size: 12px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-registrationPointsRow strong { color: var(--club-admin-accent); font-size: 12px; font-weight: 950; white-space: nowrap; }
        .club-registrationAlerts { display: flex; flex-wrap: wrap; gap: 6px; }
        .club-registrationAlerts span { background: #fff7df; border: 1px solid rgba(202,138,4,.16); border-radius: 999px; color: #854d0e; font-size: 11px; font-weight: 900; padding: 5px 8px; }
        .club-paymentActionsGrid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-resultModal { max-height: min(760px, calc(100vh - 28px)); max-width: 680px; overflow: auto; width: min(680px, 100%); }
        .club-scheduleSwapModal { max-width: 620px; width: min(620px, 100%); }
        .club-scheduleSwapCurrent { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 4px; min-width: 0; padding: 11px; }
        .club-scheduleSwapCurrent span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .club-scheduleSwapCurrent strong { color: #17253f; font-size: 14px; font-weight: 950; line-height: 1.2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-scheduleSwapCurrent small { color: #475569; font-size: 12px; font-weight: 850; line-height: 1.25; }
        .club-resultForm { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 10px; min-width: 0; padding: 10px; }
        .club-resultForm--danger { background: #fff7f7; border-color: rgba(220,38,38,.24); box-shadow: 0 0 0 1px rgba(220,38,38,.06); }
        .club-legacyScoreNotice { background: #fff7df; border: 1px solid rgba(202,138,4,.22); border-radius: 9px; color: #854d0e; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-legacyScoreNotice b { color: #713f12; }
        .club-scoreGrid { display: grid; gap: 6px; grid-template-columns: minmax(128px, 1fr) repeat(3, minmax(54px, 74px)); min-width: 0; }
        .club-scoreHead { color: #64748b; font-size: 11px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .club-scoreHead--danger { color: #b91c1c; }
        .club-scoreRow { display: contents; }
        .club-scoreRow > span { align-self: center; color: #17253f; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-scoreInput { min-height: 34px; min-width: 0; }
        .club-scoreInput--danger { background: #fff1f2; border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,.14); color: #7f1d1d; }
        .club-scoreInput--danger:focus { border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,.2); outline: none; }
        .club-resultSummary { background: #fff; border: 1px solid rgba(15,23,42,.06); border-radius: 9px; color: #64748b; font-size: 12px; font-weight: 850; padding: 8px 9px; }
        .club-resultSummary b { color: #0f766e; }
        .club-resultSummary--danger { background: #fff1f2; border-color: rgba(220,38,38,.24); color: #991b1b; }
        .club-resultSummary--danger b { color: #991b1b; }
        .club-resultActions { align-items: center; background: linear-gradient(180deg, rgba(248,250,252,.86) 0%, #f8fafc 38%); bottom: -10px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin: 0 -10px -10px; padding: 10px; position: sticky; z-index: 1; }
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
          .club-sportConfigGrid { grid-template-columns: 1fr; }
          .club-readinessGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px; }
          .club-readinessItem { min-height:50px; padding:7px; }
          .club-readinessItem span { font-size:9px; line-height:1.1; }
          .club-readinessItem b { font-size:17px; }
          .club-groupSummaryGrid { grid-template-columns: 1fr; }
          .club-planningSummary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-playoffPodium { grid-template-columns: 1fr; }
          .club-playoffSummaryGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-playoffToolbar { align-items: flex-start; flex-direction: column; }
          .club-playoffLegend { justify-content: flex-start; }
          .club-playoffToolbarActions { justify-content: flex-start; width: 100%; }
          .club-playoffBracketViewport { display: block; margin-inline: -2px; }
          .club-playoffBracketScroll { display: block; padding-bottom: 8px; scroll-snap-type: x mandatory; }
          .club-playoffRoundColumn { scroll-snap-align: start; }
          .club-playoffBracketNav { height: 154px; width: 34px; }
          .club-playoffBracketNav::before { width: 48px; }
          .club-playoffSemisFinalBracket { display: none; }
          .club-playoffMobileBracket { display: none; }
          .club-playoffUpcomingHead, .club-playoffUpcomingRow { grid-template-columns: 92px 70px minmax(0, 1fr) 120px 84px; }
          .club-dangerZone { gap:7px; padding-top:11px; }
          .club-dangerZoneHead { display:block; }
          .club-dangerZoneHead p { display:none; }
          .club-dangerZoneHead h2 { font-size:15px; margin-top:2px; }
          .club-dangerCard { align-items:center; background:#fffafa; border-radius:10px; flex-direction:row; gap:8px; padding:9px; }
          .club-dangerCardBody p { display:none; }
          .club-dangerCardBody strong { font-size:12px; }
          .club-dangerGhostBtn,.club-deleteBtn { flex:0 0 auto; font-size:11px; min-height:34px; padding:7px 8px; }
          .club-dangerZoneGrid { grid-template-columns: 1fr; }
          .club-seedStatus { align-items:center; display:grid; gap:8px; grid-template-columns:1fr; padding:9px; }
          .club-seedStatus div:first-child { gap:0; }
          .club-seedStatus strong { font-size:13px; line-height:1.2; }
          .club-seedStatus span { display:none; }
          .club-seedActions { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); justify-content:stretch; width:100%; }
          .club-seedActions > * { font-size:10px; min-height:32px; min-width:0; padding:5px 4px; white-space:nowrap; }
          .club-manualGrid { grid-template-columns: 1fr; }
          .club-operationalCenterGrid { grid-template-columns: 1fr; }
          .club-operationalQueueItem { grid-template-columns: 1fr; }
          .club-operationalQueueActions { justify-content: flex-start; }
          .club-cancellationRequest { grid-template-columns: 1fr; }
          .club-cancellationActions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-cancellationActions button { padding-inline: 8px; }
          .club-registrationMiniHead { display: none; }
          .club-registrationMiniRow { align-items:center; display:grid; gap:3px 7px; grid-template-columns:minmax(0, 1fr) auto; min-height:52px; padding:6px 7px; }
          .club-teamCompactMobile { display:grid; gap:2px; grid-column:1 / 2; min-width:0; }
          .club-teamCompactMobile strong { color:#061b3a; font-size:12px; font-weight:800; line-height:1.15; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .club-teamCompactMobile span { color:#64748b; font-size:9px; font-weight:700; line-height:1; }
          .club-teamMini { display:none; }
          .club-teamLinks { display:flex; flex-wrap:wrap; gap:3px 5px; }
          .club-teamPlayerRow { max-width:100%; }
          .club-teamPlayerRow + .club-teamPlayerRow { border-top:0; margin-top:0; padding-top:0; }
          .club-teamLink { max-width:clamp(112px, 38vw, 154px); }
          .club-teamPlayerRow small { font-size:10px; }
          .club-registrationMeta { align-items:center; display:flex; flex-wrap:wrap; gap:3px 4px; grid-column:1 / 2; min-width:0; }
          .club-dateMini { display:none; }
          .club-dateMini strong { font-size:10px; }
          .club-dateMini span { display:none; }
          .club-statusBadge, .club-paymentBadge { font-size:9px; line-height:1; padding:4px 6px; }
          .club-statusBadge { justify-self:start; }
          .club-seedMini, .club-scoreMini { display:none; }
          .club-registrationActions { align-self:center; display:flex; flex:0 0 auto; gap:4px; grid-column:2; grid-row:1 / span 2; justify-self:end; margin:0; }
          .club-viewBtn { font-size:9px; min-height:27px; padding:4px 8px; }
          .club-registrationDetailGrid { grid-template-columns: 1fr; }
          .club-paymentActionsGrid { grid-template-columns: 1fr; }
          .club-courtDraftCard { grid-template-columns: minmax(0, 1fr) auto; }
          .club-matchSectionHead { align-items: flex-start; flex-direction: row; }
          .club-matchTableHead { display: none; }
          .club-matchTable { background: transparent; border: 0; border-radius: 0; gap: 6px; overflow: visible; padding: 1px 0; }
          .club-matchTableRow, .club-matchTableRow:last-child { align-items: start; background: #fff; border: 1px solid rgba(6,27,58,.20); border-radius: 10px; box-shadow: 0 2px 5px rgba(15,23,42,.045); gap: 4px 5px; grid-template-areas: 'info status action' 'body body body'; grid-template-columns: minmax(0, 1fr) auto auto; padding: 6px 7px; }
          .club-matchScheduleActionCell { align-self: center; display: flex; grid-area: info; justify-self: end; margin-right: 4px; position: relative; z-index: 1; }
          .club-scheduleSwapBtn { background: #fff; border-color: rgba(15,23,42,.12); box-shadow: 0 1px 2px rgba(15,23,42,.06); height: 30px; width: 30px; }
          .club-matchInfoCell { align-items: start; background: #f8fafc; border-radius: 8px; display: grid; gap: 1px; grid-area: info; justify-items: start; min-height: 40px; padding: 5px 38px 5px 7px; text-align: left; width: 100%; }
          .club-matchInfoCell strong { font-size: 11px; max-width: 100%; }
          .club-matchInfoCell span { font-size: 10px; max-width: 100%; }
          .club-matchPairCell { grid-area: body; min-width: 0; width: 100%; }
          .club-groupMatchCode { justify-self: start; padding-left: 2px; }
          .club-matchTeams, .club-matchResultCell { display: none; }
          .club-mobileMatchScoreGrid { align-items: center; column-gap: 3px; display: grid; grid-template-columns: minmax(0, 1fr) repeat(3, 24px); grid-template-rows: 12px minmax(28px, auto) 1px minmax(28px, auto); min-width: 0; row-gap: 2px; width: 100%; }
          .club-mobileScoreLabel { color: #94a3b8; font-size: 8px; font-weight: 950; line-height: 1; text-align: center; text-transform: uppercase; }
          .club-mobileMatchTeam { align-items: center; color: #17253f; display: flex; font-size: clamp(10.5px, 1.6vw, 11.5px); font-weight: 800; line-height: 1.1; min-width: 0; overflow: hidden; padding: 3px 2px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
          .club-mobileMatchTeam--winner { background: transparent; border-left: 2px solid rgba(22,163,74,.62); color: #17253f; gap: 4px; padding-left: 5px; }
          .club-mobileMatchTeam--winner::before { color: #16a34a; content: '✓'; font-size: 10px; font-weight: 950; }
          .club-mobileScoreValue { align-items: center; color: #64748b; display: flex; font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 700; justify-content: center; min-height: 24px; text-align: center; }
          .club-mobileScoreValue--winner { background: #ecfdf3; border: 1px solid rgba(22,163,74,.18); border-radius: 5px; color: #15803d; font-weight: 900; }
          .club-mobileMatchDivider { background: rgba(148,163,184,.32); grid-column: 1 / -1; height: 1px; width: 100%; }
          .club-matchStatusCell { align-self: start; grid-area: status; justify-self: end; min-height: 30px; }
          .club-matchActionCell { align-self: start; grid-area: action; justify-self: end; min-height: 30px; }
          .club-groupResultBtn { font-size: 11px; min-height: 34px; min-width: 0; padding-inline: 7px; }
        }
        @media (max-width: 560px) {
          .club-nextSeedStep { align-items: stretch; flex-direction: column; }
          .club-nextSeedStep .club-generateGroupsBtn { width: 100%; }
          .club-nextGroupStep { align-items: stretch; flex-direction: column; gap: 8px; padding: 9px 10px; }
          .club-nextGroupStep h2 { font-size: 15px; }
          .club-nextGroupStep .club-generateSeedBtn { min-height: 40px; width: 100%; }
          .club-title { font-size:25px; padding-right:4px; }
          .club-detailHero { border-radius:0; margin:0 -22px; padding:11px 16px; position:relative; }
          .club-detailHero .club-kicker { font-size:9px; }
          .club-detailBadges { position:absolute; right:15px; top:11px; }
          .club-detailMain { padding-right:92px; }
          .club-metaLine { font-size:11px; gap:4px 7px; }
          .club-detailSchedule { font-size:11px; }
          .club-stepper { border-left:0; border-radius:0; border-right:0; display:grid; gap:5px; grid-template-columns:repeat(6,minmax(0,1fr)); margin:7px -22px 0; padding:7px 16px 8px; }
          .club-stepperMobileLead { align-items:baseline; display:flex; gap:8px; grid-column:1 / -1; justify-content:space-between; min-width:0; }
          .club-stepperMobileLead span { color:#64748b; font-size:10px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
          .club-stepperMobileLead strong { color:#061b3a; font-size:13px; font-weight:950; overflow:hidden; text-align:right; text-overflow:ellipsis; white-space:nowrap; }
          .club-step { justify-content:center; min-width:0; padding:0; }
          .club-step strong { display:none; }
          .club-step span { height:18px; width:18px; }
          .club-tournamentDetail { overflow:visible; }
          .club-tournamentDetail::before { border-radius:16px 16px 0 0; }
          .club-detailTopbar { background:rgba(255,255,255,.94); border-bottom:1px solid color-mix(in srgb,var(--club-admin-accent) 18%,transparent); box-shadow:0 10px 24px rgba(15,23,42,.08); margin:0 -22px 8px; padding:7px 16px; position:sticky; top:calc(58px + env(safe-area-inset-top)); z-index:40; }
          .club-backMobile { align-items:center; display:inline-flex; font-size:12px; gap:1px; }
          .club-detailTopbar .club-backBtn { max-width:min(52vw,240px); overflow:hidden; }
          .club-detailTopbar .club-backMobile { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .club-tabs { display:grid; gap:0; grid-template-columns:repeat(3,minmax(0,1fr)); overflow:visible; padding:3px 16px 0; }
          .club-tab { align-items:center; display:flex; font-size:10px; justify-content:center; min-height:34px; min-width:0; padding:7px 2px 8px; white-space:nowrap; }
          .club-metrics--detail { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .club-metric { padding:8px 7px; }
          .club-metric:nth-child(3n+2) { border-left:0; border-right:0; }
          .club-metric:nth-child(even) { border-left:1px solid rgba(15,23,42,.07); }
          .club-metric strong { font-size:14px; }
          .club-metric span { font-size:10px; }
          .club-summaryGrid { gap:8px; }
          .club-nextCard { border-radius:12px; padding:10px 11px; }
          .club-nextCard h2 { font-size:15px; }
          .club-nextAction { min-height:38px; width:100%; }
          .club-sportConfigCard { border-radius:12px; padding:8px 10px; }
          .club-sportConfigGrid { grid-template-columns:1fr; }
          .club-sportConfigItem,.club-sportConfigItem:nth-child(even) { border-bottom:1px solid rgba(15,23,42,.07); padding:7px 0; }
          .club-sportConfigItem:last-child { border-bottom:0; }
          .club-sportConfigItem strong { font-size:13px; }
          .club-flyerSlot { grid-template-columns:106px minmax(0,1fr); padding:8px; }
          .club-flyerPreviewButton { height:133px; width:106px; }
          .club-flyerSlot .flyerPreview { height:133px; min-height:133px; width:106px; }
          .club-groupsTabContent { margin-inline: -14px; }
          .club-groupsTabContent .club-registrationsPanel, .club-groupsTabContent .club-matchSection { border-radius: 12px; padding: 9px; }
          .club-planningMobileLayout { display: grid; gap: 7px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .club-planningSummary { display: contents; }
          .club-planningMetric { border-radius: 10px; gap: 2px; padding: 8px; }
          .club-planningMetric span { font-size: 9px; }
          .club-planningMetric strong { font-size: 16px; }
          .club-planningMetric:nth-child(4) { grid-column: 1; }
          .club-planningMetric:nth-child(4) span { font-size: 8px; white-space: nowrap; }
          .club-planningMetric:nth-child(4) strong { font-size: 14px; line-height: 1; white-space: nowrap; }
          .club-planningStatus { align-items: start; gap: 2px 7px; grid-column: 2 / -1; grid-template-columns: auto minmax(0, 1fr); margin-top: 0; padding: 8px 9px; }
          .club-planningStatus > span { align-self: center; }
          .club-planningStatus > strong { align-self: center; font-size: 14px; }
          .club-planningStatus > small { font-size: 10px; grid-column: 2; }
          .club-detailTopbar { align-items:center; flex-direction:row; }
          .club-backDesktop, .club-desktopAction { display:none !important; }
          .club-backMobile, .club-mobileActionMenu { display:flex; }
          .club-detailTopbar .club-backBtn { background:transparent; border:0; min-height:42px; padding:0 2px; }
          .club-topbarActions { align-items:center; flex-wrap:nowrap; justify-content:flex-end; }
          .club-topbarActions .club-publishBtn { display:none; }
          .club-groupStandings { width: 100%; }
          .club-groupStandingRow { gap: 2px; grid-template-columns: 18px minmax(0, 1fr) repeat(6, 24px); padding: 2px 5px; }
          .club-groupStandingRow--head { padding-block: 3px; }
          .club-groupStandingRow span { font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 600; }
          .club-groupStandingRow--head span { font-size: 9px; }
          .club-groupStandingRow > span:nth-child(6) { background: rgba(6,182,212,.07); border-inline: 1px solid rgba(6,182,212,.18); color: #17253f; font-weight: 800; order: 3; }
          .club-groupStandingRow > span:nth-child(3) { order: 4; }
          .club-groupStandingRow > span:nth-child(4) { order: 5; }
          .club-groupStandingRow > span:nth-child(5) { order: 6; }
          .club-groupStandingRow > span:nth-child(7) { order: 7; }
          .club-groupStandingRow > span:nth-child(8) { order: 8; }
          .club-groupStandingTeam { align-items: center; display: flex; gap: 5px; min-width: 0; }
          .club-groupStandingPlayerNames { display: grid; gap: 1px; min-width: 0; }
          .club-groupStandingPlayerNames > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .club-groupStandingPlayerNames > span + span::before { content: ''; }
          .club-groupStandingRow--qualified .club-groupStandingPlayerNames > span { font-weight: 900; }
          .club-groupStandingTeam b { display: none; }
          .club-groupStandingPosition i { display: inline; }
          .club-operationalNotices--embedded .club-operationalNotice { gap: 4px; padding: 5px 7px; }
          .club-operationalNotices--embedded .club-operationalNoticeBody > p { display: none; }
          .club-operationalNotices--embedded .club-operationalNoticeDisclosure p { display: block; }
          .club-playoffSummaryGrid { grid-template-columns: 1fr; }
          .club-playoffToolbarLeft { width: 100%; }
          .club-playoffViewChip { flex: 1 1 0; justify-content: center; }
          .club-playoffZoomControls { flex: 1 1 auto; justify-content: center; }
          .club-playoffLegend { gap: 8px; }
          .club-playoffLegend span { font-size: 10px; }
          .club-playoffToolbarLeft, .club-playoffLegend, .club-playoffToolbarActions { display: none; }
          .club-playoffBracketViewport, .club-playoffCompactLayout { display: none !important; }
          .club-playoffMobileBracket { display: grid; }
          .club-playoffRoundTabs { flex-wrap: wrap; overflow: visible; }
          .club-playoffRoundTab { flex: 1 1 calc(50% - 4px); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
          .club-playoffBracketViewport { margin-inline: 0; }
          .club-playoffBracketScroll { padding-inline: 0; }
          .club-playoffBracketNav { height: 132px; width: 30px; }
          .club-playoffBracketNav svg { height: 24px; width: 24px; }
          .club-playoffBracketNav::before { width: 38px; }
          .club-playoffRoundHead { padding: 10px 11px; }
          .club-playoffBracketMatch { padding: 8px; }
          .club-playoffCardHeadActions { gap: 4px; }
          .club-playoffMatchTitleLine { gap: 5px; }
          .club-playoffScheduleLine { font-size: 9px; }
          .club-playoffBracketMeta { align-items: flex-start; flex-direction: row; justify-content: flex-start; }
          .club-playoffBracketActions { justify-content: stretch; }
          .club-playoffBracketActions .club-groupResultBtn { width: 100%; }
          .club-playoffBracketBody { grid-template-columns: minmax(0, 1fr); }
          .club-playoffSchedulePanel { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-start; }
          .club-playoffBracketConnector, .club-playoffBracketMatch::before, .club-playoffBracketMatch::after, .club-playoffRoundMatches::after, .club-playoffRoundColumn::after { display: none; }
          .club-playoffBracketTeamRow { align-items: center; grid-template-columns: minmax(0, 1fr) auto; }
          .club-playoffInlineScore { justify-content: end; }
          .club-playoffCompactFoot { align-items: flex-start; flex-direction: column; }
          .club-playoffUpcomingHead { display: none; }
          .club-playoffUpcomingRow { align-items: start; gap: 6px; grid-template-columns: 1fr; }
          .club-playoffUpcomingRow span[role="cell"]:nth-child(3) { flex-wrap: wrap; }
          .club-modalBackdrop { align-items: end; padding: 8px; }
          .club-resultModal { border-radius: 16px 16px 10px 10px; gap: 10px; max-height: calc(100dvh - 8px); overflow: auto; padding: 12px; width: 100%; }
          .club-resultModal .club-pointsHead { gap: 8px; }
          .club-resultModal .club-pointsHead h2 { font-size: 17px; }
          .club-resultForm { gap: 8px; padding: 8px; }
          .club-scoreGrid { gap: 5px; grid-template-columns: minmax(104px, 1fr) repeat(3, 44px); }
          .club-scoreHead { font-size: 10px; }
          .club-scoreRow > span { font-size: 11px; }
          .club-scoreInput { min-height: 44px; text-align: center; }
          .club-resultSummary { font-size: 11px; padding: 7px 8px; }
          .club-resultActions { display: grid; grid-template-columns: 1fr; margin: 0 -8px -8px; padding: 8px; }
          .club-resultActions .club-primaryBtn { background: #061b3a; color: #fff; min-height: 46px; width: 100%; }
          .club-resultActions .club-editBtn { min-height: 40px; width: 100%; }
          .club-courtConfigModal { border-radius: 14px 14px 10px 10px; gap: 10px; max-height: min(88dvh, 720px); overflow: auto; padding: 12px; }
          .club-courtConfigModal .club-manualHead h2 { font-size: 18px; }
          .club-courtConfigModal .club-manualHead p { font-size: 12px; }
          .club-courtConfigModal .club-manualGrid { gap: 8px; grid-template-columns: 1fr; }
          .club-courtConfigModal .club-courtDraftList { gap: 6px; }
          .club-courtConfigModal .club-courtDraftCard { gap: 3px 8px; grid-template-columns: minmax(0, 1fr) auto; padding: 8px 9px; }
          .club-courtConfigModal .club-courtDraftCard small { display: none; }
          .club-courtConfigModal .club-scheduleCapacity { padding: 8px 9px; }
          .club-courtDraftCard { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
