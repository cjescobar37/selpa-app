/** Public allowlist: never extend with contact, birth date, roles or finances. */
export type CareerIdentity = {
  userId: string; name: string; avatarUrl: string | null; coverUrl: string | null;
  selectedClubPlayerId: string; publicPath: string;
  contexts: Array<{ clubPlayerId: string; clubId: string; clubName: string; category: number | null; gender: string | null }>;
}
export type SportsStanding = {
  club_player_id: string; club_id: string; user_id: string; player_entry_id: string;
  full_name: string; avatar_url: string | null; category: number | null; category_name: string;
  gender: string; season_id: string; season_name: string; division_id: string;
  modality: string; ranking_points: number; position: number; is_tied: boolean; ordinal: number;
}
export type CareerStats = {
  tournaments_played: number; matches_played: number; wins: number; losses: number;
  titles: number; finals: number; semifinals: number; effectiveness: number | null;
}
export type CareerSummary = {
  standing: SportsStanding | null; stats: CareerStats | null; statsAvailable: boolean;
  statsPeriod: 'CLUB_CAREER_ALL_SEASONS';
  bestResult: { role: string; position: number | null } | null;
  scope: { clubId: string; clubPlayerId: string; seasonId: string | null; seasonName: string | null };
  partner: { name: string; publicPath: string } | null;
}
export type CareerHistoryRow = {
  id: string; tournament_id: string; tournament_name: string; sports_date: string | null;
  category: number | null; category_name: string | null; partner_name: string;
  result_role: string; final_position: number | null; points: number | null;
}
export type CareerRecentRow = { id: string; tournament_name: string; tournament_id: string; sports_date: string | null; won: boolean }
export type RankingContext = { clubId: string; seasonId: string; seasonName: string; divisionId: string; category: number | null; categoryName: string; gender: string; modality: string }
export type RankingPage = { rows: SportsStanding[]; count: number; page: number; pageSize: number; context: RankingContext | null }
