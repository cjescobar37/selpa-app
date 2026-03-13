import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const accessToken = String(body?.accessToken ?? '')
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
      .select('id, name')
      .eq('id', clubId)
      .maybeSingle()

    if (clubError) {
      return NextResponse.json({ error: clubError.message }, { status: 500 })
    }

    if (!club) {
      return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('club_memberships')
      .select('id, status, role')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (existing?.status === 'APPROVED') {
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

      return NextResponse.json({
        ok: true,
        status: 'PENDING',
        message: `Tu solicitud a ${club.name} quedó pendiente.`,
      })
    }

    const { error: insertError } = await supabaseAdmin
      .from('club_memberships')
      .insert({
        club_id: clubId,
        user_id: userId,
        role: 'PLAYER',
        status: 'PENDING',
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
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