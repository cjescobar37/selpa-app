const fallbackLabel = (value?: unknown, fallback = 'Sin definir') => {
  const clean = String(value ?? '').trim()
  return clean ? clean.replaceAll('_', ' ') : fallback
}

export function formatTournamentTypeLabel(value?: string | null) {
  const key = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    OPEN: 'Open',
    MASTER: 'Master',
    MASTER_FINAL: 'Master Final',
    CHALLENGER: 'Challenger',
    AMERICANO: 'Americano',
    MIXTO: 'Mixto',
    MIXED: 'Mixto',
    EXHIBITION: 'Exhibición',
  }
  return labels[key] ?? fallbackLabel(value, 'Sin tipo')
}

export function formatTournamentSystemLabel(value?: string | null) {
  const key = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    GROUPS_ELIMINATION: 'Zona + Playoff',
    GROUPS_ELIM: 'Zona + Playoff',
    GROUPS_PLAYOFF: 'Zona + Playoff',
    ZONE_PLAYOFF: 'Zona + Playoff',
    ELIMINATION: 'Eliminación directa',
    DIRECT_ELIM: 'Eliminación directa',
    DIRECT_ELIMINATION: 'Eliminación directa',
    SINGLE_ELIMINATION: 'Eliminación directa',
    ROUND_ROBIN: 'Todos contra todos',
    GROUPS: 'Zonas',
    LEAGUE: 'Liga',
  }
  return labels[key] ?? fallbackLabel(value, 'Sin formato')
}

export function resolveTournamentCompetitionSystem(
  rules?: Record<string, unknown> | null,
  legacyFormat?: string | null,
): 'GROUPS_PLAYOFF' | 'ROUND_ROBIN' | 'SINGLE_ELIMINATION' | null {
  const configured = rules?.competition_system
  if (configured === 'DIRECT_ELIMINATION') return 'SINGLE_ELIMINATION'
  if (configured === 'GROUPS_PLAYOFF' || configured === 'ROUND_ROBIN' || configured === 'SINGLE_ELIMINATION') {
    return configured
  }
  const legacy = String(legacyFormat ?? '').trim().toUpperCase()
  if (['GROUPS_PLAYOFF', 'GROUPS_ELIMINATION', 'GROUPS_ELIM', 'ZONE_PLAYOFF'].includes(legacy)) return 'GROUPS_PLAYOFF'
  if (['SINGLE_ELIMINATION', 'DIRECT_ELIM', 'DIRECT_ELIMINATION', 'ELIMINATION'].includes(legacy)) return 'SINGLE_ELIMINATION'
  if (legacy === 'ROUND_ROBIN') return 'ROUND_ROBIN'
  return null
}

export function formatBranchLabel(value?: string | null) {
  const key = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    M: 'Caballeros',
    MALE: 'Caballeros',
    MASCULINO: 'Caballeros',
    CABALLEROS: 'Caballeros',
    F: 'Damas',
    FEMALE: 'Damas',
    FEMENINO: 'Damas',
    DAMAS: 'Damas',
    MIXED: 'Mixto',
    MIXTO: 'Mixto',
  }
  return labels[key] ?? fallbackLabel(value, 'Sin rama')
}

export function formatGenderLabel(value?: string | null) {
  return formatBranchLabel(value)
}

export function formatCategoryLabel(value?: number | string | null) {
  const numeric = Number(value)
  const labels: Record<number, string> = {
    1: '1ra',
    2: '2da',
    3: '3ra',
    4: '4ta',
    5: '5ta',
    6: '6ta',
    7: '7ma',
  }
  return Number.isFinite(numeric) && numeric > 0 ? labels[numeric] ?? `${numeric}` : 'Sin categoría'
}

export function formatSegmentLabel(value?: unknown) {
  const key = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    LIBRES: 'Libres',
    FREE: 'Libres',
    MENORES: 'Menores',
    MINORS: 'Menores',
    VETERANOS: 'Veteranos',
    VETERANS: 'Veteranos',
  }
  return labels[key] ?? fallbackLabel(value, 'Libres')
}

export function formatTournamentStatusLabel(value?: string | null) {
  const key = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    DRAFT: 'Borrador',
    OPEN: 'Inscripciones abiertas',
    REGISTRATION_OPEN: 'Inscripciones abiertas',
    RUNNING: 'En juego',
    READY: 'Listo',
    FINISHED: 'Finalizado',
    CANCELLED: 'Cancelado',
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmado',
  }
  return labels[key] ?? fallbackLabel(value, 'Sin estado')
}
