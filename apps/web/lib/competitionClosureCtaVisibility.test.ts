import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import postcss from 'postcss'
import { getTournamentClosureState } from './competitionTournamentState'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const settlement = read('app/(app)/club/competition/EventSettlementPanel.tsx')
const settlementCss = read('app/(app)/club/competition/EventSettlementPanel.module.css')
const homologation = read('app/(app)/club/competition/EventHomologationAdmin.tsx')
const homologationCss = read('app/(app)/club/competition/EventHomologationAdmin.module.css')
const operations = read('app/(app)/club/competition/EventOperationsDashboard.tsx')
const operationsCss = read('app/(app)/club/competition/EventOperationsDashboard.module.css')
const tournament = read('app/(app)/club/torneos/[id]/page.tsx')
const helpers = read('app/styles/helpers.css')

test('PUBLISHED uses the canonical non-empty ranking action and liquidated copy', () => {
  const state = getTournamentClosureState({ tournamentStatus: 'FINISHED', settlementStatus: 'PUBLISHED', linked: true, canManage: false, canView: true })
  assert.equal(state?.key, 'SETTLED')
  assert.equal(state?.title, 'Fecha liquidada')
  assert.equal(state?.message, 'Los puntos fueron publicados y el ranking quedó actualizado.')
  assert.equal(state?.nextAction?.label, 'Ver ranking →')
  assert.match(settlement, /publishedClosureState\?\.nextAction\?\.label/)
  assert.match(settlement, /className=\{styles\.rankingLink\}[^>]*>\{publishedClosureState\?\.nextAction\?\.label/)
  assert.match(settlement, /\?tab=ranking/)
})

test('closure journey keeps a human label for every relevant state and correction', () => {
  const cases = [
    [{}, 'Homologar resultados →'],
    [{ homologationStatus: 'DRAFT' }, 'Continuar homologación →'],
    [{ homologationStatus: 'SUBMITTED' }, 'Revisar y aprobar →'],
    [{ homologationStatus: 'APPROVED' }, 'Calcular puntos →'],
    [{ homologationStatus: 'APPROVED', settlementStatus: 'CALCULATED' }, 'Revisar puntos →'],
    [{ homologationStatus: 'APPROVED', settlementStatus: 'APPROVED' }, 'Publicar puntos →'],
    [{ homologationStatus: 'APPROVED', settlementStatus: 'PUBLISHED' }, 'Ver ranking →'],
  ] as const
  for (const [variant, expected] of cases) {
    const state = getTournamentClosureState({ tournamentStatus: 'FINISHED', linked: true, canManage: true, canView: true, ...variant })
    assert.equal(state?.nextAction?.label, expected)
    assert.ok(state?.nextAction?.label.trim())
  }
  assert.match(tournament, /label \?\? closureState\.nextAction\.label/)
  assert.match(tournament, /renderClosureAction\('Continuar cierre →'\)/)
  assert.match(operations, />Ver ranking<\/Link>/)
  assert.match(homologation, /Corregir resultados/)
  assert.match(settlement, />Crear corrección<\/button>/)
})

test('shared link fallback cannot override explicit action colors', () => {
  assert.match(helpers, /:where\(\.px-card a, \.club-panel a, \.px-wrap a\)\s*\{\s*color: inherit/)
  assert.doesNotMatch(helpers, /\.px-wrap a\s*\{\s*color: inherit/)
  assert.match(settlementCss, /\.panel a\.rankingLink,\.panel a\.rankingLink:visited\{[^}]*color:#fff;[^}]*-webkit-text-fill-color:#fff/)
})

for (const width of [375, 390, 430]) {
  test(`${width}px keeps closure labels visible, centered and touchable`, () => {
    const actionStyles = [settlementCss, homologationCss, operationsCss].map(css => postcss.parse(css))
    for (const root of actionStyles) {
      root.walkRules(rule => {
        if (!/rankingLink|\.publish\b|\.secondary\b|\.primary\b|\.stickyAction button|\.advanced button|\.action\b/.test(rule.selector)) return
        rule.walkDecls(decl => {
          const value = decl.value.replace(/\s*!important\s*$/, '').trim()
          assert.ok(!(decl.prop === 'display' && value === 'none'), `${rule.selector} hides display at ${width}px`)
          assert.ok(!(decl.prop === 'visibility' && value === 'hidden'), `${rule.selector} hides visibility at ${width}px`)
          assert.ok(!(decl.prop === 'opacity' && value === '0'), `${rule.selector} hides opacity at ${width}px`)
          assert.ok(!(decl.prop === 'font-size' && value === '0'), `${rule.selector} hides font at ${width}px`)
          assert.ok(decl.prop !== 'text-indent', `${rule.selector} indents label at ${width}px`)
        })
      })
    }
    assert.match(settlementCss, /\.rankingLink[^}]*min-height:46px/)
    assert.match(settlementCss, /\.panel a\.rankingLink[^}]*white-space:normal/)
    assert.match(operationsCss, /\.primary,\.action\{min-height:44px;color:#fff\}/)
    assert.match(homologationCss, /\.stickyAction button\{[^}]*min-height:48px/)
  })
}
