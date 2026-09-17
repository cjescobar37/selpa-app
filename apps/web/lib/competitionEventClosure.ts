export type ClosureIssue = { code: string; message: string }

export type ClosureEventDetail = {
  event: { status: string; revision: number }
  series: { status?: unknown; revision?: unknown }
  divisions: Array<Record<string, unknown> & { id?: unknown; status?: unknown; is_active?: unknown }>
  completeness: { blockers?: unknown }
  allowed_actions: Record<string, boolean>
}

export type ClosureHomologation = {
  id: string
  revision: number
  status: string
  source_results_revision?: string | null
}

export type ClosureHomologationDetail = {
  homologation: ClosureHomologation
  participants: unknown[]
  results: unknown[]
  blockers: unknown[]
}

export type CompetitionEventClosureAdapter = {
  getEvent: () => Promise<ClosureEventDetail>
  activateSeries: (revision: number) => Promise<void>
  scheduleEvent: (revision: number) => Promise<void>
  getDivisionPreflight: (divisionId: string) => Promise<{ ready: boolean; blockers: ClosureIssue[] }>
  completeDivision: (divisionId: string, eventRevision: number) => Promise<void>
  completeEvent: (revision: number) => Promise<void>
  listHomologations: (divisionId: string) => Promise<ClosureHomologation[]>
  createHomologation: (divisionId: string) => Promise<ClosureHomologation>
  getHomologation: (divisionId: string, homologationId: string) => Promise<ClosureHomologationDetail>
  extractHomologation: (divisionId: string, homologationId: string, revision: number) => Promise<void>
}

export class CompetitionEventClosureBlocked extends Error {
  readonly issues: ClosureIssue[]

  constructor(issues: ClosureIssue[]) {
    super(issues[0]?.message ?? 'La fecha todavía tiene una condición pendiente.')
    this.issues = issues
    this.name = 'CompetitionEventClosureBlocked'
  }
}

function eventIssues(detail: ClosureEventDetail): ClosureIssue[] {
  const values = Array.isArray(detail.completeness.blockers) ? detail.completeness.blockers : []
  return values.map((value) => typeof value === 'string'
    ? { code: value.split(':')[0], message: value }
    : { code: String((value as Record<string, unknown>)?.code ?? 'CONFIGURATION_PENDING'), message: String((value as Record<string, unknown>)?.message ?? 'La configuración de la fecha está incompleta.') })
}

function activeDivisions(detail: ClosureEventDetail) {
  return detail.divisions.filter((division) => division.is_active !== false)
}

export async function closeCompetitionEvent(adapter: CompetitionEventClosureAdapter) {
  let detail = await adapter.getEvent()
  const seriesStatus = String(detail.series.status ?? '')
  if (seriesStatus === 'SCHEDULED') {
    await adapter.activateSeries(Number(detail.series.revision))
    detail = await adapter.getEvent()
  } else if (seriesStatus !== 'ACTIVE') {
    throw new CompetitionEventClosureBlocked([{ code: 'SERIES_NOT_ACTIVE', message: 'El circuito debe estar activo antes de cerrar la fecha.' }])
  }

  if (detail.event.status === 'DRAFT') {
    if (!detail.allowed_actions.schedule) throw new CompetitionEventClosureBlocked(eventIssues(detail))
    await adapter.scheduleEvent(detail.event.revision)
    detail = await adapter.getEvent()
  }

  for (const division of activeDivisions(detail)) {
    const divisionId = String(division.id ?? '')
    const divisionStatus = String(detail.divisions.find((item) => String(item.id) === divisionId)?.status ?? '')
    if (divisionStatus === 'CANCELLED' || divisionStatus === 'COMPLETED') continue
    if (divisionStatus !== 'SCHEDULED') throw new CompetitionEventClosureBlocked([{ code: 'DIVISION_NOT_SCHEDULED', message: 'Una división no quedó lista para cerrar.' }])
    const preflight = await adapter.getDivisionPreflight(divisionId)
    if (!preflight.ready) throw new CompetitionEventClosureBlocked(preflight.blockers)
    await adapter.completeDivision(divisionId, detail.event.revision)
    detail = await adapter.getEvent()
  }

  if (detail.event.status === 'SCHEDULED') {
    if (!detail.allowed_actions.complete) throw new CompetitionEventClosureBlocked(eventIssues(detail))
    await adapter.completeEvent(detail.event.revision)
    detail = await adapter.getEvent()
  }
  if (detail.event.status !== 'COMPLETED') throw new CompetitionEventClosureBlocked([{ code: 'EVENT_NOT_COMPLETED', message: 'La fecha no pudo quedar cerrada.' }])

  const generated: Array<{ divisionId: string; detail: ClosureHomologationDetail }> = []
  for (const division of activeDivisions(detail).filter((item) => String(item.status) === 'COMPLETED')) {
    const divisionId = String(division.id)
    const current = (await adapter.listHomologations(divisionId)).find((item) => !['REJECTED', 'SUPERSEDED'].includes(item.status)) ?? await adapter.createHomologation(divisionId)
    let homologation = await adapter.getHomologation(divisionId, current.id)
    if (homologation.homologation.status === 'DRAFT' && !homologation.homologation.source_results_revision) {
      await adapter.extractHomologation(divisionId, current.id, homologation.homologation.revision)
      homologation = await adapter.getHomologation(divisionId, current.id)
    }
    generated.push({ divisionId, detail: homologation })
  }

  if (!generated.length) throw new CompetitionEventClosureBlocked([{ code: 'HOMOLOGATION_MISSING', message: 'No hay una división cerrada para revisar.' }])
  return {
    eventDivisionId: generated[0].divisionId,
    homologationId: generated[0].detail.homologation.id,
    participants: generated.reduce((sum, item) => sum + item.detail.participants.length, 0),
    results: generated.reduce((sum, item) => sum + item.detail.results.length, 0),
  }
}
