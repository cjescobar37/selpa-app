import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import type { ClubCapability } from '@/lib/clubPermissions'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeScheduleConfig, normalizeTournamentCourts } from '@/lib/tournamentSchedule'
import { normalizeGroupTiebreakerConfig } from '@/lib/tournamentTiebreakers'
import { mapTournamentError } from '@/lib/tournamentErrors'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  status: string | null
  rules_json: Record<string, unknown> | null
  rules: Record<string, unknown> | null
  updated_at: string | null
}

type UpdateDraftInput = {
  action?: unknown
  reason?: unknown
  name?: unknown
  type?: unknown
  gender?: unknown
  segment?: unknown
  category_id?: unknown
  category_rule?: unknown
  category_sum_target?: unknown
  age_category_id?: unknown
  segment_type?: unknown
  public_description?: unknown
  competition_system?: unknown
  venue_name?: unknown
  tournament_courts?: unknown
  court_ids?: unknown
  primary_venue_id?: unknown
  schedule_config?: unknown
  points_config?: unknown
  group_tiebreakers?: unknown
  start_date?: unknown
  end_date?: unknown
  registration_deadline?: unknown
  price_per_player?: unknown
  min_pairs?: unknown
  max_pairs?: unknown
  flyer?: unknown
}

const tournamentTypes = ['OPEN', 'CHALLENGER', 'MASTER', 'MASTER_FINAL'] as const
const tournamentGenders = ['MALE', 'FEMALE', 'MIXED'] as const
const tournamentSegments = ['LIBRES', 'MENORES', 'VETERANOS'] as const
const competitionSystems = ['GROUPS_PLAYOFF', 'ROUND_ROBIN', 'SINGLE_ELIMINATION'] as const

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function normalizeDateTime(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null
  return text
}

function normalizeNumber(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function normalizeInteger(value: unknown, fallback: number) {
  const parsed = normalizeNumber(value, fallback)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN
}

function normalizeObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function buildFlyerRules(value: unknown) {
  const flyer = normalizeObject(value)
  const nullableInteger = (input: unknown) => {
    if (input === null || input === undefined || input === '') return null
    const parsed = Number(input)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }

  const flyerMode = normalizeText(flyer.flyer_mode)
  const flyerBackground = normalizeText(flyer.flyer_background)
  const flyerTitleColor = normalizeText(flyer.flyer_title_color)
  const flyerTextColor = normalizeText(flyer.flyer_text_color)
  const flyerAccentColor = normalizeText(flyer.flyer_accent_color)
  const flyerBadgeColor = normalizeText(flyer.flyer_badge_color)
  const flyerDateBlockColor = normalizeText(flyer.flyer_date_block_color)
  const flyerDataCardColor = normalizeText(flyer.flyer_data_card_color)
  const flyerDataStyle = normalizeText(flyer.flyer_data_style)
  const flyerTitleSize = normalizeText(flyer.flyer_title_size)
  const flyerFont = normalizeText(flyer.flyer_font)
  const flyerFontWeight = normalizeText(flyer.flyer_font_weight)
  const flyerStyle = normalizeText(flyer.flyer_style)
  const flyerTextAlign = normalizeText(flyer.flyer_text_align)
  const flyerManualUrl = normalizeText(flyer.flyer_manual_url)
  const isManual = flyerMode === 'MANUAL'

  return {
    flyer_mode: flyerMode ?? 'NONE',
    flyer_background: flyerBackground ?? 'fondo1',
    flyer_title_color: flyerTitleColor ?? '#f8fafc',
    flyer_text_color: flyerTextColor ?? '#e2e8f0',
    flyer_accent_color: flyerAccentColor ?? '#67e8f9',
    flyer_badge_color: flyerBadgeColor ?? '#06b6d4',
    flyer_date_block_color: flyerDateBlockColor ?? '#0891b2',
    flyer_data_card_color: flyerDataCardColor ?? '#0f172a',
    flyer_data_card_opacity: Math.min(1, Math.max(0, normalizeNumber(flyer.flyer_data_card_opacity, 0.72))),
    flyer_data_card_radius: Math.min(28, Math.max(8, normalizeInteger(flyer.flyer_data_card_radius, 16))),
    flyer_data_style: flyerDataStyle ?? 'GLASS',
    flyer_title_size: flyerTitleSize ?? 'LARGE',
    flyer_visible_fields: normalizeObject(flyer.flyer_visible_fields),
    flyer_font: flyerFont ?? 'SPORT',
    flyer_font_weight: flyerFontWeight ?? 'MEDIUM',
    flyer_style: flyerStyle ?? 'MODERN',
    flyer_text_align: flyerTextAlign ?? 'left',
    flyer_manual_url: isManual ? flyerManualUrl : null,
    flyer_url: isManual ? flyerManualUrl : null,
    poster_url: isManual ? flyerManualUrl : null,
    flyer_manual_name: isManual ? normalizeText(flyer.flyer_manual_name) : null,
    flyer_manual_size: isManual ? nullableInteger(flyer.flyer_manual_size) : null,
    flyer_manual_width: isManual ? nullableInteger(flyer.flyer_manual_width) : null,
    flyer_manual_height: isManual ? nullableInteger(flyer.flyer_manual_height) : null,
  }
}

async function validateAgeCategorySelection(clubId: string, segment: string, ageCategoryId: string | null) {
  if (segment === 'LIBRES') return ageCategoryId ? 'Libres no admite categoría de edad.' : null
  if (!ageCategoryId) return 'Seleccioná una categoría de edad.'
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ageCategoryId)) return 'La categoría de edad es inválida.'
  const { data, error } = await supabaseAdmin.from('competition_age_categories')
    .select('id,min_age,max_age,is_active,age_reference_rule').eq('id', ageCategoryId).eq('club_id', clubId).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active) return 'La categoría de edad no está disponible para este club.'
  if (!['EVENT_START_DATE', 'CALENDAR_YEAR_END', 'FIXED_DATE'].includes(String(data.age_reference_rule))) return 'La regla de edad no es compatible con un torneo independiente.'
  if (segment === 'MENORES' && (data.max_age === null || Number(data.max_age) > 18)) return 'Seleccioná una categoría configurada para menores.'
  if (segment === 'VETERANOS' && (data.min_age === null || Number(data.min_age) < 18)) return 'Seleccioná una categoría configurada para veteranos.'
  return null
}

