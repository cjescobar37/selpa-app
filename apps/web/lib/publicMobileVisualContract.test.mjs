import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('public tournament and club ranking reuse the canonical SELPA dark page hero', () => {
  const tournaments = read('components/public/PublicTournamentsExperience.tsx')
  const ranking = read('components/public/PublicRankingExperience.tsx')
  const pageHeader = read('components/navigation/PageHeader.tsx')
  const headerStyles = read('components/navigation/PageHeader.module.css')
  const base = read('app/styles/base.css')

  assert.match(tournaments, /<PageHeader title=\{\`Torneos/)
  assert.match(tournaments, /eyebrow="Calendario público" tone="dark" fullBleedMobile/)
  assert.match(ranking, /eyebrow="Competencia del club" backHref="\/ranking" tone="dark" fullBleedMobile/)
  assert.match(pageHeader, /fullBleedMobile\?: boolean/)
  assert.match(headerStyles, /--selpa-public-hero-bg/)
  assert.match(headerStyles, /--selpa-public-hero-rule/)
  assert.match(base, /--selpa-mobile-gutter: 8px/)
  assert.match(base, /\.px-main \.px-fullBleedMobile\{/)
  assert.doesNotMatch(tournaments, /calc\(100vw - 47px\)/)
})

test('ranking gender choices fill the row and use the two SELPA accent colors', () => {
  const tabs = read('components/ranking/RankingDiscovery.tsx')
  const css = read('components/ranking/RankingDiscovery.module.css')
  assert.match(tabs, /data-branch=\{branch\}/)
  assert.match(tabs, /aria-current=\{gender===branch\?'page':undefined\}/)
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css, /width:100%/)
  assert.match(css, /min-height:58px/)
  assert.match(css, /data-branch=M.*#06b6d4/)
  assert.match(css, /data-branch=F.*#ec4899/)
})

test('guest menu retains full-row links with large touch targets and clear toggle semantics', () => {
  const navbar = read('components/navbar/AppNavbarClient.tsx')
  const css = read('app/styles/navbar.css')
  assert.match(navbar, /className="px-mobileMenu"/)
  assert.match(navbar, /aria-label=\{mobileMenuOpen \? "Cerrar menú" : "Abrir menú"\}/)
  assert.match(navbar, /aria-controls="selpa-guest-mobile-menu"/)
  assert.match(css, /\.px-nav \.px-mobileMenu \.px-mobileLink\{[^}]*min-height:60px/)
  assert.match(css, /\.px-nav \.px-mobileMenu \.px-mobileLink\{[^}]*font-size:16px/)
  assert.match(css, /\.px-nav \.px-mobileMenu \.px-mobileLink\.is-active/)
})
