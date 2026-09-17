const issueLabels: Record<string, string> = {
  SERIES_NOT_ACTIVE: 'Activá el circuito antes de preparar la fecha.',
  EVENT_ARCHIVED: 'La fecha está archivada.',
  EVENT_NOT_DRAFT: 'La fecha ya no está en borrador.',
  DATES_MISSING: 'Falta definir inicio y fin.',
  DATES_INVALID: 'La fecha de fin debe ser posterior al inicio.',
  TIMEZONE_MISSING: 'Falta definir la zona horaria.',
  TIMEZONE_INVALID: 'La zona horaria configurada no es válida.',
  DIVISIONS_MISSING: 'Falta agregar al menos una división.',
  DIVISION_NOT_DRAFT: 'La división ya no está en borrador.',
  DIVISION_RELATION_INVALID: 'La división no corresponde a este circuito.',
  SCORING_MISSING: 'Falta elegir la modalidad de puntuación de la división.',
  EVENT_RULE_CHANGED: 'Falta configurar una regla activa para la división.',
  EVENT_TYPE_SCORING: 'Las fechas con puntos deben ser de tipo Competitivo.',
  TIER_INVALID: 'Falta elegir un nivel activo para la división.',
  SCHEME_INVALID: 'Falta elegir un esquema de puntos activo.',
  MULTIPLIER_INVALID: 'Falta definir un multiplicador de puntos válido.',
  NON_SCORING_INVALID: 'La división sin puntos conserva una configuración incompatible.',
  TOURNAMENT_MISSING: 'Falta vincular el torneo de la división.',
  PLANNED_EVENTS_COUNT_DIFFERS: 'La cantidad de fechas creadas no coincide con la planificada.',
  VENUE_MISSING: 'Falta indicar la sede.',
  NOT_PUBLIC: 'La fecha todavía no es pública.',
}

const operationalDiagnostics = new Set(['EVENT_NOT_DRAFT', 'DIVISION_NOT_DRAFT', 'SNAPSHOT_UNEXPECTED', 'PLANNED_EVENTS_COUNT_DIFFERS'])

export function competitionEventIssueCode(value: unknown) {
  if (typeof value === 'string') return value.split(':')[0]
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return String(row.code ?? row.reason ?? '').split(':')[0]
  }
  return ''
}

export function competitionEventIssueLabel(value: unknown) {
  const code = competitionEventIssueCode(value)
  if (issueLabels[code]) return issueLabels[code]
  if (value && typeof value === 'object') {
    const message = (value as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return code ? `Revisá la configuración: ${code}.` : 'Queda una configuración pendiente.'
}

export function isActionableCompetitionEventIssue(value: unknown, context?: { tournament_status?: string | null }) {
  const code = competitionEventIssueCode(value)
  if (code === 'NOT_PUBLIC' && ['OPEN', 'RUNNING', 'FINISHED', 'COMPLETED'].includes(String(context?.tournament_status ?? '').toUpperCase())) return false
  return Boolean(issueLabels[code]) && !operationalDiagnostics.has(code)
}

export function uniqueCompetitionEventIssues(values: unknown[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const code = competitionEventIssueCode(value) || String(value)
    if (seen.has(code)) return false
    seen.add(code)
    return true
  })
}
