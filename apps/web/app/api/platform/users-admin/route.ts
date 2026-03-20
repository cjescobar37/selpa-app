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

  const [membershipsRes, clubsRes, profilesRes] = await Promise.all([
    supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status,created_at,approved_at,rejection_reason')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('clubs')
      .select('id,name,is_active,city'),
    supabaseAdmin
      .from('profiles')
      .select('user_id,display_name,first_name,last_name,email,avatar_url'),
  ])

  if (membershipsRes.error) return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 })
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 })
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })

  const clubsMap = new Map((clubsRes.data ?? []).map((club: any) => [club.id, club]))
  const profilesMap = new Map((profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]))

  const rows = (membershipsRes.data ?? []).map((membership: any) => {
    const club = clubsMap.get(membership.club_id)
    const profile = profilesMap.get(membership.user_id)
    const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.email || 'Usuario sin nombre'

    return {
      ...membership,
      club_name: club?.name ?? 'Club desconocido',
      club_city: club?.city ?? null,
      club_is_active: club?.is_active ?? null,
      user_name: displayName,
      user_email: profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
    }
  })

  const summary = {
    total: rows.length,
    approved: rows.filter((row: any) => row.status === 'APPROVED').length,
    pending: rows.filter((row: any) => row.status === 'PENDING').length,
    rejected: rows.filter((row: any) => row.status === 'REJECTED').length,
  }

  return NextResponse.json({ rows, summary, clubs: clubsRes.data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const membershipId = String(body?.membershipId ?? '')
    const action = String(body?.action ?? '')
    const rejectionReason = String(body?.rejectionReason ?? '').trim()

    if (!membershipId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('club_memberships')
      .select('id,club_id,user_id,role,status')
      .eq('id', membershipId)
      .maybeSingle()

    if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 })
    if (!membership) return NextResponse.json({ error: 'Membresía no encontrada.' }, { status: 404 })

    const { data: club } = await supabaseAdmin
      .from('clubs')
      .select('id,name')
      .eq('id', membership.club_id)
      .maybeSingle()

    const clubName = club?.name ?? 'el club'

    if (action === 'reject') {
      if (!rejectionReason) {
        return NextResponse.json({ error: 'Indicá un motivo de rechazo.' }, { status: 400 })
      }

      const { error } = await supabaseAdmin
        .from('club_memberships')
        .update({
          status: 'REJECTED',
          approved_by: auth.user!.id,
          approved_at: null,
          rejection_reason: rejectionReason,
        })
        .eq('id', membershipId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await supabaseAdmin.from('notifications').insert({
        user_id: membership.user_id,
        type: 'club_membership_rejected',
        title: 'Solicitud rechazada',
        message: `Tu solicitud para unirte a ${clubName} fue rechazada. Motivo: ${rejectionReason}`,
        metadata: { club_id: membership.club_id, membership_id: membership.id, rejection_reason: rejectionReason },
      })

      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    const { error: approveError } = await supabaseAdmin
      .from('club_memberships')
      .update({
        status: 'APPROVED',
        approved_by: auth.user!.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', membershipId)

    if (approveError) return NextResponse.json({ error: approveError.message }, { status: 500 })

    const { data: existingPlayer, error: playerCheckError } = await supabaseAdmin
      .from('club_players')
      .select('id')
      .eq('club_id', membership.club_id)
      .eq('user_id', membership.user_id)
      .maybeSingle()

    if (playerCheckError) return NextResponse.json({ error: playerCheckError.message }, { status: 500 })

    if (!existingPlayer) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('display_name,first_name,last_name')
        .eq('user_id', membership.user_id)
        .maybeSingle()

      const displayName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || null

      const { error: playerInsertError } = await supabaseAdmin
        .from('club_players')
        .insert({
          club_id: membership.club_id,
          user_id: membership.user_id,
          display_name: displayName,
          category: 6,
          gender: 'M',
          approved_at: new Date().toISOString(),
          approved_by: auth.user!.id,
        })

      if (playerInsertError) return NextResponse.json({ error: playerInsertError.message }, { status: 500 })
    }

    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('user_id,active_club_id')
      .eq('user_id', membership.user_id)
      .maybeSingle()

    if (!settings?.active_club_id) {
      const { error: settingsError } = await supabaseAdmin
        .from('user_settings')
        .upsert({ user_id: membership.user_id, active_club_id: membership.club_id }, { onConflict: 'user_id' })

      if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }

    await supabaseAdmin.from('notifications').insert({
      user_id: membership.user_id,
      type: 'club_membership_approved',
      title: 'Solicitud aprobada',
      message: `Tu solicitud para unirte a ${clubName} fue aprobada.`,
      metadata: { club_id: membership.club_id, membership_id: membership.id },
    })

    return NextResponse.json({ ok: true, status: 'APPROVED' })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude gestionar el usuario.' }, { status: 500 })
  }
}
