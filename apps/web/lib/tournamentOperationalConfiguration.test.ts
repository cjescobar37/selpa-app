import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type * as Config from './tournamentOperationalConfiguration'
const { getTournamentEditableCapabilities, validateLinkedEventFieldChanges, validateTournamentRegistrationDeadline, validateOperationalFieldChanges, validateTournamentCapacity, tournamentConfigurationEditGuard, dateConfigurationCta, registrationDeadlineState, validateTournamentOperationalConfiguration }=await import(new URL('./tournamentOperationalConfiguration.ts',import.meta.url).href) as typeof Config
const route=await readFile(new URL('../app/api/clubs/[clubId]/tournaments/[tournamentId]/route.ts',import.meta.url),'utf8')
const editor=await readFile(new URL('../app/(app)/club/competition/EventTournamentConfiguration.tsx',import.meta.url),'utf8')
const tournamentEditor=await readFile(new URL('../app/(app)/club/torneos/[id]/editar/page.tsx',import.meta.url),'utf8')
const payload={
  registration_deadline:'2026-11-08T22:30:00.000Z',min_pairs:8,max_pairs:32,price_per_player:2500,competition_system:'GROUPS_PLAYOFF',
  schedule_config:{mode:'AUTO',match_duration_minutes:90,groups:{date:'2026-11-10',start_time:'10:00',end_time:'22:00'},playoff:{date:'2026-11-12',start_time:'10:00',end_time:'22:00'}},
  tournament_courts:[{name:'Cancha 1',complex_name:'QA',source:'OWN_CLUB'}],
}
test('full editor remains draft-only while operational editor uses granular capabilities',()=>{
  assert.equal(tournamentConfigurationEditGuard('DRAFT',false,false),null)
  for(const [status,seeds,fixture] of [['OPEN',false,false],['DRAFT',true,false],['DRAFT',false,true],['FINISHED',false,false]] as const) assert.ok(tournamentConfigurationEditGuard(status,seeds,fixture))
  assert.match(route,/if \(action === 'update_draft'\) \{\s+const detail = await readTournamentOperationalConfiguration/)
})
test('OPEN without sporting milestones supports the real 19-registration operational case',()=>{
  const capabilities=getTournamentEditableCapabilities({tournamentStatus:'OPEN',hasSeedSnapshot:false,hasGroups:false,hasMatches:false,registrationCount:19})
  for(const field of ['registrationDeadline','capacity','price','courts','schedule','competitionSystem','logistics','timezone'] as const) assert.equal(capabilities[field].editable,true,field)
  assert.equal(capabilities.minimumPairs.editable,false)
  assert.equal(capabilities.structure.editable,false)
  assert.equal(validateTournamentCapacity(19,19),null)
  assert.equal(validateTournamentCapacity(32,19),null)
  assert.equal(validateTournamentCapacity(16,19),'Ya hay 19 parejas inscriptas. El cupo no puede ser menor.')
  assert.equal(validateOperationalFieldChanges(capabilities,{competitionSystem:true},false),capabilities.competitionSystem.confirmation)
  assert.equal(validateOperationalFieldChanges(capabilities,{competitionSystem:true},true),null)
  for(const field of ['registrationDeadline','price','courts','schedule'] as const)assert.equal(validateOperationalFieldChanges(capabilities,{[field]:true},false),null)
})
test('frozen seeds block enrollment universe but preserve safe operations',()=>{
  const capabilities=getTournamentEditableCapabilities({tournamentStatus:'OPEN',hasSeedSnapshot:true,hasGroups:false,hasMatches:false,registrationCount:19})
  for(const field of ['registrationDeadline','capacity','competitionSystem','structure'] as const) assert.equal(capabilities[field].editable,false,field)
  for(const field of ['courts','schedule','logistics'] as const) assert.equal(capabilities[field].editable,true,field)
  for(const field of ['registrationDeadline','capacity','competitionSystem'] as const)assert.equal(validateOperationalFieldChanges(capabilities,{[field]:true},true),capabilities[field].reason)
  assert.equal(validateOperationalFieldChanges(capabilities,{registrationDeadline:false,courts:true},false),null)
})
test('terminal and unknown status do not enable operational editing',()=>{
  for(const status of ['FINISHED','CANCELLED',null]){
    const capabilities=getTournamentEditableCapabilities({tournamentStatus:status,hasSeedSnapshot:false,hasGroups:false,hasMatches:false,registrationCount:19})
    assert.equal(Object.values(capabilities).some(capability=>capability.editable),false)
  }
})
test('deadline uses the tournament timezone instant, including previous-day local time crossing UTC midnight',()=>{
  const start='2026-11-10T03:00:00Z' // Nov 10 midnight Buenos Aires
  assert.equal(validateTournamentRegistrationDeadline('2026-11-10T02:30:00Z',start),null)
  assert.ok(validateTournamentRegistrationDeadline(start,start))
  assert.ok(validateTournamentRegistrationDeadline('2026-11-10T04:00:00Z',start))
})
test('linked date fields preserve sporting identity in OPEN while logistics remain editable; equivalent dates are not changes',()=>{
  const capabilities=getTournamentEditableCapabilities({tournamentStatus:'OPEN',hasSeedSnapshot:false,hasGroups:false,hasMatches:false,registrationCount:19})
  const current={name:'Noviembre Master',planned_starts_at:'2026-11-10T13:00:00+00:00',venue_name:'Sede 1'}
  assert.equal(validateLinkedEventFieldChanges(current,{planned_starts_at:'2026-11-10T13:00:00.000Z',venue_name:'Sede 2'},capabilities),null)
  assert.ok(validateLinkedEventFieldChanges(current,{name:'Otro nombre'},capabilities))
  const generated=getTournamentEditableCapabilities({tournamentStatus:'OPEN',hasSeedSnapshot:true,hasGroups:true,hasMatches:true,registrationCount:19})
  assert.ok(validateLinkedEventFieldChanges({timezone:'UTC'},{timezone:'Europe/Madrid'},generated))
})
test('groups and matches keep only safe operational capabilities',()=>{
  for(const state of [{hasGroups:true,hasMatches:false},{hasGroups:false,hasMatches:true}]) {
    const capabilities=getTournamentEditableCapabilities({tournamentStatus:'OPEN',hasSeedSnapshot:false,registrationCount:19,...state})
    assert.equal(capabilities.competitionSystem.editable,false)
    assert.equal(capabilities.capacity.editable,false)
    assert.equal(capabilities.structure.editable,false)
    assert.equal(capabilities.courts.editable,true)
    assert.equal(capabilities.schedule.editable,true)
  }
})
test('DRAFT without generated structure allows complete editing',()=>{
  const capabilities=getTournamentEditableCapabilities({tournamentStatus:'DRAFT',hasSeedSnapshot:false,hasGroups:false,hasMatches:false,registrationCount:0})
  assert.equal(Object.values(capabilities).every(capability=>capability.editable),true)
})
test('complete configuration changes CTA, deadlines derive state rather than duplicate persistence',()=>{
  assert.equal(dateConfigurationCta([]),'Configurar fecha')
  assert.equal(dateConfigurationCta(['TIMEZONE_MISSING']),'Completar configuración')
  assert.equal(registrationDeadlineState('2026-11-01T10:00:00Z',new Date('2026-11-02')),'Inscripciones cerradas')
  assert.equal(registrationDeadlineState(null),'Cierre pendiente')
})
test('both entry points use the same Tournament API and timezone helpers',()=>{
  assert.match(editor,/action:'update_operational_configuration'/)
  assert.match(tournamentEditor,/action: 'update_draft'/)
  assert.match(editor,/competitionWallTimeToInstant\(closing,timezone\)/)
  assert.match(tournamentEditor,/competitionWallTimeToInstant\(form.registrationDeadline, timezone/)
  assert.match(editor,/rules.competition_system/)
  assert.doesNotMatch(editor,/tournament\.format/)
})
test('valid payload preserves structured rules; rejects typo, stale-style local time, malformed schedule and injected linkage',()=>{
  assert.equal(validateTournamentOperationalConfiguration(payload),true)
  for(const bad of [
    {...payload,registration_deadline:'2026-11-08T19:30'},
    {...payload,min_pairs:2.5},{...payload,max_pairs:1},{...payload,competition_system:'MASTER'},
    {...payload,competition_series_id:'another-circuit'},
    {...payload,schedule_config:{...payload.schedule_config,match_duration_minutes:0}},
    {...payload,tournament_courts:[{name:'',source:'OWN_CLUB'}]},
  ]) assert.equal(validateTournamentOperationalConfiguration(bad),false)
})
test('operational update touches only real Tournament fields, preserving flyer, points and Competition links',()=>{
  const block=route.slice(route.indexOf("if (action === 'update_operational_configuration')"),route.indexOf("if (action === 'update_draft')"))
  assert.match(block,/\.from\('tournaments'\)\.update/)
  assert.match(block,/registration_deadline: deadline/)
  assert.match(block,/\.eq\('status',detail\.tournament\.status\)/)
  assert.match(block,/validateOperationalFieldChanges\(detail\.capabilities/)
  assert.match(block,/validateTournamentCapacity\(maxPairs, detail\.registrationCount\)/)
  assert.match(block,/mutation.eq\('updated_at',detail.tournament.updated_at\)/)
  assert.match(block,/mutation.is\('updated_at',null\)/)
  assert.match(block,/changed\.competitionSystem\?\{competition_system:system\}/)
  assert.doesNotMatch(block,/competition_series_events|competition_series_id:|points_config:|flyer_mode:/)
  assert.match(editor,/expected_updated_at:detail.tournament.updated_at/)
})
