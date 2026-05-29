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

  const { data: clubRows } = clubIds.length
    ? await supabaseAdmin.from('clubs').select('id,name,logo_url,theme_key').in('id', clubIds)
    : { data: [] }

  const clubsById = new Map(((clubRows ?? []) as ClubRow[]).map((club) => [club.id, club]))
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
      gender: item.gender,
      category: item.category,
      startDate: item.startDate,
      registrationDeadline: item.registrationDeadline,
      maxPairs: item.maxPairs,
      pricePerPlayer: item.pricePerPlayer,
    }
  })

  const clubs = Array.from(new Set(tournaments.map((item) => item.clubName))).sort((a, b) => a.localeCompare(b))

  return (
    <div className="px-wrap">
      <PublicTournamentsExperience tournaments={tournaments} clubs={clubs} />
    </div>
  )
}
