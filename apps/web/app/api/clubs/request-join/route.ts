import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureValidActiveClubForUser } from '@/lib/clubMembershipServer'
import { isApprovedMembership } from '@/lib/clubMembershipRules'
import { withNotificationScope } from '@/lib/notificationScope'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const authHeader = req.headers.get('authorization') || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const accessToken = String(body?.accessToken ?? bearerToken ?? '')
    const clubId = String(body?.clubId ?? '')

    if (!accessToken || !clubId) {
      return NextResponse.json({ error: 'Faltan datos obligatorios.' }, { status: 400 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const userId = authData.user.id

    const { data: club, error: clubError } = await supabaseAdmin
      .from('clubs')
      .select('id, name, status')
      .eq('id', clubId)
      .maybeSingle()

    if (clubError) {
      return NextResponse.json({ error: clubError.message }, { status: 500 })
    }

    if (!club) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    if (club.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Este club todavía no acepta solicitudes públicas.' }, { status: 403 })
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('club_memberships')
      .select('id, status, role, approved_at')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (isApprovedMembership(existing)) {
      return NextResponse.json({ error: 'Ya pertenecés a este club.' }, { status: 400 })
    }

    if (existing?.status === 'PENDING') {
      return NextResponse.json({ error: 'Ya tenés una solicitud pendiente en este club.' }, { status: 400 })
    }

    if (existing?.status === 'BANNED') {
      return NextResponse.json({ error: 'No podés solicitar ingreso a este club.' }, { status: 403 })
    }

    if (existing?.id) {
      const { error: updateError } = await supabaseAdmin
        .from('club_memberships')
        .update({
          role: 'PLAYER',
          status: 'PENDING',
          approved_by: null,
          approved_at: null,
        })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      try {
        await ensureValidActiveClubForUser(userId, null)
      } catch (settingsError: any) {
        return NextResponse.json({ error: settingsError?.message ?? 'No pude actualizar club activo.' }, { status: 500 })
      }

      const { data: adminRows } = await supabaseAdmin
        .from('club_memberships')
        .select('user_id, approved_at')
        .eq('club_id', clubId)
        .eq('status', 'APPROVED')
        .not('approved_at', 'is', null)
        .in('role', ['OWNER', 'ADMIN', 'PLANILLERO'])

      const adminIds = Array.from(new Set((adminRows ?? []).map((row: any) => row.user_id).filter(Boolean)))
      if (adminIds.length > 0) {
        const { data: requesterProfile } = await supabaseAdmin
          .from('profiles')
          .select('display_name, first_name, last_name, email')
          .eq('user_id', userId)
          .maybeSingle()

        const requesterName = requesterProfile?.display_name || [requesterProfile?.first_name, requesterProfile?.last_name].filter(Boolean).join(' ').trim() || requesterProfile?.email || 'Un jugador'

        await supabaseAdmin.from('notifications').insert(
          adminIds.map((adminId) => ({
            user_id: adminId,
            type: 'club_membership_requested',
            title: 'Nueva solicitud de jugador',
            message: `${requesterName} quiere sumarse a ${club.name}. Revisá la solicitud desde Solicitudes del club.`,
            link: '/club/solicitudes',
            metadata: withNotificationScope(
              {
                club_id: clubId,
                requester_user_id: userId,
                requester_name: requesterName,
              },
              'club'
            ),
          }))
        )
      }

      return NextResponse.json({
        ok: true,
        status: 'PENDING',
        message: `Tu solicitud a ${club.name} quedó pendiente.`,
      })
    }

    const { data: insertedMembership, error: insertError } = await supabaseAdmin
      .from('club_memberships')
      .insert({
        club_id: clubId,
        user_id: userId,
        role: 'PLAYER',
        status: 'PENDING',
      })
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const { data: adminRows } = await supabaseAdmin
      .from('club_memberships')
      .select('user_id, approved_at')
      .eq('club_id', clubId)
      .eq('status', 'APPROVED')
      .not('approved_at', 'is', null)
      .in('role', ['OWNER', 'ADMIN', 'PLANILLERO'])

    const adminIds = Array.from(new Set((adminRows ?? []).map((row: any) => row.user_id).filter(Boolean)))
    if (adminIds.length > 0) {
      const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, first_name, last_name, email')
        .eq('user_id', userId)
        .maybeSingle()

      const requesterName = requesterProfile?.display_name || [requesterProfile?.first_name, requesterProfile?.last_name].filter(Boolean).join(' ').trim() || requesterProfile?.email || 'Un jugador'

      await supabaseAdmin.from('notifications').insert(
        adminIds.map((adminId) => ({
          user_id: adminId,
          type: 'club_membership_requested',
          title: 'Nueva solicitud de jugador',
          message: `${requesterName} quiere sumarse a ${club.name}. Revisá la solicitud desde Solicitudes del club.`,
          link: '/club/solicitudes',
          metadata: withNotificationScope(
            {
              club_id: clubId,
              membership_id: insertedMembership?.id ?? null,
              requester_user_id: userId,
              requester_name: requesterName,
            },
            'club'
          ),
        }))
      )
    }

    return NextResponse.json({
      ok: true,
      status: 'PENDING',
      message: `Tu solicitud a ${club.name} quedó pendiente.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No pudimos generar la solicitud.' }, { status: 500 })
  }
}
