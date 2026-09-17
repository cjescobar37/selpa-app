import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type * as Presentation from './competitionEventOperationPresentation'
const { getCompetitionConfigurationAction, getCompetitionEventOperationPresentation: present } = await import(new URL('./competitionEventOperationPresentation.ts',import.meta.url).href) as typeof Presentation
const division={linked:true,tournamentStatus:'OPEN',divisionStatus:'DRAFT',homologationStatus:'',settlementStatus:'',scoringMode:'POINTS'}
const render=(changes:Partial<typeof division>={},state='OPEN',canCloseDate=false)=>present({eventStatus:'DRAFT',operationalState:state,canCloseDate,divisions:[{...division,...changes}]})
test('OPEN: actual progress is green and sporting results are the next milestone',()=>{
  const result=render()
  assert.deepEqual(result.steps.map(step=>step.state),['done','done','current','pending','pending','pending','pending'])
  assert.equal(result.steps[2].label,'Completar resultados')
  assert.equal(result.recommendation,'Inscribir parejas y preparar seeds')
})
test('draft, registration closure and live matches recommend real next work, not maintenance',()=>{
  assert.equal(render({},'DRAFT').recommendation,'Configurar y publicar el torneo')
  assert.equal(render({},'SCHEDULED').recommendation,'Preparar seeds e iniciar el torneo')
  assert.equal(render({tournamentStatus:'RUNNING'},'IN_PROGRESS').recommendation,'Completar resultados')
  assert.equal(render({linked:false}).recommendation,'Vincular el torneo a la fecha')
})
test('finished persistence completes sports milestone without implying homologation',()=>{
  const result=render({tournamentStatus:'FINISHED'},'TOURNAMENT_FINISHED',true)
  assert.equal(result.steps[2].state,'done')
  assert.equal(result.steps[3].state,'current')
  assert.equal(result.recommendation,'Cerrar fecha y preparar resultados')
  assert.equal(render({tournamentStatus:'FINISHED',divisionStatus:'COMPLETED'},'TOURNAMENT_FINISHED').recommendation,'Revisar resultados')
})
test('preview and publication recommendations derive from latest settlement status',()=>{
  const finished={tournamentStatus:'FINISHED',divisionStatus:'COMPLETED',homologationStatus:'APPROVED'}
  assert.equal(render(finished).recommendation,'Preparar la vista previa de puntos')
  assert.equal(render({...finished,settlementStatus:'DRAFT'}).steps[4].state,'current')
  assert.equal(render({...finished,settlementStatus:'CALCULATED'}).recommendation,'Revisar puntos antes de publicar')
  assert.equal(render({...finished,settlementStatus:'APPROVED'}).recommendation,'Publicar puntos')
  const published=render({...finished,settlementStatus:'PUBLISHED'})
  assert.equal(published.complete,true)
  assert.equal(published.recommendation,'Ranking actualizado')
  assert.equal(published.steps.every(step=>step.state==='done'),true)
  assert.equal(render({...finished,settlementStatus:'REVERSED'}).complete,false)
})
test('multiple divisions do not mark a partial link/publication as fully complete',()=>{
  const result=present({eventStatus:'DRAFT',operationalState:'OPEN',canCloseDate:false,divisions:[{...division,tournamentStatus:'FINISHED',divisionStatus:'COMPLETED',homologationStatus:'APPROVED',settlementStatus:'PUBLISHED'},{...division,linked:false}]})
  assert.equal(result.steps[1].state,'current')
  assert.equal(result.steps.at(-1)?.state,'pending')
  assert.equal(result.complete,false)
})
test('non-scoring and cancelled dates never claim a ranking update',()=>{
  const nonScoring=render({tournamentStatus:'FINISHED',divisionStatus:'COMPLETED',homologationStatus:'APPROVED',scoringMode:'NON_SCORING'})
  assert.equal(nonScoring.steps.length,4)
  assert.equal(nonScoring.recommendation,'Resultados revisados · Fecha sin puntos')
  const unknown=render({tournamentStatus:'FINISHED',divisionStatus:'COMPLETED',homologationStatus:'APPROVED',scoringMode:''})
  assert.equal(unknown.recommendation,'Revisar la configuración de puntos')
  assert.equal(unknown.complete,false)
  assert.equal(render({},'CANCELLED').steps.some(step=>step.state==='current'),false)
})
test('dashboard keeps route contracts, maintenance secondary and tournament action in a clear row',async()=>{
  const dashboard=await readFile(new URL('../app/(app)/club/competition/EventOperationsDashboard.tsx',import.meta.url),'utf8')
  const styles=await readFile(new URL('../app/(app)/club/competition/EventOperationsDashboard.module.css',import.meta.url),'utf8')
  assert.match(dashboard,/className=\{styles.secondary\} href=\{eventEditorHref\}>\{configurationAction.label\}/)
  assert.doesNotMatch(dashboard,/detail\.allowed_actions\.edit\?<Link className=\{styles.secondary\}/)
  assert.match(dashboard,/Gestionar torneo<ArrowRight/)
  assert.doesNotMatch(dashboard,/>Ver torneo/)
  assert.match(dashboard,/href=\{`\/club\/torneos\/\$\{String\(link.tournament_id\)\}`\}/)
  assert.match(dashboard,/data-state=\{step.state\}/)
  assert.match(dashboard,/Siguiente paso recomendado/)
  assert.match(styles,/a.secondary\{[^}]*min-height:44px/)
  assert.match(styles,/a.secondary:visited\{[^}]*background:#e8f7f9;color:#076779/)
  assert.match(styles,/a.tournament:visited\{[^}]*background:#071a38;color:#fff/)
  assert.match(styles,/\.steps \.done \.stepIcon\{[^}]*background:#159761/)
  assert.match(styles,/\.steps \.current\{[^}]*background:#eef5fa/)
})
test('configuration access derives from real capabilities and never disappears',()=>{
  assert.deepEqual(getCompetitionConfigurationAction({hasRequiredIssues:true,hasEventCapability:true,hasTournamentCapability:false,hasCompetitionCapability:false}),{editable:true,label:'Completar configuración'})
  assert.deepEqual(getCompetitionConfigurationAction({hasRequiredIssues:false,hasEventCapability:true,hasTournamentCapability:false,hasCompetitionCapability:false}),{editable:true,label:'Configurar fecha'})
  assert.deepEqual(getCompetitionConfigurationAction({hasRequiredIssues:false,hasEventCapability:false,hasTournamentCapability:true,hasCompetitionCapability:false}),{editable:true,label:'Configurar fecha'})
  assert.deepEqual(getCompetitionConfigurationAction({hasRequiredIssues:false,hasEventCapability:false,hasTournamentCapability:false,hasCompetitionCapability:false}),{editable:false,label:'Ver configuración'})
})
