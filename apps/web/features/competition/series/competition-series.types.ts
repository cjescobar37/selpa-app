export const SERIES_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const
export const RULE_STATUSES = ['DRAFT', 'ACTIVE', 'SUPERSEDED'] as const
export const ACCUMULATION_MODES = ['ALL_RESULTS', 'BEST_N', 'DROP_WORST_N'] as const
export const INVITED_POINTS_POLICIES = ['NON_SCORING', 'REQUIRE_ENTRY'] as const

export type CompetitionSeriesStatus = (typeof SERIES_STATUSES)[number]
export type CompetitionSeriesRuleStatus = (typeof RULE_STATUSES)[number]
export type CompetitionAccumulationMode = (typeof ACCUMULATION_MODES)[number]
export type InvitedPointsPolicy = (typeof INVITED_POINTS_POLICIES)[number]

export type CompetitionSeries = {
  id: string; club_id: string; season_id: string; name: string; code: string | null
  description: string | null; starts_on: string | null; ends_on: string | null
  status: CompetitionSeriesStatus; planned_events_count: number | null
  minimum_events_count: number | null; is_public: boolean; revision: number
  archived_at: string | null; created_at: string; updated_at: string
}

export type CompetitionSeriesDivision = {
  id: string; club_id: string; series_id: string; division_id: string; sort_order: number
  is_active: boolean; division_snapshot: Record<string, unknown> | null; frozen_at: string | null
  removed_at: string | null; revision: number; created_at: string; updated_at: string
  division?: {
    id: string; modality: string
    branch: { name: string; slug: string } | null
    segment: { name: string; slug: string } | null
    category: { name: string; legacy_category_id: number | null } | null
  } | null
}

export type CompetitionSeriesRule = {
  id: string; club_id: string; series_division_id: string; version: number
  status: CompetitionSeriesRuleStatus; points_scheme_id: string
  accumulation_mode: CompetitionAccumulationMode; best_results_count: number | null
  discard_worst_count: number | null; minimum_participations: number
  master_final_qualification_count: number | null; master_final_multiplier: number
  tie_breakers: unknown[]; bonus_rules: Record<string, unknown>; penalty_rules: Record<string, unknown>
  effective_from: string | null; frozen_at: string | null; superseded_at: string | null
  revision: number; created_at: string; updated_at: string
}

export type CompetitionSeriesEligibility = {
  id: string; club_id: string; series_rule_id: string; requires_active_entry: boolean
  allow_invited_players: boolean; invited_points_policy: InvitedPointsPolicy
  require_same_division_pair: boolean; age_category_id: string | null
  additional_rules: Record<string, unknown>; frozen_at: string | null
  revision: number; created_at: string; updated_at: string
  age_category?: { name: string } | null
}

export type CompetitionSeriesDetail = {
  series: CompetitionSeries
  divisions: Array<CompetitionSeriesDivision & {
    rules: Array<CompetitionSeriesRule & { eligibility: CompetitionSeriesEligibility | null }>
  }>
  finalization: CompetitionSeriesFinalization
  finalRanking: CompetitionSeriesFinalRankingRow[]
}

export type CompetitionSeriesFinalizationBlocker = { code: string; message: string }
export type CompetitionSeriesFinalization = {
  series_id: string; status: CompetitionSeriesStatus; revision: number
  events_total: number; events_completed: number; can_finalize: boolean
  blockers: CompetitionSeriesFinalizationBlocker[]; champions: CompetitionSeriesFinalRankingRow[]
}
export type CompetitionSeriesFinalRankingRow = {
  id: string; series_division_id: string; division_id: string; ranking_position: number
  club_player_id: string; player_id: string; display_name: string; avatar_url: string | null
  points: number; events_played: number; titles: number; finals: number; semifinals: number
  rule_id: string; rule_version: number; rule_snapshot: Record<string, unknown>
  tie_break_snapshot: Record<string, unknown>; finalized_at: string
}

export type CompetitionSeriesPrizeType = 'CASH' | 'GOODS' | 'SERVICE' | 'TROPHY' | 'OTHER'
export type CompetitionSeriesPrize = {
  id: string; club_id: string; series_id: string
  position_from: number; position_to: number; title: string; description: string | null
  prize_type: CompetitionSeriesPrizeType; amount: number | null; currency_code: string | null
  sort_order: number; is_active: boolean; revision: number
  created_by: string; updated_by: string; created_at: string; updated_at: string
}

export type CompetitionSeriesRankingRow = {
  position: number
  club_player_id: string
  player_id: string
  display_name: string
  avatar_url: string | null
  points: number
  events_played: number
  titles: number
}