function buildTournamentConfigRules(value: UpdateDraftInput) {
  const segmentType = normalizeText(value.segment_type ?? value.segment) ?? 'LIBRES'
  const publicDescription = normalizeText(value.public_description)
  const competitionSystem = normalizeText(value.competition_system) ?? 'GROUPS_PLAYOFF'
  const venueName = normalizeText(value.venue_name)
  const tournamentCourts = normalizeTournamentCourts(value.tournament_courts)
  const scheduleConfig = normalizeScheduleConfig(value.schedule_config, {
    startDate: normalizeDate(value.start_date) ?? '',
    endDate: normalizeDate(value.end_date) ?? normalizeDate(value.start_date) ?? '',
  })
  const pointsConfig = normalizeObject(value.points_config)
  const groupTiebreakers = value.group_tiebreakers === undefined
    ? null
    : normalizeGroupTiebreakerConfig(value.group_tiebreakers)

  const normalizedSegment = tournamentSegments.includes(segmentType as typeof tournamentSegments[number])
    ? segmentType
    : 'LIBRES'
  const normalizedCompetitionSystem = competitionSystems.includes(competitionSystem as typeof competitionSystems[number])
    ? competitionSystem
    : 'GROUPS_PLAYOFF'

  return {
    segment_type: normalizedSegment,
    public_description: publicDescription,
    competition_system: normalizedCompetitionSystem,
    venue_name: venueName,
    tournament_courts: tournamentCourts,
    schedule_config: scheduleConfig,
    points_config: {
      enabled: Boolean(pointsConfig.enabled),
      editable: Boolean(pointsConfig.editable),
      winner: normalizeInteger(pointsConfig.winner, 0),
      finalist: normalizeInteger(pointsConfig.finalist, 0),
      semifinalist: normalizeInteger(pointsConfig.semifinalist, 0),
      quarterfinalist: normalizeInteger(pointsConfig.quarterfinalist, 0),
      eighthFinalist: normalizeInteger(pointsConfig.eighthFinalist, 0),
      participation: normalizeInteger(pointsConfig.participation, 0),
    },
    ...(groupTiebreakers ? { group_tiebreakers: groupTiebreakers } : {}),
  }
}

