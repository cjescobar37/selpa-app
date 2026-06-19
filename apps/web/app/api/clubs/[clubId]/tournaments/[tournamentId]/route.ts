import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeScheduleConfig, normalizeTournamentCourts } from '@/lib/tournamentSchedule'
import { normalizeGroupTiebreakerConfig } from '@/lib/tournamentTiebreakers'

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
  segment_type?: unknown
  public_description?: unknown
  competition_system?: unknown
  venue_name?: unknown
  tournament_courts?: unknown
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
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

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function buildFlyerRules(value: unknown) {
  const flyer = normalizeObject(value)

  const flyerMode = normalizeText(flyer.flyer_mode)
  const flyerBackground = normalizeText(flyer.flyer_background)
  const flyerTitleColor = normalizeText(flyer.flyer_title_color)
  const flyerTextColor = normalizeText(flyer.flyer_text_color)
  const flyerAccentColor = normalizeText(flyer.flyer_accent_color)
  const flyerFont = normalizeText(flyer.flyer_font)
  const flyerStyle = normalizeText(flyer.flyer_style)

  return {
    flyer_mode: flyerMode ?? 'NONE',
    flyer_background: flyerBackground ?? 'fondo1',
    flyer_title_color: flyerTitleColor ?? '#f8fafc',
    flyer_text_color: flyerTextColor ?? '#e2e8f0',
    flyer_accent_color: flyerAccentColor ?? '#67e8f9',
    flyer_font: flyerFont ?? 'SPORT',
    flyer_style: flyerStyle ?? 'MODERN',
  }
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
  if (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 7) return { error: 'La categoría debe estar entre 1 y 7.' }
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
      startDate,
      endDate,
      registrationDeadline,
      pricePerPlayer,
      minPairs,
      maxPairs,
    },
  }
}

async function getTournamentRegistrationIds(tournamentId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('tournament_registrations')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)

  if (error) throw error
  return (data ?? []).map((row) => String(row.id)).filter(Boolean)
}

async function deleteRows(table: string, filters: Record<string, string>) {
  let query = supabaseAdmin
    .from(table)
    .delete()

  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value)
  })

  const { error } = await query
  if (error) throw error
}

async function cleanupTournamentDataForDelete(tournamentId: string, clubId: string) {
  const registrationIds = await getTournamentRegistrationIds(tournamentId, clubId)

  if (registrationIds.length > 0) {
    const { error: paymentsError } = await supabaseAdmin
      .from('payments')
      .delete()
      .in('registration_id', registrationIds)

    if (paymentsError) throw paymentsError
  }

  await deleteRows('tournament_team_seed_snapshots', { tournament_id: tournamentId, club_id: clubId })
  await deleteRows('tournament_group_teams', { tournament_id: tournamentId })
  await deleteRows('tournament_groups', { tournament_id: tournamentId })
  await deleteRows('tournament_matches', { tournament_id: tournamentId, club_id: clubId })
  await deleteRows('tournament_registrations', { tournament_id: tournamentId, club_id: clubId })
  await deleteRows('tournament_teams', { tournament_id: tournamentId, club_id: clubId })
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
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para gestionar este torneo.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as UpdateDraftInput
    const action = String(body.action ?? '').trim()
    if (
      action !== 'publish' &&
      action !== 'update_tournament_courts' &&
      action !== 'update_draft' &&
      action !== 'delete_tournament' &&
      action !== 'cancel_tournament'
    ) {
      return NextResponse.json({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, { status: 400 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,rules_json,rules,updated_at')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.', code: 'TOURNAMENT_NOT_FOUND' }, { status: 404 })
    }

    const current = tournament as TournamentRow
    if (action === 'delete_tournament') {
      await cleanupTournamentDataForDelete(tournamentId, clubId)

      const { error: deleteError } = await supabaseAdmin
        .from('tournaments')
        .delete()
        .eq('id', tournamentId)
        .eq('club_id', clubId)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
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
        error: action === 'publish' ? 'Solo se puede publicar un torneo en borrador.' : 'Solo se puede editar un torneo en borrador.',
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
      const flyerRules = buildFlyerRules(body.flyer)
      const tournamentConfigRules = buildTournamentConfigRules(body)
      const currentRules = normalizeObject(current.rules_json ?? current.rules ?? {})
      const payload: Record<string, unknown> = {
        name: draft.name,
        type: draft.type,
        tournament_type: draft.type,
        gender: draft.gender,
        segment: tournamentConfigRules.segment_type,
        category_id: draft.categoryId,
        category: draft.categoryId,
        category_rule: 'FIXED_CATEGORY',
        fixed_category_id: draft.categoryId,
        category_sum_target: null,
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

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('tournaments')
      .update({
        status: 'OPEN',
        updated_at: updatedAt,
      })
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .select('id,club_id,name,status,updated_at')
      .maybeSingle()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, tournament: updated })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error actualizando torneo.') }, { status: 500 })
  }
}
