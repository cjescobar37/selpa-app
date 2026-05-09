'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { calculateScheduleCapacity, normalizeScheduleConfig, type ScheduleMode } from '@/lib/tournamentSchedule'
import {
  buildGroupTiebreakerPayload,
  groupTiebreakerCriterionOptions,
  groupTiebreakerFinalOptions,
  legacyGroupTiebreakerConfig,
  normalizeGroupTiebreakerConfig,
  type GroupTiebreakerCriterion,
  type GroupTiebreakerFinal,
} from '@/lib/tournamentTiebreakers'
import { TournamentFlyerConfigurator, defaultFlyerConfig, readFlyerConfigFromRules, type FlyerConfig } from '../../_components/TournamentFlyerConfigurator'

type TournamentType = 'OPEN' | 'CHALLENGER' | 'MASTER' | 'MASTER_FINAL'
type TournamentGender = 'MALE' | 'FEMALE' | 'MIXED'
type TournamentSegment = 'LIBRES' | 'MENORES' | 'VETERANOS'
type CompetitionSystem = 'GROUPS_PLAYOFF' | 'ROUND_ROBIN' | 'SINGLE_ELIMINATION'
type CourtSource = 'OWN_CLUB' | 'EXTERNAL_COMPLEX'

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
  segmentType: TournamentSegment
  competitionSystem: CompetitionSystem
  venueName: string
  publicDescription: string
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

type CourtDraftState = {
  complexId: string
  courtName: string
}

type TournamentSummary = {
  tournament: {
    id: string
    name: string
    status: string
    type: string | null
    gender: string | null
    category_id: number | null
    start_date: string | null
    end_date: string | null
    registration_deadline: string | null
    price_per_player: number | null
    min_pairs: number | null
    max_pairs: number | null
  }
}

type TournamentRulesLookup = {
  tournaments?: Array<{
    id: string
    rules_json?: Record<string, unknown> | null
  }>
}

type ClubComplexOption = {
  id: string
  name: string
  courtsCount: number
}

const defaultPoints = {
  winner: '500',
  finalist: '400',
  semifinalist: '300',
  quarterfinalist: '200',
  eighthFinalist: '150',
  participation: '50',
}

const initialCourtDraft: CourtDraftState = {
  complexId: '',
  courtName: '',
}

function completeGroupTiebreakerCriteria(currentOrder: GroupTiebreakerCriterion[]) {
  const allCriteria = groupTiebreakerCriterionOptions.map((option) => option.value)
  return [...currentOrder, ...allCriteria].filter(
    (criterion, criterionIndex, order) =>
      allCriteria.includes(criterion) && order.indexOf(criterion) === criterionIndex
  ).slice(0, allCriteria.length)
}

function reorderGroupTiebreakerCriteria(
  currentOrder: GroupTiebreakerCriterion[],
  index: number,
  selectedCriterion: GroupTiebreakerCriterion
) {
  const normalizedOrder = completeGroupTiebreakerCriteria(currentOrder)
  const withoutSelected = normalizedOrder.filter((criterion) => criterion !== selectedCriterion)

  return [
    ...withoutSelected.slice(0, index),
    selectedCriterion,
    ...withoutSelected.slice(index),
  ].slice(0, groupTiebreakerCriterionOptions.length)
}

const typeOptions: Array<{ value: TournamentType; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CHALLENGER', label: 'Challenger' },
  { value: 'MASTER', label: 'Master' },
  { value: 'MASTER_FINAL', label: 'Master Final' },
]

const genderOptions: Array<{ value: TournamentGender; label: string }> = [
  { value: 'MALE', label: 'Masculino' },
  { value: 'FEMALE', label: 'Femenino' },
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
  { value: 'AUTO', label: 'Automática' },
  { value: 'MANUAL', label: 'Manual' },
]

function buildFlyerPayload(config: FlyerConfig) {
  return {
    flyer_mode: config.mode,
    flyer_background: config.backgroundId,
    flyer_title_color: config.titleColor,
    flyer_text_color: config.textColor,
    flyer_accent_color: config.accentColor,
    flyer_font: config.fontFamily,
    flyer_font_weight: config.fontWeight,
    flyer_style: config.style,
    flyer_text_align: config.textAlign,
  }
}

