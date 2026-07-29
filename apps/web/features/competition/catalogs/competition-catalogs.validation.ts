import {
  AGE_REFERENCE_RULES,
  type AgeReferenceRule,
  type CompetitionAgeCategoryWrite,
  type CompetitionEventTierWrite,
} from './competition-catalogs.types'

type ValidationResult<T> = { value: T; error?: never } | { value?: never; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function integerValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function normalizeCatalogCode(value: unknown) {
  return textValue(value).toUpperCase()
}

export function validateAgeCategoryInput(input: unknown): ValidationResult<CompetitionAgeCategoryWrite> {
  const body = objectValue(input)
  if (!body) return { error: 'El contenido enviado no es válido.' }

  const name = textValue(body.name)
  const code = normalizeCatalogCode(body.code)
  const minAge = nullableInteger(body.min_age)
  const maxAge = nullableInteger(body.max_age)
  const rule = normalizeCatalogCode(body.age_reference_rule) as AgeReferenceRule
  const config = objectValue(body.age_reference_config ?? {})
  const sortOrder = integerValue(body.sort_order)

  if (!name) return { error: 'El nombre es obligatorio.' }
  if (!code) return { error: 'El código interno es obligatorio.' }
  if (!Number.isInteger(minAge) && minAge !== null) return { error: 'La edad mínima debe ser un número entero.' }
  if (!Number.isInteger(maxAge) && maxAge !== null) return { error: 'La edad máxima debe ser un número entero.' }
  if (minAge !== null && (minAge < 0 || minAge > 120)) return { error: 'La edad mínima debe estar entre 0 y 120.' }
  if (maxAge !== null && (maxAge < 0 || maxAge > 120)) return { error: 'La edad máxima debe estar entre 0 y 120.' }
  if (minAge !== null && maxAge !== null && minAge > maxAge) return { error: 'La edad mínima no puede superar la edad máxima.' }
  if (!AGE_REFERENCE_RULES.includes(rule)) return { error: 'La regla de fecha de referencia no es válida.' }
  if (!config) return { error: 'La configuración de fecha de referencia debe ser un objeto.' }
  if (!Number.isInteger(sortOrder)) return { error: 'El orden debe ser un número entero.' }

  if (rule === 'FIXED_DATE') {
    const fixedDate = textValue(config.date)
    if (Object.keys(config).length !== 1 || !isIsoCalendarDate(fixedDate)) {
      return { error: 'La regla de fecha fija requiere una fecha válida.' }
    }
  } else if (Object.keys(config).length > 0) {
    return { error: 'Esta regla no admite configuración adicional.' }
  }

  return {
    value: {
      name,
      code,
      min_age: minAge,
      max_age: maxAge,
      age_reference_rule: rule,
      age_reference_config: config,
      sort_order: sortOrder,
      is_active: booleanValue(body.is_active, true),
    },
  }
}

export function validateEventTierInput(input: unknown): ValidationResult<CompetitionEventTierWrite> {
  const body = objectValue(input)
  if (!body) return { error: 'El contenido enviado no es válido.' }

  const name = textValue(body.name)
  const code = normalizeCatalogCode(body.code)
  const description = textValue(body.description) || null
  const schemeId = body.default_points_scheme_id === null || body.default_points_scheme_id === '' || body.default_points_scheme_id === undefined
    ? null
    : textValue(body.default_points_scheme_id)
  const multiplier = Number(body.points_multiplier ?? 1)
  const sortOrder = integerValue(body.sort_order)

  if (!name) return { error: 'El nombre es obligatorio.' }
  if (!code) return { error: 'El código interno es obligatorio.' }
  if (schemeId !== null && !isUuid(schemeId)) return { error: 'El esquema de puntos no es válido.' }
  if (!Number.isFinite(multiplier) || multiplier <= 0) return { error: 'El multiplicador debe ser mayor que cero.' }
  if (!Number.isInteger(sortOrder)) return { error: 'El orden debe ser un número entero.' }

  return {
    value: {
      name,
      code,
      description,
      default_points_scheme_id: schemeId,
      points_multiplier: multiplier,
      is_master_final: booleanValue(body.is_master_final, false),
      sort_order: sortOrder,
      is_active: booleanValue(body.is_active, true),
    },
  }
}
