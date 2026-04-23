import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Body = {
  accessToken: string
  tournament: {
    club_id: string
    name: string
    type: string
    tournament_type: string
    format: string
    gender: string
    category_id: number
    category: number
    start_date: string
    starts_on: string
    end_date?: string | null
    ends_on?: string | null
    registration_deadline?: string | null
    signup_deadline?: string | null
    price_per_player: number
    min_pairs: number
    max_pairs?: number | null
    points_total: number
    status: string
    rules: Record<string, unknown>
    rules_json: Record<string, unknown>
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body

    if (!body?.accessToken) {
      return NextResponse.json({ error: 'Falta accessToken' }, { status: 400 })
    }

    // Verificar token del usuario
    const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(body.accessToken)
    if (uErr || !u?.user) {
      return NextResponse.json({ error: 'Token inválido o sesión expirada' }, { status: 401 })
    }

    const userId = u.user.id
    const clubId = body.tournament?.club_id

    if (!clubId) {
      return NextResponse.json({ error: 'Falta club_id' }, { status: 400 })
    }

    // Verificar que el usuario es admin/owner/planillero del club
    const { data: membership, error: mErr } = await supabaseAdmin
      .from('club_memberships')
      .select('role, status')
      .eq('user_id', userId)
      .eq('club_id', clubId)
      .maybeSingle()

    // También puede ser platform_admin
    const { data: pa } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    const isPlatformAdmin = !!pa?.user_id
    const isClubAdmin = membership?.status === 'APPROVED' &&
      ['OWNER', 'ADMIN', 'PLANILLERO'].includes(membership?.role ?? '')

    if (!isPlatformAdmin && !isClubAdmin) {
      return NextResponse.json(
        { error: 'No tenés permisos para crear torneos en este club. Tu rol actual: ' + (membership?.role ?? 'sin membership') },
        { status: 403 }
      )
    }

    // Validaciones básicas
    const name = (body.tournament?.name ?? '').trim()
    if (name.length < 2) {
      return NextResponse.json({ error: 'El nombre del torneo es muy corto' }, { status: 400 })
    }

    const payload = {
      club_id: clubId,
      name,
      type: body.tournament.type,
      tournament_type: body.tournament.tournament_type,
      format: body.tournament.format,
      gender: body.tournament.gender,
      category_id: body.tournament.category_id,
      category: body.tournament.category,
      start_date: body.tournament.start_date,
      starts_on: body.tournament.starts_on,
      end_date: body.tournament.end_date ?? null,
      ends_on: body.tournament.ends_on ?? null,
      registration_deadline: body.tournament.registration_deadline ?? null,
      signup_deadline: body.tournament.signup_deadline ?? null,
      price_per_player: body.tournament.price_per_player,
      min_pairs: body.tournament.min_pairs,
      max_pairs: body.tournament.max_pairs ?? null,
      points_total: body.tournament.points_total,
      status: 'DRAFT',
      rules: body.tournament.rules,
      rules_json: body.tournament.rules_json,
    }

    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error interno' }, { status: 500 })
  }
}