function buildTournamentConfigPayload(form: FormState) {
  return {
    segment_type: form.segmentType,
    public_description: form.publicDescription.trim() || null,
    competition_system: form.competitionSystem,
    venue_name: form.venueName.trim() || null,
    tournament_courts: form.tournamentCourts.map((court) => ({
      ...(court.id ? { id: court.id } : {}),
      name: court.name.trim(),
      complex_name: court.complexName?.trim() || null,
      source: court.source,
    })),
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

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function toDateTimeInput(value?: string | null) {
  return value ? value.slice(0, 16) : ''
}

function toTournamentType(value?: string | null): TournamentType {
  return typeOptions.some((option) => option.value === value) ? value as TournamentType : 'OPEN'
}

function toTournamentGender(value?: string | null): TournamentGender {
  return genderOptions.some((option) => option.value === value) ? value as TournamentGender : 'MALE'
}

function formFromSummary(summary: TournamentSummary, rules?: Record<string, unknown> | null): FormState {
  const tournament = summary.tournament
  const safeRules = rules ?? {}
  const pointsConfig = typeof safeRules.points_config === 'object' && safeRules.points_config && !Array.isArray(safeRules.points_config)
    ? safeRules.points_config as Record<string, unknown>
    : {}
  const tournamentCourts = Array.isArray(safeRules.tournament_courts)
    ? safeRules.tournament_courts
        .map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : null))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
          name: typeof entry.name === 'string' ? entry.name : '',
          complexName: typeof entry.complex_name === 'string' ? entry.complex_name : '',
          source: (entry.source === 'EXTERNAL_COMPLEX' ? 'EXTERNAL_COMPLEX' : 'OWN_CLUB') as CourtSource,
        }))
        .filter((entry) => entry.name.trim())
    : []
  const scheduleConfig = normalizeScheduleConfig(safeRules.schedule_config, {
    startDate: tournament.start_date,
    endDate: tournament.end_date ?? tournament.start_date,
  })
  const groupTiebreakers = normalizeGroupTiebreakerConfig(safeRules.group_tiebreakers, legacyGroupTiebreakerConfig)

  return {
    name: tournament.name ?? '',
    type: toTournamentType(tournament.type),
    gender: toTournamentGender(tournament.gender),
    categoryId: String(tournament.category_id ?? 7),
    segmentType: safeRules.segment_type === 'MENORES' || safeRules.segment_type === 'VETERANOS' ? safeRules.segment_type : 'LIBRES',
    competitionSystem: safeRules.competition_system === 'ROUND_ROBIN' || safeRules.competition_system === 'SINGLE_ELIMINATION'
      ? safeRules.competition_system
      : 'GROUPS_PLAYOFF',
    venueName: typeof safeRules.venue_name === 'string' ? safeRules.venue_name : '',
    publicDescription: typeof safeRules.public_description === 'string' ? safeRules.public_description : '',
    startDate: toDateInput(tournament.start_date),
    endDate: toDateInput(tournament.end_date),
    registrationDeadline: toDateTimeInput(tournament.registration_deadline),
    pricePerPlayer: String(tournament.price_per_player ?? 0),
    minPairs: String(tournament.min_pairs ?? 6),
    maxPairs: tournament.max_pairs ? String(tournament.max_pairs) : '',
    tournamentCourts,
    scheduleMode: scheduleConfig.mode,
    matchDurationMinutes: String(scheduleConfig.match_duration_minutes),
    groupsDate: scheduleConfig.groups.date,
    groupsStartTime: scheduleConfig.groups.start_time,
    groupsEndTime: scheduleConfig.groups.end_time,
    playoffDate: scheduleConfig.playoff.date,
    playoffStartTime: scheduleConfig.playoff.start_time,
    playoffEndTime: scheduleConfig.playoff.end_time,
    groupTiebreakerOrder: completeGroupTiebreakerCriteria(groupTiebreakers.order),
    groupTiebreakerFinal: groupTiebreakers.final,
    pointsEnabled: typeof pointsConfig.enabled === 'boolean' ? pointsConfig.enabled : true,
    pointsEditable: Boolean(pointsConfig.editable),
    pointsWinner: String(pointsConfig.winner ?? defaultPoints.winner),
    pointsFinalist: String(pointsConfig.finalist ?? defaultPoints.finalist),
    pointsSemifinalist: String(pointsConfig.semifinalist ?? defaultPoints.semifinalist),
    pointsQuarterfinalist: String(pointsConfig.quarterfinalist ?? defaultPoints.quarterfinalist),
    pointsEighthFinalist: String(pointsConfig.eighthFinalist ?? defaultPoints.eighthFinalist),
    pointsParticipation: String(pointsConfig.participation ?? defaultPoints.participation),
  }
}

