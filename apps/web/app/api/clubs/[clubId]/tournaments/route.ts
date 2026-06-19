import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { normalizeScheduleConfig, normalizeTournamentCourts } from '@/lib/tournamentSchedule'
import { normalizeGroupTiebreakerConfig } from '@/lib/tournamentTiebreakers'

type TournamentRow = {
  id: string
  club_id: string
  name: string
  status: string
  type: string | null
  tournament_type: string | null
  format: string | null
  gender: string | null
  segment: string | null
  category_id: number | null
  category: number | null
  start_date: string | null
  starts_on: string | null
  end_date: string | null
  ends_on: string | null
  registration_deadline: string | null
  signup_deadline: string | null
  min_pairs: number | null
  max_pairs: number | null
  price_per_player: number | null
  rules_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type CategoryRow = {
  id: number
  name: string
}

type CreateTournamentInput = {
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

function getStartDate(row: TournamentRow) {
  return row.starts_on ?? row.start_date ?? null
}

function getEndDate(row: TournamentRow) {
  return row.ends_on ?? row.end_date ?? null
}

function getRegistrationDeadline(row: TournamentRow) {
  return row.registration_deadline ?? row.signup_deadline ?? null
}

function getTournamentType(row: TournamentRow) {
  return row.tournament_type ?? row.type ?? null
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

function buildTournamentConfigRules(value: CreateTournamentInput) {
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

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para ver torneos del club.' }, { status: 403 })
    }

    const { data: tournaments, error: tournamentsError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,type,tournament_type,format,gender,segment,category_id,category,start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,min_pairs,max_pairs,price_per_player,rules_json,created_at,updated_at')
      .eq('club_id', clubId)
      .order('start_date', { ascending: false })
      .limit(100)

    if (tournamentsError) {
      return NextResponse.json({ error: tournamentsError.message }, { status: 500 })
    }

    const rows = (tournaments ?? []) as TournamentRow[]
    const categoryIds = Array.from(new Set(rows.map((row) => row.category_id ?? row.category).filter((id): id is number => Number.isFinite(id))))

    let categories = new Map<number, string>()
    if (categoryIds.length > 0) {
      const { data: categoryRows, error: categoriesError } = await supabaseAdmin
        .from('categories')
        .select('id,name')
        .in('id', categoryIds)

      if (categoriesError) {
        return NextResponse.json({ error: categoriesError.message }, { status: 500 })
      }

      categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((category) => [category.id, category.name]))
    }

    return NextResponse.json({
      tournaments: rows.map((row) => {
        const categoryId = row.category_id ?? row.category
        return {
          id: row.id,
          name: row.name,
          status: row.status,
          type: getTournamentType(row),
          format: row.format,
          gender: row.gender,
          segment: row.segment ?? row.rules_json?.segment_type ?? 'LIBRES',
          category_id: categoryId,
          category_name: categoryId ? categories.get(categoryId) ?? `Categoría ${categoryId}` : null,
          start_date: getStartDate(row),
          end_date: getEndDate(row),
          registration_deadline: getRegistrationDeadline(row),
          min_pairs: row.min_pairs,
          max_pairs: row.max_pairs,
          price_per_player: row.price_per_player,
          rules_json: row.rules_json ?? {},
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      }),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo torneos del club.') }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para crear torneos en este club.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as CreateTournamentInput
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
    const flyerRules = buildFlyerRules(body.flyer)
    const tournamentConfigRules = buildTournamentConfigRules(body)

    if (!name) {
      return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
    }

    if (!tournamentTypes.includes(type as typeof tournamentTypes[number])) {
      return NextResponse.json({ error: 'Tipo de torneo inválido.' }, { status: 400 })
    }

    if (!tournamentGenders.includes(gender as typeof tournamentGenders[number])) {
      return NextResponse.json({ error: 'Género de torneo inválido.' }, { status: 400 })
    }

    if (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 7) {
      return NextResponse.json({ error: 'La categoría debe estar entre 1 y 7.' }, { status: 400 })
    }

    if (!startDate) {
      return NextResponse.json({ error: 'La fecha de inicio es obligatoria.' }, { status: 400 })
    }

    if (endDate && endDate < startDate) {
      return NextResponse.json({ error: 'La fecha fin no puede ser anterior al inicio.' }, { status: 400 })
    }

    if (registrationDeadline && registrationDeadline.slice(0, 10) > startDate) {
      return NextResponse.json({ error: 'El cierre de inscripción no puede ser posterior al inicio.' }, { status: 400 })
    }

    if (!Number.isFinite(pricePerPlayer) || pricePerPlayer < 0) {
      return NextResponse.json({ error: 'El precio debe ser un número mayor o igual a 0.' }, { status: 400 })
    }

    if (!Number.isInteger(minPairs) || minPairs < 2) {
      return NextResponse.json({ error: 'El mínimo de parejas debe ser al menos 2.' }, { status: 400 })
    }

    if (maxPairs !== null && (!Number.isInteger(maxPairs) || maxPairs < minPairs)) {
      return NextResponse.json({ error: 'El máximo de parejas debe ser mayor o igual al mínimo.' }, { status: 400 })
    }

    const rulesPayload = {
      wo_tolerance_minutes: 10,
      wo_score: '6-0 6-0',
      ...tournamentConfigRules,
      ...flyerRules,
    }

    const payload: Record<string, unknown> = {
      club_id: clubId,
      name,
      type,
      tournament_type: type,
      format: 'GROUPS_ELIMINATION',
      gender,
      segment: tournamentConfigRules.segment_type,
      category_id: categoryId,
      category: categoryId,
      category_rule: 'FIXED_CATEGORY',
      fixed_category_id: categoryId,
      category_sum_target: null,
      start_date: startDate,
      starts_on: startDate,
      status: 'DRAFT',
      price_per_player: pricePerPlayer,
      min_pairs: minPairs,
      points_total: 0,
      rules: rulesPayload,
      rules_json: rulesPayload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (endDate) {
      payload.end_date = endDate
      payload.ends_on = endDate
    }

    if (registrationDeadline) {
      payload.registration_deadline = registrationDeadline
      payload.signup_deadline = registrationDeadline
    }

    if (maxPairs !== null) {
      payload.max_pairs = maxPairs
    }

    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .insert(payload)
      .select('id,name,status,type,tournament_type,gender,segment,category_id,category,start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,min_pairs,max_pairs,price_per_player,created_at,updated_at')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, tournament: data }, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error creando torneo del club.') }, { status: 500 })
  }
}
