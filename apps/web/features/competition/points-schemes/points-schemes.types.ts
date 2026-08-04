export const POINT_RESULT_CODES = ['CHAMPION', 'RUNNER_UP', 'SEMIFINALIST', 'QUARTERFINALIST', 'PARTICIPANT'] as const
export type PointResultCode = typeof POINT_RESULT_CODES[number]
export type PointsScheme = { id:string; club_id:string|null; name:string; description:string|null; is_global:boolean; is_active:boolean; revision:number; archived_at:string|null; created_at:string; updated_at:string; rule_count?:number }
export type PointsSchemeRule = { id:string; scheme_id:string; rule_key:PointResultCode; points:number; sort_order:number; is_active:boolean; revision:number; config:Record<string,unknown>; created_at:string; updated_at:string }
