import TournamentPublicCard from '@/components/public/TournamentPublicCard'

type Tournament = {
  id: string
  name: string
  status: string | null
  starts_on: string | null
  start_date: string | null
  ends_on?: string | null
  end_date?: string | null
  registration_deadline?: string | null
  signup_deadline?: string | null
  category: number | null
  category_id?: number | null
  gender: string | null
  segment?: string | null
  type?: string | null
  tournament_type?: string | null
  price_per_player?: number | null
  max_pairs?: number | null
  rules?: Record<string, unknown> | null
  rules_json?: Record<string, unknown> | null
}

/** Data adapter only. Agenda and history share the public tournament card. */
export default function PlayerAgendaCard({ tournament, club, registrationStatus }: {
  tournament: Tournament
  club?: { name: string; logo_url?: string | null; theme_key?: string | null }
  registrationStatus?: string | null
}) {
  return <TournamentPublicCard compactAgenda showClub registrationStatus={registrationStatus} tournament={{
    id: tournament.id,
    name: tournament.name,
    status: tournament.status ?? 'DRAFT',
    type: tournament.type,
    tournament_type: tournament.tournament_type,
    gender: tournament.gender ?? 'UNKNOWN',
    segment: tournament.segment,
    category: tournament.category_id ?? tournament.category,
    startDate: tournament.starts_on ?? tournament.start_date,
    endDate: tournament.ends_on ?? tournament.end_date,
    registrationDeadline: tournament.registration_deadline ?? tournament.signup_deadline,
    pricePerPlayer: tournament.price_per_player,
    maxPairs: tournament.max_pairs,
    clubName: club?.name,
    clubLogoUrl: club?.logo_url,
    clubThemeKey: club?.theme_key,
    rules: tournament.rules ?? tournament.rules_json,
  }} />
}
