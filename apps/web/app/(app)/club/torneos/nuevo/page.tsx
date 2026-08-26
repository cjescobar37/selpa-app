'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Bot, CalendarDays, ChevronRight, Clock3, MapPin, Ticket, Trophy, UserPlus, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
import { CreationSuccess } from '@/components/ui/CreationSuccess'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import { calculateScheduleCapacity, type ScheduleMode } from '@/lib/tournamentSchedule'
import { uploadTournamentFlyer } from '@/lib/clubAssets'
import {
  buildGroupTiebreakerPayload,
  defaultGroupTiebreakerConfig,
  groupTiebreakerCriterionOptions,
  groupTiebreakerFinalOptions,
  type GroupTiebreakerCriterion,
  type GroupTiebreakerFinal,
} from '@/lib/tournamentTiebreakers'
import {
  TournamentFlyerConfigurator,
  TournamentFlyerPreviewCard,
  defaultFlyerConfig,
  resolveAutoFlyerConfig,
  type FlyerConfig,
} from '../_components/TournamentFlyerConfigurator'

type TournamentType = 'OPEN' | 'CHALLENGER' | 'MASTER' | 'MASTER_FINAL'
type TournamentGender = 'MALE' | 'FEMALE' | 'MIXED'
type TournamentSegment = 'LIBRES' | 'MENORES' | 'VETERANOS'
type CompetitionSystem = 'GROUPS_PLAYOFF' | 'ROUND_ROBIN' | 'SINGLE_ELIMINATION'
type CategoryRule = 'FIXED_CATEGORY' | 'CATEGORY_SUM'
type CourtSource = 'OWN_CLUB' | 'EXTERNAL_COMPLEX'

function formatCategoryOrdinal(value: string | number) {
  const labels: Record<number, string> = { 1: '1ra', 2: '2da', 3: '3ra', 4: '4ta', 5: '5ta', 6: '6ta', 7: '7ma', 8: '8va' }
  return labels[Number(value)] ?? String(value)
}

function formatMatchDuration(minutes: string) {
  const total = Number(minutes)
  if (!Number.isFinite(total) || total <= 0) return 'Duración a definir'
  if (total < 60) return `${total} minutos`
  const hours = Math.floor(total / 60)
  const remainder = total % 60
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}

function formatReviewDate(value: string) {
  if (!value) return 'Por definir'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatReviewDateShort(value: string) {
  if (!value) return 'Por definir'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date)
}

function formatReviewDateRange(start: string, end: string) {
  if (!end || end === start) return formatReviewDate(start)
  const first = new Date(`${start.slice(0, 10)}T12:00:00`)
  const last = new Date(`${end.slice(0, 10)}T12:00:00`)
  if (!Number.isNaN(first.getTime()) && !Number.isNaN(last.getTime()) && first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(last)} ${last.getFullYear()}`
  }
  return `${formatReviewDateShort(start)} – ${formatReviewDate(end)}`
}

function formatReviewDateTime(value: string) {
  const date = formatReviewDateShort(value)
  const time = value.match(/T(\d{2}):(\d{2})/)
  return time ? `${date} · ${time[1]}:${time[2]}` : date
}

function formatPriceInput(value: string) {
  if (!value) return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? `$ ${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : value
}

function formatPriceSummary(value: string) {
  if (value === '0') return 'Sin costo'
  const formatted = formatPriceInput(value)
  return formatted ? formatted.replace('$ ', '$') : 'Precio por definir'
}

type TournamentCourt = {
  id?: string
  name: string
  complexName?: string
  source: CourtSource
}

type FormState = {
  name: string
  type: TournamentType
  gender: TournamentGender
  categoryId: string
  categoryRule: CategoryRule
  categorySumTarget: string
  ageCategoryId: string
  segmentType: TournamentSegment
  competitionSystem: CompetitionSystem
  venueName: string
  publicDescription: string
  prizesEnabled: boolean
  championPrize: string
  runnerUpPrize: string
  startDate: string
  endDate: string
  registrationDeadline: string
  pricePerPlayer: string
  minPairs: string
  maxPairs: string
  tournamentCourts: TournamentCourt[]
  scheduleMode: ScheduleMode
  matchDurationMinutes: string
  groupsDate: string
  groupsStartTime: string
  groupsEndTime: string
  playoffDate: string
  playoffStartTime: string
  playoffEndTime: string
  groupTiebreakerOrder: GroupTiebreakerCriterion[]
  groupTiebreakerFinal: GroupTiebreakerFinal
  pointsEnabled: boolean
  pointsEditable: boolean
  pointsWinner: string
  pointsFinalist: string
  pointsSemifinalist: string
  pointsQuarterfinalist: string
  pointsEighthFinalist: string
  pointsParticipation: string
}

type VenueOption = {
  id: string
  clubId: string
  name: string
  isPrimary: boolean
  isExternal: boolean
  courts: Array<{ id: string; name: string }>
}

type AgeCategoryOption = { id: string; name: string; min_age: number | null; max_age: number | null; age_reference_rule: string; is_active: boolean }
type CompetitionDateDivision = {
  series_division_id: string; rule_id: string; rule_revision: number; points_scheme_id: string | null
  branch_slug: 'caballeros' | 'damas' | 'mixto'; branch_name: string
  segment_slug: 'libres' | 'menores' | 'veteranos'; segment_name: string
  category_id: string | null; category_name: string | null; legacy_category_id: number | null
  age_category_id: string | null; age_category_name: string | null
}
type CompetitionDateContext = {
  series_id: string; series_revision: number; series_name: string
  season: { id: string; name: string }
  allowed_actions: { create_date?: boolean }
  divisions: CompetitionDateDivision[]
}
type EventTierOption = { id: string; name: string; code: string; is_active: boolean }

function tournamentTypeFromEventTier(tier: EventTierOption | undefined): TournamentType | null {
  if (!tier) return null
  const value = `${tier.code} ${tier.name}`.toUpperCase().replace(/[\s-]+/g, '_')
  if (value.includes('MASTER_FINAL')) return 'MASTER_FINAL'
  if (value.includes('CHALLENGER')) return 'CHALLENGER'
  if (value.includes('MASTER')) return 'MASTER'
  if (value.includes('OPEN')) return 'OPEN'
  return null
}

const tournamentWizardDraftVersion = 2

type TournamentWizardDraft = {
  version: number
  form: FormState
  flyer: FlyerConfig
  step: number
  courtVenueIds: string[]
  selectedCompetitionDivisionId: string
  selectedEventTierId: string
  competitionIdempotencyKey: string
  manualAssignment: 'RANKING' | 'RANDOM' | 'MANUAL'
  manualScheduleExpanded: boolean
  flyerEditorOpen: boolean
  updatedAt: string
}

function isTournamentWizardDraft(value: unknown): value is TournamentWizardDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<TournamentWizardDraft>
  return draft.version === tournamentWizardDraftVersion
    && Boolean(draft.form && typeof draft.form === 'object')
    && Boolean(draft.flyer && typeof draft.flyer === 'object')
    && typeof draft.updatedAt === 'string'
    && Array.isArray(draft.courtVenueIds)
}

const defaultPoints = {
  winner: '500',
  finalist: '400',
  semifinalist: '300',
  quarterfinalist: '200',
  eighthFinalist: '150',
  participation: '50',
}

const initialForm: FormState = {
  name: '',
  type: 'OPEN',
  gender: 'MALE',
  categoryId: '7',
  categoryRule: 'FIXED_CATEGORY',
  categorySumTarget: '13',
  ageCategoryId: '',
  segmentType: 'LIBRES',
  competitionSystem: 'GROUPS_PLAYOFF',
  venueName: '',
  publicDescription: '',
  prizesEnabled: false,
  championPrize: '',
  runnerUpPrize: '',
  startDate: '',
  endDate: '',
  registrationDeadline: '',
  // Vacío indica que todavía falta una decisión explícita; cero es válido cuando se escribe.
  pricePerPlayer: '',
  minPairs: '6',
  maxPairs: '',
  tournamentCourts: [],
  scheduleMode: 'AUTO',
  matchDurationMinutes: '90',
  groupsDate: '',
  groupsStartTime: '10:00',
  groupsEndTime: '22:00',
  playoffDate: '',
  playoffStartTime: '10:00',
  playoffEndTime: '22:00',
  groupTiebreakerOrder: [...defaultGroupTiebreakerConfig.order],
  groupTiebreakerFinal: defaultGroupTiebreakerConfig.final,
  pointsEnabled: true,
  pointsEditable: false,
  pointsWinner: defaultPoints.winner,
  pointsFinalist: defaultPoints.finalist,
  pointsSemifinalist: defaultPoints.semifinalist,
  pointsQuarterfinalist: defaultPoints.quarterfinalist,
  pointsEighthFinalist: defaultPoints.eighthFinalist,
  pointsParticipation: defaultPoints.participation,
}

function reorderGroupTiebreakerCriteria(
  currentOrder: GroupTiebreakerCriterion[],
  index: number,
  selectedCriterion: GroupTiebreakerCriterion
) {
  const allCriteria = groupTiebreakerCriterionOptions.map((option) => option.value)
  const normalizedOrder = [...currentOrder, ...allCriteria].filter(
    (criterion, criterionIndex, order) =>
      allCriteria.includes(criterion) && order.indexOf(criterion) === criterionIndex
  )
  const withoutSelected = normalizedOrder.filter((criterion) => criterion !== selectedCriterion)

  return [
    ...withoutSelected.slice(0, index),
    selectedCriterion,
    ...withoutSelected.slice(index),
  ].slice(0, allCriteria.length)
}

const typeOptions: Array<{ value: TournamentType; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CHALLENGER', label: 'Challenger' },
  { value: 'MASTER', label: 'Master' },
  { value: 'MASTER_FINAL', label: 'Master Final' },
]

const genderOptions: Array<{ value: TournamentGender; label: string }> = [
  { value: 'MALE', label: 'Caballeros' },
  { value: 'FEMALE', label: 'Damas' },
  { value: 'MIXED', label: 'Mixto' },
]

const segmentOptions: Array<{ value: TournamentSegment; label: string }> = [
  { value: 'LIBRES', label: 'Libres' },
  { value: 'MENORES', label: 'Menores' },
  { value: 'VETERANOS', label: 'Veteranos' },
]

const competitionSystemOptions: Array<{ value: CompetitionSystem; label: string }> = [
  { value: 'GROUPS_PLAYOFF', label: 'Zona + Playoff' },
  { value: 'ROUND_ROBIN', label: 'Liga todos contra todos' },
  { value: 'SINGLE_ELIMINATION', label: 'Eliminación directa' },
]

const scheduleModeOptions: Array<{ value: ScheduleMode; label: string }> = [
  { value: 'AUTO', label: 'SELPA arma los horarios' },
  { value: 'MANUAL', label: 'Quiero armarlos yo' },
]

const mobileSteps = [
  'Presentación',
  'Participantes',
  'Configuración deportiva',
  'Fechas e inscripción',
  'Sede y organización',
  'Publicación',
  'Revisión final',
] as const

function buildFlyerPayload(config: FlyerConfig, tournamentTypeLabel: string) {
  const resolvedConfig = resolveAutoFlyerConfig(config, tournamentTypeLabel)
  const manualUrl = resolvedConfig.manualFlyer?.publicUrl ?? null
  return {
    flyer_mode: resolvedConfig.mode,
    flyer_background: resolvedConfig.backgroundId,
    flyer_title_color: resolvedConfig.titleColor,
    flyer_text_color: resolvedConfig.textColor,
    flyer_accent_color: resolvedConfig.accentColor,
    flyer_badge_color: resolvedConfig.badgeColor,
    flyer_date_block_color: resolvedConfig.dateBlockColor,
    flyer_data_card_color: resolvedConfig.dataCardColor,
    flyer_data_card_opacity: resolvedConfig.dataCardOpacity,
    flyer_data_card_radius: resolvedConfig.dataCardRadius,
    flyer_data_style: resolvedConfig.dataStyle,
    flyer_title_size: resolvedConfig.titleSize,
    flyer_visible_fields: resolvedConfig.visibleFields,
    flyer_font: resolvedConfig.fontFamily,
    flyer_font_weight: resolvedConfig.fontWeight,
    flyer_style: resolvedConfig.style,
    flyer_text_align: resolvedConfig.textAlign,
    flyer_manual_url: manualUrl,
    flyer_url: resolvedConfig.mode === 'MANUAL' ? manualUrl : null,
    poster_url: resolvedConfig.mode === 'MANUAL' ? manualUrl : null,
    flyer_manual_name: resolvedConfig.manualFlyer?.name ?? null,
    flyer_manual_size: resolvedConfig.manualFlyer?.size ?? null,
    flyer_manual_width: resolvedConfig.manualFlyer?.width ?? null,
    flyer_manual_height: resolvedConfig.manualFlyer?.height ?? null,
  }
}

async function prepareFlyerConfigForSubmit(config: FlyerConfig, clubId: string, tournamentTypeLabel: string) {
  const resolvedConfig = resolveAutoFlyerConfig(config, tournamentTypeLabel)
  const manualFlyer = resolvedConfig.manualFlyer

  if (resolvedConfig.mode !== 'MANUAL' || !manualFlyer?.file || manualFlyer.publicUrl) {
    return resolvedConfig
  }

  const uploaded = await uploadTournamentFlyer({
    file: manualFlyer.file,
    clubId,
  })

  return {
    ...resolvedConfig,
    manualFlyer: {
      ...manualFlyer,
      previewUrl: uploaded.publicUrl,
      publicUrl: uploaded.publicUrl,
    },
  }
}

function buildTournamentConfigPayload(form: FormState) {
  return {
    segment_type: form.segmentType,
    public_description: form.publicDescription.trim() || null,
    prizes: {
      enabled: form.prizesEnabled,
      champion: form.prizesEnabled ? form.championPrize.trim() || null : null,
      runner_up: form.prizesEnabled ? form.runnerUpPrize.trim() || null : null,
    },
    competition_system: form.competitionSystem,
    venue_name: form.venueName.trim() || null,
    schedule_config: {
      mode: form.scheduleMode,
      match_duration_minutes: toInteger(form.matchDurationMinutes, 90),
      groups: {
        date: form.groupsDate || form.startDate,
        start_time: form.groupsStartTime || '10:00',
        end_time: form.groupsEndTime || '22:00',
      },
      playoff: {
        date: form.playoffDate || form.endDate || form.startDate,
        start_time: form.playoffStartTime || '10:00',
        end_time: form.playoffEndTime || '22:00',
      },
    },
    points_config: {
      enabled: form.pointsEnabled,
      editable: form.pointsEditable,
      winner: toInteger(form.pointsWinner, 0),
      finalist: toInteger(form.pointsFinalist, 0),
      semifinalist: toInteger(form.pointsSemifinalist, 0),
      quarterfinalist: toInteger(form.pointsQuarterfinalist, 0),
      eighthFinalist: toInteger(form.pointsEighthFinalist, 0),
      participation: toInteger(form.pointsParticipation, 0),
    },
    group_tiebreakers: buildGroupTiebreakerPayload({
      order: form.groupTiebreakerOrder,
      final: form.groupTiebreakerFinal,
    }),
  }
}

