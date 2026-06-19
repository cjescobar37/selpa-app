import { listPublishedContent } from '@/lib/platformContent'
import PublicHomeExperience from '@/components/public/PublicHomeExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'

export default async function PublicHomePage() {
  const { archiveNews, ads, sponsors } = await listPublishedContent()
  const prioritizedSlides = [
    ...archiveNews.filter((item: any) => item.placement === 'HERO'),
    ...archiveNews.filter((item: any) => item.placement !== 'HERO'),
  ]
    .filter((item: any, index: number, list: any[]) => list.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 3)

  const { data: tournamentRows } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .neq('status', 'DRAFT')
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(4)

  const tournamentViewsRaw = (tournamentRows ?? []).map((row: any) => toTournamentView(row)).filter(Boolean)
  const featuredTournamentIds = tournamentViewsRaw.map((item: any) => item.id).filter(Boolean)
  const { data: featuredRegistrationRows } = featuredTournamentIds.length
    ? await supabaseAdmin
      .from('tournament_registrations')
      .select('tournament_id,status')
      .in('tournament_id', featuredTournamentIds)
    : { data: [] }
  const featuredRegistrationsByTournamentId = new Map<string, number>()
  for (const row of (featuredRegistrationRows ?? []) as Array<{ tournament_id: string | null; status: string | null }>) {
    if (!row.tournament_id || String(row.status ?? '').toUpperCase() === 'CANCELLED') continue
    featuredRegistrationsByTournamentId.set(row.tournament_id, (featuredRegistrationsByTournamentId.get(row.tournament_id) ?? 0) + 1)
  }

  const [
    { count: clubsCount },
    { count: playersCount },
    { count: tournamentsCount },
    { data: clubRows },
    { data: clubPlayerRows },
    { data: tournamentStatRows },
  ] = await Promise.all([
    supabaseAdmin.from('clubs').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('club_players').select('id', { count: 'exact', head: true }).not('approved_at', 'is', null),
    supabaseAdmin.from('tournaments').select('id', { count: 'exact', head: true }).neq('status', 'DRAFT'),
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,logo_url,theme_key')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(4),
    supabaseAdmin
      .from('club_players')
      .select('club_id,category,gender')
      .not('approved_at', 'is', null),
    supabaseAdmin
      .from('tournaments')
      .select('club_id,category,category_id,gender,status')
      .neq('status', 'DRAFT'),
  ])

  const clubsById = new Map((clubRows ?? []).map((club: any) => [String(club.id), club]))
  const playerStatsByClub = new Map<string, { players: number; categories: Set<number>; male: number; female: number }>()
  for (const row of clubPlayerRows ?? []) {
    const clubId = String((row as any).club_id ?? '')
    if (!clubId) continue
    const current = playerStatsByClub.get(clubId) ?? { players: 0, categories: new Set<number>(), male: 0, female: 0 }
    current.players += 1
    const category = Number((row as any).category)
    if (Number.isFinite(category)) current.categories.add(category)
    const gender = String((row as any).gender ?? '').toUpperCase()
    if (gender === 'M' || gender === 'MALE') current.male += 1
    if (gender === 'F' || gender === 'FEMALE') current.female += 1
    playerStatsByClub.set(clubId, current)
  }
  const tournamentStatsByClub = new Map<string, { tournaments: number; active: number }>()
  for (const row of tournamentStatRows ?? []) {
    const clubId = String((row as any).club_id ?? '')
    if (!clubId) continue
    const current = tournamentStatsByClub.get(clubId) ?? { tournaments: 0, active: 0 }
    current.tournaments += 1
    const status = String((row as any).status ?? '').toUpperCase()
    if (!['FINISHED', 'COMPLETED', 'CLOSED', 'ARCHIVED'].includes(status)) current.active += 1
    tournamentStatsByClub.set(clubId, current)
  }

  const featuredClubs = (clubRows ?? []).map((club: any) => {
    const id = String(club.id)
    const playerStats = playerStatsByClub.get(id)
    const tournamentStats = tournamentStatsByClub.get(id)
    return {
      ...club,
      players: playerStats?.players ?? 0,
      categories: playerStats ? Array.from(playerStats.categories).sort((a, b) => a - b) : [],
      malePlayers: playerStats?.male ?? 0,
      femalePlayers: playerStats?.female ?? 0,
      tournaments: tournamentStats?.tournaments ?? 0,
      activeTournaments: tournamentStats?.active ?? 0,
    }
  })

  const tournaments = tournamentViewsRaw
    .map((view: any) => {
      const club = view ? clubsById.get(view.club_id) : null
      return view ? { ...view, registeredPairs: featuredRegistrationsByTournamentId.get(view.id) ?? 0, clubName: club?.name ?? null, clubLogoUrl: club?.logo_url ?? null, clubThemeKey: club?.theme_key ?? null } : null
    })
    .filter(Boolean)

  return (
    <div className="px-wrap">
      <PublicHomeExperience
        slides={prioritizedSlides as any}
        newsArchive={archiveNews as any}
        tournaments={tournaments as any}
        ads={ads as any}
        sponsors={sponsors as any}
        metrics={{
          clubs: clubsCount ?? 0,
          players: playersCount ?? 0,
          tournaments: tournamentsCount ?? tournaments.length,
        }}
        clubs={featuredClubs as any}
      />
    </div>
  )
}
