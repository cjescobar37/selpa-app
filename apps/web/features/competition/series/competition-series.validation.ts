import { ACCUMULATION_MODES, INVITED_POINTS_POLICIES } from './competition-series.types'

type Result<T> = { value: T; error?: never } | { value?: never; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) }
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function nullableText(value: unknown) { return text(value) || null }
function nullableInteger(value: unknown) { if (value === null || value === undefined || value === '') return null; const n=Number(value); return Number.isInteger(n) ? n : Number.NaN }
function isoDate(value: unknown) { const v=text(value); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null }

export function validateCreateSeries(input: unknown): Result<{ seasonId: string; name: string }> {
  const body=object(input); if (!body) return { error:'El contenido no es válido.' }
  if (!isUuid(body.season_id)) return { error:'La temporada es inválida.' }
  const name=text(body.name); if (!name) return { error:'El nombre es obligatorio.' }
  return { value:{ seasonId:body.season_id,name } }
}

export function validateUpdateSeries(input: unknown): Result<Record<string, unknown>> {
  const body=object(input); if (!body || !isUuid(body.id)) return { error:'El circuito es inválido.' }
  const revision=Number(body.revision); if (!Number.isInteger(revision) || revision<1) return { error:'La revisión es inválida.' }
  const name=text(body.name); if (!name) return { error:'El nombre es obligatorio.' }
  const starts=body.starts_on ? isoDate(body.starts_on) : null; const ends=body.ends_on ? isoDate(body.ends_on) : null
  if (body.starts_on && !starts || body.ends_on && !ends) return { error:'Las fechas no son válidas.' }
  const planned=nullableInteger(body.planned_events_count), minimum=nullableInteger(body.minimum_events_count)
  if (Number.isNaN(planned) || Number.isNaN(minimum)) return { error:'Los conteos deben ser enteros.' }
  return { value:{ id:body.id,revision,name,code:nullableText(body.code),description:nullableText(body.description),starts_on:starts,ends_on:ends,planned_events_count:planned,minimum_events_count:minimum,is_public:body.is_public===true } }
}

export function validateDivision(input: unknown): Result<{ divisionId?: string; linkId?: string; sortOrder: number; revision: number }> {
  const body=object(input); if (!body) return { error:'El contenido no es válido.' }
  const divisionId=isUuid(body.division_id) ? body.division_id : undefined; const linkId=isUuid(body.id) ? body.id : undefined
  if (!divisionId && !linkId) return { error:'La división es inválida.' }
  const revision=Number(body.revision), sortOrder=Number(body.sort_order ?? 0)
  if (!Number.isInteger(revision) || revision<1 || !Number.isInteger(sortOrder)) return { error:'Revisión u orden inválidos.' }
  return { value:{divisionId,linkId,sortOrder,revision} }
}

export function validateRuleCreate(input: unknown): Result<{ seriesDivisionId:string; pointsSchemeId:string; cloneRuleId:string|null; seriesRevision:number }> {
  const body=object(input); if (!body || !isUuid(body.series_division_id) || !isUuid(body.points_scheme_id)) return { error:'División o esquema inválido.' }
  const seriesRevision=Number(body.series_revision);if(!Number.isInteger(seriesRevision)||seriesRevision<1)return {error:'La revisión del circuito es inválida.'}
  const clone=body.clone_rule_id ? body.clone_rule_id : null; if (clone!==null && !isUuid(clone)) return { error:'La regla de origen es inválida.' }
  return { value:{seriesDivisionId:body.series_division_id,pointsSchemeId:body.points_scheme_id,cloneRuleId:clone,seriesRevision} }
}

export function validateRuleUpdate(input: unknown): Result<{ id:string; revision:number; seriesRevision:number; config:Record<string,unknown> }> {
  const body=object(input); if (!body || !isUuid(body.id)) return { error:'La regla es inválida.' }
  const revision=Number(body.revision); if (!Number.isInteger(revision)||revision<1) return { error:'La revisión es inválida.' }
  const seriesRevision=Number(body.series_revision);if(!Number.isInteger(seriesRevision)||seriesRevision<1)return {error:'La revisión del circuito es inválida.'}
  const config=object(body.config); if (!config) return { error:'La configuración es inválida.' }
  if (config.accumulation_mode && !ACCUMULATION_MODES.includes(String(config.accumulation_mode).toUpperCase() as (typeof ACCUMULATION_MODES)[number])) return { error:'El modo de acumulación es inválido.' }
  return { value:{id:body.id,revision,seriesRevision,config} }
}

export function validateEligibility(input: unknown): Result<{ ruleId:string; revision:number|null; seriesRevision:number; config:Record<string,unknown> }> {
  const body=object(input); if (!body || !isUuid(body.rule_id)) return { error:'La regla es inválida.' }
  const revision=body.revision===null||body.revision===undefined?null:Number(body.revision); if (revision!==null&&(!Number.isInteger(revision)||revision<1)) return { error:'La revisión es inválida.' }
  const seriesRevision=Number(body.series_revision);if(!Number.isInteger(seriesRevision)||seriesRevision<1)return {error:'La revisión del circuito es inválida.'}
  const config=object(body.config); if (!config) return { error:'La elegibilidad es inválida.' }
  if (config.invited_points_policy && !INVITED_POINTS_POLICIES.includes(String(config.invited_points_policy).toUpperCase() as (typeof INVITED_POINTS_POLICIES)[number])) return { error:'La política de invitados es inválida.' }
  if (config.age_category_id && !isUuid(config.age_category_id)) return { error:'La categoría etaria es inválida.' }
  return { value:{ruleId:body.rule_id,revision,seriesRevision,config} }
}

export function validatePrizes(input: unknown): Result<{ seriesRevision: number; prizes: unknown[] }> {
  const body=object(input); if (!body || !Array.isArray(body.prizes)) return { error:'Los premios no son válidos.' }
  const seriesRevision=Number(body.series_revision)
  if (!Number.isInteger(seriesRevision) || seriesRevision<1) return { error:'La revisión del circuito es inválida.' }
  if (body.prizes.length>50) return { error:'La cantidad de premios no es válida.' }
  return { value:{seriesRevision,prizes:body.prizes} }
}

export function validateLifecycle(input: unknown): Result<{ action:string; revision:number; confirm:boolean; reason:string|null }> {
  const body=object(input); if (!body) return { error:'El contenido no es válido.' }
  const action=text(body.action).toUpperCase(), revision=Number(body.revision)
  if (!['SCHEDULE','RETURN_TO_DRAFT','ACTIVATE','CLOSE','CANCEL','ARCHIVE'].includes(action)) return { error:'La acción no es válida.' }
  if (!Number.isInteger(revision)||revision<1) return { error:'La revisión es inválida.' }
  return { value:{action,revision,confirm:body.confirm===true,reason:nullableText(body.reason)} }
}

export function validateSeriesDelete(input: unknown): Result<{ revision:number; confirmation:string }> {
  const body=object(input); if (!body) return { error:'El contenido no es válido.' }
  const revision=Number(body.revision); if (!Number.isInteger(revision)||revision<1) return { error:'La revisión es inválida.' }
  const confirmation=text(body.confirmation)
  if (confirmation !== 'ACEPTAR') return { error:'Escribí ACEPTAR para eliminar el circuito.' }
  return { value:{revision,confirmation} }
}
