import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership } from '@/lib/clubMembershipRules'

type MembershipRow = {
  club_id: string
  status: string
  approved_at: string | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function GET(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  }

  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('club_memberships')
    .select('club_id,status,approved_at')
    .eq('user_id', user.id)

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 })
  }

  const approvedClubIds = ((memberships ?? []) as MembershipRow[])
    .filter((membership) => isApprovedMembership(membership))
    .map((membership) => membership.club_id)

  if (!approvedClubIds.length) {
    return NextResponse.json({ clubs: [] })
  }

  const { data: clubs, error: clubsError } = await supabaseAdmin
    .from('clubs')
    .select('id,name,logo_url,status')
    .in('id', approvedClubIds)
    .order('name', { ascending: true })

  if (clubsError) {
    return NextResponse.json({ error: clubsError.message }, { status: 500 })
  }

  return NextResponse.json({ clubs: clubs ?? [] })
}