function toNumber(value: string, fallback: number) {
  if (!value.trim()) return fallback
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function toInteger(value: string, fallback: number) {
  const parsed = toNumber(value, fallback)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN
}

function ReviewBlock({ title, step, onEdit, issue, multiline = false, children }: { title: string; step: number; onEdit: (step: number) => void; issue?: string | null; multiline?: boolean; children: ReactNode }) {
  return (
    <article className={`${issue ? 'has-issue ' : ''}${multiline ? 'allows-wrap' : ''}`.trim() || undefined}>
      <button type="button" className="club-reviewRowAction" onClick={() => onEdit(step)} aria-label={`Editar ${title}`} />
      <div className="club-reviewRow">
        <span className="club-reviewRowTitle">{title}</span>
        <div className="club-reviewRowCopy">{children}</div>
        {issue ? <em>{issue}</em> : null}
        <b aria-hidden="true">›</b>
      </div>
    </article>
  )
}

function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="club-choiceField">
      <span>{label}</span>
      <div className="club-choiceChips" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? 'is-active' : ''}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ClubNuevoTorneoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeClub } = useSession()
  const competitionSeriesId = searchParams.get('competitionSeriesId')?.trim() || null
  const [form, setForm] = useState<FormState>(initialForm)
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [ageCategories, setAgeCategories] = useState<AgeCategoryOption[]>([])
  const [loadingAgeCategories, setLoadingAgeCategories] = useState(true)
  const [competitionContext, setCompetitionContext] = useState<CompetitionDateContext | null>(null)
  const [selectedCompetitionDivisionId, setSelectedCompetitionDivisionId] = useState('')
  const [eventTiers, setEventTiers] = useState<EventTierOption[]>([])
  const [selectedEventTierId, setSelectedEventTierId] = useState('')
  const [loadingCompetitionContext, setLoadingCompetitionContext] = useState(Boolean(competitionSeriesId))
  const [competitionContextError, setCompetitionContextError] = useState('')
  const [competitionIdempotencyKey, setCompetitionIdempotencyKey] = useState('')
  const competitionKeyRef = useRef('')
  const createdTournamentRef = useRef<string | null>(null)
  const [loadingComplexes, setLoadingComplexes] = useState(true)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [courtVenueIds, setCourtVenueIds] = useState<string[]>([])
  const [addingCourtVenue, setAddingCourtVenue] = useState(false)
  const [manualAssignment, setManualAssignment] = useState<'RANKING' | 'RANDOM' | 'MANUAL'>('RANKING')
  const [manualScheduleExpanded, setManualScheduleExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creationSuccess, setCreationSuccess] = useState<{ id: string; name: string } | null>(null)
  const [message, setMessage] = useState('')
  const [mobileStep, setMobileStep] = useState(1)
  const [flyerEditorOpen, setFlyerEditorOpen] = useState(false)
  const [flyerMiniPreviewVisible, setFlyerMiniPreviewVisible] = useState(false)
  const [editingStep, setEditingStep] = useState<number | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<{ form: FormState; flyer: FlyerConfig } | null>(null)
  const [draftOffer, setDraftOffer] = useState<TournamentWizardDraft | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [draftReadyKey, setDraftReadyKey] = useState<string | null>(null)
  const draftKey = activeClub?.id ? `selpa:tournament-wizard:v${tournamentWizardDraftVersion}:${activeClub.id}:${competitionSeriesId ? `series:${competitionSeriesId}` : 'independent'}` : null
  const isCompetitionDate = Boolean(competitionSeriesId)
  const selectedCompetitionDivision = competitionContext?.divisions.find((division) => division.series_division_id === selectedCompetitionDivisionId) ?? null
  const primaryCourtVenue = useMemo(
    () => venueOptions.find((venue) => venue.isPrimary) ?? null,
    [venueOptions]
  )

  const selectedCourtVenues = useMemo(() => {
    const ids = new Set(courtVenueIds)
    if (primaryCourtVenue) ids.add(primaryCourtVenue.id)
    for (const court of form.tournamentCourts) {
      const venue = venueOptions.find((option) => option.id === court.complexName)
      if (venue) ids.add(venue.id)
    }
    return venueOptions.filter((venue) => ids.has(venue.id))
  }, [venueOptions, courtVenueIds, form.tournamentCourts, primaryCourtVenue])
  const availableCourtVenues = useMemo(
    () => venueOptions.filter((venue) => venue.isExternal && !selectedCourtVenues.some((selected) => selected.id === venue.id)),
    [venueOptions, selectedCourtVenues]
  )

  useEffect(() => {
    document.body.classList.add('club-tournament-wizard-active')
    return () => document.body.classList.remove('club-tournament-wizard-active')
  }, [])

  useEffect(() => {
    if (!creationSuccess) return
    const timer = window.setTimeout(() => {
      router.replace(isCompetitionDate && competitionSeriesId ? `/club/competition/series/${competitionSeriesId}?tab=dates` : `/club/torneos/${creationSuccess.id}`)
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [competitionSeriesId, creationSuccess, isCompetitionDate, router])

  useEffect(() => {
    if (!draftKey) return
    let nextDraft: TournamentWizardDraft | null = null
    let recoveryMessage = ''
    try {
      const raw = localStorage.getItem(draftKey)
      const parsed = raw ? JSON.parse(raw) as unknown : null
      if (isTournamentWizardDraft(parsed)) {
        nextDraft = parsed
      } else if (raw) {
        localStorage.removeItem(draftKey)
        recoveryMessage = 'El borrador guardado usa una versión anterior y no se puede restaurar.'
      }
    } catch {
      localStorage.removeItem(draftKey)
      recoveryMessage = 'No pudimos recuperar el borrador guardado. Empezamos uno nuevo de forma segura.'
    }
    queueMicrotask(() => {
      if (nextDraft) {
        setForm(nextDraft.form)
        setFlyerConfig(nextDraft.flyer)
        setMobileStep(Math.min(7, Math.max(1, nextDraft.step)))
        setCourtVenueIds(nextDraft.courtVenueIds)
        setSelectedCompetitionDivisionId(nextDraft.selectedCompetitionDivisionId)
        setSelectedEventTierId(nextDraft.selectedEventTierId)
        setCompetitionIdempotencyKey(nextDraft.competitionIdempotencyKey)
        competitionKeyRef.current = nextDraft.competitionIdempotencyKey
        setManualAssignment(nextDraft.manualAssignment)
        setManualScheduleExpanded(nextDraft.manualScheduleExpanded)
        setFlyerEditorOpen(nextDraft.flyerEditorOpen)
        setDraftOffer(nextDraft)
      }
      if (recoveryMessage) setMessage(recoveryMessage)
      setDraftReady(true)
      setDraftReadyKey(draftKey)
    })
  }, [draftKey])

  useEffect(() => {
    if (!draftKey || !draftReady || draftReadyKey !== draftKey || draftOffer) return
    const timer = window.setTimeout(() => {
      const persistableFlyer = {
        ...flyerConfig,
        manualFlyer: flyerConfig.manualFlyer?.publicUrl ? flyerConfig.manualFlyer : null,
      }
      const draft: TournamentWizardDraft = {
        version: tournamentWizardDraftVersion,
        form,
        flyer: persistableFlyer,
        step: mobileStep,
        courtVenueIds,
        selectedCompetitionDivisionId,
        selectedEventTierId,
        competitionIdempotencyKey,
        manualAssignment,
        manualScheduleExpanded,
        flyerEditorOpen,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(draftKey, JSON.stringify(draft))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [competitionIdempotencyKey, courtVenueIds, draftKey, draftOffer, draftReady, draftReadyKey, flyerConfig, flyerEditorOpen, form, manualAssignment, manualScheduleExpanded, mobileStep, selectedCompetitionDivisionId, selectedEventTierId])

  const errors = useMemo(() => {
    const next: string[] = []
    const categoryId = toInteger(form.categoryId, 0)
    const minPairs = toInteger(form.minPairs, 6)
    const maxPairs = form.maxPairs.trim() ? toInteger(form.maxPairs, NaN) : null
    const price = form.pricePerPlayer.trim() === '' ? Number.NaN : toNumber(form.pricePerPlayer, Number.NaN)
    const matchDuration = toInteger(form.matchDurationMinutes, 90)

    if (!activeClub?.id) next.push('Seleccioná un club activo.')
    if (isCompetitionDate && (!competitionContext || !selectedCompetitionDivision)) next.push(competitionContextError || 'Estamos preparando el circuito.')
    if (isCompetitionDate && selectedCompetitionDivision?.points_scheme_id && !selectedEventTierId) next.push('Elegí la jerarquía de esta fecha.')
    if (!form.name.trim()) next.push('El nombre es obligatorio.')
    if (!form.startDate) next.push('La fecha de inicio es obligatoria.')
    if (form.segmentType === 'LIBRES' && form.categoryRule === 'FIXED_CATEGORY' && (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 8)) next.push('Seleccioná una categoría válida.')
    if (form.segmentType === 'LIBRES' && form.categoryRule === 'CATEGORY_SUM' && (toInteger(form.categorySumTarget, 0) < 2 || toInteger(form.categorySumTarget, 0) > 16)) next.push('La suma debe estar entre 2 y 16.')
    if (form.segmentType !== 'LIBRES' && !form.ageCategoryId) next.push('Seleccioná una categoría de edad.')
    if (!Number.isInteger(minPairs) || minPairs < 2) next.push('El mínimo de parejas debe ser al menos 2.')
    if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) next.push('El máximo debe ser mayor o igual al mínimo.')
    if (!Number.isFinite(price)) next.push('Definí el precio por jugador.')
    else if (price < 0) next.push('El precio debe ser mayor o igual a 0.')
    if (!Number.isInteger(matchDuration) || matchDuration < 30) next.push('La duración estimada debe ser de al menos 30 minutos.')
    if (form.endDate && form.startDate && form.endDate < form.startDate) next.push('La fecha fin no puede ser anterior al inicio.')
    if (form.registrationDeadline && form.startDate && form.registrationDeadline.slice(0, 10) > form.startDate) next.push('El cierre de inscripción no puede ser posterior al inicio.')
    if (form.groupsDate && form.startDate && form.groupsDate < form.startDate) next.push('El día de grupos no puede ser anterior al inicio del torneo.')
    if (form.playoffDate && form.endDate && form.playoffDate > form.endDate) next.push('El día de playoff no puede ser posterior al fin del torneo.')
    if (form.groupsStartTime && form.groupsEndTime && form.groupsStartTime >= form.groupsEndTime) next.push('El horario de grupos debe cerrar después de la hora de inicio.')
    if (form.playoffStartTime && form.playoffEndTime && form.playoffStartTime >= form.playoffEndTime) next.push('El horario de playoff debe cerrar después de la hora de inicio.')

    return next
  }, [activeClub?.id, competitionContext, competitionContextError, form, isCompetitionDate, selectedCompetitionDivision, selectedEventTierId])

  const groupsScheduleCapacity = useMemo(
    () =>
      calculateScheduleCapacity({
        courtsCount: form.tournamentCourts.length,
        startTime: form.groupsStartTime || '10:00',
        endTime: form.groupsEndTime || '22:00',
        matchDurationMinutes: toInteger(form.matchDurationMinutes, 90),
      }),
    [form.groupsEndTime, form.groupsStartTime, form.matchDurationMinutes, form.tournamentCourts.length]
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

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function selectCompetitionDivision(division: CompetitionDateDivision) {
    setSelectedCompetitionDivisionId(division.series_division_id)
    setForm((current) => ({
      ...current,
      gender: division.branch_slug === 'caballeros' ? 'MALE' : division.branch_slug === 'damas' ? 'FEMALE' : 'MIXED',
      segmentType: division.segment_slug.toUpperCase() as TournamentSegment,
      categoryId: division.legacy_category_id ? String(division.legacy_category_id) : '',
      categoryRule: 'FIXED_CATEGORY',
      ageCategoryId: division.age_category_id ?? '',
      pointsEnabled: false,
      pointsEditable: false,
    }))
  }

  function selectEventTier(eventTierId: string, tiers = eventTiers) {
    setSelectedEventTierId(eventTierId)
    const type = tournamentTypeFromEventTier(tiers.find((tier) => tier.id === eventTierId))
    if (type) updateField('type', type)
  }

  function updateStartDate(value: string) {
    setForm((current) => ({
      ...current,
      startDate: value,
      groupsDate: current.groupsDate || value,
      playoffDate: current.playoffDate || current.endDate || value,
    }))
  }

  function updateEndDate(value: string) {
    setForm((current) => ({
      ...current,
      endDate: value,
      // La ventana de playoff acompaña al fin mientras sea la sugerida o quede fuera del rango.
      // No pisamos una fecha manual válida que el organizador haya elegido dentro del torneo.
      playoffDate: !current.playoffDate || current.playoffDate === current.endDate || current.playoffDate > value
        ? value || current.startDate
        : current.playoffDate,
    }))
  }

  function updateGroupTiebreakerCriterion(index: number, value: GroupTiebreakerCriterion) {
    setForm((current) => {
      return {
        ...current,
        groupTiebreakerOrder: reorderGroupTiebreakerCriteria(current.groupTiebreakerOrder, index, value),
      }
    })
  }

  async function loadVenueOptions() {
    if (!activeClub?.id) {
      setVenueOptions([])
      setThemeKey(null)
      setLoadingComplexes(false)
      return
    }

    setLoadingComplexes(true)
    const { data } = await supabase.auth.getSession()
    const { data: clubTheme } = await supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle()
    setThemeKey(typeof clubTheme?.theme_key === 'string' ? clubTheme.theme_key : null)
    const response = await fetch(`/api/clubs/${activeClub.id}/tournament-venues`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({})) as { venues?: VenueOption[]; error?: string }
    if (!response.ok) {
      setMessage(payload.error ?? 'No pude cargar los predios disponibles.')
      setVenueOptions([])
      setLoadingComplexes(false)
      return
    }
    const nextOptions = payload.venues ?? []
    setVenueOptions(nextOptions)
    const primaryVenue = nextOptions.find((venue) => venue.isPrimary)
    if (primaryVenue) {
      setForm((current) => ({
        ...current,
        venueName: primaryVenue.name,
        tournamentCourts: current.tournamentCourts.filter((court) => nextOptions.some((venue) => venue.courts.some((item) => item.id === court.id))),
      }))
    }
    setLoadingComplexes(false)
  }

  function toggleCourt(venue: VenueOption, court: { id: string; name: string }) {
    setForm((current) => ({
      ...current,
      tournamentCourts: current.tournamentCourts.some((selected) => selected.id === court.id)
        ? current.tournamentCourts.filter((selected) => selected.id !== court.id)
        : [...current.tournamentCourts, { id: court.id, name: court.name, complexName: venue.id, source: venue.isExternal ? 'EXTERNAL_COMPLEX' : 'OWN_CLUB' }],
    }))
  }

  function addCourtVenue(venueId: string) {
    if (!venueId) return
    setCourtVenueIds((current) => current.includes(venueId) ? current : [...current, venueId])
    setAddingCourtVenue(false)
  }

  function removeCourtVenue(venue: VenueOption) {
    if (venue.isPrimary) return
    setCourtVenueIds((current) => current.filter((id) => id !== venue.id))
    setForm((current) => ({
      ...current,
      tournamentCourts: current.tournamentCourts.filter((court) => court.complexName !== venue.id),
    }))
  }

  function getStepError(step: number) {
    const categoryId = toInteger(form.categoryId, 0)
    const minPairs = toInteger(form.minPairs, 6)
    const maxPairs = form.maxPairs.trim() ? toInteger(form.maxPairs, NaN) : null
    const price = form.pricePerPlayer.trim() === '' ? Number.NaN : toNumber(form.pricePerPlayer, Number.NaN)
    const matchDuration = toInteger(form.matchDurationMinutes, 90)

    if (isCompetitionDate && (loadingCompetitionContext || competitionContextError || !selectedCompetitionDivision)) return competitionContextError || 'Estamos preparando el circuito.'
    if (step === 1 && !form.name.trim()) return 'Ingresá el nombre del torneo para continuar.'
    if (step === 2 && form.segmentType === 'LIBRES' && form.categoryRule === 'FIXED_CATEGORY' && (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 8)) return 'Seleccioná una categoría válida.'
    if (step === 2 && form.segmentType === 'LIBRES' && form.categoryRule === 'CATEGORY_SUM' && (toInteger(form.categorySumTarget, 0) < 2 || toInteger(form.categorySumTarget, 0) > 16)) return 'La suma debe estar entre 2 y 16.'
    if (step === 2 && form.segmentType !== 'LIBRES' && !form.ageCategoryId) return 'Seleccioná una categoría de edad para continuar.'
    if (step === 4) {
      if (!form.startDate) return 'Ingresá la fecha de inicio para continuar.'
      if (form.endDate && form.endDate < form.startDate) return 'La fecha fin no puede ser anterior al inicio.'
      if (form.registrationDeadline && form.registrationDeadline.slice(0, 10) > form.startDate) return 'El cierre de inscripción no puede ser posterior al inicio.'
      if (!Number.isFinite(price)) return 'Definí el precio por jugador.'
      if (price < 0) return 'El precio debe ser mayor o igual a 0.'
      if (!Number.isInteger(minPairs) || minPairs < 2) return 'El mínimo de parejas debe ser al menos 2.'
      if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) return 'El máximo debe ser mayor o igual al mínimo.'
    }
    if (step === 5) {
      if (!Number.isInteger(matchDuration) || matchDuration < 30) return 'La duración estimada debe ser de al menos 30 minutos.'
      if (form.competitionSystem !== 'SINGLE_ELIMINATION') {
        if (form.groupsDate && form.startDate && form.groupsDate < form.startDate) return 'El día de grupos no puede ser anterior al inicio.'
        if (form.groupsStartTime && form.groupsEndTime && form.groupsStartTime >= form.groupsEndTime) return 'El horario de grupos debe cerrar después de la hora de inicio.'
      }
      if (form.competitionSystem !== 'ROUND_ROBIN') {
        if (form.playoffDate && form.endDate && form.playoffDate > form.endDate) return 'El día de playoff no puede ser posterior al fin.'
        if (form.playoffStartTime && form.playoffEndTime && form.playoffStartTime >= form.playoffEndTime) return 'El horario de playoff debe cerrar después de la hora de inicio.'
      }
    }
    return null
  }

  const messageOriginStep = message
    ? [1, 2, 3, 4, 5].find((step) => getStepError(step) === message) ?? null
    : null
  const noticeTone = !message
    ? null
    : messageOriginStep
      ? 'warning'
      : /no pude|sesión inválida|no se puede|error|falló/i.test(message)
        ? 'error'
        : 'success'

  const reviewIssues = [1, 2, 3, 4, 5]
    .map((step) => ({ step, message: getStepError(step) }))
    .filter((issue): issue is { step: number; message: string } => Boolean(issue.message))
  const reviewIssueByStep = new Map(reviewIssues.map((issue) => [issue.step, issue.message]))
  const reviewChecklist = [
    { label: 'Presentación', complete: !reviewIssueByStep.get(1) },
    { label: 'Participantes', complete: !reviewIssueByStep.get(2) },
    { label: 'Configuración deportiva', complete: !reviewIssueByStep.get(3) },
    { label: 'Fechas', complete: !reviewIssueByStep.get(4) },
    { label: 'Canchas opcionales', complete: form.tournamentCourts.length > 0, optional: true },
    { label: 'Publicación', complete: true },
  ]
  const reviewCompletedSections = reviewChecklist.filter((item) => item.complete || item.optional).length
  const reviewDateRange = formatReviewDateRange(form.startDate, form.endDate)
  const reviewParticipantSummary = form.segmentType === 'LIBRES'
    ? (form.categoryRule === 'CATEGORY_SUM' ? `Suma ${form.categorySumTarget}` : formatCategoryOrdinal(form.categoryId))
    : (ageCategories.find((category) => category.id === form.ageCategoryId)?.name ?? 'Edad por elegir')
  const reviewFlyerSummary = flyerConfig.mode === 'NONE'
    ? 'Sin flyer'
    : flyerConfig.mode === 'MANUAL'
      ? 'Flyer personalizado'
      : flyerEditorOpen ? 'Flyer personalizado' : 'Flyer automático'

  function goToMobileStep(step: number) {
    setMessage('')
    setMobileStep(Math.min(7, Math.max(1, step)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function beginContextualEdit(step: number) {
    setEditSnapshot({ form: structuredClone(form), flyer: structuredClone(flyerConfig) })
    setEditingStep(step)
    goToMobileStep(step)
  }

  function cancelContextualEdit() {
    if (editSnapshot) {
      setForm(editSnapshot.form)
      setFlyerConfig(editSnapshot.flyer)
    }
    setEditSnapshot(null)
    setEditingStep(null)
    goToMobileStep(7)
    setMessage('Edición cancelada. El resumen no fue modificado.')
  }

  function saveContextualEdit() {
    if (editingStep) {
      const stepError = getStepError(editingStep)
      if (stepError) {
        setMessage(stepError)
        return
      }
    }
    setEditSnapshot(null)
    setEditingStep(null)
    goToMobileStep(7)
    setMessage('Cambios guardados.')
  }

  function continueDraft() {
    if (!draftOffer) return
    setDraftOffer(null)
  }

  function discardDraft() {
    if (draftKey) localStorage.removeItem(draftKey)
    setDraftOffer(null)
    setForm(initialForm)
    setFlyerConfig(defaultFlyerConfig)
    setMobileStep(1)
    setCourtVenueIds([])
    setSelectedCompetitionDivisionId('')
    setSelectedEventTierId('')
    setCompetitionIdempotencyKey('')
    competitionKeyRef.current = ''
    setManualAssignment('RANKING')
    setManualScheduleExpanded(false)
    setFlyerEditorOpen(false)
    setMessage('Borrador descartado. Podés empezar un torneo nuevo.')
  }

  function cancelWizard() {
    const hasProgress = Boolean(draftOffer || form.name.trim() || form.publicDescription.trim() || mobileStep > 1 || form.tournamentCourts.length || flyerEditorOpen)
    if (hasProgress && !window.confirm('¿Querés descartar el torneo que estás preparando? Esta acción no se puede deshacer.')) return
    discardDraft()
    router.push(isCompetitionDate && competitionSeriesId ? `/club/competition/series/${competitionSeriesId}` : '/club/torneos')
  }

  function goToNextMobileStep() {
    const stepError = getStepError(mobileStep)
    if (stepError) {
      setMessage(stepError)
      return
    }
    goToMobileStep(mobileStep + 1)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadVenueOptions())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    if (!activeClub?.id) return
    let cancelled = false
    void supabase.auth.getSession().then(async ({ data }) => {
      const response = await fetch(`/api/clubs/${activeClub.id}/competition/age-categories`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({})) as { ageCategories?: AgeCategoryOption[] }
      if (!cancelled) {
        setAgeCategories(response.ok ? (payload.ageCategories ?? []).filter((category) => category.is_active) : [])
        setLoadingAgeCategories(false)
      }
    })
    return () => { cancelled = true }
  }, [activeClub?.id])

  useEffect(() => {
    if (!competitionSeriesId || !activeClub?.id) return
    let cancelled = false
    void supabase.auth.getSession().then(async ({ data }) => {
      const response = await fetch(`/api/clubs/${activeClub.id}/competition/series/${competitionSeriesId}/date-creation`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({})) as { context?: CompetitionDateContext; error?: string }
      if (cancelled) return
      if (!response.ok || !payload.context) {
        setCompetitionContextError(payload.error ?? 'No pudimos preparar esta fecha de circuito.')
        setLoadingCompetitionContext(false)
        return
      }
      const nextContext = payload.context
      const firstDivision = nextContext.divisions[0]
      if (!firstDivision) {
        setCompetitionContextError('El circuito no tiene una división lista para crear fechas.')
        setLoadingCompetitionContext(false)
        return
      }
      setCompetitionContext(nextContext)
      setSelectedCompetitionDivisionId((current) => {
        const restoredDivision = current && nextContext.divisions.some((division) => division.series_division_id === current)
          ? nextContext.divisions.find((division) => division.series_division_id === current) ?? firstDivision
          : firstDivision
        // La división del circuito es fuente de verdad, incluso al restaurar un borrador local.
        // Así nunca queda una categoría heredada de otra división oculta en el formulario.
        queueMicrotask(() => selectCompetitionDivision(restoredDivision))
        return restoredDivision.series_division_id
      })
      setLoadingCompetitionContext(false)
    })
    return () => { cancelled = true }
  }, [activeClub?.id, competitionSeriesId])

  useEffect(() => {
    if (!isCompetitionDate || !activeClub?.id) return
    let cancelled = false
    void supabase.auth.getSession().then(async ({ data }) => {
      const response = await fetch(`/api/clubs/${activeClub.id}/competition/event-tiers`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({})) as { eventTiers?: EventTierOption[] }
      const tiers = response.ok ? (payload.eventTiers ?? []).filter((tier) => tier.is_active) : []
      if (!cancelled) {
        setEventTiers(tiers)
        setSelectedEventTierId((current) => {
          const next = tiers.some((tier) => tier.id === current) ? current : tiers[0]?.id ?? ''
          const type = tournamentTypeFromEventTier(tiers.find((tier) => tier.id === next))
          if (type) queueMicrotask(() => updateField('type', type))
          return next
        })
      }
    })
    return () => { cancelled = true }
  }, [activeClub?.id, isCompetitionDate])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (!activeClub?.id || errors.length) {
      setMessage(errors[0] ?? 'Revisá los datos del torneo.')
      return
    }

    setSaving(true)

    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) {
      setMessage('Sesión inválida.')
      setSaving(false)
      return
    }

    const tournamentTypeLabel = typeOptions.find((option) => option.value === form.type)?.label ?? form.type
    const tournamentGenderLabel = genderOptions.find((option) => option.value === form.gender)?.label ?? form.gender
    let preparedFlyerConfig: FlyerConfig
    try {
      preparedFlyerConfig = await prepareFlyerConfigForSubmit(
        flyerConfig,
        activeClub.id,
        `${tournamentTypeLabel} ${tournamentGenderLabel}`
      )
      if (preparedFlyerConfig !== flyerConfig) setFlyerConfig(preparedFlyerConfig)
    } catch {
      setMessage('No pudimos preparar el flyer. Revisá el archivo e intentá nuevamente.')
      setSaving(false)
      return
    }

    const tournamentConfig = buildTournamentConfigPayload(form)
    const tournamentPayload = {
      name: form.name,
      type: form.type,
      gender: form.gender,
      category_id: form.segmentType === 'LIBRES' ? Number(form.categoryId) : null,
      category_rule: form.categoryRule,
      category_sum_target: form.categoryRule === 'CATEGORY_SUM' ? Number(form.categorySumTarget) : null,
      age_category_id: form.segmentType === 'LIBRES' ? null : form.ageCategoryId,
      segment_type: tournamentConfig.segment_type,
      segment: tournamentConfig.segment_type,
      public_description: tournamentConfig.public_description,
      prizes: tournamentConfig.prizes,
      competition_system: tournamentConfig.competition_system,
      venue_name: tournamentConfig.venue_name,
      schedule_config: tournamentConfig.schedule_config,
      points_config: isCompetitionDate ? { ...tournamentConfig.points_config, enabled: false, editable: false, winner: 0, finalist: 0, semifinalist: 0, quarterfinalist: 0, eighthFinalist: 0, participation: 0 } : tournamentConfig.points_config,
      group_tiebreakers: tournamentConfig.group_tiebreakers,
      start_date: form.startDate,
      end_date: form.endDate || null,
      registration_deadline: form.registrationDeadline || null,
      price_per_player: form.pricePerPlayer,
      min_pairs: form.minPairs,
      max_pairs: form.maxPairs || null,
      flyer: buildFlyerPayload(preparedFlyerConfig, `${tournamentTypeLabel} ${tournamentGenderLabel}`),
    }
    const dateKey = competitionKeyRef.current || competitionIdempotencyKey || crypto.randomUUID()
    if (!competitionKeyRef.current) {
      competitionKeyRef.current = dateKey
      setCompetitionIdempotencyKey(dateKey)
    }
    const requestUrl = isCompetitionDate && competitionSeriesId
      ? `/api/clubs/${activeClub.id}/competition/series/${competitionSeriesId}/date-creation`
      : `/api/clubs/${activeClub.id}/tournaments`
    const requestBody = isCompetitionDate && competitionContext && selectedCompetitionDivision
      ? {
          idempotencyKey: dateKey,
          seriesRevision: competitionContext.series_revision,
          seriesDivisionId: selectedCompetitionDivision.series_division_id,
          ruleId: selectedCompetitionDivision.rule_id,
          ruleRevision: selectedCompetitionDivision.rule_revision,
          eventPayload: {
            name: form.name,
            event_type: 'STANDARD',
            scoring_mode: selectedCompetitionDivision.points_scheme_id ? 'POINTS' : 'NON_SCORING',
            event_tier_id: selectedCompetitionDivision.points_scheme_id ? selectedEventTierId : null,
            planned_starts_at: form.startDate || null,
            planned_ends_at: form.endDate || form.startDate || null,
            venue_name: form.venueName || null,
            is_public: false,
          },
          tournamentPayload,
        }
      : tournamentPayload
    let tournamentId = createdTournamentRef.current
    if (!tournamentId) {
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': dateKey,
        },
        body: JSON.stringify(requestBody),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMessage(json?.error ?? 'No pude crear el torneo.')
        setSaving(false)
        return
      }

      const createdTournament = json?.tournament ?? json?.result?.tournament ?? json?.result
      tournamentId = typeof createdTournament?.id === 'string'
        ? createdTournament.id
        : typeof json?.tournament_id === 'string'
          ? json.tournament_id
          : typeof json?.result?.tournament_id === 'string'
            ? json.result.tournament_id
            : null
      if (tournamentId) createdTournamentRef.current = tournamentId
    }
    if (!tournamentId || !primaryCourtVenue) {
      setMessage('El torneo se creó, pero no pude confirmar la sede para guardar las canchas.')
      setSaving(false)
      return
    }

    const assignmentResponse = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'replace_tournament_court_assignments',
        primary_venue_id: primaryCourtVenue.id,
        court_ids: form.tournamentCourts.map((court) => court.id).filter((id): id is string => Boolean(id)),
      }),
    })
    const assignmentPayload = await assignmentResponse.json().catch(() => ({}))
    if (!assignmentResponse.ok) {
      setMessage(assignmentPayload?.error ?? 'El torneo se creó, pero no pude guardar las canchas seleccionadas.')
      setSaving(false)
      return
    }

    setSaving(false)
    createdTournamentRef.current = null
    if (draftKey) localStorage.removeItem(draftKey)
    setCreationSuccess({ id: tournamentId, name: form.name.trim() || 'tu torneo' })
  }

  const flyerPreviewData = {
    clubName: activeClub?.name ?? '',
    name: form.name,
    type: typeOptions.find((option) => option.value === form.type)?.label ?? form.type,
    gender: genderOptions.find((option) => option.value === form.gender)?.label ?? form.gender,
    categoryLabel: form.segmentType === 'LIBRES'
      ? (form.categoryRule === 'CATEGORY_SUM' ? `Suma ${form.categorySumTarget}` : formatCategoryOrdinal(form.categoryId || '7'))
      : (ageCategories.find((category) => category.id === form.ageCategoryId)?.name ?? 'Edad por elegir'),
    publicDescription: form.publicDescription,
    segmentLabel: segmentOptions.find((option) => option.value === form.segmentType)?.label ?? form.segmentType,
    competitionSystemLabel: competitionSystemOptions.find((option) => option.value === form.competitionSystem)?.label ?? form.competitionSystem,
    venueName: form.venueName || activeClub?.name || '',
    startDate: form.startDate,
    endDate: form.endDate,
    registrationDeadline: form.registrationDeadline,
    pricePerPlayer: form.pricePerPlayer,
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-newTournament" style={themeStyle}>
        {message && !creationSuccess && noticeTone ? <ActionFeedbackNotice
          tone={noticeTone}
          title={noticeTone === 'success' ? 'Listo' : noticeTone === 'error' ? 'No pudimos completar la acción' : 'Revisá este dato'}
          message={message}
          detail={messageOriginStep ? 'Señalamos el bloque que requiere atención.' : undefined}
          onDismiss={() => setMessage('')}
          autoDismissMs={noticeTone === 'success' ? 4000 : undefined}
        /> : null}
        {creationSuccess ? <CreationSuccess
          kicker={isCompetitionDate ? 'Fecha creada' : 'Torneo creado'}
          title="¡Felicitaciones!"
          message={<>Acabás de crear <strong>{creationSuccess.name}</strong>.</>}
          nextStep={isCompetitionDate ? 'La fecha ya quedó vinculada al circuito.' : 'El siguiente paso es publicarlo cuando esté listo.'}
          actionLabel={isCompetitionDate ? 'Volver al circuito' : 'Ir al torneo'}
          redirectLabel={isCompetitionDate ? 'Volvemos al circuito…' : 'Te llevamos al torneo…'}
          onAction={() => router.replace(isCompetitionDate && competitionSeriesId ? `/club/competition/series/${competitionSeriesId}?tab=dates` : `/club/torneos/${creationSuccess.id}`)}
        /> : <>
        <div className="club-newHead">
          <div>
            <span className="club-kicker">Club Torneos</span>
            <h1 className="club-title">{isCompetitionDate ? 'Crear fecha' : 'Crear torneo'}</h1>
            <p className="club-sub">{isCompetitionDate ? 'La fecha quedará vinculada al circuito como borrador.' : `Alta rápida para ${activeClub?.name ?? 'tu club'}. El torneo queda como borrador.`}</p>
          </div>
          <Link href="/club/torneos" className="club-secondaryBtn">Volver</Link>
        </div>

        {draftOffer ? (
          <div className="club-draftResume">
            <div className="club-draftResumeSummary">
              <Trophy aria-hidden="true" />
              <div className="club-draftResumeCopy">
                <div className="club-draftResumeTitleRow"><strong>Tenés un torneo sin terminar</strong><span className="club-draftResumeStatus">Autoguardado</span></div>
                <span className="club-draftResumeName">{draftOffer.form.name || 'Sin nombre'}</span>
                <small>Actualizado {new Date(draftOffer.updatedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</small>
              </div>
            </div>
            <div className="club-draftResumeActions"><button type="button" onClick={continueDraft}>Continuar</button><button type="button" onClick={discardDraft}>Descartar</button></div>
          </div>
        ) : null}
        {isCompetitionDate ? <aside className="club-competitionDateContext" aria-live="polite">
          <span>FECHA DEL CIRCUITO</span>
          {loadingCompetitionContext ? <strong>Preparando contexto…</strong> : competitionContextError ? <><strong>No se puede crear esta fecha</strong><p>{competitionContextError}</p></> : competitionContext && selectedCompetitionDivision ? <>
            <strong>{competitionContext.series_name}</strong>
            <p>{selectedCompetitionDivision.branch_name} · {selectedCompetitionDivision.segment_name} · {selectedCompetitionDivision.age_category_name ?? selectedCompetitionDivision.category_name ?? 'Categoría'}</p>
            {selectedCompetitionDivision.points_scheme_id && eventTiers.length ? <label><span>Jerarquía</span><select value={selectedEventTierId} onChange={(event) => selectEventTier(event.target.value)}>{eventTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label> : null}
          </> : null}
        </aside> : null}

        <form className="club-formCard" onSubmit={submit}>
          <header className="club-mobileWizardHead">
            <div>
              <span>Paso {mobileStep} de 7</span>
              <strong>{mobileSteps[mobileStep - 1]}</strong>
            </div>
            <i aria-hidden="true"><span style={{ width: `${(mobileStep / 7) * 100}%` }} /></i>
            <div className="club-mobileStepLegend" aria-label="Progreso del formulario">
              <span>{mobileStep > 1 ? `✓ ${mobileSteps[mobileStep - 2]}` : '○ Inicio'}</span>
              <strong>● {mobileSteps[mobileStep - 1]}</strong>
              <span>{mobileStep < 7 ? `○ ${mobileSteps[mobileStep]}` : '✓ Listo'}</span>
            </div>
          </header>

          <section className="club-formSection club-mobileStep" data-active={mobileStep === 1} data-origin-error={messageOriginStep === 1}>
            <div className="club-formSectionHead">
              <span className="club-kicker">Presentación</span>
              <p>¿Qué torneo vas a organizar?</p>
            </div>
            <div className="club-formSectionGrid">
              <label className="club-field club-field--span6">
                <span>Nombre</span>
                <input
                  className="px-input"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Ej: Open Verano 6ta"
                  maxLength={90}
                />
              </label>

              <label className="club-field club-field--span6">
                <span>Descripción pública</span>
                <textarea
                  className="club-textarea club-textarea--compact"
                  value={form.publicDescription}
                  onChange={(event) => updateField('publicDescription', event.target.value)}
                  placeholder="Contá brevemente de qué se trata."
                  maxLength={280}
                  rows={2}
                />
              </label>
              <fieldset className="club-field club-field--span6 club-apbChoice">
                <legend>{isCompetitionDate ? 'Premios de esta fecha' : 'Premios'} <small>Opcional</small></legend>
                <label><input type="radio" name="prizes" checked={!form.prizesEnabled} onChange={() => updateField('prizesEnabled', false)} /><span>{isCompetitionDate ? 'Sin premio adicional' : 'Sin premios'}</span></label>
                <label><input type="radio" name="prizes" checked={form.prizesEnabled} onChange={() => updateField('prizesEnabled', true)} /><span>{isCompetitionDate ? 'Esta fecha entrega premios' : 'Entrega premios'}</span></label>
                {isCompetitionDate ? <small className="club-prizeDateHint">Es independiente del premio general del circuito.</small> : null}
              </fieldset>
              {form.prizesEnabled ? <div className="club-formSectionGrid club-field--wide club-prizesGrid">
                <label className="club-field club-field--span3"><span>🏆 Campeón</span><input className="px-input" value={form.championPrize} onChange={(event) => updateField('championPrize', event.target.value)} placeholder="Trofeo + $50.000" /></label>
                <label className="club-field club-field--span3"><span>🥈 Subcampeón</span><input className="px-input" value={form.runnerUpPrize} onChange={(event) => updateField('runnerUpPrize', event.target.value)} placeholder="Paleta o voucher" /></label>
              </div> : null}
            </div>
          </section>

          <section className="club-formSection club-formSection--soft club-mobileStep" data-active={mobileStep === 2} data-origin-error={messageOriginStep === 2}>
            <div className="club-formSectionHead">
              <span className="club-kicker">Participantes</span>
              <p>¿Quiénes juegan este torneo?</p>
            </div>
            <div className="club-formSectionGrid">
              {isCompetitionDate && competitionContext && selectedCompetitionDivision ? <div className="club-inheritedDivision club-field--wide">
                <span>DIVISIÓN DEL CIRCUITO</span>
                {competitionContext.divisions.length > 1 ? <label>Elegí la división de esta fecha<select value={selectedCompetitionDivisionId} onChange={(event) => { const division = competitionContext.divisions.find((item) => item.series_division_id === event.target.value); if (division) selectCompetitionDivision(division) }}>{competitionContext.divisions.map((division) => <option key={division.series_division_id} value={division.series_division_id}>{division.branch_name} · {division.segment_name} · {division.age_category_name ?? division.category_name ?? 'Categoría'}</option>)}</select></label> : null}
                <strong>{selectedCompetitionDivision.branch_name} · {selectedCompetitionDivision.segment_name} · {selectedCompetitionDivision.age_category_name ?? selectedCompetitionDivision.category_name ?? 'Categoría'}</strong>
                <small>✓ Heredada del circuito</small>
              </div> : <>
              <div className="club-field--wide">
                <ChoiceChips
                  label="Género"
                  value={form.gender}
                  options={genderOptions}
                  onChange={(gender) => updateField('gender', gender)}
                  disabled={isCompetitionDate}
                />
              </div>
              <div className="club-field--wide">
                <ChoiceChips
                  label="Grupo"
                  value={form.segmentType}
                  options={segmentOptions}
                  onChange={(segmentType) => setForm((current) => ({ ...current, segmentType, ageCategoryId: '', categoryRule: 'FIXED_CATEGORY' }))}
                  disabled={isCompetitionDate}
                />
              </div>

              {form.segmentType === 'LIBRES' ? <div className="club-field--wide">
                <ChoiceChips
                  label="Modalidad"
                  value={form.categoryRule}
                  options={[
                    { value: 'FIXED_CATEGORY', label: 'Categoría fija' },
                    { value: 'CATEGORY_SUM', label: 'Suma XX' },
                  ]}
                  onChange={(categoryRule) => updateField('categoryRule', categoryRule)}
                  disabled={isCompetitionDate}
                />
              </div> : null}

              {form.segmentType !== 'LIBRES' ? (() => {
                const options = ageCategories.filter((category) => form.segmentType === 'MENORES'
                  ? category.max_age !== null && category.max_age <= 18
                  : category.min_age !== null && category.min_age >= 18)
                return options.length ? <div className="club-field--wide">
                  <ChoiceChips
                    label="Categoría de edad"
                    value={form.ageCategoryId}
                    options={options.map((category) => ({ value: category.id, label: category.name }))}
                    onChange={(ageCategoryId) => updateField('ageCategoryId', ageCategoryId)}
                    disabled={isCompetitionDate}
                  />
                </div> : <div className="club-field club-field--wide club-ageEmpty">
                  <strong>{loadingAgeCategories ? 'Cargando categorías…' : 'No hay categorías de edad configuradas'}</strong>
                  {!loadingAgeCategories ? <><span>Configurá las opciones del club antes de crear este torneo.</span><Link href="/club/competition">Ir a Competencia</Link></> : null}
                </div>
              })() : null}

              {form.segmentType === 'LIBRES' && form.categoryRule === 'FIXED_CATEGORY' ? <div className="club-field--wide">
                <ChoiceChips
                  label="Categoría"
                  value={form.categoryId}
                  options={[8, 7, 6, 5, 4, 3, 2, 1].map((category) => ({ value: String(category), label: formatCategoryOrdinal(category) }))}
                  onChange={(categoryId) => updateField('categoryId', categoryId)}
                  disabled={isCompetitionDate}
                />
              </div> : null}
              {form.segmentType === 'LIBRES' && form.categoryRule === 'CATEGORY_SUM' ? <label className="club-field club-field--span4"><span>Suma de la pareja</span><input className="px-input" inputMode="numeric" min="2" max="16" value={form.categorySumTarget} onChange={(event) => updateField('categorySumTarget', event.target.value)} placeholder="13" /></label> : null}
              </>}

              <div className="club-liveSummary club-field--wide">{genderOptions.find(option => option.value === form.gender)?.label} · {segmentOptions.find(option => option.value === form.segmentType)?.label} · {form.segmentType === 'LIBRES' ? (form.categoryRule === 'CATEGORY_SUM' ? `Suma ${form.categorySumTarget}` : formatCategoryOrdinal(form.categoryId)) : (ageCategories.find((category) => category.id === form.ageCategoryId)?.name ?? 'Edad por elegir')}</div>
            </div>
          </section>

          <section className="club-formSection club-mobileStep" data-active={mobileStep === 3} data-origin-error={messageOriginStep === 3}>
            <div className="club-formSectionHead"><span className="club-kicker">Configuración deportiva</span><p>{isCompetitionDate ? 'Definí el formato y revisá los puntos efectivos de esta fecha.' : 'Elegí la jerarquía y el formato de juego.'}</p></div>
            <div className="club-formSectionGrid">
              {!isCompetitionDate ? <div className="club-field--wide">
                <ChoiceChips label="Jerarquía" value={form.type} options={typeOptions} onChange={(type) => updateField('type', type)} />
              </div> : null}
              <div className="club-field--wide">
                <ChoiceChips label="Formato" value={form.competitionSystem} options={competitionSystemOptions} onChange={(competitionSystem) => updateField('competitionSystem', competitionSystem)} />
              </div>
              {isCompetitionDate ? <div className="club-inheritedPoints club-field--wide"><strong>Tabla de puntos</strong><span>{selectedCompetitionDivision?.points_scheme_id ? 'Esta fecha usa la tabla efectiva del circuito.' : 'Esta fecha no asigna puntos.'}</span><small>Los ajustes por fecha se realizan sobre una fecha ya creada; al crearla mantiene la regla del circuito.</small></div> : <details className="club-mobileSecondary club-field--wide">
                <summary>Tabla de puntos <small>{form.pointsEnabled ? 'Activa' : 'Sin puntos'}</small></summary>
                <div className="club-mobileSecondaryContent">
                  <label className="club-checkRow club-checkRow--wide"><input type="checkbox" checked={form.pointsEnabled} onChange={(event) => updateField('pointsEnabled', event.target.checked)} /><span>Este torneo asigna puntos</span></label>
                  {form.pointsEnabled ? <details className="club-mobilePointsTable"><summary>Ver tabla</summary><p>Ganador {form.pointsWinner} · Finalista {form.pointsFinalist} · Semifinalista {form.pointsSemifinalist}</p></details> : <p className="club-mobilePointsNote">Este torneo no asigna puntos.</p>}
                </div>
              </details>}
            </div>
          </section>

          <section className="club-formSection club-mobileStep" data-active={mobileStep === 4} data-origin-error={messageOriginStep === 4}>
            <div className="club-formSectionHead">
              <span className="club-kicker">Fechas e inscripción</span>
              <p>Definí fechas, cupos y precio.</p>
            </div>
            <div className="club-mobileDateBlocks">
              <div className="club-mobileDateBlock">
                <div className="club-mobileDateBlockHead"><CalendarDays aria-hidden="true" /><div><strong>Fechas del torneo</strong><span>¿Cuándo se juega?</span></div></div>
                <div className="club-formSectionGrid club-mobileDatesGrid">
              <label className="club-field club-field--span3 club-field--compact club-mobileDateHalf">
                <span>Inicio</span>
                <input className="px-input" type="date" value={form.startDate} onChange={(event) => updateStartDate(event.target.value)} />
              </label>

              <label className="club-field club-field--span3 club-field--compact club-mobileDateHalf">
                <span>Fin</span>
                <input className="px-input" type="date" value={form.endDate} onChange={(event) => updateEndDate(event.target.value)} />
              </label>
                </div>
                <p className="club-mobileDateDuration">Duración: {form.startDate && form.endDate ? `${Math.max(1, Math.floor((new Date(`${form.endDate}T12:00:00`).getTime() - new Date(`${form.startDate}T12:00:00`).getTime()) / 86400000) + 1)} día${Math.max(1, Math.floor((new Date(`${form.endDate}T12:00:00`).getTime() - new Date(`${form.startDate}T12:00:00`).getTime()) / 86400000) + 1) === 1 ? '' : 's'}` : 'a definir'}</p>
              </div>
              <div className="club-mobileDateBlock">
                <div className="club-mobileDateBlockHead"><UserPlus aria-hidden="true" /><div><strong>Inscripciones</strong><span>¿Hasta cuándo se pueden anotar?</span></div></div>
                <div className="club-formSectionGrid">
              <label className="club-field club-field--span3 club-field--compact">
                <span>Cierre de inscripción</span>
                <input className="px-input" type="datetime-local" value={form.registrationDeadline} onChange={(event) => updateField('registrationDeadline', event.target.value)} />
              </label>
                </div>
                <p className="club-mobileDateHelp">Definí hasta cuándo se pueden anotar.</p>
              </div>
              <div className="club-mobileDateBlock">
                <div className="club-mobileDateBlockHead"><Ticket aria-hidden="true" /><div><strong>Precio y cupos</strong></div></div>
                <div className="club-formSectionGrid club-mobileDatesGrid">
              <label className="club-field club-field--span3 club-field--compact">
                <span>Precio por jugador</span>
                <input className="px-input" inputMode="numeric" value={isCompetitionDate ? formatPriceInput(form.pricePerPlayer) : form.pricePerPlayer} onChange={(event) => updateField('pricePerPlayer', isCompetitionDate ? event.target.value.replace(/\D/g, '') : event.target.value)} placeholder={isCompetitionDate ? '$ 35.000' : undefined} />
              </label>

              <label className="club-field club-field--span2 club-field--compact">
                <span>Mín. parejas</span>
                <input className="px-input" inputMode="numeric" value={form.minPairs} onChange={(event) => updateField('minPairs', event.target.value)} />
              </label>

              <label className="club-field club-field--span2 club-field--compact">
                <span>Máx. parejas</span>
                <input className="px-input" inputMode="numeric" value={form.maxPairs} onChange={(event) => updateField('maxPairs', event.target.value)} placeholder="Opcional" />
              </label>
                </div>
              </div>
            </div>
          </section>

          <section className="club-formSection club-formSection--highlight club-mobileStep" data-active={mobileStep === 5}>
            <div className="club-formSectionHead">
              <span className="club-kicker">Sede y organización</span>
              <p>Definí las canchas y la jornada del torneo.</p>
            </div>
            <div className="club-formSectionGrid club-venueRow">
              <span className="club-organizationBlockLabel club-field--wide">Sede principal</span>
              <div className="club-primaryVenue club-field--wide">
                <MapPin aria-hidden="true" />
                <div><strong>{primaryCourtVenue?.name ?? 'Cargando sede principal…'}</strong><small>Organiza el torneo</small></div>
                <em>Sede principal</em>
              </div>

              <div className="club-courtsPanel club-field--wide">
                <div className="club-courtsPanelHead"><strong>Canchas disponibles para este torneo</strong><small>{form.tournamentCourts.length ? `${form.tournamentCourts.length} cancha${form.tournamentCourts.length === 1 ? '' : 's'} · ${selectedCourtVenues.length} predio${selectedCourtVenues.length === 1 ? '' : 's'}` : 'Todavía no seleccionaste canchas.'}</small></div>
                {loadingComplexes ? <div className="club-emptyInline">Cargando predios disponibles…</div> : !primaryCourtVenue ? <div className="club-emptyInline">No hay una sede principal disponible para este club.</div> : <>
                  {selectedCourtVenues.map((venue) => {
                    const isPrimary = venue.isPrimary
                    return <section key={venue.id} className="club-complexCourts">
                      <header><strong><MapPin aria-hidden="true" /> {venue.name}</strong>{isPrimary ? <em>Sede principal</em> : <button type="button" onClick={() => removeCourtVenue(venue)}>Quitar</button>}</header>
                      {venue.courts.length ? <div>{venue.courts.map((court) => {
                        const selected = form.tournamentCourts.some((item) => item.id === court.id)
                        return <label key={court.id}><input type="checkbox" checked={selected} onChange={() => toggleCourt(venue, court)} /> <span>{court.name}</span></label>
                      })}</div> : <small>Este predio no tiene canchas activas disponibles.</small>}
                    </section>
                  })}
                  {availableCourtVenues.length ? addingCourtVenue ? <label className="club-addVenueSelect"><span>Agregar otro predio</span><select className="px-input" value="" autoFocus onChange={(event) => addCourtVenue(event.target.value)}><option value="">Seleccioná un predio</option>{availableCourtVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label> : <button type="button" className="club-addVenueButton" onClick={() => setAddingCourtVenue(true)}><span>＋</span> Agregar otro predio</button> : null}
                </>}
              </div>
            </div>
          </section>

          <section className="club-formSection club-mobileStep" data-active={mobileStep === 5} data-origin-error={messageOriginStep === 5}>
            <div className="club-formSectionGrid">
              <div className="club-field--wide club-scheduleModeCards">
                <span className="club-organizationBlockLabel">Quién organiza el torneo</span>
                <span className="club-organizationLabel">Planificación</span>
                <div className="club-scheduleModeOptions" role="group" aria-label="Planificación">
                  <button type="button" className={form.scheduleMode === 'AUTO' ? 'is-active' : ''} onClick={() => { updateField('scheduleMode', 'AUTO'); setManualScheduleExpanded(false) }}><Bot aria-hidden="true" /><span><strong>SELPA organiza</strong><small>Horarios y orden de juego.</small></span></button>
                  <button type="button" className={form.scheduleMode === 'MANUAL' ? 'is-active' : ''} onClick={() => updateField('scheduleMode', 'MANUAL')}><UserRound aria-hidden="true" /><span><strong>Lo organizo yo</strong><small>Definís horarios y orden.</small></span></button>
                </div>
              </div>

              {form.scheduleMode === 'AUTO' ? <div className="club-autoPlanningNote club-field--wide">
                <Bot aria-hidden="true" /><span>SELPA organizará horarios, canchas y descansos. Podés ajustar después.</span>
              </div> : <div className="club-manualPlanning club-field--wide">
                <div className="club-manualChoice"><strong>Asignación inicial</strong><div role="group" aria-label="Asignación inicial"><button type="button" className={manualAssignment === 'RANKING' ? 'is-active' : ''} onClick={() => setManualAssignment('RANKING')}>Por ranking</button><button type="button" className={manualAssignment === 'RANDOM' ? 'is-active' : ''} onClick={() => setManualAssignment('RANDOM')}>Aleatoria</button><button type="button" className={manualAssignment === 'MANUAL' ? 'is-active' : ''} onClick={() => setManualAssignment('MANUAL')}>Manual</button></div></div>
                <button type="button" className="club-manualScheduleButton" aria-expanded={manualScheduleExpanded} onClick={() => setManualScheduleExpanded((current) => !current)}><CalendarDays aria-hidden="true" /><span><strong>Configurar horarios</strong><small>Definí las ventanas y el cronograma inicial.</small></span><ChevronRight aria-hidden="true" /></button>
                <span>SELPA no reorganizará automáticamente los partidos.</span>
              </div>}

              <label className="club-field club-field--wide club-matchDurationField">
                <span><Clock3 aria-hidden="true" /> Duración del partido <em>{formatMatchDuration(form.matchDurationMinutes)}</em></span>
                <input className="px-input" inputMode="numeric" value={form.matchDurationMinutes} onChange={(event) => updateField('matchDurationMinutes', event.target.value)} placeholder="90" />
                <small>{form.matchDurationMinutes ? 'Tiempo estimado por partido.' : 'Definí el tiempo estimado por partido.'}</small>
              </label>

              {form.tournamentCourts.length ? <div className="club-field club-field--wide club-scheduleCapacity">
                <span>Capacidad estimada</span><strong>{groupsScheduleCapacity.totalCapacity} partidos</strong><small>{form.tournamentCourts.length} cancha{form.tournamentCourts.length === 1 ? '' : 's'} · {groupsScheduleCapacity.slotsPerCourt} slots por cancha</small>
              </div> : null}

              <span className="club-organizationBlockLabel club-field--wide">Configuración de la jornada</span>
              <div className="club-scheduleWindows club-field--wide" data-auto={form.scheduleMode === 'AUTO'} data-manual-open={manualScheduleExpanded}>
                <details className="club-scheduleWindow club-mobileConditional" data-mobile-hidden={form.competitionSystem === 'SINGLE_ELIMINATION'}>
                  <summary>
                    <span>Grupos</span>
                    <small>{form.scheduleMode === 'AUTO' ? 'Se calcularán automáticamente' : form.groupsDate && form.groupsStartTime && form.groupsEndTime ? `Configurado: ${form.groupsStartTime}–${form.groupsEndTime}${form.tournamentCourts.length ? ` · ${form.tournamentCourts.length} canchas` : ''}` : form.groupsDate || form.groupsStartTime || form.groupsEndTime ? 'Configurado parcialmente' : 'Sin configurar'}</small>
                  </summary>
                  <div className="club-scheduleFields">
                  <strong>GRUPOS</strong>
                  <label className="club-field club-field--compact">
                    <span>Día</span>
                    <input className="px-input" type="date" value={form.groupsDate} onChange={(event) => updateField('groupsDate', event.target.value)} />
                  </label>
                  <label className="club-field club-field--compact">
                    <span>Desde</span>
                    <input className="px-input" type="time" value={form.groupsStartTime} onChange={(event) => updateField('groupsStartTime', event.target.value)} />
                  </label>
                  <label className="club-field club-field--compact">
                    <span>Hasta</span>
                    <input className="px-input" type="time" value={form.groupsEndTime} onChange={(event) => updateField('groupsEndTime', event.target.value)} />
                  </label>
                  </div>
                </details>

                <details className="club-scheduleWindow club-mobileConditional" data-mobile-hidden={form.competitionSystem === 'ROUND_ROBIN'}>
                  <summary>
                    <span>Playoff</span>
                    <small>{form.scheduleMode === 'AUTO' ? 'Se calcularán automáticamente' : form.playoffDate && form.playoffStartTime && form.playoffEndTime ? `Configurado: ${form.playoffStartTime}–${form.playoffEndTime}${form.tournamentCourts.length ? ` · ${form.tournamentCourts.length} canchas` : ''}` : form.playoffDate || form.playoffStartTime || form.playoffEndTime ? 'Configurado parcialmente' : 'Sin configurar'}</small>
                  </summary>
                  <div className="club-scheduleFields">
                  <strong>PLAYOFF</strong>
                  <label className="club-field club-field--compact">
                    <span>Día</span>
                    <input className="px-input" type="date" value={form.playoffDate} onChange={(event) => updateField('playoffDate', event.target.value)} />
                  </label>
                  <label className="club-field club-field--compact">
                    <span>Desde</span>
                    <input className="px-input" type="time" value={form.playoffStartTime} onChange={(event) => updateField('playoffStartTime', event.target.value)} />
                  </label>
                  <label className="club-field club-field--compact">
                    <span>Hasta</span>
                    <input className="px-input" type="time" value={form.playoffEndTime} onChange={(event) => updateField('playoffEndTime', event.target.value)} />
                  </label>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <section className="club-formSection club-formSection--soft club-mobileStep club-mobileConditional" data-active={mobileStep === 5} data-mobile-hidden={form.competitionSystem === 'SINGLE_ELIMINATION'}>
            <div className="club-formSectionHead">
              <span className="club-organizationBlockLabel">Opciones avanzadas</span>
            </div>
            <details className="club-mobileSecondary">
              <summary><span><strong>Configurar desempates</strong><small>Definí reglas sólo si las necesitás.</small></span><em>Opcional</em><ChevronRight aria-hidden="true" /></summary>
              <div className="club-mobileSecondaryContent">
            <div className="club-tiebreakerGrid">
              {form.groupTiebreakerOrder.map((criterion, index) => (
                <label className="club-field club-field--compact" key={`tiebreaker-${index}`}>
                  <span>Criterio {index + 1}</span>
                  <select
                    className="px-input"
                    value={criterion}
                    onChange={(event) => updateGroupTiebreakerCriterion(index, event.target.value as GroupTiebreakerCriterion)}
                  >
                    {groupTiebreakerCriterionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="club-field club-field--compact">
                <span>Desempate final</span>
                <select
                  className="px-input"
                  value={form.groupTiebreakerFinal}
                  onChange={(event) => updateField('groupTiebreakerFinal', event.target.value as GroupTiebreakerFinal)}
                >
                  {groupTiebreakerFinalOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {form.groupTiebreakerFinal === 'DRAW' ? (
              <div className="club-inlineNote club-inlineNote--compact">
                Si el empate llega a sorteo/manual, el sistema no elige automáticamente al azar.
              </div>
            ) : null}
              </div>
            </details>
          </section>

          <section className="club-formSection club-mobileStep club-desktopPoints" data-active={false}>
            <div className="club-formSectionHead">
              <span className="club-kicker">Puntaje</span>
              <p>Revisá la escala y editála solo si hace falta.</p>
            </div>
            <div className="club-formSectionGrid">
              <label className="club-checkRow club-checkRow--wide">
                <input
                  type="checkbox"
                  checked={form.pointsEnabled}
                  onChange={(event) => updateField('pointsEnabled', event.target.checked)}
                />
                <span>Este torneo asigna puntos</span>
              </label>

              <div className="club-field club-field--wide club-pointsToolbar">
                {form.pointsEnabled ? (
                  <div className="club-pointsSummary" aria-label="Resumen de puntos">
                    <span>Ganador <strong>{form.pointsWinner}</strong></span>
                    <span>Finalista <strong>{form.pointsFinalist}</strong></span>
                    <span>Semifinalista <strong>{form.pointsSemifinalist}</strong></span>
                    <span>Cuartos <strong>{form.pointsQuarterfinalist}</strong></span>
                    <span>Octavos <strong>{form.pointsEighthFinalist}</strong></span>
                    <span>Participación / Zona <strong>{form.pointsParticipation}</strong></span>
                  </div>
                ) : (
                  <span className="club-pointsHint">Puntaje desactivado para este torneo.</span>
                )}
                <button
                  type="button"
                  className="club-secondaryBtn club-secondaryBtn--compact"
                  onClick={() => updateField('pointsEditable', !form.pointsEditable)}
                  disabled={!form.pointsEnabled}
                >
                  {form.pointsEditable ? 'Bloquear puntos' : 'Editar puntos'}
                </button>
              </div>

              {form.pointsEnabled && form.pointsEditable ? (
              <div className="club-pointsGrid">
                <label className="club-field">
                  <span>Ganador</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsWinner} onChange={(event) => updateField('pointsWinner', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
                <label className="club-field">
                  <span>Finalista</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsFinalist} onChange={(event) => updateField('pointsFinalist', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
                <label className="club-field">
                  <span>Semifinalista</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsSemifinalist} onChange={(event) => updateField('pointsSemifinalist', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
                <label className="club-field">
                  <span>Cuartos</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsQuarterfinalist} onChange={(event) => updateField('pointsQuarterfinalist', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
                <label className="club-field">
                  <span>Octavos</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsEighthFinalist} onChange={(event) => updateField('pointsEighthFinalist', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
                <label className="club-field">
                  <span>Participación / zona</span>
                  <input className="px-input" inputMode="numeric" value={form.pointsParticipation} onChange={(event) => updateField('pointsParticipation', event.target.value)} disabled={!form.pointsEnabled || !form.pointsEditable} />
                </label>
              </div>
              ) : null}
            </div>
          </section>

          <section
            className="club-formSection club-mobileStep club-reviewStep"
            data-active={mobileStep === 6 || mobileStep === 7}
            data-current-step={mobileStep}
            data-flyer-editor-open={flyerEditorOpen}
          >
            <div className="club-formSectionHead">
              <span className="club-kicker">{mobileStep === 6 ? 'Publicación' : 'Revisión final'}</span>
              <p>{mobileStep === 6 ? '¿Cómo querés presentar el torneo?' : 'Revisá el torneo antes de crearlo.'}</p>
            </div>
            <div className="club-mobileFlyerOverview">
              <div className="club-mobileFlyerModes" aria-label="Modo de flyer">
                <button
                  type="button"
                  className={flyerConfig.mode === 'NONE' ? 'is-active' : ''}
                  onClick={() => {
                    setFlyerConfig((current) => ({ ...current, mode: 'NONE' }))
                    setFlyerEditorOpen(false)
                  }}
                >
                  Sin flyer
                </button>
                <button
                  type="button"
                  className={flyerConfig.mode === 'AUTO' && !flyerEditorOpen ? 'is-active' : ''}
                  onClick={() => {
                    setFlyerConfig((current) => ({ ...current, mode: 'AUTO' }))
                    setFlyerEditorOpen(false)
                  }}
                >
                  Automático
                </button>
                <button
                  type="button"
                  className={flyerEditorOpen ? 'is-active' : ''}
                  aria-expanded={flyerEditorOpen}
                  onClick={() => {
                    setFlyerConfig((current) => ({ ...current, mode: 'AUTO' }))
                    setFlyerEditorOpen(true)
                  }}
                >
                  Personalizar
                </button>
              </div>
              {flyerEditorOpen ? (
                <div className="club-mobileFlyerEditor">
                  <TournamentFlyerConfigurator
                    value={flyerConfig}
                    onChange={setFlyerConfig}
                    advancedControls
                    previewData={flyerPreviewData}
                    progressive
                    hideModeControls
                    onPreviewVisibilityChange={(isVisible) => setFlyerMiniPreviewVisible(!isVisible)}
                    onResetToAutomatic={() => {
                      const automatic = resolveAutoFlyerConfig({ ...defaultFlyerConfig, mode: 'AUTO' }, `${flyerPreviewData.type} ${flyerPreviewData.gender}`)
                      setFlyerConfig(automatic)
                    }}
                  />
                </div>
              ) : <div className="club-mobileFlyerPrimaryPreview">
                {flyerConfig.mode === 'NONE' ? (
                  <div className="club-mobileFlyerEmptyPreview">
                    <span>Flyer del torneo</span>
                    <strong>Sin flyer por ahora</strong>
                    <p>Podés usar el diseño automático o personalizarlo antes de crear.</p>
                  </div>
                ) : (
                  <TournamentFlyerPreviewCard
                    value={resolveAutoFlyerConfig(flyerConfig, `${flyerPreviewData.type} ${flyerPreviewData.gender}`)}
                    previewData={flyerPreviewData}
                    variant="editor"
                  />
                )}
              </div>}
            </div>
            {mobileStep === 6 && flyerEditorOpen && flyerMiniPreviewVisible ? <aside className="club-mobileFlyerStickyPreview" aria-label="Vista previa del flyer">
              <div>
                <span>Vista previa</span>
                <strong>Personalizando</strong>
              </div>
              <div className="club-mobileFlyerMiniCanvas" aria-hidden="true">
                <div className="club-mobileFlyerMiniScale">
                  <TournamentFlyerPreviewCard
                    value={resolveAutoFlyerConfig(flyerConfig, `${flyerPreviewData.type} ${flyerPreviewData.gender}`)}
                    previewData={flyerPreviewData}
                    variant="card"
                  />
                </div>
              </div>
            </aside> : null}

            <div className="club-review">
              <div className={`club-reviewReadiness${reviewIssues.length ? ' has-issues' : ''}`}>
                <div>
                  <strong>{reviewIssues.length ? `Hay ${reviewIssues.length} ${reviewIssues.length === 1 ? 'cosa' : 'cosas'} que necesitás resolver` : '✓ Tu torneo está listo'}</strong>
                  <span>{reviewIssues.length ? 'Revisá los bloques señalados antes de crear el borrador.' : 'Revisamos la configuración y podés crear el borrador.'}</span>
                </div>
                <small>{reviewIssues.length ? `${reviewCompletedSections}/6 secciones completas` : '6/6 secciones completas'}</small>
              </div>
              <div className="club-reviewChecklist" aria-label="Estado de la configuración">
                {reviewChecklist.map((item) => <span key={item.label} className={item.complete ? 'is-complete' : item.optional ? 'is-optional' : 'is-pending'}>
                  <i aria-hidden="true">{item.complete ? '✓' : '○'}</i>{item.label}
                </span>)}
              </div>

              <article className="club-reviewMainCard">
                <span className="club-reviewStatusBadge">Borrador</span>
                <div className="club-reviewMainCopy">
                  <span className="club-kicker">Resumen del torneo</span>
                  <strong>{form.name || 'Torneo sin nombre'}</strong>
                  <p>{genderOptions.find((option) => option.value === form.gender)?.label} · {segmentOptions.find((option) => option.value === form.segmentType)?.label} · {reviewParticipantSummary}</p>
                </div>
                <div className="club-reviewFacts">
                  <span>{typeOptions.find((option) => option.value === form.type)?.label} · {reviewDateRange}</span>
                  <span>{form.venueName || 'Sede por definir'}</span>
                  <span>{formatPriceSummary(form.pricePerPlayer)} · {form.maxPairs ? `${form.minPairs}–${form.maxPairs}` : `desde ${form.minPairs}`} parejas</span>
                </div>
                {flyerConfig.mode !== 'NONE' ? <div className="club-reviewMainFlyer" aria-hidden="true"><div><TournamentFlyerPreviewCard value={resolveAutoFlyerConfig(flyerConfig, `${flyerPreviewData.type} ${flyerPreviewData.gender}`)} previewData={flyerPreviewData} variant="card" /></div></div> : null}
              </article>

              {isCompetitionDate && competitionContext && selectedCompetitionDivision ? <article className="club-reviewCircuit">
                <span>Circuito</span><strong>{competitionContext.series_name}</strong><small>{selectedCompetitionDivision.branch_name} · {selectedCompetitionDivision.segment_name} · {selectedCompetitionDivision.age_category_name ?? selectedCompetitionDivision.category_name ?? 'Categoría'} · {typeOptions.find((option) => option.value === form.type)?.label ?? form.type}</small>
              </article> : null}
              <ReviewBlock title={isCompetitionDate ? 'Presentación y premio de esta fecha' : 'Presentación'} step={1} onEdit={beginContextualEdit} issue={reviewIssueByStep.get(1)}>
                <strong>{form.name || 'Sin nombre'}</strong>
                <span>{form.publicDescription || (form.prizesEnabled ? (isCompetitionDate ? 'Premio de esta fecha configurado' : 'Premios configurados') : (isCompetitionDate ? 'Sin premio adicional para esta fecha' : 'Sin descripción pública'))}</span>
              </ReviewBlock>
              <ReviewBlock title="Participantes" step={2} onEdit={beginContextualEdit} issue={reviewIssueByStep.get(2)}>
                <strong>{genderOptions.find((option) => option.value === form.gender)?.label} · {segmentOptions.find((option) => option.value === form.segmentType)?.label} · {reviewParticipantSummary}</strong>
                <span>{form.categoryRule === 'CATEGORY_SUM' ? 'Suma de la pareja' : 'Categoría fija'}</span>
              </ReviewBlock>
              <ReviewBlock title="Configuración deportiva" step={3} onEdit={beginContextualEdit} issue={reviewIssueByStep.get(3)}>
                <strong>{typeOptions.find((option) => option.value === form.type)?.label} · {competitionSystemOptions.find((option) => option.value === form.competitionSystem)?.label}</strong>
                <span>{isCompetitionDate ? (selectedCompetitionDivision?.points_scheme_id ? 'Tabla efectiva del circuito' : 'No asigna puntos') : (form.pointsEnabled ? 'Tabla de puntos activa' : 'No asigna puntos')}</span>
              </ReviewBlock>
              <ReviewBlock title="Fechas e inscripción" step={4} onEdit={beginContextualEdit} issue={reviewIssueByStep.get(4)} multiline>
                <strong>{reviewDateRange}</strong>
                <span>Cierre {form.registrationDeadline ? formatReviewDateTime(form.registrationDeadline) : 'por definir'} · {formatPriceSummary(form.pricePerPlayer)} · {form.maxPairs ? `${form.minPairs}–${form.maxPairs}` : `desde ${form.minPairs}`} parejas</span>
              </ReviewBlock>
              <ReviewBlock title="Sede y organización" step={5} onEdit={beginContextualEdit} issue={reviewIssueByStep.get(5)}>
                <strong>{form.venueName || 'Sede por definir'}</strong>
                <span>{form.tournamentCourts.length ? `${form.tournamentCourts.length} cancha${form.tournamentCourts.length === 1 ? '' : 's'}` : 'Sin canchas'} · {scheduleModeOptions.find((option) => option.value === form.scheduleMode)?.label}</span>
              </ReviewBlock>
              <ReviewBlock title="Publicación" step={6} onEdit={beginContextualEdit}>
                <div className="club-reviewPublication">
                  <div><strong>{reviewFlyerSummary}{flyerConfig.mode !== 'NONE' ? ` · ${flyerConfig.backgroundId.replace('fondo', 'Fondo ')}` : ''}</strong><span>{Object.values(flyerConfig.visibleFields).filter(Boolean).length} datos visibles</span></div>
                  {flyerConfig.mode !== 'NONE' ? <div className="club-reviewFlyerMini" aria-hidden="true"><div><TournamentFlyerPreviewCard value={resolveAutoFlyerConfig(flyerConfig, `${flyerPreviewData.type} ${flyerPreviewData.gender}`)} previewData={flyerPreviewData} variant="card" /></div></div> : null}
                </div>
              </ReviewBlock>
            </div>
          </section>

          {mobileStep === 7 && !editingStep ? <p className="club-reviewCreateHint">Se creará como borrador. Podrás publicarlo cuando esté listo.</p> : null}

          <div className="club-formActions">
            <button type="submit" className="club-primaryBtn" disabled={saving}>
              {saving ? 'Creando...' : isCompetitionDate ? 'Crear fecha' : 'Crear torneo'}
            </button>
            <Link href="/club/torneos" className="club-secondaryBtn">Cancelar</Link>
          </div>

          <div className="club-mobileActions" data-first-step={mobileStep === 1}>
            {editingStep ? (
              <>
                <button type="button" className="club-secondaryBtn" onClick={cancelContextualEdit}>Cancelar</button>
                <button type="button" className="club-primaryBtn" onClick={saveContextualEdit}>Guardar cambios</button>
              </>
            ) : (
              <>
            {mobileStep > 1 ? <button type="button" className="club-secondaryBtn" onClick={() => goToMobileStep(mobileStep - 1)}>Atrás</button> : <button type="button" className="club-secondaryBtn" onClick={cancelWizard}>Cancelar</button>}
            {mobileStep < 7 ? (
              <button type="button" className="club-primaryBtn" onClick={(event) => { event.preventDefault(); goToNextMobileStep() }}>Siguiente →</button>
            ) : (
              <button type="submit" className="club-primaryBtn" disabled={saving || Boolean(competitionContextError) || loadingCompetitionContext}>{saving ? 'Creando...' : isCompetitionDate ? 'Crear fecha' : 'Crear torneo'}</button>
            )}
              </>
            )}
          </div>
        </form>
        </>}
      </div>

      <style>{`
        .club-competitionDateContext { background:#f7fbff; border:1px solid color-mix(in srgb, var(--club-admin-accent) 18%, #cbd5e1); border-radius:12px; display:grid; gap:2px; margin:0 0 10px; padding:9px 11px; }
        .club-competitionDateContext > span { color:var(--club-admin-accent); font-size:10px; font-weight:900; letter-spacing:.08em; }
        .club-competitionDateContext strong { color:#0b2545; font-size:14px; }
        .club-competitionDateContext p,.club-competitionDateContext small { color:#52657a; margin:0; }
        .club-competitionDateContext p { font-size:11px; font-weight:800; }
        .club-competitionDateContext small { font-size:10px; }
        .club-competitionDateContext label { align-items:center; display:flex; font-size:11px; font-weight:850; gap:8px; justify-content:space-between; margin-top:3px; }
        .club-competitionDateContext select { background:#fff; border:1px solid #cbd5e1; border-radius:8px; color:#17314f; font:inherit; max-width:66%; min-height:32px; padding:0 7px; }
        .club-prizeDateHint { color:#64748b; display:block; font-size:11px; font-weight:750; line-height:1.35; margin-top:4px; }
        .club-inheritedDivision { background:color-mix(in srgb,var(--club-admin-accent) 5%,#fff); border:1px solid color-mix(in srgb,var(--club-admin-accent) 18%,#dce5ef); border-radius:12px; display:grid; gap:3px; padding:10px 11px; }
        .club-inheritedDivision>span { color:var(--club-admin-accent); font-size:10px; font-weight:900; letter-spacing:.07em; }
        .club-inheritedDivision strong { color:#112946; font-size:14px; }
        .club-inheritedDivision small { color:#5b738b; font-size:11px; font-weight:800; }
        .club-inheritedDivision label { color:#50657c; display:grid; font-size:11px; font-weight:800; gap:4px; }
        .club-inheritedDivision select { background:#fff; border:1px solid #cbd5e1; border-radius:8px; color:#17314f; font:inherit; min-height:36px; padding:0 8px; }
        .club-inheritedPoints { background:#f7f9fc; border:1px solid #e0e7ef; border-radius:12px; display:grid; gap:3px; padding:10px 11px; }
        .club-inheritedPoints strong { color:#142a46; font-size:13px; }
        .club-inheritedPoints span { color:#536a82; font-size:12px; font-weight:800; }
        .club-inheritedPoints small { color:#73859a; font-size:10px; font-weight:700; line-height:1.35; }
        .club-newTournament {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-newTournament::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-newHead { align-items: flex-start; background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft)); border: 1px solid rgba(15,23,42,.07); border-radius: 20px; display: flex; gap: 14px; justify-content: space-between; padding: 18px; }
        .club-draftResume { background:#fff; border:1px solid color-mix(in srgb,var(--club-admin-accent) 30%,transparent); border-radius:14px; display:grid; gap:9px; margin:12px 0 0; padding:10px 12px; }
        .club-draftResumeSummary { align-items:center; display:grid; gap:9px; grid-template-columns:28px minmax(0,1fr); min-width:0; }
        .club-draftResumeSummary > svg { color:var(--club-admin-accent); height:26px; width:26px; }
        .club-draftResumeCopy { display:grid; gap:2px; min-width:0; }
        .club-draftResumeTitleRow { align-items:center; display:flex; gap:8px; justify-content:space-between; min-width:0; }
        .club-draftResume strong { color:#071a35; font-size:13px; line-height:1.2; min-width:0; }
        .club-draftResumeStatus { background:color-mix(in srgb,var(--club-admin-accent) 11%,#fff); border-radius:999px; color:var(--club-admin-accent); flex:0 0 auto; font-size:10px; font-weight:900; padding:3px 7px; }
        .club-draftResumeName { color:#526b8d; font-size:12px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-draftResume small { color:#8094b1; font-size:10px; font-weight:700; line-height:1.2; }
        .club-draftResumeActions { display:grid; gap:7px; grid-template-columns:1fr 1fr; }
        .club-draftResume button { background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:9px; color:#17314f; font:inherit; font-size:12px; font-weight:900; min-height:40px; padding:0 10px; }
        .club-draftResume button:first-child { background:#061b3a; color:#fff; }
        .club-formCard { background: rgba(248,250,252,.72); border: 1px solid rgba(15,23,42,.07); border-radius: 20px; display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 12px; }
        .club-formSection { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 18px; box-shadow: 0 14px 34px rgba(15,23,42,.045); display: grid; gap: 12px; padding: 16px; }
        .club-formSection[data-origin-error="true"] { border-color:rgba(217,119,6,.48); box-shadow:0 0 0 3px rgba(217,119,6,.09),0 14px 34px rgba(15,23,42,.045); }
        .club-formSection[data-origin-error="true"] .club-formSectionHead .club-kicker { color:#a35a05; }
        .club-formSection--soft { background: linear-gradient(135deg, #fff, color-mix(in srgb, var(--club-admin-accent) 5%, white)); border-color: color-mix(in srgb, var(--club-admin-accent) 16%, transparent); }
        .club-formSection--highlight { background: linear-gradient(135deg, color-mix(in srgb, var(--club-admin-accent) 6%, white), #fff); border-color: color-mix(in srgb, var(--club-admin-accent) 20%, transparent); }
        .club-formSectionHead { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
        .club-formSectionHead p { color: #64748b; font-size: 12px; font-weight: 780; line-height: 1.4; margin: 0; max-width: 420px; }
        .club-formSectionGrid { display: grid; gap: 8px; grid-template-columns: repeat(12, minmax(0, 1fr)); }
        .club-formSectionGrid--nested { margin-top: 8px; }
        .club-tiebreakerGrid { display: grid; gap: 8px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .club-inlineNote--compact { margin-top: 8px; padding: 8px 10px; }
        .club-field { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-choiceField { display:grid; gap:7px; min-width:0; }
        .club-choiceField > span { color:#17253f; font-size:13px; font-weight:900; }
        .club-choiceChips { display:flex; flex-wrap:wrap; gap:7px; min-width:0; }
        .club-choiceChips button { background:#fff; border:1px solid rgba(15,23,42,.14); border-radius:12px; color:#395069; cursor:pointer; font:inherit; font-size:12px; font-weight:900; min-height:36px; padding:6px 11px; transition:border-color .16s ease, box-shadow .16s ease, color .16s ease; }
        .club-choiceChips button:hover, .club-choiceChips button:focus-visible { border-color:color-mix(in srgb,var(--club-admin-accent) 52%,transparent); box-shadow:0 0 0 3px var(--club-admin-soft); color:#071a35; outline:none; }
        .club-choiceChips button.is-active { background:color-mix(in srgb,var(--club-admin-accent) 9%,white); border-color:var(--club-admin-accent); box-shadow:inset 0 -2px 0 var(--club-admin-accent); color:#071a35; }
        .club-choiceHint { color:#64748b; font-size:12px; font-weight:750; line-height:1.4; margin:0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-field .px-input { background: #fff; border-color: rgba(15,23,42,.10); border-radius: 12px; min-height: 36px; }
        .club-field .px-input:focus { border-color: color-mix(in srgb, var(--club-admin-accent) 45%, transparent); box-shadow: 0 0 0 3px var(--club-admin-soft); outline: none; }
        .club-field--compact .px-input { min-height: 32px; padding-block: 6px; }
        .club-field--wide { grid-column: 1 / -1; }
        .club-field--span2 { grid-column: span 2; }
        .club-field--span3 { grid-column: span 3; }
        .club-field--span4 { grid-column: span 4; }
        .club-field--span6 { grid-column: span 6; }
        .club-field--span8 { grid-column: span 8; }
        .club-textarea { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font: inherit; font-size: 13px; font-weight: 700; min-height: 46px; max-height: 84px; outline: none; padding: 8px 10px; resize: vertical; width: 100%; }
        .club-textarea--compact { min-height: 52px; }
        .club-textarea:focus { border-color: color-mix(in srgb, var(--club-admin-accent) 45%, transparent); box-shadow: 0 0 0 3px var(--club-admin-soft); }
        .club-checkRow--wide { grid-column: 1 / -1; }
        .club-disclosure { background: rgba(255,255,255,.76); border: 1px solid rgba(15,23,42,.08); border-radius: 12px; padding: 8px 10px; }
        .club-disclosure--button { align-self: end; background: transparent; border: 0; padding: 0; }
        .club-disclosure--button > summary { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); border-radius: 999px; color: #061b3a; min-height: 36px; padding: 7px 12px; }
        .club-disclosureSection { padding: 10px; }
        .club-disclosure > summary, .club-disclosureSection > summary { align-items: center; cursor: pointer; display: flex; gap: 10px; justify-content: space-between; list-style: none; }
        .club-disclosure > summary::-webkit-details-marker, .club-disclosureSection > summary::-webkit-details-marker { display: none; }
        .club-disclosure summary span, .club-disclosureSection summary span { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-disclosure summary small, .club-disclosureSection summary small { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 4px 8px; }
        .club-disclosure p { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 8px 0 0; }
        .club-venueRow { align-items: end; }
        .club-venueField > span, .club-matchDurationField > span { align-items:center; display:flex; gap:7px; }
        .club-venueField > span svg, .club-matchDurationField > span svg { color:var(--club-admin-accent); height:18px; width:18px; }
        .club-primaryVenue { align-items:center; background:color-mix(in srgb,var(--club-admin-accent) 5%,#fff); border:1px solid color-mix(in srgb,var(--club-admin-accent) 18%,rgba(15,23,42,.08)); border-radius:12px; display:grid; gap:9px; grid-template-columns:20px minmax(0,1fr) auto; min-height:50px; padding:8px 10px; }
        .club-primaryVenue > svg { color:var(--club-admin-accent); height:19px; width:19px; }
        .club-primaryVenue > div { display:grid; gap:1px; min-width:0; }
        .club-primaryVenue strong { color:#17253f; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-primaryVenue small { color:#64748b; font-size:10px; font-weight:800; }
        .club-primaryVenue > em { background:color-mix(in srgb,var(--club-admin-accent) 10%,#fff); border-radius:999px; color:var(--club-admin-accent); font-size:10px; font-style:normal; font-weight:900; padding:3px 7px; white-space:nowrap; }
        .club-organizationLabel { color:#17253f; display:block; font-size:13px; font-weight:950; margin-bottom:2px; }
        .club-organizationBlockLabel { color:#64748b; display:block; font-size:11px; font-weight:950; letter-spacing:.055em; margin-bottom:-2px; text-transform:uppercase; }
        .club-scheduleModeOptions { display:grid; gap:8px; grid-template-columns:repeat(2,minmax(0,1fr)); }
        .club-scheduleModeOptions button { align-items:flex-start; background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:13px; color:#17253f; cursor:pointer; display:flex; gap:9px; min-height:64px; padding:9px; text-align:left; }
        .club-scheduleModeOptions button.is-active { background:color-mix(in srgb,var(--club-admin-accent) 8%,#fff); border-color:var(--club-admin-accent); box-shadow:inset 0 -2px 0 var(--club-admin-accent); }
        .club-scheduleModeOptions button > svg { color:var(--club-admin-accent); flex:0 0 auto; height:20px; width:20px; }
        .club-scheduleModeOptions button > span { display:grid; gap:4px; }
        .club-scheduleModeOptions strong { font-size:13px; line-height:1.2; }
        .club-scheduleModeOptions small, .club-matchDurationField > small { color:#64748b; font-size:11px; font-weight:750; line-height:1.3; }
        .club-autoPlanningNote { align-items:center; background:color-mix(in srgb,var(--club-admin-accent) 6%,#fff); border:1px solid color-mix(in srgb,var(--club-admin-accent) 15%,transparent); border-radius:11px; color:#496276; display:flex; font-size:11px; font-weight:800; gap:8px; line-height:1.3; padding:9px 10px; }
        .club-autoPlanningNote > svg { color:var(--club-admin-accent); flex:0 0 auto; height:17px; width:17px; }
        .club-manualPlanning > span { color:#64748b; font-size:11px; font-weight:750; }
        .club-manualPlanning { display:grid; gap:11px; }
        .club-manualChoice { display:grid; gap:7px; }
        .club-manualChoice > strong { color:#17253f; font-size:13px; }
        .club-manualChoice > div { display:flex; flex-wrap:wrap; gap:7px; }
        .club-manualChoice button { background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:10px; color:#395069; cursor:pointer; font:inherit; font-size:12px; font-weight:850; min-height:38px; padding:7px 10px; }
        .club-manualChoice button.is-active { background:color-mix(in srgb,var(--club-admin-accent) 8%,#fff); border-color:var(--club-admin-accent); color:#071a35; }
        .club-manualScheduleButton { align-items:center; background:#f8fafc; border:1px solid rgba(15,23,42,.09); border-radius:12px; color:#17253f; cursor:pointer; display:flex; font:inherit; font-size:13px; font-weight:950; justify-content:space-between; min-height:46px; padding:0 11px; }
        .club-manualScheduleButton > svg { color:var(--club-admin-accent); height:20px; width:20px; }
        .club-manualScheduleButton > span { display:grid; flex:1; gap:2px; margin-left:9px; text-align:left; }
        .club-manualScheduleButton > span small { color:#64748b; font-size:11px; font-weight:750; }
        .club-manualScheduleButton > svg:last-child { color:#64748b; height:18px; width:18px; }
        .club-matchDurationField > span { justify-content:flex-start; }
        .club-matchDurationField > span em { background:color-mix(in srgb,var(--club-admin-accent) 9%,#fff); border-radius:999px; color:var(--club-admin-accent); font-size:11px; font-style:normal; margin-left:auto; padding:3px 7px; }
        .club-scheduleWindows[data-auto="true"] .club-scheduleWindow > summary { align-items:center; color:#17253f; display:flex; justify-content:space-between; }
        .club-scheduleWindows[data-auto="true"] .club-scheduleFields { display:none !important; }
        .club-courtsPanel { border-top:1px solid rgba(15,23,42,.08); display:grid; gap:9px; padding-top:10px; }
        .club-courtsPanelHead { display:grid; gap:2px; }
        .club-courtsPanelHead strong { color:#17253f; font-size:13px; font-weight:950; }
        .club-courtsPanelHead small { color:#64748b; font-size:11px; font-weight:750; line-height:1.3; }
        .club-complexCourts { border-top:1px solid rgba(15,23,42,.07); display:grid; gap:7px; padding-top:9px; }
        .club-complexCourts > header { align-items:center; display:flex; gap:8px; justify-content:space-between; min-width:0; }
        .club-complexCourts > header strong { align-items:center; color:#17253f; display:flex; font-size:13px; gap:7px; min-width:0; overflow-wrap:anywhere; }
        .club-complexCourts > header strong svg { color:var(--club-admin-accent); flex:0 0 auto; height:17px; width:17px; }
        .club-complexCourts > header em { background:color-mix(in srgb,var(--club-admin-accent) 10%,#fff); border-radius:999px; color:var(--club-admin-accent); flex:0 0 auto; font-size:10px; font-style:normal; font-weight:900; padding:3px 7px; }
        .club-complexCourts > header button { background:transparent; border:0; color:#64748b; cursor:pointer; font:inherit; font-size:11px; font-weight:900; min-height:28px; padding:0 2px; }
        .club-complexCourts > header button:hover { color:#b42318; }
        .club-complexCourts > div { display:grid; gap:6px; grid-template-columns:repeat(2,minmax(0,1fr)); }
        .club-complexCourts label { align-items:center; color:#40546d; display:flex; font-size:12px; font-weight:800; gap:8px; min-height:36px; min-width:0; }
        .club-complexCourts input { accent-color:var(--club-admin-accent); height:18px; width:18px; }
        .club-complexCourts small { color:#64748b; font-size:11px; }
        .club-addVenueButton { background:transparent; border:0; color:var(--club-admin-accent); cursor:pointer; font:inherit; font-size:12px; font-weight:950; justify-self:start; min-height:38px; padding:0; }
        .club-addVenueButton span { font-size:18px; vertical-align:-1px; }
        .club-addVenueSelect { display:grid; gap:5px; }
        .club-addVenueSelect > span { color:#40546d; font-size:11px; font-weight:900; }
        .club-formSectionGrid--nested { align-items: end; background: rgba(255,255,255,.62); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; padding: 10px; }
        .club-formSectionGrid--nested > .club-field--span4 { grid-column: auto; }
        .club-formSectionGrid--nested > label:nth-of-type(1) { grid-column: 1 / span 5; }
        .club-formSectionGrid--nested > label:nth-of-type(2) { grid-column: span 5; }
        .club-formSectionGrid--nested > .club-courtComposer { grid-column: span 2; }
        .club-courtComposer { align-items: end; display: flex; justify-content: flex-end; min-height: 58px; }
        .club-courtComposer .club-secondaryBtn { min-height: 36px; width: 100%; }
        .club-pointsGrid { display: grid; gap: 8px; grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-pointsToolbar { align-items: center; display: flex; flex-wrap: wrap; justify-content: space-between; }
        .club-pointsHint { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-pointsSummary { display: flex; flex-wrap: wrap; gap: 8px; }
        .club-pointsSummary span { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #64748b; font-size: 12px; font-weight: 900; padding: 6px 9px; }
        .club-pointsSummary strong { color: #17253f; margin-left: 4px; }
        .club-scheduleCapacity { align-items:baseline; border-top:1px solid rgba(15,23,42,.08); display:flex; flex-wrap:wrap; gap:5px 8px; padding:9px 0 0; }
        .club-scheduleCapacity > span { color:#64748b; font-size:11px; font-weight:900; }
        .club-scheduleCapacity strong { color:#17253f; font-size:14px; line-height:1; }
        .club-scheduleCapacity small { color:#64748b; flex-basis:100%; font-size:11px; font-weight:800; }
        .club-scheduleWindows { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-scheduleWindow { align-items: end; background: rgba(248,250,252,.64); border: 1px solid rgba(15,23,42,.06); border-radius: 12px; display: grid; gap: 8px; grid-template-columns: auto minmax(132px, 1fr) minmax(84px, .55fr) minmax(84px, .55fr); padding: 8px; }
        .club-scheduleWindow > summary { display:none; }
        .club-scheduleWindow:not([open]) > .club-scheduleFields { display:contents; }
        .club-scheduleFields { display:contents; }
        .club-scheduleFields > strong { align-self: center; color: var(--club-admin-accent); font-size: 11px; font-weight: 950; }
        .club-courtList { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
        .club-courtChip { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; }
        .club-courtChip strong { color: #17253f; display: block; font-size: 13px; }
        .club-courtChip span { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-courtChip small { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 4px 8px; }
        .club-chipRemove { background: none; border: none; color: #c2410c; cursor: pointer; font-size: 12px; font-weight: 900; justify-self: end; padding: 0; }
        .club-emptyInline { background: rgba(248,250,252,.9); border: 1px dashed rgba(148,163,184,.36); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 800; padding: 12px; }
        .club-formActions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
        .club-mobileWizardHead, .club-mobileActions, .club-mobileVenueHint { display: none; }
        .club-mobileFlyerOverview { display:grid; gap:12px; }
        .club-mobileFlyerModes { display:grid; gap:7px; grid-template-columns:repeat(3,minmax(0,1fr)); }
        .club-mobileFlyerModes button { background:#fff; border:1px solid rgba(15,23,42,.14); border-radius:12px; color:#30455f; cursor:pointer; font:inherit; font-size:12px; font-weight:900; min-height:44px; padding:0 8px; }
        .club-mobileFlyerModes button.is-active { background:var(--club-admin-soft); border-color:var(--club-admin-accent); color:#071a35; }
        .club-mobileFlyerEditor { display:grid; gap:10px; }
        .club-mobileFlyerStickyPreview { align-items:center; background:color-mix(in srgb,#fff 94%,var(--club-admin-soft)); border:1px solid color-mix(in srgb,var(--club-admin-accent) 26%,transparent); border-radius:13px; box-shadow:0 12px 28px rgba(15,23,42,.15); display:none; gap:10px; padding:7px; position:fixed; right:16px; top:126px; width:min(244px,calc(100vw - 32px)); z-index:58; }
        .club-mobileFlyerStickyPreview > div:first-child { display:grid; flex:1; gap:2px; min-width:0; padding-left:3px; }
        .club-mobileFlyerStickyPreview > div:first-child span { color:var(--club-admin-accent); font-size:10px; font-weight:950; letter-spacing:.04em; text-transform:uppercase; }
        .club-mobileFlyerStickyPreview > div:first-child strong { color:#17253f; font-size:12px; line-height:1.15; }
        .club-mobileFlyerMiniCanvas { flex:0 0 110px; height:138px; overflow:hidden; width:110px; }
        .club-mobileFlyerMiniScale { transform:scale(.295); transform-origin:top left; width:373px; }
        .club-mobileFlyerMiniScale :global(.flyerPreviewShell) { display:block; width:373px; }
        .club-mobileFlyerMiniScale :global(.flyerPreview) { aspect-ratio:4 / 5; border-radius:16px; box-sizing:border-box; display:flex; flex-direction:column; height:466px; min-height:466px; overflow:hidden; padding:14px; width:373px; }
        .club-mobileFlyerMiniScale :global(.flyerPreviewMeta) { margin-top:auto; }
        .club-mobileDateBlocks { display:grid; gap:12px; }
        .club-mobilePointsNote, .club-mobilePointsTable p { color:#64748b; font-size:12px; line-height:1.45; margin:9px 0 0; }
        .club-mobilePointsTable { margin-top:9px; }
        .club-mobilePointsTable summary { color:var(--club-admin-accent); cursor:pointer; font-size:12px; font-weight:900; }
        .club-mobileFlyerDisclosure > summary, .club-mobileSecondary > summary { display: none; }
        .club-mobileFlyerDisclosure:not([open]) > .club-flyerContent,
        .club-mobileSecondary:not([open]) > .club-mobileSecondaryContent { display: block; }
        .club-review { display:grid; gap:0; }
        .club-reviewReadiness { align-items:start; background:color-mix(in srgb,var(--club-admin-soft) 38%,#fff); border-left:3px solid var(--club-admin-accent); border-radius:0 10px 10px 0; display:flex; gap:10px; justify-content:space-between; margin:0 0 8px; padding:9px 10px; }
        .club-reviewReadiness > div { display:grid; gap:2px; }
        .club-reviewReadiness strong { color:#2d6b3d; font-size:12px; }
        .club-reviewReadiness span { color:#52657a; font-size:11px; font-weight:750; line-height:1.3; }
        .club-reviewReadiness small { color:var(--club-admin-accent); flex:0 0 auto; font-size:10px; font-weight:950; white-space:nowrap; }
        .club-reviewReadiness.has-issues { background:#fffaf0; border-left-color:#d18a1d; }
        .club-reviewReadiness.has-issues strong { color:#a35a05; }
        .club-reviewChecklist { display:flex; flex-wrap:wrap; gap:5px 9px; margin:0 0 10px; padding:0 2px; }
        .club-reviewChecklist span { align-items:center; color:#52657a; display:inline-flex; font-size:10px; font-weight:800; gap:3px; }
        .club-reviewChecklist i { color:#9aa8ba; font-size:12px; font-style:normal; font-weight:950; }
        .club-reviewChecklist .is-complete i { color:var(--club-admin-accent); }
        .club-reviewChecklist .is-optional { color:#7b8798; }
        .club-reviewMainCard { background:#fff; border:1px solid rgba(15,23,42,.09); border-radius:14px; display:grid; gap:10px; min-height:112px; padding:12px 104px 12px 12px; position:relative; }
        .club-reviewStatusBadge { background:color-mix(in srgb,var(--club-admin-accent) 11%,#fff); border-radius:999px; color:var(--club-admin-accent); font-size:10px; font-weight:950; padding:4px 8px; position:absolute; right:10px; top:10px; }
        .club-reviewMainCopy { display:grid; gap:3px; min-width:0; }
        .club-reviewMainCopy > strong { color:#17253f; font-size:17px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-reviewMainCopy p { color:#52657a; font-size:12px; font-weight:750; line-height:1.3; margin:0; }
        .club-reviewFacts { display:grid; gap:2px; }
        .club-reviewFacts span { color:#52657a; font-size:11px; font-weight:800; line-height:1.3; }
        .club-reviewMainFlyer { height:100px; overflow:hidden; position:absolute; right:12px; top:12px; width:80px; }
        .club-reviewMainFlyer > div { transform:scale(.214); transform-origin:top left; width:373px; }
        .club-reviewMainFlyer :global(.flyerPreviewShell) { display:block; width:373px; }
        .club-reviewMainFlyer :global(.flyerPreview) { aspect-ratio:4 / 5; box-sizing:border-box; display:flex; flex-direction:column; height:466px; min-height:466px; overflow:hidden; padding:14px; width:373px; }
        .club-reviewMainFlyer :global(.flyerPreviewMeta) { margin-top:auto; }
        .club-reviewCircuit { border-bottom:1px solid rgba(15,23,42,.08); display:grid; gap:2px; padding:9px 2px; }
        .club-reviewCircuit > span { color:var(--club-admin-accent); font-size:10px; font-weight:950; text-transform:uppercase; }
        .club-reviewCircuit strong { color:#17253f; font-size:13px; }
        .club-reviewCircuit small { color:#64748b; font-size:11px; font-weight:750; }
        .club-review > article:not(.club-reviewMainCard):not(.club-reviewCircuit) { border-bottom:1px solid rgba(15,23,42,.08); position:relative; }
        .club-reviewRow { display:grid; gap:3px; padding:11px 26px 11px 2px; position:relative; }
        .club-reviewRowAction { background:transparent; border:0; cursor:pointer; inset:0; position:absolute; width:100%; z-index:2; }
        .club-reviewRowAction:hover + .club-reviewRow { background:color-mix(in srgb,var(--club-admin-soft) 44%,transparent); }
        .club-reviewRowAction:focus-visible { outline:2px solid var(--club-admin-accent); outline-offset:-2px; }
        .club-reviewRowTitle { color:#52657a; font-size:10px; font-weight:950; letter-spacing:.045em; text-transform:uppercase; }
        .club-reviewRowCopy { display:grid; gap:2px; min-width:0; }
        .club-reviewRowCopy strong { color:#17253f; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-reviewRowCopy > span { color:#64748b; font-size:11px; font-weight:750; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-review > article.allows-wrap .club-reviewRowCopy > span { overflow:visible; text-overflow:clip; white-space:normal; }
        .club-reviewRow > b { color:var(--club-admin-accent); font-size:23px; font-weight:500; line-height:1; position:absolute; right:3px; top:50%; transform:translateY(-50%); }
        .club-review > article.has-issue .club-reviewRow { background:#fffaf0; }
        .club-reviewRow em { color:#a35a05; font-size:11px; font-style:normal; font-weight:850; line-height:1.3; }
        .club-reviewPublication { align-items:center; display:flex; gap:9px; justify-content:space-between; min-width:0; }
        .club-reviewPublication > div:first-child { display:grid; gap:3px; min-width:0; }
        .club-reviewPublication > div:first-child strong { color:#17253f; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .club-reviewPublication > div:first-child span { color:#64748b; font-size:11px; font-weight:750; }
        .club-reviewFlyerMini { flex:0 0 66px; height:83px; overflow:hidden; width:66px; }
        .club-reviewFlyerMini > div { transform:scale(.177); transform-origin:top left; width:373px; }
        .club-reviewFlyerMini :global(.flyerPreviewShell) { display:block; width:373px; }
        .club-reviewFlyerMini :global(.flyerPreview) { aspect-ratio:4 / 5; box-sizing:border-box; display:flex; flex-direction:column; height:466px; min-height:466px; overflow:hidden; padding:14px; width:373px; }
        .club-reviewFlyerMini :global(.flyerPreviewMeta) { margin-top:auto; }
        .club-reviewCreateHint { background:#f8fafc; border-left:3px solid var(--club-admin-accent); border-radius:0 8px 8px 0; color:#52657a; font-size:11px; font-weight:750; line-height:1.35; margin:2px 0 0; padding:8px 10px; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 999px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; min-height: 38px; padding: 8px 14px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-primaryBtn { background:var(--club-admin-accent); border:1px solid var(--club-admin-accent); box-shadow:0 12px 28px var(--club-admin-glow); color:#fff; }
        .club-secondaryBtn { background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); color: #061b3a; }
        .club-primaryBtn:hover:not(:disabled), .club-secondaryBtn:hover:not(:disabled) { box-shadow: 0 14px 30px var(--club-admin-glow); transform: translateY(-1px); }
        .club-secondaryBtn--compact { min-height: 32px; padding: 6px 11px; }
        .club-pointsGrid .px-input:disabled { background: #eef2f7; border-color: rgba(148,163,184,.22); color: #42526b; cursor: not-allowed; }
        .club-pointsGrid .px-input:not(:disabled) { background: #fff; cursor: text; }
        .club-primaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .flyerCard { background: linear-gradient(180deg, rgba(248,250,252,.98) 0%, rgba(241,245,249,.94) 100%); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 18%, transparent); border-radius: 18px; display: grid; gap: 14px; padding: 14px; }
        .flyerBlockHead { align-items: start; display: flex; gap: 16px; justify-content: space-between; }
        .flyerBlockHead h2 { color: #17253f; font-size: 22px; line-height: 1.1; margin: 4px 0 0; }
        .flyerBlockHead p { color: #5b6b84; font-size: 12px; font-weight: 800; line-height: 1.45; margin: 0; max-width: 360px; }
        .flyerKicker, .flyerControlTitle, .flyerPreviewLabel { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .flyerModeSwitch { display: flex; flex-wrap: wrap; gap: 8px; }
        .flyerModeChip { background: #fff; border: 1px solid rgba(148,163,184,.26); border-radius: 999px; color: #274159; cursor: pointer; font-size: 13px; font-weight: 900; min-height: 38px; padding: 0 14px; transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }
        .flyerModeChip:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 38%, transparent); color: #061b3a; }
        .flyerModeChip.is-active { background: color-mix(in srgb, var(--club-admin-accent) 10%, white); border-color: color-mix(in srgb, var(--club-admin-accent) 52%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--club-admin-accent) 14%, transparent); color: #061b3a; }
        .flyerLayout { display: grid; gap: 12px; grid-template-columns: minmax(0, 1.24fr) minmax(300px, .76fr); }
        .flyerControls { display: grid; gap: 10px; min-width: 0; }
        .flyerControlSection, .flyerPlaceholder { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; padding: 14px; }
        .flyerControlSection--compact { border-radius: 12px; display: grid; gap: 8px; padding: 10px; }
        .flyerPlaceholder strong { color: #17253f; display: block; font-size: 15px; margin-bottom: 6px; }
        .flyerPlaceholder p { color: #64748b; font-size: 13px; font-weight: 700; line-height: 1.45; margin: 0; }
        .flyerPlaceholder--compact { min-height: 0; padding: 12px; }
        .flyerManualUploader { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; display: grid; gap: 10px; padding: 12px; }
        .flyerManualDropzone { align-items: center; background: linear-gradient(135deg, rgba(255,255,255,.92), color-mix(in srgb, var(--club-admin-accent) 7%, white)); border: 1px dashed color-mix(in srgb, var(--club-admin-accent) 46%, rgba(148,163,184,.5)); border-radius: 14px; cursor: pointer; display: grid; gap: 5px; justify-items: center; min-height: 128px; padding: 18px; text-align: center; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
        .flyerManualDropzone:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 74%, transparent); box-shadow: 0 14px 30px rgba(15,23,42,.08); transform: translateY(-1px); }
        .flyerManualDropzone input, .flyerManualActions input { display: none; }
        .flyerManualDropzone span { color: #061b3a; font-size: 16px; font-weight: 950; }
        .flyerManualDropzone strong { color: #30455f; font-size: 12px; font-weight: 900; }
        .flyerManualDropzone small { color: #64748b; font-size: 11px; font-weight: 800; }
        .flyerManualDropzone.has-file { min-height: 96px; }
        .flyerManualMessage { border-radius: 12px; font-size: 12px; font-weight: 850; line-height: 1.35; margin: 0; padding: 9px 10px; }
        .flyerManualMessage--error { background: #fff1f2; border: 1px solid rgba(244,63,94,.22); color: #be123c; }
        .flyerManualMessage--warning { background: #fffbeb; border: 1px solid rgba(245,158,11,.26); color: #92400e; }
        .flyerManualFile { align-items: center; background: rgba(248,250,252,.92); border: 1px solid rgba(148,163,184,.18); border-radius: 14px; display: flex; gap: 10px; justify-content: space-between; padding: 10px; }
        .flyerManualFile strong { color: #17253f; display: block; font-size: 13px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .flyerManualFile span { color: #64748b; display: block; font-size: 12px; font-weight: 800; margin-top: 2px; }
        .flyerManualActions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .flyerManualActions label { cursor: pointer; }
        .flyerLayout--compact { grid-template-columns: minmax(0, 1fr); }
        .flyerBackgroundGrid { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(66px, 1fr)); margin-top: 8px; }
        .flyerBackgroundOption { background: rgba(255,255,255,.92); border: 1px solid rgba(148,163,184,.18); border-radius: 10px; cursor: pointer; display: grid; gap: 5px; padding: 6px; text-align: left; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .flyerBackgroundOption:hover { border-color: color-mix(in srgb, var(--club-admin-accent) 50%, transparent); box-shadow: 0 8px 18px rgba(15,23,42,.08); transform: translateY(-1px); }
        .flyerBackgroundOption.is-selected { border-color: color-mix(in srgb, var(--club-admin-accent) 80%, transparent); box-shadow: 0 0 0 2px var(--club-admin-soft); }
        .flyerBackgroundOption span:last-child { color: #30455f; font-size: 10px; font-weight: 900; line-height: 1; }
        .flyerBackgroundSwatch { aspect-ratio: 1.22; border-radius: 8px; display: block; min-width: 0; }
        .flyerPersonalization { background: rgba(255,255,255,.68); border: 1px solid rgba(148,163,184,.16); border-radius: 16px; display: grid; gap: 10px; padding: 10px; }
        .flyerPersonalizationHead { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
        .flyerPersonalizationHead .flyerControlHint { margin: 0; max-width: 440px; text-align: right; }
        .flyerPersonalizationGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .flyerProgressiveSectionHead { align-items:center; display:flex; justify-content:space-between; }
        .flyerTextAction, .flyerResetAction { background:transparent; border:0; color:var(--club-admin-accent); cursor:pointer; font:inherit; font-size:12px; font-weight:900; min-height:38px; padding:0 4px; }
        .flyerProgressivePanels { display:grid; gap:7px; margin-top:10px; }
        .flyerProgressivePanel { background:#fff; border:1px solid rgba(15,23,42,.09); border-radius:12px; overflow:hidden; }
        .flyerProgressivePanelTrigger { align-items:center; background:transparent; border:0; color:#17253f; cursor:pointer; display:flex; font:inherit; justify-content:space-between; min-height:54px; padding:8px 11px; text-align:left; width:100%; }
        .flyerProgressivePanelTrigger span { display:grid; gap:2px; min-width:0; }
        .flyerProgressivePanelTrigger strong { font-size:13px; }
        .flyerProgressivePanelTrigger small { align-items:center; color:#64748b; display:flex; font-size:11px; font-weight:700; gap:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .flyerProgressivePanelTrigger small i { border-radius:50%; display:inline-block; height:9px; width:9px; }
        .flyerProgressivePanelTrigger b { color:var(--club-admin-accent); font-size:22px; font-weight:500; line-height:1; transform:rotate(0deg); }
        .flyerProgressivePanelTrigger[aria-expanded="true"] b { transform:rotate(90deg); }
        .flyerProgressivePanelContent { border-top:1px solid rgba(15,23,42,.07); padding:10px; }
        .flyerInlineAction { background:#f6f8fb; border:1px dashed color-mix(in srgb,var(--club-admin-accent) 42%,transparent); border-radius:10px; color:#17314f; cursor:pointer; font:inherit; font-size:12px; font-weight:850; min-height:40px; padding:0 10px; text-align:left; }
        .flyerManualBackRow { align-items:center; display:flex; gap:8px; justify-content:space-between; }
        .flyerBackgroundGrid--rail { display:flex; margin-right:-2px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
        .flyerBackgroundGrid--rail::-webkit-scrollbar { display:none; }
        .flyerBackgroundGrid--rail .flyerBackgroundOption { flex:0 0 72px; }
        .flyerControlRow { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .flyerControlRow--colors { gap: 7px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .flyerControlRow--selects { gap: 7px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .flyerControlHint { color: #64748b; font-size: 12px; font-weight: 750; line-height: 1.45; margin: 6px 0 0; }
        .flyerColorField, .flyerSelectField, .flyerRangeField { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 11px; color: #30455f; display: grid; font-size: 11px; font-weight: 900; gap: 6px; min-width: 0; padding: 8px; }
        .flyerColorField input { appearance: none; background: transparent; border: none; cursor: pointer; height: 30px; padding: 0; width: 100%; }
        .flyerColorField input::-webkit-color-swatch-wrapper { padding: 0; }
        .flyerColorField input::-webkit-color-swatch { border: 1px solid rgba(15,23,42,.14); border-radius: 8px; }
        .flyerSelectField .px-input { min-height: 34px; padding-bottom: 6px; padding-top: 6px; }
        .flyerRangeField input { accent-color: var(--club-admin-accent); min-width: 0; width: 100%; }
        .flyerRangeField small { color: #64748b; font-size: 11px; font-weight: 900; }
        .flyerVisibleGrid { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .flyerToggleField { align-items: center; background: rgba(248,250,252,.9); border: 1px solid rgba(148,163,184,.18); border-radius: 999px; color: #30455f; cursor: pointer; display: flex; font-size: 11px; font-weight: 900; gap: 6px; min-height: 28px; padding: 4px 8px; }
        .flyerToggleField input { accent-color: var(--club-admin-accent); }
        .flyerPreviewShell { display: grid; gap: 8px; }
        .flyerPreview { border-radius: 22px; box-shadow: 0 28px 60px rgba(15,23,42,.18); min-height: 100%; overflow: hidden; padding: 18px; position: relative; }
        .flyerPreview--editor { min-height: 360px; }
        .flyerPreview--manual { background-color: #020617; display: grid; min-height: 420px; place-items: center; }
        .flyerPreview::after { background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(2,6,23,.24) 100%); content: ''; inset: 0; pointer-events: none; position: absolute; }
        .flyerPreview--manual::after { background: radial-gradient(circle at center, rgba(255,255,255,.08), transparent 62%); }
        .flyerPreview > * { position: relative; z-index: 1; }
        .flyerManualImageFrame { align-items: center; display: flex; inset: 14px; justify-content: center; position: absolute; z-index: 1; }
        .flyerManualImageFrame img { border-radius: 16px; box-shadow: 0 18px 44px rgba(0,0,0,.34); display: block; height: 100%; max-height: 100%; max-width: 100%; object-fit: contain; width: 100%; }
        .flyerPreviewTop { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
        .flyerPreviewClub { backdrop-filter: blur(12px); background: rgba(15,23,42,.42); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; color: #f8fafc; display: inline-flex; font-size: 12px; letter-spacing: .04em; max-width: min(62%, 260px); overflow: hidden; padding: 7px 11px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .flyerPreviewType { backdrop-filter: blur(12px); background: color-mix(in srgb, var(--flyer-badge-color) 72%, rgba(15,23,42,.48)); border: 1px solid rgba(255,255,255,.28); border-radius: 999px; box-shadow: 0 10px 24px color-mix(in srgb, var(--flyer-badge-color) 28%, rgba(15,23,42,.16)); font-size: 13px; letter-spacing: .04em; padding: 9px 14px; text-transform: uppercase; }
        .flyerPreviewBody { display: grid; gap: 14px; margin-top: 30px; }
        .flyerPreviewEyebrow { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; }
        .flyerPreviewMain h3 { font-size: clamp(30px, 4vw, 44px); letter-spacing: 0; line-height: 1.02; margin: 7px 0 8px; max-width: 10ch; overflow-wrap: anywhere; text-wrap: balance; }
        .flyerPreview--title-small .flyerPreviewMain h3 { font-size: clamp(26px, 3.2vw, 34px); line-height: 1.06; max-width: 12ch; }
        .flyerPreview--title-medium .flyerPreviewMain h3 { font-size: clamp(30px, 3.8vw, 40px); }
        .flyerPreview--title-large .flyerPreviewMain h3 { font-size: clamp(34px, 4.4vw, 48px); }
        .flyerPreview--title-impact .flyerPreviewMain h3 { font-size: clamp(38px, 5.2vw, 56px); letter-spacing: -.02em; line-height: .96; max-width: 9ch; text-transform: uppercase; }
        .flyerPreviewMain p { color: inherit; font-size: 15px; line-height: 1.25; margin: 0; opacity: .92; }
        .flyerPreviewDate { background: linear-gradient(135deg, color-mix(in srgb, var(--flyer-date-color) 82%, rgba(15,23,42,.68)), rgba(15,23,42,.42)); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.22); border-radius: var(--flyer-data-radius); box-shadow: 0 16px 38px color-mix(in srgb, var(--flyer-date-color) 24%, rgba(15,23,42,.18)); display: inline-grid; gap: 9px; justify-self: start; max-width: 100%; min-width: min(100%, 230px); padding: 12px 14px; }
        .flyerPreviewDateRow { display: grid; gap: 3px; min-width: 0; }
        .flyerPreviewDate span, .flyerPreviewMeta span { color: rgba(226,232,240,.80); font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .flyerPreviewDate strong, .flyerPreviewMeta strong { color: #f8fafc; font-size: 16px; line-height: 1.15; overflow-wrap: anywhere; }
        .flyerPreviewMeta { align-items: stretch; display: grid; gap: 9px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 20px; }
        .flyerPreviewMetaItem { backdrop-filter: blur(var(--flyer-data-blur)); background: color-mix(in srgb, var(--flyer-data-color) var(--flyer-data-alpha), transparent); border: 1px solid color-mix(in srgb, rgba(255,255,255,.18) var(--flyer-data-alpha), transparent); border-radius: var(--flyer-data-radius); box-shadow: 0 10px 26px color-mix(in srgb, rgba(15,23,42,.16) var(--flyer-data-alpha), transparent); display: grid; gap: 5px; min-width: 0; padding: 11px 13px; }
        .flyerPreviewMetaItem--deadline { border-color: color-mix(in srgb, var(--flyer-accent-color) var(--flyer-data-accent-alpha), transparent); grid-column: span 2; }
        .flyerPreviewMetaItem--price { align-self: start; justify-self: start; min-width: 118px; }
        .flyerPreviewMetaItem--price strong { color: #fff; font-size: 18px; }
        .flyerPreviewMetaItem--secondary { opacity: .84; }
        .flyerPreview--data-compact .flyerPreviewMeta { gap: 7px; margin-top: 16px; }
        .flyerPreview--data-compact .flyerPreviewMetaItem { border-radius: 12px; padding: 9px 10px; }
        .flyerPreview--data-solid .flyerPreviewMetaItem { backdrop-filter: none; background: color-mix(in srgb, var(--flyer-data-color) var(--flyer-data-alpha), transparent); }
        .flyerPreview--data-editorial .flyerPreviewMeta { grid-template-columns: 1.2fr .8fr; }
        .flyerPreview--data-editorial .flyerPreviewMetaItem { background: color-mix(in srgb, rgba(248,250,252,.92) var(--flyer-data-alpha), transparent); border-color: color-mix(in srgb, rgba(255,255,255,.22) var(--flyer-data-alpha), transparent); }
        .flyerPreview--data-editorial .flyerPreviewMetaItem span { color: color-mix(in srgb, var(--flyer-data-color) 74%, #334155); }
        .flyerPreview--data-editorial .flyerPreviewMetaItem strong { color: #061b3a; }
        .flyerManualOverlay, .flyerNoneOverlay { backdrop-filter: blur(14px); background: rgba(15,23,42,.48); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; bottom: 20px; display: grid; gap: 6px; left: 20px; padding: 14px; position: absolute; right: 20px; z-index: 2; }
        .flyerManualOverlay strong, .flyerNoneOverlay strong { color: #f8fafc; font-size: 15px; }
        .flyerManualOverlay span, .flyerNoneOverlay span { color: rgba(226,232,240,.88); font-size: 12px; font-weight: 700; line-height: 1.4; }
        @media (max-width: 1080px) {
          .flyerPersonalizationGrid { grid-template-columns: 1fr; }
          .flyerPersonalizationHead { display: grid; }
          .flyerPersonalizationHead .flyerControlHint { max-width: none; text-align: left; }
        }
        @media (max-width: 767px) {
          .club-newTournament { border: 0; border-radius: 0; box-shadow: none; min-height: calc(100dvh - 56px); overflow: visible; padding: 0 0 calc(72px + env(safe-area-inset-bottom)); }
          .club-newTournament::before, .club-newHead { display: none; }
          .club-formCard { background: transparent; border: 0; border-radius: 0; gap: 10px; margin: 0; padding: 6px 16px 10px; }
          .club-mobileWizardHead { background:#f6f8fb; border-bottom:1px solid rgba(15,23,42,.09); display:grid; gap:5px; margin:0 -16px 6px; padding:10px 16px 9px; position:sticky; top:54px; z-index:12; }
          .club-mobileWizardHead > div { align-items: end; display: flex; gap: 8px; justify-content: space-between; }
          .club-mobileWizardHead > div span { color: #64748b; font-size: 11px; font-weight: 850; }
          .club-mobileWizardHead > div strong { color: #071a35; font-size: 13px; line-height: 1.15; text-align: right; }
          .club-mobileWizardHead > i { background: #e8edf2; border-radius: 999px; display: block; height: 3px; overflow: hidden; }
          .club-mobileWizardHead > i span { background: linear-gradient(90deg,var(--club-admin-accent),var(--club-admin-accent-2)); border-radius: inherit; display: block; height: 100%; transition: width .2s ease; }
          .club-mobileWizardHead .club-mobileStepLegend { align-items:center; display:grid; gap:5px; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); margin-top:3px; }
          .club-mobileWizardHead .club-mobileStepLegend span { font-size:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .club-mobileWizardHead .club-mobileStepLegend span:last-child { text-align:right; }
          .club-mobileWizardHead .club-mobileStepLegend strong { color:#071a35; font-size:10px; text-align:center; white-space:nowrap; }
          .club-choiceChips { flex-wrap:wrap; margin-right:0; overflow:visible; padding-bottom:0; }
          .club-choiceChips button { flex:0 1 auto; min-height:40px; padding-inline:12px; }
          .club-choiceField > span { color:#17253f; display:block; font-size:14px; font-weight:900; }
          .club-choiceField > span::after { background:linear-gradient(90deg,color-mix(in srgb,var(--club-admin-accent) 82%,#fff) 0 58%,rgba(15,23,42,.09) 58%); border-radius:999px; content:''; display:block; height:2px; margin:8px 0 12px; width:100%; }
          .club-mobileDateBlock { background:#fff; border:1px solid rgba(15,23,42,.10); border-radius:14px; display:grid; gap:12px; padding:13px; }
          .club-mobileDateBlock + .club-mobileDateBlock { margin-top:5px; }
          .club-mobileDateBlockHead { align-items:flex-start; display:flex; gap:11px; }
          .club-mobileDateBlockHead > svg { color:var(--club-admin-accent); flex:0 0 auto; height:27px; margin-top:1px; stroke-width:2; width:27px; }
          .club-mobileDateBlockHead > div { display:grid; gap:2px; }
          .club-mobileDateBlockHead strong { color:#17253f; font-size:16px; line-height:1.15; }
          .club-mobileDateBlockHead span { color:#64748b; font-size:13px; line-height:1.25; }
          .club-mobileDateBlock .club-formSectionGrid { gap:10px; }
          .club-mobileDateBlock .px-input { background:#fff; border-color:rgba(15,23,42,.12); }
          .club-mobileDateDuration, .club-mobileDateHelp { background:color-mix(in srgb,var(--club-admin-accent) 7%,#eef5ff); border-radius:9px; color:#285592; font-size:12px; line-height:1.35; margin:0; padding:9px 10px; }
          .club-scheduleModeCards .club-choiceChips { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
          .club-scheduleModeCards .club-choiceChips button { min-height:58px; padding:9px 10px; text-align:left; }
          .club-scheduleModeOptions { grid-template-columns:1fr; }
          .club-scheduleModeOptions button { min-height:68px; }
          .club-matchDurationField > small { margin-top:1px; }
          .club-autoPlanningNote { margin-top:-2px; }
          .club-scheduleWindows[data-manual-open="true"] .club-scheduleFields { display:grid; }
          .club-scheduleWindows[data-manual-open="true"] .club-scheduleWindow { padding-bottom:8px; }
          .club-scheduleWindows[data-auto="true"] .club-scheduleWindow > summary { gap:8px; min-height:52px; }
          .club-scheduleWindows[data-auto="true"] .club-scheduleWindow > summary small { max-width:170px; overflow:visible; white-space:normal; }
          .club-apbChoice { border:0; display:grid; gap:7px; margin:0; padding:0; }
          .club-apbChoice legend { color:#30455f; font-size:12px; font-weight:900; margin-bottom:4px; }
          .club-apbChoice legend small { color:#64748b; font-weight:750; }
          .club-apbChoice label { align-items:center; border:1px solid rgba(148,163,184,.26); border-radius:12px; display:flex; gap:9px; min-height:44px; padding:0 11px; }
          .club-prizesGrid { gap:8px; }
          .club-liveSummary { background:#f1f7ec; border:1px solid color-mix(in srgb,var(--club-admin-accent) 28%,transparent); border-radius:12px; color:#193654; font-size:13px; font-weight:900; padding:10px 12px; }
          .club-ageEmpty { background:#fff8e8; border:1px solid rgba(217,151,28,.24); border-radius:12px; display:grid; gap:4px; padding:11px; }
          .club-ageEmpty strong { color:#5f430c; font-size:13px; }
          .club-ageEmpty span { color:#765d29; font-size:12px; }
          .club-ageEmpty a { color:#075985; font-size:12px; font-weight:900; min-height:36px; align-items:center; display:inline-flex; width:fit-content; }
          .club-reviewStep[data-current-step="6"] .club-review { display:none; }
          .club-reviewStep[data-current-step="7"] .club-mobileFlyerOverview { display:none; }
          .club-mobileStep { display: none; }
          .club-mobileStep[data-active="true"] { display: grid; }
          .club-mobileConditional[data-mobile-hidden="true"] { display: none !important; }
          .club-formSection { background: transparent; border: 0; border-radius: 0; box-shadow: none; gap: 10px; padding: 0; }
          .club-formSection[data-origin-error="true"] { background:linear-gradient(90deg,rgba(255,248,228,.78),transparent 78%); border-left:3px solid #d18a1d; box-shadow:none; padding-left:10px; }
          .club-formSectionHead { display: grid; }
          .club-formSectionHead .club-kicker { color: #071a35; font-size: 26px; letter-spacing: -.035em; line-height: 1.04; text-transform: none; }
          .club-formSectionHead p { font-size: 14px; line-height: 1.25; margin-top: 2px; }
          .club-formSectionGrid, .club-tiebreakerGrid, .club-pointsGrid, .club-formCard, .club-scheduleWindows, .club-scheduleWindow { grid-template-columns: 1fr; }
          .club-formSectionGrid { gap: 12px; }
          .club-field--span2, .club-field--span3, .club-field--span4, .club-field--span6, .club-field--span8 { grid-column: auto; }
          .club-field { font-size: 14px; gap: 5px; }
          .club-field .px-input, .club-field--compact .px-input { font-size: 16px; min-height: 48px; padding-block: 9px; }
          .club-textarea--compact { font-size: 16px; min-height: 84px; padding-block: 10px; }
          .club-disclosure--button { align-self: stretch; }
          .club-formActions { display: none; }
          .club-mobileActions { background: rgba(255,255,255,.96); border-top: 1px solid rgba(15,23,42,.10); bottom: 0; display: grid; gap: 8px; grid-template-columns: minmax(0,.72fr) minmax(0,1.28fr); left: 0; padding: 7px 16px calc(7px + env(safe-area-inset-bottom)); position: fixed; right: 0; z-index: 70; }
          .club-mobileActions > span:only-child { display:none; }
          .club-mobileActions .club-primaryBtn, .club-mobileActions .club-secondaryBtn { min-height: 44px; width: 100%; }
          .club-mobileActions > span:first-child + .club-primaryBtn { grid-column: 2; }
          .club-mobileVenueHint { background:#f8fafc; border-left:3px solid var(--club-admin-accent); border-radius:0 9px 9px 0; color:#52657a; display:block; font-size:12px; font-weight:750; grid-column:1 / -1; line-height:1.35; margin:0; padding:8px 10px; }
          .club-formSectionGrid--nested > label:nth-of-type(1),
          .club-formSectionGrid--nested > label:nth-of-type(2),
          .club-formSectionGrid--nested > .club-courtComposer { grid-column: auto; }
          .club-courtComposer { min-height: 0; }
          .club-courtsPanel { border-radius: 12px; padding: 8px; }
          .club-scheduleCapacity { order: 3; }
          .club-scheduleWindows { gap: 6px; }
          .club-scheduleWindow { display:block; padding:0 10px; }
          .club-scheduleWindow > summary { align-items:center; color:#17253f; cursor:pointer; display:grid; font-size:13px; font-weight:950; gap:2px; grid-template-columns:minmax(0,1fr) auto; justify-content:space-between; list-style:none; min-height:48px; padding-right:16px; position:relative; text-transform:none; }
          .club-scheduleWindow > summary::after { color:var(--club-admin-accent); content:'›'; font-size:20px; line-height:1; position:absolute; right:0; top:50%; transform:translateY(-50%); }
          .club-scheduleWindow > summary::-webkit-details-marker { display:none; }
          .club-scheduleWindow > summary small { color:#64748b; font-size:11px; font-weight:800; overflow:hidden; text-align:right; text-overflow:ellipsis; white-space:nowrap; }
          .club-scheduleWindow:not([open]) > .club-scheduleFields { display:none; }
          .club-scheduleFields { display:grid; gap:7px; grid-template-columns:1fr; padding:0 0 9px; }
          .club-scheduleFields > strong { display:none; }
          .club-pointsSummary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; }
          .club-pointsSummary span { border-radius:10px; font-size:11px; padding:7px; }
          .club-pointsToolbar { gap:8px; }
          .club-pointsToolbar .club-secondaryBtn { min-height:44px; width:100%; }
          .club-mobileSecondary { background:#f8fafc; border:1px solid rgba(15,23,42,.08); border-radius:12px; padding:0 10px; }
          .club-mobileFlyerDisclosure > summary, .club-mobileSecondary > summary { align-items:center; color:#17253f; cursor:pointer; display:flex; font-size:13px; font-weight:950; justify-content:space-between; list-style:none; min-height:44px; }
          .club-mobileSecondary > summary > span { display:grid; flex:1; gap:2px; }
          .club-mobileSecondary > summary > span small { color:#64748b; font-size:11px; font-weight:750; }
          .club-mobileSecondary > summary > em { color:var(--club-admin-accent); font-size:11px; font-style:normal; margin-right:8px; }
          .club-mobileSecondary > summary > svg { color:#64748b; height:18px; width:18px; }
          .club-mobileFlyerDisclosure > summary::-webkit-details-marker, .club-mobileSecondary > summary::-webkit-details-marker { display:none; }
          .club-mobileFlyerDisclosure > summary small, .club-mobileSecondary > summary small { color:#64748b; font-size:11px; }
          .club-mobileFlyerDisclosure:not([open]) > .club-flyerContent,
          .club-mobileSecondary:not([open]) > .club-mobileSecondaryContent { display:none; }
          .club-flyerContent, .club-mobileSecondaryContent { padding:0 0 10px; }
          .club-mobileFlyerOverview { display:grid; gap:8px; }
          .club-mobileFlyerEmptyPreview { align-content:center; background:#f4f7fa; border:1px dashed rgba(15,23,42,.18); border-radius:14px; display:grid; gap:4px; height:160px; justify-items:center; padding:14px; text-align:center; }
          .club-mobileFlyerEmptyPreview span { color:var(--club-admin-accent); font-size:11px; font-weight:950; letter-spacing:.05em; text-transform:uppercase; }
          .club-mobileFlyerEmptyPreview strong { color:#071a35; font-size:20px; }
          .club-mobileFlyerEmptyPreview p { color:#64748b; font-size:13px; line-height:1.4; margin:0; max-width:260px; }
          .club-mobileFlyerOverview .flyerPreviewLabel { display:none; }
          .club-mobileFlyerOverview .flyerPreview { aspect-ratio:4 / 5; border-radius:16px; box-shadow:0 14px 30px rgba(15,23,42,.14); height:auto; min-height:0; overflow:hidden; padding:12px; }
          .club-mobileFlyerOverview .flyerPreviewBody { gap:8px; margin-top:16px; }
          .club-mobileFlyerOverview .flyerPreviewMain h3 { font-size:28px; }
          .club-mobileFlyerOverview .flyerPreviewDate { gap:5px; padding:8px 10px; }
          .club-mobileFlyerOverview .flyerPreviewMeta { gap:6px; margin-top:10px; }
          .club-mobileFlyerOverview .flyerPreviewMetaItem { padding:7px 9px; }
          .club-mobileFlyerModes { display:grid; gap:6px; grid-template-columns:repeat(3,minmax(0,1fr)); }
          .club-mobileFlyerModes button { background:#fff; border:1px solid rgba(15,23,42,.14); border-radius:12px; color:#30455f; font:inherit; font-size:11px; font-weight:900; min-height:44px; padding:0 6px; }
          .club-mobileFlyerModes button.is-active { background:var(--club-admin-soft); border-color:var(--club-admin-accent); color:#071a35; }
          .club-mobileFlyerEditor { display:grid; gap:8px; }
          .club-mobileFlyerEditor .flyerCard { background:transparent; border:0; box-shadow:none; padding:0; }
          .club-mobileFlyerEditor .flyerBlockHead { display:none; }
          .club-reviewStep[data-flyer-editor-open="true"] .club-mobileFlyerPrimaryPreview { display:none; }
          .club-mobileFlyerEditor .flyerLayout { display:flex; flex-direction:column; }
          .club-mobileFlyerEditor .flyerPreviewShell { order:-1; }
          .club-mobileFlyerEditor .flyerPreview { aspect-ratio:4 / 5; box-sizing:border-box; display:flex; flex-direction:column; height:auto; min-height:0; padding:12px; }
          .club-mobileFlyerEditor .flyerPreviewTop { gap:6px; }
          .club-mobileFlyerEditor .flyerPreviewClub { font-size:9px; padding:5px 7px; }
          .club-mobileFlyerEditor .flyerPreviewType { font-size:9px; padding:5px 7px; }
          .club-mobileFlyerEditor .flyerPreviewBody { gap:6px; margin-top:11px; }
          .club-mobileFlyerEditor .flyerPreviewMain h3 { font-size:23px; margin:4px 0; }
          .club-mobileFlyerEditor .flyerPreviewMain p { font-size:12px; }
          .club-mobileFlyerEditor .flyerPreviewDate { gap:3px; padding:5px 7px; }
          .club-mobileFlyerEditor .flyerPreviewDate strong { font-size:12px; }
          .club-mobileFlyerEditor .flyerPreviewMeta { gap:4px; margin-top:auto; }
          .club-mobileFlyerEditor .flyerPreviewMetaItem { gap:2px; padding:4px 6px; }
          .club-mobileFlyerEditor .flyerPreviewMetaItem span { font-size:8px; }
          .club-mobileFlyerEditor .flyerPreviewMetaItem strong { font-size:10px; }
          .club-mobileFlyerStickyPreview { display:flex; }
          .club-reviewStep[data-current-step="6"] { padding-bottom:calc(96px + env(safe-area-inset-bottom)); }
          .club-reviewStep[data-current-step="6"][data-flyer-editor-open="true"] .club-review { display:none; }
          .club-review { gap:5px; }
          .club-reviewStep { padding-bottom:6px; }
          .club-reviewStep[data-current-step="7"] { padding-bottom:8px; }
          .club-reviewCreateHint { margin-bottom:calc(68px + env(safe-area-inset-bottom)); }
          .flyerBlockHead, .flyerLayout, .flyerControlRow, .flyerControlRow--colors, .flyerControlRow--selects, .flyerPreviewMeta { grid-template-columns: 1fr; }
          .flyerVisibleGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .flyerBlockHead { display: grid; }
          .flyerPreview { min-height: 360px; }
          .flyerPreviewMetaItem--deadline { grid-column: auto; }
        }
        @media (min-width: 375px) and (max-width: 767px) {
          .club-mobileDatesGrid { grid-template-columns:1fr; }
          .club-mobileDatesGrid > * { grid-column:1 / -1; }
          .club-pointsGrid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .club-pointsGrid .club-field { min-width:0; }
          .club-draftResume { gap:8px; padding:9px 10px; }
        }
        @media (max-width: 340px) {
          .club-formCard { padding-left: 12px; padding-right: 12px; }
          .club-mobileActions { padding-left: 12px; padding-right: 12px; }
          .club-formSectionHead .club-kicker { font-size: 23px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .club-mobileWizardHead > i span { transition: none; }
        }
      `}</style>
    </div>
  )
}