function validateDraftPayload(body: UpdateDraftInput) {
  const name = normalizeText(body.name)
  const type = normalizeText(body.type) ?? 'OPEN'
  const gender = normalizeText(body.gender) ?? 'MALE'
  const categoryId = normalizeInteger(body.category_id, 0)
  const segmentType = normalizeText(body.segment_type ?? body.segment) ?? 'LIBRES'
  const categoryRule = normalizeText(body.category_rule) === 'CATEGORY_SUM' ? 'CATEGORY_SUM' : 'FIXED_CATEGORY'
  const categorySumTarget = normalizeInteger(body.category_sum_target, 0)
  const ageCategoryId = normalizeText(body.age_category_id)
  const startDate = normalizeDate(body.start_date)
  const endDate = normalizeDate(body.end_date)
  const registrationDeadline = normalizeDateTime(body.registration_deadline)
  const pricePerPlayer = normalizeNumber(body.price_per_player, 0)
  const minPairs = normalizeInteger(body.min_pairs, 6)
  const maxPairs = body.max_pairs === '' || body.max_pairs === null || body.max_pairs === undefined
    ? null
    : normalizeInteger(body.max_pairs, NaN)

  if (!name) return { error: 'El nombre es obligatorio.' }
  if (!tournamentTypes.includes(type as typeof tournamentTypes[number])) return { error: 'Tipo de torneo inválido.' }
  if (!tournamentGenders.includes(gender as typeof tournamentGenders[number])) return { error: 'Género de torneo inválido.' }
  if (segmentType === 'LIBRES' && categoryRule === 'FIXED_CATEGORY' && (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 8)) return { error: 'La categoría debe estar entre 1 y 8.' }
  if (segmentType !== 'LIBRES' && categoryRule === 'CATEGORY_SUM') return { error: 'Suma XX solo está disponible para Libres.' }
  if (categoryRule === 'CATEGORY_SUM' && (!Number.isInteger(categorySumTarget) || categorySumTarget < 2 || categorySumTarget > 16)) return { error: 'La suma debe estar entre 2 y 16.' }
  if (!startDate) return { error: 'La fecha de inicio es obligatoria.' }
  if (endDate && endDate < startDate) return { error: 'La fecha fin no puede ser anterior al inicio.' }
  if (registrationDeadline && registrationDeadline.slice(0, 10) > startDate) return { error: 'El cierre de inscripción no puede ser posterior al inicio.' }
  if (!Number.isFinite(pricePerPlayer) || pricePerPlayer < 0) return { error: 'El precio debe ser un número mayor o igual a 0.' }
  if (!Number.isInteger(minPairs) || minPairs < 2) return { error: 'El mínimo de parejas debe ser al menos 2.' }
  if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) return { error: 'El máximo de parejas debe ser mayor o igual al mínimo.' }

  return {
    value: {
      name,
      type,
      gender,
      categoryId,
      categoryRule,
      categorySumTarget,
      ageCategoryId,
      segmentType,
      startDate,
      endDate,
      registrationDeadline,
      pricePerPlayer,
      minPairs,
      maxPairs,
    },
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const body = (await req.json().catch(() => ({}))) as UpdateDraftInput
    const action = String(body.action ?? '').trim()
    if (
      action !== 'publish' &&
      action !== 'update_tournament_courts' &&
      action !== 'replace_tournament_court_assignments' &&
      action !== 'update_draft' &&
      action !== 'pause_tournament' &&
      action !== 'resume_tournament' &&
      action !== 'delete_tournament' &&
      action !== 'cancel_tournament' &&
      action !== 'finalize_tournament'
    ) {
      return NextResponse.json({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, { status: 400 })
    }

    const capabilityByAction: Record<string, ClubCapability> = {
      publish: 'tournaments:publish',
      update_tournament_courts: 'tournaments:update',
      replace_tournament_court_assignments: 'tournaments:update',
      update_draft: 'tournaments:update',
      pause_tournament: 'tournaments:update',
      resume_tournament: 'tournaments:update',
      delete_tournament: 'tournaments:delete',
      cancel_tournament: 'tournaments:cancel',
      finalize_tournament: 'tournaments:update',
    }
    const canManage = await userHasClubCapability(user.id, clubId, capabilityByAction[action])
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para gestionar este torneo.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,rules_json,rules,updated_at')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      const mapped = mapTournamentError(tournamentError, 'No pudimos consultar este torneo. Intentá nuevamente.')
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.', code: 'TOURNAMENT_NOT_FOUND' }, { status: 404 })
    }

    const current = tournament as TournamentRow
    if (action === 'publish' || action === 'finalize_tournament') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey || !token) {
        return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
      }
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await userClient.rpc(
        action === 'publish' ? 'publish_tournament_atomic' : 'finalize_tournament_atomic',
        { p_club_id: clubId, p_tournament_id: tournamentId }
      )
      if (error) {
        const mapped = mapTournamentError(
          error,
          action === 'publish' ? 'No pudimos publicar el torneo.' : 'No pudimos finalizar el torneo.'
        )
        return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
      }
      return NextResponse.json({ ok: true, tournament: data })
    }
    if (action === 'pause_tournament' || action === 'resume_tournament') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey || !token) return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await userClient.rpc(action === 'pause_tournament' ? 'pause_tournament' : 'resume_tournament', {
        p_club_id: clubId,
        p_tournament_id: tournamentId,
      })
      if (error) {
        const mapped = mapTournamentError(error, action === 'pause_tournament' ? 'No pudimos pausar el torneo.' : 'No pudimos reanudar el torneo.')
        return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
      }
      return NextResponse.json({ ok: true, tournament: data })
    }
    if (action === 'delete_tournament') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey || !token) {
        return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
      }
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error: deleteError } = await userClient.rpc('delete_tournament_draft_atomic', {
        p_club_id: clubId,
        p_tournament_id: tournamentId,
      })

      if (deleteError) {
        const mapped = mapTournamentError(deleteError, 'No pudimos eliminar el torneo. Intentá nuevamente.')
        return NextResponse.json({ error: mapped.message, code: mapped.code === 'TOURNAMENT_OPERATION_FAILED' ? 'TOURNAMENT_DELETE_FAILED' : mapped.code }, { status: mapped.status })
      }

      return NextResponse.json({ ok: true, deleted: true, tournamentId })
    }

    if (action === 'cancel_tournament') {
      const reason = normalizeText(body.reason)
      if (!reason) {
        return NextResponse.json({
          error: 'El motivo de cancelación es obligatorio.',
          code: 'CANCELLATION_REASON_REQUIRED',
        }, { status: 400 })
      }

      if (String(current.status ?? '').toUpperCase() === 'CANCELLED') {
        return NextResponse.json({
          error: 'Este torneo ya está cancelado.',
          code: 'INVALID_STATUS_TRANSITION',
        }, { status: 409 })
      }

      const updatedAt = new Date().toISOString()
      const currentRules = normalizeObject(current.rules_json ?? current.rules ?? {})
      const currentAdminRules = normalizeObject(currentRules.tournament_admin)
      const nextRules = {
        ...currentRules,
        tournament_admin: {
          ...currentAdminRules,
          cancellation_reason: reason,
          cancelled_at: updatedAt,
          cancelled_by: user.id,
        },
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tournaments')
        .update({
          status: 'CANCELLED',
          rules_json: nextRules,
          rules: nextRules,
          updated_at: updatedAt,
        })
        .eq('id', tournamentId)
        .eq('club_id', clubId)
        .select('id,club_id,name,status,updated_at,rules_json,rules')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, tournament: updated })
    }

    if (action === 'replace_tournament_court_assignments') {
      const primaryVenueId = normalizeText(body.primary_venue_id)
      const courtIds = Array.isArray(body.court_ids)
        ? body.court_ids.map((value) => normalizeText(value)).filter((value): value is string => Boolean(value))
        : []
      if (!primaryVenueId) {
        return NextResponse.json({ error: 'La sede principal es obligatoria.', code: 'VALIDATION_ERROR' }, { status: 400 })
      }
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey || !token) return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await userClient.rpc('replace_tournament_court_assignments', {
        p_club_id: clubId,
        p_tournament_id: tournamentId,
        p_primary_venue_id: primaryVenueId,
        p_court_ids: courtIds,
      })
      if (error) {
        const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400
        return NextResponse.json({ error: error.message, code: 'COURT_ASSIGNMENT_FAILED' }, { status })
      }
      return NextResponse.json({ ok: true, assignment: data })
    }

    if (action === 'update_tournament_courts') {
      const updatedAt = new Date().toISOString()
      const currentRules = normalizeObject(current.rules_json ?? current.rules ?? {})
      const tournamentCourts = normalizeTournamentCourts(body.tournament_courts)
      const venueName = normalizeText(body.venue_name)
      const nextRules = {
        ...currentRules,
        ...(venueName !== null ? { venue_name: venueName } : {}),
        tournament_courts: tournamentCourts,
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tournaments')
        .update({
          rules_json: nextRules,
          rules: nextRules,
          updated_at: updatedAt,
        })
        .eq('id', tournamentId)
        .eq('club_id', clubId)
        .select('id,club_id,name,status,updated_at,rules_json,rules')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, tournament: updated })
    }

    if (String(current.status ?? '').toUpperCase() !== 'DRAFT') {
      return NextResponse.json({
        error: 'Solo se puede editar un torneo en borrador.',
        code: 'INVALID_STATUS_TRANSITION',
      }, { status: 409 })
    }

    const updatedAt = new Date().toISOString()
    if (action === 'update_draft') {
      const validation = validateDraftPayload(body)
      if ('error' in validation) {
        return NextResponse.json({ error: validation.error, code: 'VALIDATION_ERROR' }, { status: 400 })
      }

      const draft = validation.value
      const ageCategoryError = await validateAgeCategorySelection(clubId, draft.segmentType, draft.ageCategoryId)
      if (ageCategoryError) return NextResponse.json({ error: ageCategoryError, code: 'VALIDATION_ERROR' }, { status: 400 })
      const flyerRules = buildFlyerRules(body.flyer)
      const tournamentConfigRules = buildTournamentConfigRules(body)
      const currentRules = normalizeObject(current.rules_json ?? current.rules ?? {})
      const payload: Record<string, unknown> = {
        name: draft.name,
        type: draft.type,
        tournament_type: draft.type,
        gender: draft.gender,
        segment: tournamentConfigRules.segment_type,
        category_id: draft.segmentType === 'LIBRES' ? draft.categoryId : null,
        category: draft.segmentType === 'LIBRES' ? draft.categoryId : null,
        category_rule: draft.categoryRule,
        fixed_category_id: draft.segmentType === 'LIBRES' && draft.categoryRule === 'FIXED_CATEGORY' ? draft.categoryId : null,
        category_sum_target: draft.categoryRule === 'CATEGORY_SUM' ? draft.categorySumTarget : null,
        age_category_id: draft.segmentType === 'LIBRES' ? null : draft.ageCategoryId,
        start_date: draft.startDate,
        starts_on: draft.startDate,
        end_date: draft.endDate,
        ends_on: draft.endDate,
        registration_deadline: draft.registrationDeadline,
        signup_deadline: draft.registrationDeadline,
        price_per_player: draft.pricePerPlayer,
        min_pairs: draft.minPairs,
        max_pairs: draft.maxPairs,
        rules_json: {
          ...currentRules,
          ...tournamentConfigRules,
          ...flyerRules,
        },
        rules: {
          ...currentRules,
          ...tournamentConfigRules,
          ...flyerRules,
        },
        updated_at: updatedAt,
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tournaments')
        .update(payload)
        .eq('id', tournamentId)
        .eq('club_id', clubId)
        .select('id,club_id,name,status,type,tournament_type,gender,segment,category_id,category,start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,min_pairs,max_pairs,price_per_player,updated_at')
        .maybeSingle()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, tournament: updated })
    }

    return NextResponse.json({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, { status: 400 })
  } catch (error: unknown) {
    const mapped = mapTournamentError(error, 'No pudimos actualizar el torneo. Intentá nuevamente.')
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
}
