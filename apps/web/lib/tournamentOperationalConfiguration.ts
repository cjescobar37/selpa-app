export type OperationalTournament = {
  id: string; club_id: string; name: string; status: string | null; updated_at: string | null;
  registration_deadline: string | null; min_pairs: number; max_pairs: number | null; price_per_player: number | null;
  start_date: string | null; end_date: string | null; rules_json: Record<string, unknown> | null;
}
export type TournamentConfigurationDetail = {
  tournament: OperationalTournament; teams: number; seedsFrozen: boolean; fixtureGenerated: boolean;
  registrationCount: number; hasGroups: boolean; hasMatches: boolean;
  timezone: string | null;
  capabilities: TournamentEditableCapabilities;
  canEdit: boolean; blockedReason: string | null;
}
export type TournamentFieldCapability = { editable: boolean; reason: string | null; confirmation?: string }
export type TournamentEditableCapabilities = Record<'registrationDeadline'|'minimumPairs'|'capacity'|'price'|'courts'|'schedule'|'competitionSystem'|'structure'|'logistics'|'timezone', TournamentFieldCapability>
export function getTournamentEditableCapabilities(input: {
  tournamentStatus: string | null; hasSeedSnapshot: boolean; hasGroups: boolean; hasMatches: boolean; registrationCount: number;
}): TournamentEditableCapabilities {
  const status = String(input.tournamentStatus ?? '').toUpperCase()
  const draft = status === 'DRAFT'
  const operational = ['DRAFT','OPEN','RUNNING'].includes(status)
  const milestone = input.hasSeedSnapshot || input.hasGroups || input.hasMatches
  const reason = input.hasSeedSnapshot ? 'Los seeds ya fueron congelados.' : input.hasGroups || input.hasMatches ? 'Ya hay grupos o partidos generados.' : 'No está disponible en el estado actual del torneo.'
  const permission = (editable: boolean): TournamentFieldCapability => ({editable, reason: editable ? null : reason})
  const enrollment = (draft || status === 'OPEN') && !milestone
  return {
    registrationDeadline: permission(enrollment), minimumPairs: {...permission(draft && !milestone), ...(!draft && !milestone ? {reason:'El mínimo de parejas sólo se cambia en borrador.'} : {})},
    capacity: permission(enrollment), price: permission(enrollment),
    courts: permission(operational), schedule: permission(operational), logistics: permission(operational),
    timezone: permission(operational && !input.hasGroups && !input.hasMatches),
    structure: {...permission(draft && !milestone), ...(!draft && !milestone ? {reason:'La configuración deportiva general sólo se cambia en borrador.'} : {})},
    competitionSystem: {...permission(enrollment), ...(!draft && enrollment ? {confirmation:'Cambiar el sistema de competencia puede modificar la forma en que se generarán grupos y playoff.'} : {})},
  }
}
export function validateTournamentCapacity(maxPairs: number | null, registrationCount: number) {
  return maxPairs !== null && maxPairs < registrationCount ? `Ya hay ${registrationCount} parejas inscriptas. El cupo no puede ser menor.` : null
}
export function validateTournamentRegistrationDeadline(deadline: string | null, startInstant: string) {
  return deadline && Date.parse(deadline)>=Date.parse(startInstant) ? 'El cierre debe ser anterior al inicio del torneo.' : null
}
export function validateOperationalFieldChanges(capabilities: TournamentEditableCapabilities, changed: Partial<Record<keyof TournamentEditableCapabilities, boolean>>, confirmation: unknown) {
  for (const field of Object.keys(changed) as (keyof TournamentEditableCapabilities)[]) {
    if (changed[field] && !capabilities[field].editable) return capabilities[field].reason
  }
  if (changed.competitionSystem && capabilities.competitionSystem.confirmation && confirmation !== true) return capabilities.competitionSystem.confirmation
  return null
}
export function validateLinkedEventFieldChanges(current: Record<string, unknown>, next: Record<string, unknown>, capabilities: TournamentEditableCapabilities) {
  const fields: Record<string,keyof TournamentEditableCapabilities>={name:'structure',event_type:'structure',planned_starts_at:'structure',planned_ends_at:'structure',venue_name:'logistics',venue_address:'logistics',is_public:'logistics',timezone:'timezone'}
  for(const [field,capability] of Object.entries(fields)){
    if(!(field in next))continue
    const value=(input:unknown)=>field.startsWith('planned_')&&typeof input==='string'?Date.parse(input):input??null
    if(value(current[field])!==value(next[field])&&!capabilities[capability].editable)return capabilities[capability].reason
  }
  return null
}
export function tournamentConfigurationEditGuard(status: string | null, seedsFrozen: boolean, fixtureGenerated: boolean) {
  if (seedsFrozen) return 'Los seeds ya están congelados. La configuración deportiva no se puede cambiar.'
  if (fixtureGenerated) return 'Ya hay grupos o partidos generados. La configuración deportiva está bloqueada.'
  if (String(status ?? '').toUpperCase() !== 'DRAFT') return 'El torneo ya está publicado. La edición general sólo está disponible en borrador.'
  return null
}
export function registrationDeadlineState(deadline: string | null, now = new Date()) {
  if (!deadline) return 'Cierre pendiente'
  return new Date(deadline).getTime() <= now.getTime() ? 'Inscripciones cerradas' : 'Abiertas hasta'
}
export function dateConfigurationCta(blockers: unknown[]) {
  return blockers.length ? 'Completar configuración' : 'Configurar fecha'
}
export const operationalTournamentKeys = ['registration_deadline','min_pairs','max_pairs','price_per_player','competition_system','schedule_config','tournament_courts'] as const

