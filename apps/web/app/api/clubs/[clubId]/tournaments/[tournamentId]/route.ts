import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
  name?: unknown
  type?: unknown
  gender?: unknown
  category_id?: unknown
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

async function countRows(table: string, filters: Record<string, string>) {
  let query = supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })

  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value)
  })

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function countPlayoffMatches(tournamentId: string, clubId: string) {
  const { count, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)
    .neq('phase', 'GROUP')

  if (error) throw error
  return count ?? 0
}

async function countPlayedFinals(tournamentId: string, clubId: string) {
  const { count, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)
    .eq('phase', 'FINAL')
    .eq('status', 'PLAYED')

  if (error) throw error
  return count ?? 0
}

async function countGroupMatches(tournamentId: string, clubId: string) {
  const { count, error } = await supabaseAdmin
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)
    .eq('phase', 'GROUP')

  if (error) throw error
  return count ?? 0
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

async function cleanupPrecompetitiveTournamentData(tournamentId: string, clubId: string) {
  const registrationIds = await getTournamentRegistrationIds(tournamentId, clubId)

  if (registrationIds.length > 0) {
    const { error: paymentsError } = await supabaseAdmin
      .from('payments')
      .delete()
      .in('registration_id', registrationIds)

    if (paymentsError) throw paymentsError
  }

  await deleteRows('tournament_team_seed_snapshots', { tournament_id: tournamentId, club_id: clubId })
  await deleteRows('tournament_registrations', { tournament_id: tournamentId, club_id: clubId })
  await deleteRows('tournament_teams', { tournament_id: tournamentId, club_id: clubId })
}

async function getTournamentDeleteBlockers(tournamentId: string, clubId: string) {
  const blockers: string[] = []

  const [
    groupsCount,
    groupMatchesCount,
    playoffMatchesCount,
    playedFinalsCount,
  ] = await Promise.all([
    countRows('tournament_groups', { tournament_id: tournamentId }),
    countGroupMatches(tournamentId, clubId),
    countPlayoffMatches(tournamentId, clubId),
    countPlayedFinals(tournamentId, clubId),
  ])

  if (groupsCount > 0) blockers.push('grupos')
  if (groupMatchesCount > 0) blockers.push('partidos_group')
  if (playoffMatchesCount > 0) blockers.push('playoff')
  if (playedFinalsCount > 0) blockers.push('final_jugada')

  return blockers
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
    if (action !== 'publish' && action !== 'update_draft' && action !== 'delete_tournament') {
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
      const blockers = await getTournamentDeleteBlockers(tournamentId, clubId)
      if (blockers.length > 0) {
        return NextResponse.json({
          error: 'No se puede eliminar este torneo porque ya tiene actividad competitiva.',
          code: 'TOURNAMENT_DELETE_NOT_ALLOWED',
          blockers,
        }, { status: 409 })
      }

      await cleanupPrecompetitiveTournamentData(tournamentId, clubId)

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
      const currentRules = normalizeObject(current.rules_json ?? current.rules ?? {})
      const payload: Record<string, unknown> = {
        name: draft.name,
        type: draft.type,
        tournament_type: draft.type,
        gender: draft.gender,
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
          ...flyerRules,
        },
        rules: {
          ...currentRules,
          ...flyerRules,
        },
        updated_at: updatedAt,
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('tournaments')
        .update(payload)
        .eq('id', tournamentId)
        .eq('club_id', clubId)
        .select('id,club_id,name,status,type,tournament_type,gender,category_id,category,start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,min_pairs,max_pairs,price_per_player,updated_at')
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
