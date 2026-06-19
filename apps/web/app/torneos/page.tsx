import PublicTournamentsExperience, { type PublicTournamentItem } from '@/components/public/PublicTournamentsExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'

export const dynamic = 'force-dynamic'

type ClubRow = {
  id: string
  name: string
  logo_url: string | null
  theme_key: string | null
}

export default async function TorneosPublicPage() {
  const { data: tournamentRows } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .not('status', 'in', '("DRAFT","CANCELLED","ARCHIVED")')
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(96)

  const tournamentViews = (tournamentRows ?? []).map((row: any) => toTournamentView(row)).filter(Boolean)
  const clubIds = Array.from(new Set(tournamentViews.map((item: any) => item.club_id).filter(Boolean)))
  const tournamentIds = tournamentViews.map((item: any) => item.id).filter(Boolean)

  const [{ data: clubRows }, { data: registrationRows }] = await Promise.all([
    clubIds.length
      ? supabaseAdmin.from('clubs').select('id,name,logo_url,theme_key').in('id', clubIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length
      ? supabaseAdmin.from('tournament_registrations').select('tournament_id,status').in('tournament_id', tournamentIds)
      : Promise.resolve({ data: [] }),
  ])

  const clubsById = new Map(((clubRows ?? []) as ClubRow[]).map((club) => [club.id, club]))
  const registrationsByTournamentId = new Map<string, number>()
  for (const row of (registrationRows ?? []) as Array<{ tournament_id: string | null; status: string | null }>) {
    if (!row.tournament_id || String(row.status ?? '').toUpperCase() === 'CANCELLED') continue
    registrationsByTournamentId.set(row.tournament_id, (registrationsByTournamentId.get(row.tournament_id) ?? 0) + 1)
  }
  const tournaments: PublicTournamentItem[] = tournamentViews.map((item: any) => {
    const club = clubsById.get(item.club_id)
    return {
      id: item.id,
      club_id: item.club_id,
      clubName: club?.name ?? 'Club Pamprax',
      clubLogoUrl: club?.logo_url ?? null,
      clubThemeKey: club?.theme_key ?? null,
      name: item.name,
      status: item.status,
      type: item.type,
      gender: item.gender,
      segment: item.segment,
      category: item.category,
      startDate: item.startDate,
      endDate: item.endDate,
      registrationDeadline: item.registrationDeadline,
      maxPairs: item.maxPairs,
      registeredPairs: registrationsByTournamentId.get(item.id) ?? 0,
      pricePerPlayer: item.pricePerPlayer,
      rules: item.rules,
    }
  })

  const clubs = Array.from(new Set(tournaments.map((item) => item.clubName))).sort((a, b) => a.localeCompare(b))

  return (
    <div className="px-wrap">
      <PublicTournamentsExperience tournaments={tournaments} clubs={clubs} />
    </div>
  )
}