export function validateTournamentOperationalConfiguration(input: Record<string, unknown>) {
  if (operationalTournamentKeys.some(key => !(key in input))) return false
  if (Object.keys(input).some(key => ![...operationalTournamentKeys,'action','expected_updated_at','confirm_competition_system_change'].includes(key))) return false
  if ('confirm_competition_system_change' in input && typeof input.confirm_competition_system_change !== 'boolean') return false
  if (input.registration_deadline !== null && (typeof input.registration_deadline !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.registration_deadline) || !Number.isFinite(Date.parse(input.registration_deadline)))) return false
  if (typeof input.min_pairs !== 'number' || !Number.isInteger(input.min_pairs) || input.min_pairs < 2) return false
  if (input.max_pairs !== null && (typeof input.max_pairs !== 'number' || !Number.isInteger(input.max_pairs) || input.max_pairs < input.min_pairs)) return false
  if (typeof input.price_per_player !== 'number' || !Number.isFinite(input.price_per_player) || input.price_per_player < 0) return false
  if (!['GROUPS_PLAYOFF','SINGLE_ELIMINATION','ROUND_ROBIN'].includes(String(input.competition_system))) return false
  const object = (value: unknown): Record<string,unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null
  const schedule = object(input.schedule_config)
  if (!schedule || !['AUTO','MANUAL'].includes(String(schedule.mode)) || typeof schedule.match_duration_minutes !== 'number' || !Number.isInteger(schedule.match_duration_minutes) || schedule.match_duration_minutes < 1) return false
  const minutes = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return NaN
    const [hour,minute] = value.split(':').map(Number)
    return hour <= 24 && minute < 60 && (hour < 24 || minute === 0) ? hour*60+minute : NaN
  }
  for (const phase of ['groups','playoff']) {
    const window = object(schedule[phase])
    if (!window || typeof window.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(window.date) || !Number.isFinite(Date.parse(window.date)) || new Date(window.date).toISOString().slice(0,10)!==window.date || !(minutes(window.start_time) < minutes(window.end_time))) return false
  }
  if (!Array.isArray(input.tournament_courts)) return false
  return input.tournament_courts.every(value => {
    const court = object(value)
    return Boolean(court && typeof court.name === 'string' && court.name.trim() && ['OWN_CLUB','EXTERNAL_COMPLEX'].includes(String(court.source)))
  })
}
