import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeCompetitionCatalog } from '@/features/competition/catalogs/competition-catalogs.auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/features/competition/catalogs/competition-catalogs.validation'

type Context = { params: Promise<{ clubId: string }> }

type DivisionRow = {
  id: string
  season_id: string
  is_active: boolean
  branch: { name: string } | null
  segment: { name: string } | null
  category: { name: string; short_label: string } | null
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function authenticatedClient(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !key) return null
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
}

async function authorize(req: NextRequest, clubId: string) {
  // Gestión de catálogo: OWNER/ADMIN solamente, también para la lectura de esta pantalla.
  return authorizeCompetitionCatalog(req, clubId, 'write')
}

function mapDivision(row: DivisionRow, seasonName: string) {
  return {
    id: row.id,
    season_id: row.season_id,
    season: seasonName,
    gender_label: row.branch?.name ?? 'Género pendiente',
    group_label: row.segment?.name ?? null,
    category_label: row.category?.short_label || row.category?.name || null,
    is_active: row.is_active,
  }
}

export async function GET(req: NextRequest, context: Context) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return error('Club inválido.')
  const auth = await authorize(req, clubId)
  if (auth.error) return auth.error

  const seasonId = req.nextUrl.searchParams.get('season_id')
  const state = req.nextUrl.searchParams.get('state') === 'inactive' ? false : true

  const { data: seasons, error: seasonsError } = await supabaseAdmin
    .from('competition_seasons')
    .select('id,name,status')
    .eq('club_id', clubId)
    .in('status', ['DRAFT', 'ACTIVE'])
    .order('starts_on', { ascending: false })
  if (seasonsError) return error('No pudimos leer las temporadas del club.', 500)

  const selectedSeason = seasonId
    ? (seasons ?? []).find((season) => season.id === seasonId)
    : (seasons ?? []).find((season) => season.status === 'ACTIVE') ?? seasons?.[0]
  if (!selectedSeason) return error('No hay una temporada disponible para administrar divisiones.', 409)

  const [divisionsResult, branchesResult, segmentsResult, categoriesResult, agesResult] = await Promise.all([
    supabaseAdmin.from('competition_divisions')
      .select('id,season_id,is_active,branch:competition_branches(name),segment:competition_segments(name),category:competition_categories(name,short_label)')
      .eq('club_id', clubId).eq('season_id', selectedSeason.id).eq('modality', 'PAIRS').eq('is_active', state)
      .order('sort_order', { ascending: true }),
    supabaseAdmin.from('competition_branches').select('id,name,slug,is_active').eq('club_id', clubId).order('is_active', { ascending: false }).order('sort_order'),
    supabaseAdmin.from('competition_segments').select('id,name,slug,is_active').eq('club_id', clubId).order('is_active', { ascending: false }).order('sort_order'),
    supabaseAdmin.from('competition_categories').select('id,name,slug,short_label,is_active').eq('club_id', clubId).order('is_active', { ascending: false }).order('sort_order'),
    supabaseAdmin.from('competition_age_categories').select('id,name,code,min_age,max_age,is_active').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
  ])
  if (divisionsResult.error || branchesResult.error || segmentsResult.error || categoriesResult.error || agesResult.error) {
    return error('No pudimos cargar las divisiones del club.', 500)
  }

  return NextResponse.json({
    seasons: seasons ?? [],
    selected_season_id: selectedSeason.id,
    divisions: ((divisionsResult.data ?? []) as unknown as DivisionRow[]).map((division) => mapDivision(division, selectedSeason.name)),
    catalogs: {
      genders: branchesResult.data ?? [], groups: segmentsResult.data ?? [], categories: categoriesResult.data ?? [], age_categories: agesResult.data ?? [],
    },
  })
}

