import test from 'node:test'
import assert from 'node:assert/strict'
import { tournamentDetailHref, tournamentReturnTo } from './tournamentNavigation'

test('detail URL carries public and Player discovery filters through reload and new tabs', () => {
  for (const path of ['/torneos', '/player/torneos/explorar']) {
    const origin = `${path}?${new URLSearchParams({ q: 'Copa Pádel & más', categoria: '6', rama: 'M', club: 'Club QA 6' })}`
    const detail = new URL(tournamentDetailHref('tournament-id', origin), 'https://selpa.local')
    assert.equal(detail.pathname, '/torneos/tournament-id')
    assert.equal(tournamentReturnTo(detail.searchParams.get('returnTo')), origin)
  }
})

test('direct links fall back to discovery and untrusted return URLs cannot redirect elsewhere', () => {
  assert.equal(tournamentDetailHref('id'), '/torneos/id')
  for (const value of [undefined, '', 'https://evil.test/torneos', '//evil.test/torneos', '/\\evil.test', '/login', '/torneos/../login', '/torneos\n']) {
    assert.equal(tournamentReturnTo(value), '/torneos')
  }
  assert.equal(tournamentReturnTo('/player/torneos/explorar?q=Copa&token=private&returnTo=https://evil.test#ignored'), '/player/torneos/explorar?q=Copa')
})