export default function EditClubTournamentPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const tournamentId = params?.id
  const { activeClub } = useSession()
  const [form, setForm] = useState<FormState | null>(null)
  const [courtDraft, setCourtDraft] = useState<CourtDraftState>(initialCourtDraft)
  const [complexOptions, setComplexOptions] = useState<ClubComplexOption[]>([])
  const [loadingComplexes, setLoadingComplexes] = useState(true)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const isDraft = status.toUpperCase() === 'DRAFT'

  const errors = useMemo(() => {
    if (!form) return []

    const next: string[] = []
    const categoryId = toInteger(form.categoryId, 0)
    const minPairs = toInteger(form.minPairs, 6)
    const maxPairs = form.maxPairs.trim() ? toInteger(form.maxPairs, NaN) : null
    const price = toNumber(form.pricePerPlayer, 0)
    const matchDuration = toInteger(form.matchDurationMinutes, 90)

    if (!activeClub?.id) next.push('Seleccioná un club activo.')
    if (!form.name.trim()) next.push('El nombre es obligatorio.')
    if (!form.startDate) next.push('La fecha de inicio es obligatoria.')
    if (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 7) next.push('La categoría debe estar entre 1 y 7.')
    if (!Number.isInteger(minPairs) || minPairs < 2) next.push('El mínimo de parejas debe ser al menos 2.')
    if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) next.push('El máximo debe ser mayor o igual al mínimo.')
    if (!Number.isFinite(price) || price < 0) next.push('El precio debe ser mayor o igual a 0.')
    if (!Number.isInteger(matchDuration) || matchDuration < 30) next.push('La duración estimada debe ser de al menos 30 minutos.')
    if (form.endDate && form.startDate && form.endDate < form.startDate) next.push('La fecha fin no puede ser anterior al inicio.')
    if (form.registrationDeadline && form.startDate && form.registrationDeadline.slice(0, 10) > form.startDate) next.push('El cierre de inscripción no puede ser posterior al inicio.')
    if (form.groupsDate && form.startDate && form.groupsDate < form.startDate) next.push('El día de grupos no puede ser anterior al inicio del torneo.')
    if (form.playoffDate && form.endDate && form.playoffDate > form.endDate) next.push('El día de playoff no puede ser posterior al fin del torneo.')
    if (form.groupsStartTime && form.groupsEndTime && form.groupsStartTime >= form.groupsEndTime) next.push('El horario de grupos debe cerrar después de la hora de inicio.')
    if (form.playoffStartTime && form.playoffEndTime && form.playoffStartTime >= form.playoffEndTime) next.push('El horario de playoff debe cerrar después de la hora de inicio.')

    return next
  }, [activeClub?.id, form])

  const groupsScheduleCapacity = useMemo(
    () => !form
      ? calculateScheduleCapacity({
          courtsCount: 0,
          startTime: '10:00',
          endTime: '22:00',
          matchDurationMinutes: 90,
        })
      : calculateScheduleCapacity({
          courtsCount: form.tournamentCourts.length,
          startTime: form.groupsStartTime || '10:00',
          endTime: form.groupsEndTime || '22:00',
          matchDurationMinutes: toInteger(form.matchDurationMinutes, 90),
        }),
    [form]
  )

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }

  function updateGroupTiebreakerCriterion(index: number, value: GroupTiebreakerCriterion) {
    setForm((current) => {
      if (!current) return current
      return {
        ...current,
        groupTiebreakerOrder: reorderGroupTiebreakerCriteria(current.groupTiebreakerOrder, index, value),
      }
    })
  }

  const selectedComplex = complexOptions.find((option) => option.id === courtDraft.complexId) ?? null
  const selectedComplexCourts = useMemo(() => {
    const count = selectedComplex?.courtsCount ?? 0
    return Array.from({ length: Math.max(0, count) }, (_, index) => `Cancha ${index + 1}`)
  }, [selectedComplex])

  async function loadComplexOptions() {
    if (!activeClub?.id) {
      setComplexOptions([])
      setLoadingComplexes(false)
      return
    }

    setLoadingComplexes(true)
    const { data, error } = await supabase
      .from('clubs')
      .select('id,name,courts_count,is_active')
      .eq('is_active', true)
      .order('name')

    const fallbackOption = { id: activeClub.id, name: activeClub.name ?? 'Club actual', courtsCount: 0 }

    if (error) {
      setComplexOptions([fallbackOption])
      setCourtDraft((current) => ({ ...current, complexId: current.complexId || fallbackOption.id }))
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

    if (form?.venueName && !nextOptions.some((option) => option.name === form.venueName)) {
      nextOptions.push({ id: `external:${form.venueName}`, name: form.venueName, courtsCount: 0 })
    }

    setComplexOptions(nextOptions)
    setCourtDraft((current) => ({
      ...current,
      complexId: current.complexId || nextOptions[0]?.id || '',
    }))
    setLoadingComplexes(false)
  }

  function addCourt() {
    const complex = complexOptions.find((option) => option.id === courtDraft.complexId)
    const name = courtDraft.courtName.trim()

    if (!complex) {
      setMessage('Seleccioná un complejo para agregar una cancha.')
      return
    }

    if (!name) {
      setMessage('Seleccioná una cancha disponible.')
      return
    }

    if ((form?.tournamentCourts ?? []).some((court) => court.name === name && (court.complexName ?? '') === complex.name)) {
      setMessage('Esa cancha ya está agregada en el torneo.')
      return
    }

    setForm((current) => current ? ({
      ...current,
      venueName: current.venueName || complex.name,
      tournamentCourts: [
        ...current.tournamentCourts,
        {
          name,
          complexName: complex.name,
          source: complex.id === activeClub?.id ? 'OWN_CLUB' : 'EXTERNAL_COMPLEX',
        },
      ],
    }) : current)
    setCourtDraft((current) => ({ ...current, courtName: '' }))
    setMessage('')
  }

  function removeCourt(index: number) {
    setForm((current) => current ? ({
      ...current,
      tournamentCourts: current.tournamentCourts.filter((_, courtIndex) => courtIndex !== index),
    }) : current)
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token ?? null
  }

  async function loadTournament() {
    if (!activeClub?.id || !tournamentId) {
      setForm(null)
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
    const json = await res.json().catch(() => ({})) as Partial<TournamentSummary> & { error?: string }

    if (!res.ok || !json.tournament) {
      setMessage(json?.error ?? 'No pude cargar el torneo.')
      setForm(null)
      setLoading(false)
      return
    }

    const summary = json as TournamentSummary
    const rulesRes = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const rulesJson = await rulesRes.json().catch(() => ({})) as TournamentRulesLookup
    const currentTournament = (rulesJson.tournaments ?? []).find((item) => item.id === tournamentId)
    setStatus(summary.tournament.status)
    setForm(formFromSummary(summary, currentTournament?.rules_json))
    setFlyerConfig(readFlyerConfigFromRules(currentTournament?.rules_json))
    setLoading(false)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (!form || !activeClub?.id || !tournamentId) return
    if (!isDraft) {
      setMessage('Solo se pueden editar torneos en borrador.')
      return
    }
    if (errors.length) {
      setMessage(errors[0] ?? 'Revisá los datos del torneo.')
      return
    }

    setSaving(true)

    const token = await getToken()
    if (!token) {
      setMessage('Sesión inválida.')
      setSaving(false)
      return
    }

    const tournamentConfig = buildTournamentConfigPayload(form)
    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'update_draft',
        name: form.name,
        type: form.type,
        gender: form.gender,
        category_id: Number(form.categoryId),
        segment_type: tournamentConfig.segment_type,
        public_description: tournamentConfig.public_description,
        competition_system: tournamentConfig.competition_system,
        venue_name: tournamentConfig.venue_name,
        tournament_courts: tournamentConfig.tournament_courts,
        schedule_config: tournamentConfig.schedule_config,
        points_config: tournamentConfig.points_config,
        group_tiebreakers: tournamentConfig.group_tiebreakers,
        start_date: form.startDate,
        end_date: form.endDate || null,
        registration_deadline: form.registrationDeadline || null,
        price_per_player: form.pricePerPlayer,
        min_pairs: form.minPairs,
        max_pairs: form.maxPairs || null,
        flyer: buildFlyerPayload(flyerConfig),
      }),
    })
    const json = await res.json().catch(() => ({})) as { error?: string; code?: string }

    setSaving(false)

    if (!res.ok) {
      const messages: Record<string, string> = {
        INVALID_STATUS_TRANSITION: 'Solo podés editar torneos en borrador.',
        UNAUTHORIZED: 'No tenés permisos para editar este torneo.',
        TOURNAMENT_NOT_FOUND: 'Torneo no encontrado para este club.',
        VALIDATION_ERROR: json.error ?? 'Revisá los datos del torneo.',
      }
      setMessage(json.code ? messages[json.code] ?? json.error ?? 'No pude guardar los cambios.' : json.error ?? 'No pude guardar los cambios.')
      return
    }

    router.replace(`/club/torneos/${tournamentId}`)
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTournament())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, tournamentId])

  useEffect(() => {
    void loadComplexOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id, form?.venueName])

  useEffect(() => {
    if (!form) return

    const nextGroupsDate = form.groupsDate || form.startDate
    const nextPlayoffDate = form.playoffDate || form.endDate || form.startDate
    if (nextGroupsDate === form.groupsDate && nextPlayoffDate === form.playoffDate) return

    setForm((current) => current ? {
      ...current,
      groupsDate: current.groupsDate || current.startDate,
      playoffDate: current.playoffDate || current.endDate || current.startDate,
    } : current)
  }, [form])

  return (
    <div className="px-wrap">
      <div className="club-panel club-editTournament">
        <div className="club-editHead">
          <div>
            <h1 className="club-title">Editar torneo</h1>
            <p className="club-sub">Ajustá los datos antes de publicar. Después de abrir inscripciones, esta edición queda bloqueada.</p>
          </div>
          <Link href={tournamentId ? `/club/torneos/${tournamentId}` : '/club/torneos'} className="club-secondaryBtn">Volver</Link>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        {loading ? (
          <div className="px-empty">Cargando torneo...</div>
        ) : !activeClub?.id ? (
          <div className="px-empty">Primero seleccioná un club activo.</div>
        ) : !form ? (
          <div className="px-empty">No pude cargar el torneo.</div>
        ) : !isDraft ? (
          <div className="club-blockedCard">
            <span className="club-kicker">Edición bloqueada</span>
            <h2>Este torneo ya no está en borrador.</h2>
            <p>Para proteger inscripciones, seed, grupos y operación deportiva, solo se editan torneos en estado DRAFT.</p>
            <Link href={`/club/torneos/${tournamentId}`} className="club-secondaryBtn">Volver al torneo</Link>
          </div>
        ) : (
          <form className="club-formCard" onSubmit={submit}>
            <section className="club-formSection">
              <div className="club-formSectionHead">
                <span className="club-kicker">Datos principales</span>
                <p>La base del torneo para seguir afinándolo sin desordenar la carga.</p>
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

                <label className="club-field club-field--span3">
                  <span>Tipo</span>
                  <select className="px-input" value={form.type} onChange={(event) => updateField('type', event.target.value as TournamentType)}>
                    {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="club-field club-field--span3">
                  <span>Segmento / Rama</span>
                  <select className="px-input" value={form.segmentType} onChange={(event) => updateField('segmentType', event.target.value as TournamentSegment)}>
                    {segmentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="club-field club-field--span4">
                  <span>Categoría</span>
                  <select className="px-input" value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}>
                    {[7, 6, 5, 4, 3, 2, 1].map((category) => <option key={category} value={category}>Categoría {category}</option>)}
                  </select>
                </label>

                <label className="club-field club-field--span4">
                  <span>Género</span>
                  <select className="px-input" value={form.gender} onChange={(event) => updateField('gender', event.target.value as TournamentGender)}>
                    {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="club-field club-field--span4">
                  <span>Sistema de competencia</span>
                  <select className="px-input" value={form.competitionSystem} onChange={(event) => updateField('competitionSystem', event.target.value as CompetitionSystem)}>
                    {competitionSystemOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="club-formSection">
              <div className="club-formSectionHead">
                <span className="club-kicker">Fechas, cupos y costo</span>
                <p>Calendario y cupos bien ordenados, sin dejar huecos ni campos sueltos.</p>
              </div>
              <div className="club-formSectionGrid">
                <label className="club-field club-field--span3 club-field--compact">
                  <span>Inicio</span>
                  <input className="px-input" type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
                </label>

                <label className="club-field club-field--span3 club-field--compact">
                  <span>Fin</span>
                  <input className="px-input" type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} />
                </label>

                <label className="club-field club-field--span3 club-field--compact">
                  <span>Cierre de inscripción</span>
                  <input className="px-input" type="datetime-local" value={form.registrationDeadline} onChange={(event) => updateField('registrationDeadline', event.target.value)} />
                </label>

                <label className="club-field club-field--span3 club-field--compact">
                  <span>Precio por jugador</span>
                  <input className="px-input" inputMode="decimal" value={form.pricePerPlayer} onChange={(event) => updateField('pricePerPlayer', event.target.value)} />
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
            </section>

            <section className="club-formSection club-formSection--soft">
              <div className="club-formSectionHead">
                <span className="club-kicker">Descripción / Observaciones públicas</span>
                <p>Opcional. Usala solo si necesitás mostrar premios, reglas visibles o aclaraciones.</p>
              </div>
              <div className="club-formSectionGrid">
                <label className="club-field club-field--wide">
                  <textarea
                    className="club-textarea club-textarea--compact"
                    value={form.publicDescription}
                    onChange={(event) => updateField('publicDescription', event.target.value)}
                    placeholder="Agregar una descripción pública breve para el torneo."
                    maxLength={280}
                    rows={2}
                  />
                </label>
              </div>
            </section>

            <section className="club-formSection club-formSection--highlight">
              <div className="club-formSectionHead">
                <span className="club-kicker">Sede y canchas</span>
                <p>Podés configurar las canchas más adelante.</p>
              </div>
              <div className="club-formSectionGrid club-venueRow">
                <label className="club-field club-field--span8">
                  <span>Sede / Complejo principal</span>
                  <select
                    className="px-input"
                    value={form.venueName}
                    onChange={(event) => updateField('venueName', event.target.value)}
                  >
                    <option value="">Seleccioná un complejo</option>
                    {complexOptions.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                  </select>
                </label>

                <details className="club-disclosure club-disclosure--button club-field--span4">
                  <summary>
                    <span>Configurar canchas</span>
                    <small>{form.tournamentCourts.length ? `${form.tournamentCourts.length} cancha${form.tournamentCourts.length === 1 ? '' : 's'}` : 'Opcional'}</small>
                  </summary>
                  <p>Podés configurar canchas ahora o más adelante desde Grupos/Agenda.</p>
                  <div className="club-formSectionGrid club-formSectionGrid--nested">
                    <label className="club-field club-field--span4">
                      <span>Complejo / Sede</span>
                      <select className="px-input" value={courtDraft.complexId} onChange={(event) => setCourtDraft({ complexId: event.target.value, courtName: '' })}>
                        <option value="">{loadingComplexes ? 'Cargando complejos...' : 'Seleccioná un complejo'}</option>
                        {complexOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}{option.id === activeClub?.id ? ' · Club actual' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="club-field club-field--span4">
                      <span>Cancha</span>
                      <select
                        className="px-input"
                        value={courtDraft.courtName}
                        onChange={(event) => setCourtDraft((current) => ({ ...current, courtName: event.target.value }))}
                        disabled={!courtDraft.complexId || !selectedComplexCourts.length}
                      >
                        <option value="">
                          {!courtDraft.complexId
                            ? 'Elegí un complejo primero'
                            : selectedComplexCourts.length
                              ? 'Seleccioná una cancha'
                              : 'Sin canchas cargadas'}
                        </option>
                        {selectedComplexCourts.map((courtName) => (
                          <option key={courtName} value={courtName}>{courtName}</option>
                        ))}
                      </select>
                    </label>

                    <div className="club-field club-field--span4 club-courtComposer">
                      <button type="button" className="club-secondaryBtn club-secondaryBtn--compact" onClick={addCourt}>Agregar cancha</button>
                    </div>

                    {courtDraft.complexId && !selectedComplexCourts.length ? (
                      <div className="club-field club-field--wide">
                        <div className="club-emptyInline">Este complejo todavía no tiene canchas cargadas.</div>
                      </div>
                    ) : null}

                    {form.tournamentCourts.length ? (
                    <div className="club-field club-field--wide">
                      <span>Canchas seleccionadas</span>
                      <div className="club-courtList">
                        {form.tournamentCourts.map((court, index) => (
                          <div key={`${court.name}-${court.complexName ?? 'club'}-${index}`} className="club-courtChip">
                            <div>
                              <strong>{court.name}</strong>
                              <span>{court.complexName || form.venueName || activeClub?.name || 'Complejo por definir'}</span>
                            </div>
                            <small>{court.source === 'EXTERNAL_COMPLEX' ? 'Otro complejo' : 'Club actual'}</small>
                            <button type="button" className="club-chipRemove" onClick={() => removeCourt(index)}>Quitar</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </section>

            <section className="club-formSection">
              <div className="club-formSectionHead">
                <span className="club-kicker">Planificación de partidos</span>
                <p>Dejá lista la ventana operativa para automatizar horarios y canchas cuando generes cruces.</p>
              </div>
              <div className="club-formSectionGrid">
                <label className="club-field club-field--span3 club-field--compact">
                  <span>Modo de planificación</span>
                  <select className="px-input" value={form.scheduleMode} onChange={(event) => updateField('scheduleMode', event.target.value as ScheduleMode)}>
                    {scheduleModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="club-field club-field--span3 club-field--compact">
                  <span>Duración partido</span>
                  <input className="px-input" inputMode="numeric" value={form.matchDurationMinutes} onChange={(event) => updateField('matchDurationMinutes', event.target.value)} placeholder="90" />
                </label>

                <div className="club-field club-field--span6 club-scheduleCapacity">
                  <span>Capacidad</span>
                  {form.tournamentCourts.length ? (
                    <>
                      <strong>{groupsScheduleCapacity.totalCapacity} partidos</strong>
                      <small>
                        {groupsScheduleCapacity.slotsPerCourt} slot{groupsScheduleCapacity.slotsPerCourt === 1 ? '' : 's'} por cancha · {form.tournamentCourts.length} cancha{form.tournamentCourts.length === 1 ? '' : 's'}
                      </small>
                    </>
                  ) : (
                    <small>Capacidad se calculará al configurar canchas.</small>
                  )}
                </div>

                <div className="club-scheduleWindows club-field--wide">
                  <div className="club-scheduleWindow">
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

                  <div className="club-scheduleWindow">
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
                </div>
              </div>
            </section>

            <section className="club-formSection club-formSection--soft">
              <div className="club-formSectionHead">
                <span className="club-kicker">Definición por desempate</span>
                <p>Orden aplicado a las tablas de grupos. Si todo sigue igualado, el desempate final queda separado.</p>
              </div>
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
            </section>

            <section className="club-formSection">
              <div className="club-formSectionHead">
                <span className="club-kicker">Puntaje</span>
                <p>La escala viene precargada y solo se habilita edición si querés ajustarla.</p>
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

            <div className="club-field club-field--wide">
              <TournamentFlyerConfigurator
                value={flyerConfig}
                onChange={setFlyerConfig}
                previewData={{
                  clubName: activeClub?.name ?? '',
                  name: form.name,
                  type: typeOptions.find((option) => option.value === form.type)?.label ?? form.type,
                  gender: genderOptions.find((option) => option.value === form.gender)?.label ?? form.gender,
                  categoryLabel: `Categoria ${form.categoryId || '7'}`,
                  segmentLabel: segmentOptions.find((option) => option.value === form.segmentType)?.label ?? form.segmentType,
                  competitionSystemLabel: competitionSystemOptions.find((option) => option.value === form.competitionSystem)?.label ?? form.competitionSystem,
                  venueName: form.venueName || activeClub?.name || '',
                  startDate: form.startDate,
                  endDate: form.endDate,
                  registrationDeadline: form.registrationDeadline,
                  pricePerPlayer: form.pricePerPlayer,
                }}
                helperText="Si el torneo ya tenia configuracion visual guardada, la retomamos desde rules_json para seguir afinandola en borrador."
              />
            </div>

            <div className="club-formActions">
              <Link href={`/club/torneos/${tournamentId}`} className="club-secondaryBtn">Cancelar</Link>
              <button type="submit" className="club-primaryBtn" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .club-editTournament { overflow: hidden; }
        .club-editHead { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; }
        .club-message { background: #fff7df; border: 1px solid rgba(217,119,6,.24); border-radius: 12px; color: #854d0e; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-formCard, .club-blockedCard { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.07); border-radius: 16px; margin-top: 12px; min-width: 0; padding: 10px; }
        .club-formCard { display: grid; gap: 9px; }
        .club-formSection { background: rgba(255,255,255,.82); border: 0; border-top: 1px solid rgba(15,23,42,.08); display: grid; gap: 9px; padding: 11px 2px 8px; }
        .club-formSection:first-child { border-top: 0; padding-top: 2px; }
        .club-formSection--soft { background: rgba(248,252,253,.72); border: 1px solid rgba(83,199,217,.14); border-radius: 12px; padding: 9px; }
        .club-formSection--highlight { background: rgba(248,252,253,.9); border: 1px solid rgba(83,199,217,.18); border-radius: 12px; padding: 10px; }
        .club-formSectionHead { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
        .club-formSectionHead p { color: #64748b; font-size: 12px; font-weight: 780; line-height: 1.4; margin: 0; max-width: 420px; }
        .club-formSectionGrid { display: grid; gap: 8px; grid-template-columns: repeat(12, minmax(0, 1fr)); }
        .club-formSectionGrid--nested { margin-top: 8px; }
        .club-formSection--soft { background: #f8fafc; border-color: rgba(14,116,144,.16); }
        .club-tiebreakerGrid { display: grid; gap: 8px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .club-inlineNote--compact { margin-top: 8px; padding: 8px 10px; }
        .club-field { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
        .club-field .px-input { background: #fff; min-height: 34px; }
        .club-field--compact .px-input { min-height: 32px; padding-block: 6px; }
        .club-field--wide { grid-column: 1 / -1; }
        .club-field--span2 { grid-column: span 2; }
        .club-field--span3 { grid-column: span 3; }
        .club-field--span4 { grid-column: span 4; }
        .club-field--span6 { grid-column: span 6; }
        .club-field--span8 { grid-column: span 8; }
        .club-textarea { background: #fff; border: 1px solid rgba(15,23,42,.12); border-radius: 10px; color: #17253f; font: inherit; font-size: 13px; font-weight: 700; min-height: 46px; max-height: 84px; outline: none; padding: 8px 10px; resize: vertical; width: 100%; }
        .club-textarea--compact { min-height: 52px; }
        .club-textarea:focus { border-color: rgba(83,199,217,.70); box-shadow: 0 0 0 3px rgba(83,199,217,.12); }
        .club-checkRow--wide { grid-column: 1 / -1; }
        .club-disclosure { background: rgba(255,255,255,.76); border: 1px solid rgba(15,23,42,.08); border-radius: 12px; padding: 8px 10px; }
        .club-disclosure--button { align-self: end; background: transparent; border: 0; padding: 0; }
        .club-disclosure--button[open] { grid-column: 1 / -1; }
        .club-disclosure--button > summary { background: #fff; border: 1px solid rgba(83,199,217,.36); border-radius: 10px; color: #0f8ea0; min-height: 34px; padding: 7px 10px; }
        .club-disclosure--button[open] > summary { border-color: rgba(83,199,217,.62); box-shadow: 0 0 0 3px rgba(83,199,217,.10); justify-self: end; min-width: 220px; }
        .club-disclosureSection { padding: 10px; }
        .club-disclosure > summary, .club-disclosureSection > summary { align-items: center; cursor: pointer; display: flex; gap: 10px; justify-content: space-between; list-style: none; }
        .club-disclosure > summary::-webkit-details-marker, .club-disclosureSection > summary::-webkit-details-marker { display: none; }
        .club-disclosure summary span, .club-disclosureSection summary span { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-disclosure summary small, .club-disclosureSection summary small { background: #e9fbff; border-radius: 999px; color: #0f7180; font-size: 11px; font-weight: 900; padding: 4px 8px; }
        .club-disclosure p { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 8px 0 0; }
        .club-pointsGrid { display: grid; gap: 8px; grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .club-pointsToolbar, .club-courtComposer { align-items: center; display: flex; flex-wrap: wrap; justify-content: space-between; }
        .club-pointsHint { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-pointsSummary { display: flex; flex-wrap: wrap; gap: 8px; }
        .club-pointsSummary span { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 999px; color: #64748b; font-size: 12px; font-weight: 900; padding: 6px 9px; }
        .club-pointsSummary strong { color: #17253f; margin-left: 4px; }
        .club-scheduleCapacity { align-content: center; background: #f8fdff; border: 1px solid rgba(83,199,217,.18); border-radius: 12px; padding: 8px 10px; }
        .club-scheduleCapacity strong { color: #17253f; font-size: 16px; line-height: 1; }
        .club-scheduleCapacity small { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-scheduleWindows { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-scheduleWindow { align-items: end; background: rgba(248,250,252,.64); border: 1px solid rgba(15,23,42,.06); border-radius: 12px; display: grid; gap: 8px; grid-template-columns: auto minmax(132px, 1fr) minmax(84px, .55fr) minmax(84px, .55fr); padding: 8px; }
        .club-scheduleWindow > strong { align-self: center; color: #0f7180; font-size: 11px; font-weight: 950; }
        .club-courtList { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
        .club-courtChip { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; }
        .club-courtChip strong { color: #17253f; display: block; font-size: 13px; }
        .club-courtChip span { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-courtChip small { background: rgba(83,199,217,.12); border-radius: 999px; color: #0f8ea0; font-size: 11px; font-weight: 900; padding: 4px 8px; }
        .club-chipRemove { background: none; border: none; color: #c2410c; cursor: pointer; font-size: 12px; font-weight: 900; justify-self: end; padding: 0; }
        .club-emptyInline { background: rgba(248,250,252,.9); border: 1px dashed rgba(148,163,184,.36); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 800; padding: 12px; }
        .club-formActions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
        .club-blockedCard { display: grid; gap: 8px; }
        .club-blockedCard h2 { color: #17253f; font-size: 20px; line-height: 1.15; margin: 0; }
        .club-blockedCard p { color: #64748b; font-size: 13px; font-weight: 800; line-height: 1.35; margin: 0 0 4px; max-width: 680px; }
        .club-kicker { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: 0; text-transform: uppercase; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 8px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; min-height: 36px; padding: 8px 12px; text-decoration: none; transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease; white-space: nowrap; }
        .club-primaryBtn { background: #69dfe3; border: 1px solid rgba(15,23,42,.10); color: #102538; }
        .club-primaryBtn:hover:not(:disabled) { background: #7be8eb; border-color: rgba(15,23,42,.18); box-shadow: 0 8px 18px rgba(15,142,160,.14); transform: translateY(-1px); }
        .club-secondaryBtn { background: #fff; border: 1px solid rgba(83,199,217,.36); color: #0f8ea0; }
        .club-secondaryBtn--compact { min-height: 32px; padding: 6px 11px; }
        .club-secondaryBtn:hover { background: #f0fcff; border-color: rgba(15,142,160,.45); box-shadow: 0 8px 18px rgba(15,142,160,.10); transform: translateY(-1px); }
        .club-primaryBtn:disabled { cursor: not-allowed; opacity: .65; }
        .club-pointsGrid .px-input:disabled { background: #eef2f7; border-color: rgba(148,163,184,.22); color: #42526b; cursor: not-allowed; }
        .club-pointsGrid .px-input:not(:disabled) { background: #fff; cursor: text; }
        .flyerCard { background: linear-gradient(180deg, rgba(248,250,252,.98) 0%, rgba(241,245,249,.94) 100%); border: 1px solid rgba(83,199,217,.18); border-radius: 16px; display: grid; gap: 14px; padding: 14px; }
        .flyerBlockHead { align-items: start; display: flex; gap: 16px; justify-content: space-between; }
        .flyerBlockHead h2 { color: #17253f; font-size: 22px; line-height: 1.1; margin: 4px 0 0; }
        .flyerBlockHead p { color: #5b6b84; font-size: 12px; font-weight: 800; line-height: 1.45; margin: 0; max-width: 360px; }
        .flyerKicker, .flyerControlTitle, .flyerPreviewLabel { color: #64748b; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .flyerModeSwitch { display: flex; flex-wrap: wrap; gap: 8px; }
        .flyerModeChip { background: #fff; border: 1px solid rgba(148,163,184,.26); border-radius: 999px; color: #274159; cursor: pointer; font-size: 13px; font-weight: 900; min-height: 38px; padding: 0 14px; transition: background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease; }
        .flyerModeChip:hover { border-color: rgba(15,142,160,.38); color: #0f8ea0; }
        .flyerModeChip.is-active { background: #e6fbff; border-color: rgba(83,199,217,.52); box-shadow: inset 0 0 0 1px rgba(83,199,217,.14); color: #0f8ea0; }
        .flyerLayout { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); }
        .flyerControls { display: grid; gap: 14px; min-width: 0; }
        .flyerControlSection, .flyerPlaceholder { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; padding: 14px; }
        .flyerPlaceholder strong { color: #17253f; display: block; font-size: 15px; margin-bottom: 6px; }
        .flyerPlaceholder p { color: #64748b; font-size: 13px; font-weight: 700; line-height: 1.45; margin: 0; }
        .flyerPlaceholder--compact { min-height: 0; padding: 12px; }
        .flyerLayout--compact { grid-template-columns: minmax(0, 1fr); }
        .flyerBackgroundGrid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); margin-top: 10px; }
        .flyerBackgroundOption { background: rgba(255,255,255,.92); border: 1px solid rgba(148,163,184,.18); border-radius: 12px; cursor: pointer; display: grid; gap: 8px; padding: 8px; text-align: left; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .flyerBackgroundOption:hover { border-color: rgba(83,199,217,.5); box-shadow: 0 8px 18px rgba(15,23,42,.08); transform: translateY(-1px); }
        .flyerBackgroundOption.is-selected { border-color: rgba(83,199,217,.8); box-shadow: 0 0 0 2px rgba(83,199,217,.12); }
        .flyerBackgroundOption span:last-child { color: #30455f; font-size: 11px; font-weight: 900; }
        .flyerBackgroundSwatch { aspect-ratio: 1.12; border-radius: 10px; display: block; min-width: 0; }
        .flyerControlRow { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .flyerControlRow--selects { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .flyerColorField, .flyerSelectField { background: rgba(255,255,255,.82); border: 1px solid rgba(148,163,184,.16); border-radius: 14px; color: #30455f; display: grid; font-size: 12px; font-weight: 900; gap: 8px; padding: 12px; }
        .flyerColorField input { appearance: none; background: transparent; border: none; cursor: pointer; height: 42px; padding: 0; width: 100%; }
        .flyerColorField input::-webkit-color-swatch-wrapper { padding: 0; }
        .flyerColorField input::-webkit-color-swatch { border: 1px solid rgba(15,23,42,.14); border-radius: 10px; }
        .flyerPreviewShell { display: grid; gap: 8px; }
        .flyerPreview { border-radius: 22px; box-shadow: 0 28px 60px rgba(15,23,42,.18); min-height: 100%; overflow: hidden; padding: 18px; position: relative; }
        .flyerPreview--editor { min-height: 360px; }
        .flyerPreview::after { background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(2,6,23,.24) 100%); content: ''; inset: 0; pointer-events: none; position: absolute; }
        .flyerPreview > * { position: relative; z-index: 1; }
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
        @media (max-width: 720px) {
          .club-editHead { display: grid; }
          .club-formSectionHead { display: grid; }
          .club-formSectionGrid, .club-tiebreakerGrid, .club-pointsGrid, .club-formCard, .club-scheduleWindows, .club-scheduleWindow { grid-template-columns: 1fr; }
          .club-field--span2, .club-field--span3, .club-field--span4, .club-field--span6, .club-field--span8 { grid-column: auto; }
          .club-disclosure--button { align-self: stretch; }
          .club-formActions { justify-content: stretch; }
          .club-formActions > * { width: 100%; }
          .flyerBlockHead, .flyerLayout, .flyerControlRow, .flyerControlRow--selects, .flyerPreviewMeta { grid-template-columns: 1fr; }
          .flyerBlockHead { display: grid; }
          .flyerPreview { min-height: 420px; }
        }
      `}</style>
    </div>
  )
}
