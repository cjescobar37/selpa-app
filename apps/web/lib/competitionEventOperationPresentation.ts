export type OperationDivisionProgress = {
  linked: boolean;
  tournamentStatus: string | null;
  divisionStatus: string;
  homologationStatus: string;
  settlementStatus: string;
  scoringMode: string;
}
export type OperationTimelineStep = { label: string; state: 'done' | 'current' | 'pending' }
export function getCompetitionConfigurationAction(input:{hasRequiredIssues:boolean;hasEventCapability:boolean;hasTournamentCapability:boolean;hasCompetitionCapability:boolean}){
  const editable=input.hasEventCapability||input.hasTournamentCapability||input.hasCompetitionCapability
  return {editable,label:editable?(input.hasRequiredIssues?'Completar configuración':'Configurar fecha'):'Ver configuración'} as const
}

/** Presentation only: use the latest loaded records, never mutate or advance the pipeline. */
export function getCompetitionEventOperationPresentation(input: {
  eventStatus: string;
  operationalState: string;
  divisions: OperationDivisionProgress[];
  canCloseDate: boolean;
}) {
  const { divisions } = input
  const every = (predicate: (division: OperationDivisionProgress) => boolean) => divisions.length > 0 && divisions.every(predicate)
  const linked = every(division => division.linked)
  const results = every(division => division.divisionStatus === 'COMPLETED' || ['FINISHED','COMPLETED'].includes(division.tournamentStatus ?? ''))
  const reviewed = every(division => division.homologationStatus === 'APPROVED')
  const scoring = divisions.filter(division => division.scoringMode !== 'NON_SCORING')
  const calculated = scoring.length > 0 && scoring.every(division => ['CALCULATED','SUBMITTED','APPROVED','PUBLISHED'].includes(division.settlementStatus))
  const published = scoring.length > 0 && scoring.every(division => division.settlementStatus === 'PUBLISHED')
  const milestones: [string, boolean][] = [
    ['Fecha creada', true], ['Torneo vinculado', linked], ['Resultados completados', results], ['Resultados revisados', reviewed],
    ...(scoring.length ? [['Puntos calculados', calculated], ['Puntos publicados', published], ['Ranking actualizado', published]] as [string, boolean][] : []),
  ]
  const cancelled = input.eventStatus === 'CANCELLED' || input.operationalState === 'CANCELLED'
  const current = cancelled ? -1 : milestones.findIndex(([,done]) => !done)
  const currentLabels:Record<string,string>={'Torneo vinculado':'Vincular torneo','Resultados completados':'Completar resultados','Resultados revisados':'Revisar resultados','Puntos calculados':'Calcular puntos','Puntos publicados':'Publicar puntos','Ranking actualizado':'Actualizar ranking'}
  const steps: OperationTimelineStep[] = milestones.map(([label,done],index) => ({label:!done&&index===current?currentLabels[label]??label:label,state:done?'done':index===current?'current':'pending'}))
  let recommendation: string
  if (cancelled) recommendation = 'Fecha cancelada'
  else if (!linked) recommendation = 'Vincular el torneo a la fecha'
  else if (!results) recommendation = input.operationalState === 'OPEN' ? 'Inscribir parejas y preparar seeds' : input.operationalState === 'SCHEDULED' ? 'Preparar seeds e iniciar el torneo' : input.operationalState === 'DRAFT' ? 'Configurar y publicar el torneo' : 'Completar resultados'
  else if (input.canCloseDate) recommendation = 'Cerrar fecha y preparar resultados'
  else if (!reviewed) recommendation = 'Revisar resultados'
  else if (scoring.some(division=>division.scoringMode!=='POINTS')) recommendation = 'Revisar la configuración de puntos'
  else if (!scoring.length) recommendation = 'Resultados revisados · Fecha sin puntos'
  else if (!calculated) recommendation = 'Preparar la vista previa de puntos'
  else if (!published) recommendation = scoring.some(division => division.settlementStatus === 'CALCULATED') ? 'Revisar puntos antes de publicar' : 'Publicar puntos'
  else recommendation = 'Ranking actualizado'
  return {steps,recommendation,complete:current===-1&&!cancelled&&divisions.every(division=>['POINTS','NON_SCORING'].includes(division.scoringMode)),cancelled}
}
