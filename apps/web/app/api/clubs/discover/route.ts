import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type MembershipRow = {
  club_id: string
  status: string
  role: string
  approved_at: string | null
}

type ProfileLocationRow = {
  city: string | null
  province: string | null
}

function comparableLocation(value: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-AR')
}

async function getTokenUser(req: NextRequest) {
  const authorization = req.headers.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  return error ? null : data.user
}

export async function GET(req: NextRequest) {
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const [{ data: clubs, error: clubsError }, { data: memberships, error: membershipsError }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,province,logo_url,theme_key,status')
      .eq('status', 'ACTIVE')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('club_memberships')
      .select('club_id,status,role,approved_at')
      .eq('user_id', user.id),
    supabaseAdmin
      .from('profiles')
      .select('city,province')
      .eq('user_id', user.id)
      .maybeSingle<ProfileLocationRow>(),
  ])

  if (clubsError || membershipsError) {
    return NextResponse.json({ error: 'No pudimos cargar los clubes disponibles.' }, { status: 500 })
  }

  const membershipsByClub = new Map(
    ((memberships ?? []) as MembershipRow[]).map((membership) => [membership.club_id, membership]),
  )

  const userCity = comparableLocation(profile?.city ?? null)
  const userProvince = comparableLocation(profile?.province ?? null)
  const rankedClubs = [...(clubs ?? [])].sort((left, right) => {
    const score = (club: typeof left) => {
      if (userCity && comparableLocation(club.city) === userCity) return 0
      if (userProvince && comparableLocation(club.province) === userProvince) return 1
      return 2
    }
    return score(left) - score(right) || left.name.localeCompare(right.name, 'es-AR')
  })

  return NextResponse.json({
    clubs: rankedClubs.map((club) => {
      const membership = membershipsByClub.get(String(club.id))
      return {
        ...club,
        membership: membership
          ? {
              status: membership.status,
              role: membership.role,
              approvedAt: membership.approved_at,
            }
          : null,
      }
    }),
  })
}
