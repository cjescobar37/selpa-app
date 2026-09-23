import assert from 'node:assert/strict'
import test from 'node:test'
import type { TournamentExportData } from './tournamentExportData'
import { appliedTiebreakLabel } from './tournamentExportData'
import { assertSummaryFits, summaryPngDimensions } from './tournamentSummaryExport'

const base: TournamentExportData = {
  name: 'Noviembre Master', clubName: 'Cristal Padel Club', categoryLabel: '6ta', gender: 'Caballeros',
  startDate: '2026-10-02', endDate: '2026-10-04', champion: null, rounds: [], groups: [],
}

test('expone sólo criterios de desempate realmente resueltos', () => {
  assert.equal(appliedTiebreakLabel(undefined), null)
  assert.equal(appliedTiebreakLabel([]), null)
  assert.equal(appliedTiebreakLabel([{ resolvedBy: 'SET_DIFF' }]), 'Diferencia de sets')
  assert.equal(appliedTiebreakLabel([{ resolvedBy: 'HEAD_TO_HEAD' }, { resolvedBy: 'HEAD_TO_HEAD' }]), 'Resultado entre empatados')
})

test('define las dimensiones sociales solicitadas', () => {
  assert.deepEqual(summaryPngDimensions.groups, { width: 2160, height: 2700 })
  assert.deepEqual(summaryPngDimensions.playoff, { width: 3200, height: 1800 })
})

test('acepta seis grupos y rechaza resúmenes ilegibles', () => {
  const row = { name: 'Jugador Uno / Jugador Dos', seed: 1, qualified: true, metrics: [4, 2, 2, 0, 3, 12] }
  const sixGroups = { ...base, groups: Array.from({ length: 6 }, (_, index) => ({ name: `Grupo ${String.fromCharCode(65 + index)}`, rows: [row, row, row, { ...row, qualified: false }], matches: [], tiebreakLabel: null })) }
  assert.doesNotThrow(() => assertSummaryFits(sixGroups, 'groups'))
  assert.throws(() => assertSummaryFits({ ...sixGroups, groups: [...sixGroups.groups, ...sixGroups.groups] }, 'groups'), /PDF completo/)
})

test('acepta una llave de octavos completa y rechaza más de ocho partidos iniciales', () => {
  const match = { code: 'O1', state: 'Programado', date: '', time: '', court: '', teams: [], labels: [], sources: [] }
  const bracket = { ...base, rounds: [8, 4, 2, 1].map((count, round) => ({ name: ['Octavos', 'Cuartos', 'Semis', 'Final'][round], matches: Array.from({ length: count }, (_, index) => ({ ...match, code: `${round}-${index}` })) })) }
  assert.doesNotThrow(() => assertSummaryFits(bracket, 'playoff'))
  assert.throws(() => assertSummaryFits({ ...bracket, rounds: [{ name: 'Inicial', matches: Array.from({ length: 9 }, () => match) }] }, 'playoff'), /PDF completo/)
})
