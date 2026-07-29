export const AGE_REFERENCE_RULES = [
  'EVENT_START_DATE',
  'SERIES_START_DATE',
  'SEASON_START_DATE',
  'SEASON_END_DATE',
  'CALENDAR_YEAR_END',
  'FIXED_DATE',
] as const

export type AgeReferenceRule = (typeof AGE_REFERENCE_RULES)[number]

export type CompetitionAgeCategory = {
  id: string
  club_id: string
  name: string
  code: string
  min_age: number | null
  max_age: number | null
  age_reference_rule: AgeReferenceRule
  age_reference_config: Record<string, unknown>
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CompetitionEventTier = {
  id: string
  club_id: string
  name: string
  code: string
  description: string | null
  default_points_scheme_id: string | null
  points_multiplier: number
  is_master_final: boolean
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CompetitionAgeCategoryWrite = Omit<
  CompetitionAgeCategory,
  'id' | 'club_id' | 'created_by' | 'created_at' | 'updated_at'
>

export type CompetitionEventTierWrite = Omit<
  CompetitionEventTier,
  'id' | 'club_id' | 'created_by' | 'created_at' | 'updated_at'
>
