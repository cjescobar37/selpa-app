'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { getClubTheme } from '@/lib/clubThemes'
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
import { TournamentFlyerConfigurator, defaultFlyerConfig, resolveAutoFlyerConfig, type FlyerConfig } from '../_components/TournamentFlyerConfigurator'

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

const initialForm: FormState = {
  name: '',
  type: 'OPEN',
  gender: 'MALE',
  categoryId: '7',
  segmentType: 'LIBRES',
  competitionSystem: 'GROUPS_PLAYOFF',
  venueName: '',
  publicDescription: '',
  startDate: '',
  endDate: '',
  registrationDeadline: '',
  pricePerPlayer: '0',
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

const initialCourtDraft: CourtDraftState = {
  complexId: '',
  courtName: '',
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

export default function ClubNuevoTorneoPage() {
  const router = useRouter()
  const { activeClub } = useSession()
  const [form, setForm] = useState<FormState>(initialForm)
  const [courtDraft, setCourtDraft] = useState<CourtDraftState>(initialCourtDraft)
  const [complexOptions, setComplexOptions] = useState<ClubComplexOption[]>([])
  const [loadingComplexes, setLoadingComplexes] = useState(true)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [flyerConfig, setFlyerConfig] = useState<FlyerConfig>(defaultFlyerConfig)
  const [courtsExpanded, setCourtsExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const errors = useMemo(() => {
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

  function updateGroupTiebreakerCriterion(index: number, value: GroupTiebreakerCriterion) {
    setForm((current) => {
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
      setThemeKey(null)
      setLoadingComplexes(false)
      return
    }

    setLoadingComplexes(true)
    const { data, error } = await supabase
      .from('clubs')
      .select('id,name,courts_count,is_active,theme_key')
      .eq('is_active', true)
      .order('name')

    if (error) {
      setThemeKey(null)
      setComplexOptions([{ id: activeClub.id, name: activeClub.name ?? 'Club actual', courtsCount: 0 }])
      setLoadingComplexes(false)
      return
    }

    const clubRows = (data ?? []) as Array<{ id: string; name: string; courts_count: number | null; theme_key?: string | null }>
    setThemeKey(clubRows.find((club) => club.id === activeClub.id)?.theme_key ?? null)

    const nextOptions = clubRows
      .map((club) => ({
        id: club.id,
        name: club.name,
        courtsCount: Number.isFinite(club.courts_count ?? NaN) ? Math.max(0, Number(club.courts_count ?? 0)) : 0,
      }))

    if (!nextOptions.some((option) => option.id === activeClub.id)) {
      nextOptions.unshift({ id: activeClub.id, name: activeClub.name ?? 'Club actual', courtsCount: 0 })
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

    if (form.tournamentCourts.some((court) => court.name === name && (court.complexName ?? '') === complex.name)) {
      setMessage('Esa cancha ya está agregada en el torneo.')
      return
    }

    setForm((current) => ({
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
    }))
    setCourtDraft((current) => ({ ...current, courtName: '' }))
    setMessage('')
  }

  function removeCourt(index: number) {
    setForm((current) => ({
      ...current,
      tournamentCourts: current.tournamentCourts.filter((_, courtIndex) => courtIndex !== index),
    }))
  }

  useEffect(() => {
    void loadComplexOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  useEffect(() => {
    setForm((current) => {
      const nextGroupsDate = current.groupsDate || current.startDate
      const nextPlayoffDate = current.playoffDate || current.endDate || current.startDate
      if (nextGroupsDate === current.groupsDate && nextPlayoffDate === current.playoffDate) return current
      return {
        ...current,
        groupsDate: nextGroupsDate,
        playoffDate: nextPlayoffDate,
      }
    })
  }, [form.startDate, form.endDate])

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pude subir el flyer manual.')
      setSaving(false)
      return
    }

    const tournamentConfig = buildTournamentConfigPayload(form)
    const res = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        gender: form.gender,
        category_id: Number(form.categoryId),
        segment_type: tournamentConfig.segment_type,
        segment: tournamentConfig.segment_type,
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
        flyer: buildFlyerPayload(preparedFlyerConfig, `${tournamentTypeLabel} ${tournamentGenderLabel}`),
      }),
    })
    const json = await res.json().catch(() => ({}))

    setSaving(false)

    if (!res.ok) {
      setMessage(json?.error ?? 'No pude crear el torneo.')
      return
    }

    router.replace('/club/torneos')
  }

  return (
    <div className="px-wrap">
      <div className="club-panel club-newTournament" style={themeStyle}>
        <div className="club-newHead">
          <div>
            <span className="club-kicker">Club Torneos</span>
            <h1 className="club-title">Crear torneo</h1>
            <p className="club-sub">Alta rápida para {activeClub?.name ?? 'tu club'}. El torneo queda como borrador.</p>
          </div>
          <Link href="/club/torneos" className="club-secondaryBtn">Volver</Link>
        </div>

        {message ? <div className="club-message">{message}</div> : null}

        <form className="club-formCard" onSubmit={submit}>
          <section className="club-formSection">
            <div className="club-formSectionHead">
              <span className="club-kicker">1. Identidad del torneo</span>
              <p>Nombre y descripción pública breve para presentar el torneo.</p>
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
                  placeholder="Premios, condiciones o aclaraciones visibles."
                  maxLength={280}
                  rows={2}
                />
              </label>
            </div>
          </section>

          <section className="club-formSection club-formSection--soft">
            <div className="club-formSectionHead">
              <span className="club-kicker">2. Categoría y formato</span>
              <p>Segmento deportivo, rama y sistema competitivo del torneo.</p>
            </div>
            <div className="club-formSectionGrid">
              <label className="club-field club-field--span3">
                <span>Tipo</span>
                <select className="px-input" value={form.type} onChange={(event) => updateField('type', event.target.value as TournamentType)}>
                  {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="club-field club-field--span3">
                <span>Segmento</span>
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
              <span className="club-kicker">3. Fechas e inscripción</span>
              <p>Calendario, cierre, cupos y costo de inscripción.</p>
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

          <section className="club-formSection club-formSection--highlight">
            <div className="club-formSectionHead">
              <span className="club-kicker">4. Sede, canchas y cupos</span>
              <p>Elegí el complejo principal y, si querés, dejá canchas preconfiguradas.</p>
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

              <div className="club-field club-field--span4 club-courtsToggle">
                <button
                  type="button"
                  className="club-courtsToggleButton"
                  aria-expanded={courtsExpanded}
                  onClick={() => setCourtsExpanded((current) => !current)}
                >
                  <span>Configurar canchas</span>
                  <small>{form.tournamentCourts.length ? `${form.tournamentCourts.length} cancha${form.tournamentCourts.length === 1 ? '' : 's'}` : 'Opcional'}</small>
                </button>
              </div>

              {courtsExpanded ? (
                <div className="club-courtsPanel club-field--wide">
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
                </div>
              ) : null}
            </div>
          </section>

          <section className="club-formSection">
            <div className="club-formSectionHead">
              <span className="club-kicker">5. Reglas / puntos / premios</span>
              <p>Definí la ventana operativa para automatizar cruces de grupos con horarios y canchas.</p>
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
                    <small>{groupsScheduleCapacity.slotsPerCourt} slot{groupsScheduleCapacity.slotsPerCourt === 1 ? '' : 's'} por cancha · {form.tournamentCourts.length} cancha{form.tournamentCourts.length === 1 ? '' : 's'}</small>
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
              <p>La escala arranca con defaults seguros y la podés editar solo cuando haga falta.</p>
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
              advancedControls
              previewData={{
                clubName: activeClub?.name ?? '',
                name: form.name,
                type: typeOptions.find((option) => option.value === form.type)?.label ?? form.type,
                gender: genderOptions.find((option) => option.value === form.gender)?.label ?? form.gender,
                categoryLabel: `Categoria ${form.categoryId || '7'}`,
                publicDescription: form.publicDescription,
                segmentLabel: segmentOptions.find((option) => option.value === form.segmentType)?.label ?? form.segmentType,
                competitionSystemLabel: competitionSystemOptions.find((option) => option.value === form.competitionSystem)?.label ?? form.competitionSystem,
                venueName: form.venueName || activeClub?.name || '',
                startDate: form.startDate,
                endDate: form.endDate,
                registrationDeadline: form.registrationDeadline,
                pricePerPlayer: form.pricePerPlayer,
              }}
              helperText="La configuracion visual se guarda dentro de rules_json para que despues puedas retomarla y seguir afinando el flyer."
            />
          </div>

          <div className="club-formActions">
            <button type="submit" className="club-primaryBtn" disabled={saving}>
              {saving ? 'Creando...' : 'Crear torneo'}
            </button>
            <Link href="/club/torneos" className="club-secondaryBtn">Cancelar</Link>
          </div>
        </form>
      </div>

      <style>{`
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
        .club-message { background: #fff7df; border: 1px solid rgba(217,119,6,.24); border-radius: 12px; color: #854d0e; font-weight: 800; margin-top: 12px; padding: 10px 12px; }
        .club-formCard { background: rgba(248,250,252,.72); border: 1px solid rgba(15,23,42,.07); border-radius: 20px; display: grid; gap: 12px; margin-top: 14px; min-width: 0; padding: 12px; }
        .club-formSection { background: rgba(255,255,255,.96); border: 1px solid rgba(15,23,42,.08); border-radius: 18px; box-shadow: 0 14px 34px rgba(15,23,42,.045); display: grid; gap: 12px; padding: 16px; }
        .club-formSection--soft { background: linear-gradient(135deg, #fff, color-mix(in srgb, var(--club-admin-accent) 5%, white)); border-color: color-mix(in srgb, var(--club-admin-accent) 16%, transparent); }
        .club-formSection--highlight { background: linear-gradient(135deg, color-mix(in srgb, var(--club-admin-accent) 6%, white), #fff); border-color: color-mix(in srgb, var(--club-admin-accent) 20%, transparent); }
        .club-formSectionHead { align-items: start; display: flex; gap: 12px; justify-content: space-between; }
        .club-formSectionHead p { color: #64748b; font-size: 12px; font-weight: 780; line-height: 1.4; margin: 0; max-width: 420px; }
        .club-formSectionGrid { display: grid; gap: 8px; grid-template-columns: repeat(12, minmax(0, 1fr)); }
        .club-formSectionGrid--nested { margin-top: 8px; }
        .club-tiebreakerGrid { display: grid; gap: 8px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
        .club-inlineNote--compact { margin-top: 8px; padding: 8px 10px; }
        .club-field { color: #17253f; display: grid; font-size: 13px; font-weight: 900; gap: 6px; min-width: 0; }
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
        .club-courtsToggle { align-self: end; }
        .club-courtsToggleButton { align-items: center; background: #fff; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 34%, transparent); border-radius: 999px; color: #061b3a; cursor: pointer; display: flex; gap: 10px; justify-content: space-between; min-height: 36px; padding: 7px 12px; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; width: 100%; }
        .club-courtsToggleButton:hover, .club-courtsToggleButton[aria-expanded="true"] { border-color: color-mix(in srgb, var(--club-admin-accent) 54%, transparent); box-shadow: 0 0 0 3px var(--club-admin-soft); }
        .club-courtsToggleButton span { color: #17253f; font-size: 13px; font-weight: 950; }
        .club-courtsToggleButton small { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 4px 8px; white-space: nowrap; }
        .club-courtsPanel { background: rgba(255,255,255,.54); border: 1px solid rgba(148,163,184,.14); border-radius: 14px; display: grid; gap: 10px; padding: 10px; }
        .club-courtsPanel > p { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; margin: 0; }
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
        .club-scheduleCapacity { align-content: center; background: color-mix(in srgb, var(--club-admin-accent) 7%, white); border: 1px solid color-mix(in srgb, var(--club-admin-accent) 18%, transparent); border-radius: 12px; padding: 8px 10px; }
        .club-scheduleCapacity strong { color: #17253f; font-size: 16px; line-height: 1; }
        .club-scheduleCapacity small { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-scheduleWindows { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .club-scheduleWindow { align-items: end; background: rgba(248,250,252,.64); border: 1px solid rgba(15,23,42,.06); border-radius: 12px; display: grid; gap: 8px; grid-template-columns: auto minmax(132px, 1fr) minmax(84px, .55fr) minmax(84px, .55fr); padding: 8px; }
        .club-scheduleWindow > strong { align-self: center; color: var(--club-admin-accent); font-size: 11px; font-weight: 950; }
        .club-courtList { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
        .club-courtChip { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 4px; grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; }
        .club-courtChip strong { color: #17253f; display: block; font-size: 13px; }
        .club-courtChip span { color: #64748b; font-size: 12px; font-weight: 700; }
        .club-courtChip small { background: color-mix(in srgb, var(--club-admin-accent) 12%, white); border-radius: 999px; color: #061b3a; font-size: 11px; font-weight: 900; padding: 4px 8px; }
        .club-chipRemove { background: none; border: none; color: #c2410c; cursor: pointer; font-size: 12px; font-weight: 900; justify-self: end; padding: 0; }
        .club-emptyInline { background: rgba(248,250,252,.9); border: 1px dashed rgba(148,163,184,.36); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 800; padding: 12px; }
        .club-formActions { display: flex; flex-wrap: wrap; gap: 8px; grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
        .club-primaryBtn, .club-secondaryBtn { align-items: center; border-radius: 999px; cursor: pointer; display: inline-flex; font-weight: 950; justify-content: center; min-height: 38px; padding: 8px 14px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; white-space: nowrap; }
        .club-primaryBtn { background: #061b3a; border: 1px solid color-mix(in srgb, var(--club-admin-accent) 38%, transparent); box-shadow: 0 12px 28px var(--club-admin-glow); color: #fff; }
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
        @media (max-width: 720px) {
          .club-newHead { display: grid; }
          .club-formSectionHead { display: grid; }
          .club-formSectionGrid, .club-tiebreakerGrid, .club-pointsGrid, .club-formCard, .club-scheduleWindows, .club-scheduleWindow { grid-template-columns: 1fr; }
          .club-field--span2, .club-field--span3, .club-field--span4, .club-field--span6, .club-field--span8 { grid-column: auto; }
          .club-disclosure--button { align-self: stretch; }
          .club-formActions { justify-content: stretch; }
          .club-formActions > * { width: 100%; }
          .club-formSectionGrid--nested > label:nth-of-type(1),
          .club-formSectionGrid--nested > label:nth-of-type(2),
          .club-formSectionGrid--nested > .club-courtComposer { grid-column: auto; }
          .club-courtComposer { min-height: 0; }
          .flyerBlockHead, .flyerLayout, .flyerControlRow, .flyerControlRow--colors, .flyerControlRow--selects, .flyerPreviewMeta { grid-template-columns: 1fr; }
          .flyerVisibleGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .flyerBlockHead { display: grid; }
          .flyerPreview { min-height: 420px; }
          .flyerPreviewMetaItem--deadline { grid-column: auto; }
        }
      `}</style>
    </div>
  )
}
