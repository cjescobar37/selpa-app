import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SearchResult = {
  type: 'jugador' | 'torneo' | 'club' | 'noticia'
  title: string
  subtitle: string
  href: string
}

function cleanQuery(value: string | null) {
  return (value ?? '').replace(/[,%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function fullName(profile: any) {
  return profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || ''
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const q = cleanQuery(req.nextUrl.searchParams.get('q'))
  const context = req.nextUrl.searchParams.get('context')

  if (q.length < 2) return NextResponse.json([])

  const pattern = `%${q}%`

  const [
    clubPlayersByName,
    profilesByText,
    tournamentsRes,
    clubsRes,
    newsRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender')
      .ilike('display_name', pattern)
      .not('approved_at', 'is', null)
      .limit(20),
    supabaseAdmin
      .from('profiles')
      .select('user_id,first_name,last_name,display_name')
      .or(`display_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
      .limit(20),
    supabaseAdmin
      .from('tournaments')
      .select('id,club_id,name,status,start_date,starts_on')
      .ilike('name', pattern)
      .limit(5),
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,is_active')
      .ilike('name', pattern)
      .limit(5),
    supabaseAdmin
      .from('platform_news')
      .select('id,title,slug,excerpt,status')
      .eq('status', 'PUBLISHED')
      .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`)
      .limit(5),
  ])

  const profileRows = (profilesByText.data ?? []) as any[]
  const profileUserIds = profileRows.map((profile) => profile.user_id).filter(Boolean)
  const clubPlayersByProfile = profileUserIds.length
    ? await supabaseAdmin
        .from('club_players')
        .select('id,club_id,user_id,display_name,category,gender')
        .in('user_id', profileUserIds)
        .not('approved_at', 'is', null)
        .limit(20)
    : { data: [], error: null }

  const playerRows = [...((clubPlayersByName.data ?? []) as any[]), ...((clubPlayersByProfile.data ?? []) as any[])]
  const uniquePlayerRows = Array.from(new Map(playerRows.map((row) => [row.id, row])).values()).slice(0, 5)
  const playerUserIds = uniquePlayerRows.map((row) => row.user_id).filter(Boolean)
  const playerClubIds = uniquePlayerRows.map((row) => row.club_id).filter(Boolean)

  const [playerProfilesRes, playerClubsRes] = await Promise.all([
    playerUserIds.length
      ? supabaseAdmin.from('profiles').select('user_id,first_name,last_name,display_name').in('user_id', playerUserIds)
      : Promise.resolve({ data: [], error: null }),
    playerClubIds.length
      ? supabaseAdmin.from('clubs').select('id,name').in('id', playerClubIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const profiles = new Map(((playerProfilesRes.data ?? []) as any[]).map((profile) => [profile.user_id, profile]))
  const playerClubs = new Map(((playerClubsRes.data ?? []) as any[]).map((club) => [club.id, club]))

  const results: SearchResult[] = []

  uniquePlayerRows.forEach((player) => {
    const profile = profiles.get(player.user_id)
    const title = fullName(profile) || player.display_name || 'Jugador'
    results.push({
      type: 'jugador',
      title,
      subtitle: playerClubs.get(player.club_id)?.name || 'Jugador',
      href: `/club/jugadores/${player.id}`,
    })
  })

  ;((tournamentsRes.data ?? []) as any[]).slice(0, 5).forEach((tournament) => {
    results.push({
      type: 'torneo',
      title: tournament.name || 'Torneo',
      subtitle: tournament.status || 'Torneo',
      href: context === 'club' ? `/club/torneos/${tournament.id}` : `/torneos/${tournament.id}`,
    })
  })

  ;((clubsRes.data ?? []) as any[]).slice(0, 5).forEach((club) => {
    results.push({
      type: 'club',
      title: club.name || 'Club',
      subtitle: club.city || 'Club',
      href: `/clubs/${club.id}`,
    })
  })

  ;((newsRes.data ?? []) as any[]).slice(0, 5).forEach((news) => {
    results.push({
      type: 'noticia',
      title: news.title || 'Noticia',
      subtitle: news.excerpt || 'Noticia',
      href: `/noticias/${news.slug}`,
    })
  })

  return NextResponse.json(results)
}
