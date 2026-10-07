import type { PublicTournamentItem } from '@/components/public/PublicTournamentsExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'
import { BRAND } from '@/lib/branding'

type ClubRow = { id: string; name: string; logo_url: string | null; theme_key: string | null }

/** Same public source for discovery, calendar and live links; no per-tournament requests. */
export async function getPublicTournamentItems() {
  const tournamentResult = await supabaseAdmin.from('tournaments').select(TOURNAMENT_SELECT)
    .not('status', 'in', '("DRAFT","CANCELLED","ARCHIVED")')
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('start_date', { ascending: true, nullsFirst: false }).limit(96)
  if (tournamentResult.error) throw tournamentResult.error
  const views = (tournamentResult.data ?? []).map(toTournamentView).filter((item) => item !== null)
  const clubIds = Array.from(new Set(views.map(item => item.club_id).filter(Boolean)))
  const ids = views.map(item => item.id)
  const [clubResult, registrationResult] = await Promise.all([
    clubIds.length ? supabaseAdmin.from('clubs').select('id,name,logo_url,theme_key').in('id', clubIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabaseAdmin.from('tournament_registrations').select('tournament_id,status').in('tournament_id', ids) : Promise.resolve({ data: [], error: null }),
  ])
  if (clubResult.error) throw clubResult.error
  if (registrationResult.error) throw registrationResult.error
  const clubsById = new Map(((clubResult.data ?? []) as ClubRow[]).map(club => [club.id, club]))
  const counts = new Map<string, number>()
  for (const row of registrationResult.data ?? []) {
    if (!row.tournament_id || String(row.status ?? '').toUpperCase() === 'CANCELLED') continue
    counts.set(row.tournament_id, (counts.get(row.tournament_id) ?? 0) + 1)
  }
  const tournaments: PublicTournamentItem[] = views.map(item => {
    const club = clubsById.get(item.club_id)
    return { id: item.id, club_id: item.club_id, clubName: club?.name ?? `Club ${BRAND.name}`,
      clubLogoUrl: club?.logo_url ?? null, clubThemeKey: club?.theme_key ?? null,
      name: item.name.replace(/PAMPRAX|PAMPrax|Pamprax|pamprax/g, BRAND.name.toUpperCase()),
      status: item.status, type: item.type, gender: item.gender, segment: item.segment, category: item.category,
      startDate: item.startDate, endDate: item.endDate, registrationDeadline: item.registrationDeadline,
      maxPairs: item.maxPairs, registeredPairs: counts.get(item.id) ?? 0, pricePerPlayer: item.pricePerPlayer, rules: item.rules }
  })
  return { tournaments, clubs: Array.from(new Set(tournaments.map(item => item.clubName))).sort((a,b) => a.localeCompare(b)) }
}
