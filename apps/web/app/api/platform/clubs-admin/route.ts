import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function assertPlatformAdmin(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const { data: pa, error: paErr } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (paErr) return { error: NextResponse.json({ error: paErr.message }, { status: 500 }), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const { data: clubs, error: clubsError } = await supabaseAdmin
    .from('clubs')
    .select('id,name,city,is_active,created_at,logo_url')
    .order('created_at', { ascending: false })

  if (clubsError) {
    return NextResponse.json({ error: clubsError.message }, { status: 500 })
  }

  const clubIds = (clubs ?? []).map((club: any) => club.id)

  const [membershipsRes, tournamentsRes] = await Promise.all([
    clubIds.length
      ? supabaseAdmin
          .from('club_memberships')
          .select('club_id,role,status,user_id')
          .in('club_id', clubIds)
      : Promise.resolve({ data: [], error: null } as any),
    clubIds.length
      ? supabaseAdmin
          .from('tournaments')
          .select('id,club_id')
          .in('club_id', clubIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  if (membershipsRes.error) {
    return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })
  }
  if (tournamentsRes.error) {
    return NextResponse.json({ error: tournamentsRes.error.message }, { status: 500 })
  }

  const memberships = membershipsRes.data ?? []
  const ownerIds = Array.from(
    new Set(
      memberships
        .filter((row: any) => row.role === 'OWNER' && row.status === 'APPROVED')
        .map((row: any) => row.user_id)
        .filter(Boolean)
    )
  )

  let profilesMap = new Map<string, any>()
  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,display_name,first_name,last_name,email')
      .in('user_id', ownerIds)

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    profilesMap = new Map((profiles ?? []).map((profile: any) => [profile.user_id, profile]))
  }

  const tournamentRows = tournamentsRes.data ?? []

  const rows = (clubs ?? []).map((club: any) => {
    const relatedMemberships = memberships.filter((row: any) => row.club_id === club.id)
    const approvedMemberships = relatedMemberships.filter((row: any) => row.status === 'APPROVED')
    const pendingMemberships = relatedMemberships.filter((row: any) => row.status === 'PENDING')
    const ownerMembership = relatedMemberships.find((row: any) => row.role === 'OWNER' && row.status === 'APPROVED')
    const ownerProfile = ownerMembership ? profilesMap.get(ownerMembership.user_id) : null
    const ownerName = ownerProfile?.display_name || [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(' ').trim() || ownerProfile?.email || 'Sin owner asignado'
    const tournamentsCount = tournamentRows.filter((row: any) => row.club_id === club.id).length

    return {
      ...club,
      owner_name: ownerName,
      owner_email: ownerProfile?.email || null,
      approved_members_count: approvedMemberships.length,
      pending_members_count: pendingMemberships.length,
      tournaments_count: tournamentsCount,
    }
  })

  return NextResponse.json({ rows })
}

export async function PATCH(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const clubId = String(body?.clubId ?? '')
    const nextActive = Boolean(body?.is_active)

    if (!clubId) {
      return NextResponse.json({ error: 'Falta clubId.' }, { status: 400 })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('clubs')
      .update({ is_active: nextActive })
      .eq('id', clubId)
      .select('id,name,is_active')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, club: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude actualizar el club.' }, { status: 500 })
  }
}
