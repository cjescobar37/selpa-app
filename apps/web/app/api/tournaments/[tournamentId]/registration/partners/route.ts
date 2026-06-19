import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'

type PartnerSearchContext = {
  params: Promise<{ tournamentId: string }>
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function fullName(profile?: Record<string, any> | null, fallback?: string | null) {
  return (
    fallback ||
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    'Jugador'
  )
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function GET(req: NextRequest, context: PartnerSearchContext) {
  const { tournamentId } = await context.params
  const user = await getTokenUser(req)
  if (!user) return NextResponse.json({ error: 'Iniciá sesión para buscar compañero.' }, { status: 401 })

  const { data: tournamentRow, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  const tournament = toTournamentView(tournamentRow as any)
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const { data: me } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,approved_at')
    .eq('club_id', tournament.club_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!me?.id) return NextResponse.json({ error: 'No tenés perfil de jugador en este club.' }, { status: 403 })

  const query = String(req.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length < 2) return NextResponse.json({ partners: [] })

  const { data: players, error: playersError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,display_name,category,gender,approved_at')
    .eq('club_id', tournament.club_id)
    .neq('user_id', user.id)
    .limit(30)

  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

  const userIds = Array.from(new Set((players ?? []).map((player) => String(player.user_id)).filter(Boolean)))
  const { data: profiles } = userIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('user_id,display_name,first_name,last_name,avatar_url')
        .in('user_id', userIds)
    : { data: [] as any[] }

  const profilesByUserId = new Map((profiles ?? []).map((profile) => [String(profile.user_id), profile as Record<string, any>]))
  const q = query.toLowerCase()
  const partners = (players ?? [])
    .map((player) => {
      const profile = profilesByUserId.get(String(player.user_id))
      const name = fullName(profile, player.display_name)
      return {
        clubPlayerId: player.id,
        userId: player.user_id,
        name,
        avatarUrl: profile?.avatar_url ?? null,
        category: player.category ?? null,
        gender: player.gender ?? null,
        approved: Boolean(player.approved_at),
      }
    })
    .filter((partner) => partner.name.toLowerCase().includes(q))
    .slice(0, 12)

  return NextResponse.json({ partners })
}
