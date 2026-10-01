import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTournamentClosureState } from './competitionTournamentState'

const base = {
  tournamentStatus: 'FINISHED',
  eventStatus: 'SCHEDULED',
  divisionStatus: 'SCHEDULED',
  scoringMode: 'POINTS',
  homologationStatus: null,
  settlementStatus: null,
  canManage: true,
  canView: true,
  linked: true,
}

test('a running tournament has no competitive closure action', () => {
  assert.equal(getTournamentClosureState({ ...base, tournamentStatus: 'RUNNING' }), null)
})

test('finished scheduled date leads through existing operations before homologation', () => {
  const state = getTournamentClosureState(base)
  assert.equal(state?.key, 'HOMOLOGATE')
  assert.equal(state?.nextAction?.label, 'Homologar resultados →')
  assert.equal(state?.nextAction?.target, 'OPERATIONS')
  assert.equal(getTournamentClosureState({ ...base, eventStatus: 'COMPLETED', divisionStatus: 'COMPLETED' })?.nextAction?.target, 'HOMOLOGATION')
})

test('homologation and settlement statuses produce the next human action', () => {
  const states = [
    ['DRAFT', null, 'REVIEW_HOMOLOGATION', 'Continuar homologación →'],
    ['SUBMITTED', null, 'APPROVE_HOMOLOGATION', 'Revisar y aprobar →'],
    ['APPROVED', null, 'CALCULATE_POINTS', 'Calcular puntos →'],
    ['APPROVED', 'DRAFT', 'CONTINUE_SETTLEMENT', 'Continuar liquidación →'],
    ['APPROVED', 'CALCULATED', 'REVIEW_POINTS', 'Revisar puntos →'],
    ['APPROVED', 'SUBMITTED', 'APPROVE_SETTLEMENT', 'Revisar y aprobar →'],
    ['APPROVED', 'APPROVED', 'PUBLISH_POINTS', 'Publicar puntos →'],
    ['APPROVED', 'PUBLISHED', 'SETTLED', 'Ver ranking →'],
  ] as const
  for (const [homologationStatus, settlementStatus, key, label] of states) {
    const state = getTournamentClosureState({ ...base, homologationStatus, settlementStatus })
    assert.equal(state?.key, key)
    assert.equal(state?.nextAction?.label, label)
  }
})

test('read-only users see pending status without a transition that would fail', () => {
  for (const input of [base, { ...base, homologationStatus: 'SUBMITTED' }, { ...base, homologationStatus: 'APPROVED', settlementStatus: 'APPROVED' }]) {
    const state = getTournamentClosureState({ ...input, canManage: false })
    assert.equal(state?.nextAction, null)
    assert.equal(state?.waitingForApproval, true)
  }
  const published = getTournamentClosureState({ ...base, settlementStatus: 'PUBLISHED', canManage: false })
  assert.equal(published?.nextAction?.target, 'RANKING')
})

test('an unlinked finished tournament points to existing Competition configuration', () => {
  const state = getTournamentClosureState({ ...base, linked: false })
  assert.equal(state?.key, 'LINK_DATE')
  assert.equal(state?.nextAction?.target, 'COMPETITION')
})

test('a real preflight blocker replaces an unsafe homologation action', () => {
  const state = getTournamentClosureState({ ...base, blocker: 'Falta finalizar un partido.' })
  assert.equal(state?.key, 'BLOCKED')
  assert.equal(state?.message, 'Falta finalizar un partido.')
  assert.equal(state?.nextAction?.label, 'Resolver pendientes →')
  assert.equal(state?.nextAction?.target, 'OPERATIONS')
})

test('General and Resultado final share the same closure handler; Final refreshes its summary', () => {
  const source = readFileSync(join(process.cwd(), 'app/(app)/club/torneos/[id]/page.tsx'), 'utf8')
  assert.match(source, /function renderClosureAction/)
  assert.match(source, /function runClosureAction/)
  assert.match(source, /if \(closureState\) return renderClosureAction\(\)/)
  assert.match(source, /renderClosureAction\('Continuar cierre →'\)/)
  assert.match(source, /continueTournamentCompetitionClosure\(/)
  assert.match(source, /if \(closureState\.key !== 'HOMOLOGATE'\)/)
  assert.match(source, /completesPlayoffRound && phase === 'FINAL'[\s\S]*?await loadSummary\(token\)/)
})

test('Operación and its timeline call the shared closure action instead of looping to the tournament', () => {
  const source = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventOperationsDashboard.tsx'), 'utf8')
  assert.match(source, /continueTournamentCompetitionClosure\(/)
  assert.match(source, /Revisar y homologar resultados →/)
  assert.match(source, /className=\{styles\.timelineAction\}/)
  assert.match(source, /onClick=\{\(\) => void continueClosure\(String\(closureDivision\.id\)/)
})

test('homologation keeps submit and approve as separate explicit actions', () => {
  const source = readFileSync(join(process.cwd(), 'app/(app)/club/competition/EventHomologationAdmin.tsx'), 'utf8')
  assert.match(source, /Enviar a aprobación/)
  assert.match(source, /detail\.allowed_actions\.approve/)
  assert.match(source, /transitionResults\('submit'\)/)
  assert.match(source, /transitionResults\('approve'\)/)
  assert.doesNotMatch(source, /approveCompetitionResults\(/)
})
