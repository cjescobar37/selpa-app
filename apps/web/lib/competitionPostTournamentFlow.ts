export type WorkflowState = {
  id: string
  revision: number
  status: string
  blockers: unknown[]
  allowedActions: Record<string, boolean>
  sourceResultsRevision?: string | null
}

export class CompetitionWorkflowBlocked extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompetitionWorkflowBlocked'
  }
}

export async function approveCompetitionResults(adapter: {
  get: () => Promise<WorkflowState>
  extract: (state: WorkflowState) => Promise<void>
  submit: (state: WorkflowState) => Promise<void>
  approve: (state: WorkflowState) => Promise<void>
}) {
  let current = await adapter.get()
  if (current.status === 'DRAFT' && !current.sourceResultsRevision) {
    await adapter.extract(current)
    current = await adapter.get()
  }
  if (current.blockers.length) throw new CompetitionWorkflowBlocked('Corregí los problemas indicados antes de aprobar.')
  if (current.status === 'DRAFT') {
    if (!current.allowedActions.submit) throw new CompetitionWorkflowBlocked('Los resultados todavía no están listos para aprobar.')
    await adapter.submit(current)
    current = await adapter.get()
  }
  if (current.status === 'SUBMITTED') {
    if (current.blockers.length || !current.allowedActions.approve) throw new CompetitionWorkflowBlocked('La homologación quedó en revisión y requiere un administrador autorizado para aprobarla.')
    await adapter.approve(current)
    current = await adapter.get()
  }
  if (current.status !== 'APPROVED') throw new CompetitionWorkflowBlocked('Los resultados no pudieron quedar aprobados.')
  return current
}

export async function prepareCompetitionPointsPreview(adapter: {
  get: () => Promise<WorkflowState | null>
  create: () => Promise<void>
  calculate: (state: WorkflowState) => Promise<void>
}) {
  let current = await adapter.get()
  if (!current) {
    await adapter.create()
    current = await adapter.get()
  }
  if (!current) throw new CompetitionWorkflowBlocked('No pudimos crear la liquidación de la fecha.')
  if (current.status === 'DRAFT' && current.allowedActions.calculate) {
    await adapter.calculate(current)
    current = await adapter.get()
  }
  if (!current) throw new CompetitionWorkflowBlocked('No pudimos preparar la vista previa de puntos.')
  if (!['CALCULATED', 'SUBMITTED', 'APPROVED', 'PUBLISHED'].includes(current.status)) throw new CompetitionWorkflowBlocked('La liquidación no está en un estado publicable.')
  return current
}

export async function publishCompetitionPoints(adapter: {
  get: () => Promise<WorkflowState>
  submit: (state: WorkflowState) => Promise<WorkflowState>
  approve: (state: WorkflowState) => Promise<WorkflowState>
  publish: (state: WorkflowState) => Promise<WorkflowState>
}) {
  let current = await adapter.get()
  if (current.blockers.length) throw new CompetitionWorkflowBlocked('Corregí las incidencias antes de publicar puntos.')
  if (current.status === 'CALCULATED') {
    if (!current.allowedActions.submit) throw new CompetitionWorkflowBlocked('La liquidación todavía no está lista para publicar.')
    current = await adapter.submit(current)
  }
  if (current.status === 'SUBMITTED') {
    if (current.blockers.length || !current.allowedActions.approve) throw new CompetitionWorkflowBlocked('La liquidación requiere aprobación de un administrador autorizado.')
    current = await adapter.approve(current)
  }
  if (current.status === 'APPROVED') {
    if (current.blockers.length || !current.allowedActions.publish) throw new CompetitionWorkflowBlocked('Los puntos todavía no están listos para publicar.')
    current = await adapter.publish(current)
  }
  if (current.status !== 'PUBLISHED') throw new CompetitionWorkflowBlocked('Los puntos no pudieron quedar publicados.')
  return current
}
