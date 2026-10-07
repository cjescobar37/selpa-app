import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { nonPlayerAccountIds } from '@/lib/accountRoleServer'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'

type SearchResult = {
  type: 'jugador' | 'torneo' | 'club' | 'noticia'
  title: string
  subtitle: string
  href: string
}

function cleanQuery(value: string | null) {
  return (value ?? '').replace(/[,%()*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

type SearchProfile = { user_id: string; display_name: string | null; first_name: string | null; last_name: string | null }
type SearchPlayer = { id: string; club_id: string; user_id: string | null; display_name: string | null }
type SearchClub = { id: string; name: string | null; city?: string | null }
type SearchTournament = { id: string; name: string | null; status: string | null; start_date: string | null; starts_on: string | null }
type SearchNews = { title: string | null; excerpt: string | null; slug: string }

function fullName(profile: SearchProfile | undefined) {
  return profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || ''
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !authData.user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

  const q = cleanQuery(req.nextUrl.searchParams.get('q'))

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
      .not('status', 'in', '("DRAFT","CANCELLED","CANCELED","CANCELADO","ARCHIVED")')
      .limit(5),
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,is_active')
      .ilike('name', pattern)
      .eq('is_active', true)
      .limit(5),
    supabaseAdmin
      .from('platform_news')
      .select('id,title,slug,excerpt,status')
      .eq('status', 'PUBLISHED')
      .or(`title.ilike.${pattern},excerpt.ilike.${pattern}`)
      .limit(5),
  ])

  const initialError = [clubPlayersByName, profilesByText, tournamentsRes, clubsRes, newsRes].find(result => result.error)?.error
  if (initialError) {
    console.error('[search]', { operation: 'READ_SEARCH', code: /^[A-Z0-9]{1,12}$/.test(initialError.code ?? '') ? initialError.code : 'READ_FAILED' })
    return NextResponse.json({ error: 'No pudimos buscar en SELPA. Intentá nuevamente.' }, { status: 500 })
  }

  const profileRows = (profilesByText.data ?? []) as SearchProfile[]
  const profileUserIds = profileRows.map((profile) => profile.user_id).filter(Boolean)
  const clubPlayersByProfile = profileUserIds.length
    ? await supabaseAdmin
        .from('club_players')
        .select('id,club_id,user_id,display_name,category,gender')
        .in('user_id', profileUserIds)
        .not('approved_at', 'is', null)
        .limit(20)
    : { data: [], error: null }

  if (clubPlayersByProfile.error) return NextResponse.json({ error: 'No pudimos buscar jugadores. Intentá nuevamente.' }, { status: 500 })

  const playerRows = [...((clubPlayersByName.data ?? []) as SearchPlayer[]), ...((clubPlayersByProfile.data ?? []) as SearchPlayer[])]
  const blocked = await nonPlayerAccountIds(playerRows.map(row => row.user_id))
  const uniquePlayerRows = Array.from(new Map(playerRows.filter(row => row.user_id && !blocked.has(row.user_id)).map((row) => [row.id, row])).values()).slice(0, 5)
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

  if (playerProfilesRes.error || playerClubsRes.error) return NextResponse.json({ error: 'No pudimos completar la búsqueda. Intentá nuevamente.' }, { status: 500 })

  const profiles = new Map(((playerProfilesRes.data ?? []) as SearchProfile[]).map((profile) => [profile.user_id, profile]))
  const playerClubs = new Map(((playerClubsRes.data ?? []) as SearchClub[]).map((club) => [club.id, club]))

  const results: SearchResult[] = []

  uniquePlayerRows.forEach((player) => {
    const profile = player.user_id ? profiles.get(player.user_id) : undefined
    const title = fullName(profile) || player.display_name || 'Jugador'
    results.push({
      type: 'jugador',
      title,
      subtitle: playerClubs.get(player.club_id)?.name || 'Jugador',
      href: `/jugadores/${player.id}`,
    })
  })

  ;((tournamentsRes.data ?? []) as SearchTournament[]).slice(0, 5).forEach((tournament) => {
    results.push({
      type: 'torneo',
      title: tournament.name || 'Torneo',
      subtitle: getTournamentDisplayStatus(tournament as unknown).label,
      href: `/torneos/${tournament.id}`,
    })
  })

  ;((clubsRes.data ?? []) as SearchClub[]).slice(0, 5).forEach((club) => {
    results.push({
      type: 'club',
      title: club.name || 'Club',
      subtitle: club.city || 'Club',
      href: `/clubs/${club.id}`,
    })
  })

  ;((newsRes.data ?? []) as SearchNews[]).slice(0, 5).forEach((news) => {
    results.push({
      type: 'noticia',
      title: news.title || 'Noticia',
      subtitle: news.excerpt || 'Noticia',
      href: `/noticias/${news.slug}`,
    })
  })

  return NextResponse.json(results)
}
