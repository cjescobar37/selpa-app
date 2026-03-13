import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    let currentUserId: string | null = null

    if (token) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && authData.user) {
        currentUserId = authData.user.id
      }
    }

    const { data: clubs, error: clubsError } = await supabaseAdmin
      .from('clubs')
      .select('id, name, city, province, logo_url, created_at')
      .order('name', { ascending: true })

    if (clubsError) {
      return NextResponse.json({ error: clubsError.message }, { status: 500 })
    }

    let membershipMap = new Map<string, { role: string; status: string }>()

    if (currentUserId) {
      const { data: memberships, error: membershipsError } = await supabaseAdmin
        .from('club_memberships')
        .select('club_id, role, status')
        .eq('user_id', currentUserId)

      if (membershipsError) {
        return NextResponse.json({ error: membershipsError.message }, { status: 500 })
      }

      membershipMap = new Map(
        (memberships ?? []).map((m: any) => [
          m.club_id,
          { role: String(m.role), status: String(m.status) },
        ])
      )
    }

    const payload = (clubs ?? []).map((club: any) => {
      const membership = membershipMap.get(club.id)
      return {
        id: club.id,
        name: club.name,
        city: club.city ?? null,
        province: club.province ?? null,
        logo_url: club.logo_url ?? null,
        membership_status: membership?.status ?? null,
        membership_role: membership?.role ?? null,
      }
    })

    return NextResponse.json({ clubs: payload })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error cargando clubes' }, { status: 500 })
  }
}