export async function POST(req: NextRequest, context: Context) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return error('Club inválido.')
  const auth = await authorize(req, clubId)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const seasonId = body?.season_id
  const branchId = body?.branch_id
  const segmentId = body?.segment_id
  const categoryId = body?.category_id
  if (![seasonId, branchId, segmentId].every(isUuid) || (categoryId !== null && categoryId !== undefined && categoryId !== '' && !isUuid(categoryId))) {
    return error('Completá temporada, género, grupo y categoría válida cuando corresponda.')
  }

  const [season, branch, segment, category] = await Promise.all([
    supabaseAdmin.from('competition_seasons').select('id').eq('id', seasonId).eq('club_id', clubId).in('status', ['DRAFT', 'ACTIVE']).maybeSingle(),
    supabaseAdmin.from('competition_branches').select('id').eq('id', branchId).eq('club_id', clubId).eq('is_active', true).maybeSingle(),
    supabaseAdmin.from('competition_segments').select('id').eq('id', segmentId).eq('club_id', clubId).eq('is_active', true).maybeSingle(),
    categoryId ? supabaseAdmin.from('competition_categories').select('id').eq('id', categoryId).eq('club_id', clubId).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (season.error || branch.error || segment.error || category.error) return error('No pudimos validar la división.', 500)
  if (!season.data || !branch.data || !segment.data || (categoryId && !category.data)) return error('La temporada o alguno de los catálogos ya no está disponible.', 409)

  const { data: duplicate, error: duplicateError } = await supabaseAdmin.from('competition_divisions')
    .select('id').eq('club_id', clubId).eq('season_id', seasonId).eq('modality', 'PAIRS').eq('branch_id', branchId).eq('segment_id', segmentId)
    .is('category_id', categoryId || null).maybeSingle()
  if (duplicateError) return error('No pudimos verificar si la división ya existe.', 500)
  if (duplicate) return error('Esta división ya existe para la temporada.', 409)

  const client = authenticatedClient(req)
  if (!client) return error('Sesión inválida.', 401)

  const { data: division, error: rpcError } = await client.rpc('ensure_competition_division', {
    p_club_id: clubId, p_season_id: seasonId, p_modality: 'PAIRS', p_branch_id: branchId,
    p_segment_id: segmentId, p_category_id: categoryId || null, p_name: null,
  })
  if (rpcError) {
    if (rpcError.code === '23505') return error('Esta división ya existe para la temporada.', 409)
    return error('No pudimos crear la división.', 500)
  }
  return NextResponse.json({ ok: true, division }, { status: 201 })
}

export async function PATCH(req: NextRequest, context: Context) {
  const { clubId } = await context.params
  if (!isUuid(clubId)) return error('Club inválido.')
  const auth = await authorize(req, clubId)
  if (auth.error) return auth.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const id = body?.id
  const isActive = body?.is_active
  if (!isUuid(id) || typeof isActive !== 'boolean') return error('La división seleccionada no es válida.')

  const { data: division, error: divisionError } = await supabaseAdmin
    .from('competition_divisions').select('id,is_active').eq('id', id).eq('club_id', clubId).eq('modality', 'PAIRS').maybeSingle()
  if (divisionError) return error('No pudimos leer la división.', 500)
  if (!division) return error('La división no existe en este club.', 404)

  if (!isActive) {
    const { data: links, error: linksError } = await supabaseAdmin
      .from('competition_series_divisions').select('series_id').eq('club_id', clubId).eq('division_id', id).eq('is_active', true)
    if (linksError) return error('No pudimos verificar el uso de la división.', 500)
    const seriesIds = (links ?? []).map((link) => link.series_id)
    if (seriesIds.length) {
      const { data: activeSeries, error: activeSeriesError } = await supabaseAdmin
        .from('competition_series').select('id').eq('club_id', clubId).in('id', seriesIds).in('status', ['SCHEDULED', 'ACTIVE']).is('archived_at', null).limit(1)
      if (activeSeriesError) return error('No pudimos verificar el estado de los circuitos.', 500)
      if (activeSeries?.length) return error('No podés desactivar esta división porque está en uso por un circuito activo o programado.', 409)
    }
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('competition_divisions').update({ is_active: isActive }).eq('id', id).eq('club_id', clubId).eq('modality', 'PAIRS').select('id,is_active').maybeSingle()
  if (updateError || !data) return error('No pudimos actualizar la división.', updateError?.code === 'PGRST116' ? 404 : 500)
  return NextResponse.json({ ok: true, division: data })
}
