import { listPublishedContent } from '@/lib/platformContent'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'
import { BRAND } from '@/lib/branding'

function normalizeBrandText(value: string): string
function normalizeBrandText(value: unknown): unknown
function normalizeBrandText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/PAMPRAX|PAMPrax|Pamprax|pamprax/g, BRAND.name.toUpperCase())
    : value
}

function normalizeContentBrand<T extends Record<string, unknown>>(item: T): T {
  return {
    ...item,
    title: normalizeBrandText(item.title),
    excerpt: normalizeBrandText(item.excerpt),
    body: normalizeBrandText(item.body),
    description: normalizeBrandText(item.description),
  }
}

export async function getPublicHomeData() {
  const unavailableSections: string[] = []
  const [contentResult, tournamentResult] = await Promise.all([
    listPublishedContent().then(data => ({ data, failed: false })).catch(() => ({ data: { archiveNews: [], ads: [], sponsors: [] }, failed: true })),
    supabaseAdmin
      .from('tournaments')
      .select(TOURNAMENT_SELECT)
      .not('status', 'in', '("DRAFT","CANCELLED","CANCELED","CANCELADO","ARCHIVED","FINISHED","COMPLETED","FINALIZADO","CLOSED")')
      .order('starts_on', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: true, nullsFirst: false })
      .limit(72),
  ])
  if (contentResult.failed) unavailableSections.push('content')
  if (tournamentResult.error) unavailableSections.push('tournaments')
  const content = contentResult.data
  const { archiveNews, ads, sponsors } = content
  const normalizedArchiveNews = archiveNews.map(item => normalizeContentBrand(item))
  const normalizedAds = ads.map(item => normalizeContentBrand(item))
  const normalizedSponsors = sponsors.map(item => normalizeContentBrand(item))
  const prioritizedSlides = [
    ...normalizedArchiveNews.filter(item => item.placement === 'HERO'),
    ...normalizedArchiveNews.filter(item => item.placement !== 'HERO'),
  ]
    .filter((item, index, list) => list.findIndex(entry => entry.id === item.id) === index)
    .slice(0, 3)

  const tournamentRows = tournamentResult.error ? [] : tournamentResult.data

  const tournamentViewsRaw = (tournamentRows ?? []).map(toTournamentView).filter(item => item !== null)
  const featuredTournamentIds = tournamentViewsRaw.map(item => item.id).filter(Boolean)
  const [registrationResult, tournamentClubsResult] = await Promise.all([
    featuredTournamentIds.length
    ? supabaseAdmin
      .from('tournament_registrations')
      .select('tournament_id,team_id,status')
      .in('tournament_id', featuredTournamentIds)
    : Promise.resolve({ data: [], error: null }),
    tournamentViewsRaw.length ? supabaseAdmin.from('clubs').select('id,name,logo_url,theme_key').in('id', Array.from(new Set(tournamentViewsRaw.map(item => item.club_id)))) : Promise.resolve({ data: [], error: null }),
  ])
  if (registrationResult.error || tournamentClubsResult.error) unavailableSections.push('tournamentDetails')
  const featuredRegistrationsByTournamentId = new Map<string, Set<string>>()
  for (const row of registrationResult.data ?? []) {
    if (!row.tournament_id || !row.team_id || ['CANCELLED', 'REJECTED'].includes(String(row.status ?? '').toUpperCase())) continue
    const teams = featuredRegistrationsByTournamentId.get(row.tournament_id) ?? new Set<string>()
    teams.add(row.team_id)
    featuredRegistrationsByTournamentId.set(row.tournament_id, teams)
  }

  const [
    clubsResult,
    playersResult,
    tournamentsResult,
    clubResult,
    clubPlayerResult,
    tournamentStatResult,
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
  if (clubResult.error) unavailableSections.push('clubs')
  if (clubPlayerResult.error || tournamentStatResult.error || clubsResult.error || playersResult.error || tournamentsResult.error) unavailableSections.push('statistics')
  const clubRows = clubResult.error ? [] : clubResult.data
  const clubPlayerRows = clubPlayerResult.error ? [] : clubPlayerResult.data
  const tournamentStatRows = tournamentStatResult.error ? [] : tournamentStatResult.data
  const clubsById = new Map((tournamentClubsResult.data ?? []).map(club => [String(club.id), club]))
  const playerStatsByClub = new Map<string, { players: number; categories: Set<number>; male: number; female: number }>()
  for (const row of clubPlayerRows ?? []) {
    const clubId = String(row.club_id ?? '')
    if (!clubId) continue
    const current = playerStatsByClub.get(clubId) ?? { players: 0, categories: new Set<number>(), male: 0, female: 0 }
    current.players += 1
    const category = Number(row.category)
    if (row.category !== null && Number.isInteger(category) && category >= 1 && category <= 7) current.categories.add(category)
    const gender = String(row.gender ?? '').toUpperCase()
    if (gender === 'M' || gender === 'MALE') current.male += 1
    if (gender === 'F' || gender === 'FEMALE') current.female += 1
    playerStatsByClub.set(clubId, current)
  }

  const tournamentStatsByClub = new Map<string, { tournaments: number; active: number }>()
  for (const row of tournamentStatRows ?? []) {
    const clubId = String(row.club_id ?? '')
    if (!clubId) continue
    const current = tournamentStatsByClub.get(clubId) ?? { tournaments: 0, active: 0 }
    current.tournaments += 1
    const status = String(row.status ?? '').toUpperCase()
    if (!['FINISHED', 'COMPLETED', 'CLOSED', 'ARCHIVED'].includes(status)) current.active += 1
    tournamentStatsByClub.set(clubId, current)
  }

  const featuredClubs = (clubRows ?? []).map(club => {
    const id = String(club.id)
    const playerStats = playerStatsByClub.get(id)
    const tournamentStats = tournamentStatsByClub.get(id)
    return {
      ...club,
      players: clubPlayerResult.error ? undefined : playerStats?.players ?? 0,
      categories: playerStats ? Array.from(playerStats.categories).sort((a, b) => a - b) : [],
      malePlayers: playerStats?.male ?? 0,
      femalePlayers: playerStats?.female ?? 0,
      tournaments: tournamentStatResult.error ? undefined : tournamentStats?.tournaments ?? 0,
      activeTournaments: tournamentStats?.active ?? 0,
    }
  })

  const tournaments = tournamentViewsRaw
    .map(view => {
      const club = view ? clubsById.get(view.club_id) : null
      return view ? { ...view, name: normalizeBrandText(view.name), registeredPairs: registrationResult.error ? null : featuredRegistrationsByTournamentId.get(view.id)?.size ?? 0, clubName: club?.name ?? null, clubLogoUrl: club?.logo_url ?? null, clubThemeKey: club?.theme_key ?? null } : null
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return {
    unavailableSections,
    slides: prioritizedSlides,
    newsArchive: normalizedArchiveNews,
    tournaments,
    ads: normalizedAds,
    sponsors: normalizedSponsors,
    metrics: {
      clubs: clubsResult.error ? null : clubsResult.count,
      players: playersResult.error ? null : playersResult.count,
      tournaments: tournamentsResult.error ? null : tournamentsResult.count,
    },
    clubs: featuredClubs,
  }
}
