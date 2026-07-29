export type CompetitionModality = 'INDIVIDUAL' | 'PAIRS'

export type CompetitionSeasonStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED'

export type CompetitionAccentKind = 'DEFAULT' | 'CYAN' | 'MAGENTA' | 'MIXED'

export type CompetitionPlayerEntryStatus = 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' | 'TRANSFERRED'

export type CompetitionPlayerAssignmentType =
  | 'MANUAL'
  | 'LEGACY_BACKFILL'
  | 'PROMOTION'
  | 'RELEGATION'
  | 'CORRECTION'
  | 'IMPORT'

export type CompetitionSeason = {
  id: string
  club_id: string
  name: string
  starts_on: string
  ends_on: string
  status: CompetitionSeasonStatus
  is_public: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CompetitionBranch = {
  id: string
  club_id: string
  name: string
  slug: string
  accent_kind: CompetitionAccentKind
  sort_order: number
  is_active: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type CompetitionSegment = {
  id: string
  club_id: string
  name: string
  slug: string
  sort_order: number
  is_active: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type CompetitionCategory = {
  id: string
  club_id: string
  name: string
  short_label: string
  slug: string
  legacy_category_id: number | null
  sort_order: number
  is_active: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type CompetitionDivision = {
  id: string
  club_id: string
  season_id: string
  modality: CompetitionModality
  branch_id: string
  segment_id: string | null
  category_id: string | null
  name_override: string | null
  sort_order: number
  is_active: boolean
  is_visible: boolean
  created_at: string
  updated_at: string
}

export type CompetitionPlayerEntry = {
  id: string
  club_id: string
  division_id: string
  club_player_id: string
  status: CompetitionPlayerEntryStatus
  valid_from: string
  valid_until: string | null
  assigned_by: string | null
  assignment_type: CompetitionPlayerAssignmentType
  previous_entry_id: string | null
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CompetitionBackfillBatchStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'APPROVED'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'FAILED'

export type CompetitionBackfillDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'SKIPPED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'FAILED'

export type CompetitionBackfillBatch = {
  id: string
  club_id: string
  season_id: string
  status: CompetitionBackfillBatchStatus
  created_by: string | null
  approved_by: string | null
  created_at: string
  approved_at: string | null
  executed_at: string | null
  metadata: Record<string, unknown>
  notes: string | null
}

export type CompetitionBackfillBatchItem = {
  id: string
  batch_id: string
  club_id: string
  club_player_id: string
  proposed_division_id: string | null
  diagnostic_status: CompetitionBackfillDiagnosticStatus
  decision: CompetitionBackfillDecision
  decision_reason: string | null
  executed_entry_id: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CompetitionBackfillDiagnosticStatus =
  | 'READY'
  | 'ALREADY_ASSIGNED'
  | 'MISSING_SEASON'
  | 'MISSING_BRANCH'
  | 'MISSING_CATEGORY'
  | 'MISSING_DIVISION'
  | 'AMBIGUOUS_DIVISION'
  | 'INVALID_LEGACY_GENDER'
  | 'INVALID_LEGACY_CATEGORY'
  | 'MULTIPLE_ACTIVE_SEASONS'
  | 'MULTIPLE_CANDIDATE_BRANCHES'
  | 'DUPLICATE_USER_MEMBERSHIP'
  | 'MANUAL_REVIEW'

export type CompetitionBackfillDiagnosticRow = {
  club_id: string
  club_player_id: string
  user_id: string
  player_name: string
  legacy_gender: string | null
  legacy_category: number | null
  ranking_points: number | null
  active_season_id: string | null
  candidate_branch_id: string | null
  candidate_branch: string | null
  candidate_category_id: string | null
  candidate_category: string | null
  candidate_division_id: string | null
  candidate_division_count: number
  existing_entry_id: string | null
  diagnostic_status: CompetitionBackfillDiagnosticStatus
  diagnostic_detail: string
}

export type CompetitionBackfillBatchSummary = {
  batch_id: string
  summary: Partial<Record<CompetitionBackfillDecision, number>>
}
