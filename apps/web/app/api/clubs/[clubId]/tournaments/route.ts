import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { mapTournamentError } from '@/lib/tournamentErrors'
import { getTournamentCircuitContexts } from '@/features/competition/events/competition-events.repository'

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

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId } = await context.params
    const canManage = await userHasClubCapability(user.id, clubId, 'tournaments:view')
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
    const circuitContexts = await getTournamentCircuitContexts(supabaseAdmin, clubId, rows.map((row) => row.id))
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
          circuit: circuitContexts[row.id] ?? null,
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
    const canManage = await userHasClubCapability(user.id, clubId, 'tournaments:create')
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para crear torneos en este club.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const idempotencyKey = req.headers.get('idempotency-key')?.trim() ?? ''
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return NextResponse.json({ error: 'La solicitud de creación es inválida. Volvé a intentarlo.', code: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 })
    }
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey || !token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await userClient.rpc('create_tournament_canonical', {
      p_club_id: clubId,
      p_payload: body,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      const mapped = mapTournamentError(error, 'No pudimos crear el torneo. Revisá los datos e intentá nuevamente.')
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status === 500 ? 400 : mapped.status })
    }
    return NextResponse.json({ ok: true, tournament: data }, { status: 201 })
  } catch (error: unknown) {
    const mapped = mapTournamentError(error, 'No pudimos crear el torneo. Intentá nuevamente.')
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
}
