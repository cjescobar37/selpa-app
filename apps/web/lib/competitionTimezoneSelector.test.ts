import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import type * as Timezone from './competitionTimezone'
const tz = await import(new URL('./competitionTimezone.ts', import.meta.url).href) as typeof Timezone

test('browser Buenos Aires is canonical and stays selected in the option catalog', () => {
  const selected = tz.resolveCompetitionTimezone({deviceTimezone:'America/Buenos_Aires'})
  assert.equal(selected,'America/Argentina/Buenos_Aires')
  assert.ok(tz.competitionTimezoneOptions(selected).includes(selected!))
  assert.match(tz.competitionTimezoneLabel(selected!,new Date('2026-10-02')),/Buenos Aires, Argentina · UTC−3/)
})
test('saved zone wins over browser, alternatives and fallback remain international', () => {
  assert.equal(tz.resolveCompetitionTimezone({tournamentTimezone:'Europe/Madrid',deviceTimezone:'America/Buenos_Aires'}),'Europe/Madrid')
  const options=tz.competitionTimezoneOptions('Asia/Tokyo',[])
  assert.ok(options.includes('Asia/Tokyo'))
  assert.ok(options.includes('America/Montevideo'))
  assert.ok(options.includes('America/Argentina/Mendoza'))
})
test('labels are presentation; arbitrary strings and numeric offsets are not IANA IDs', () => {
  for(const invalid of ['Buenos Aires','Argentina','UTC-3','GMT-3','+03:00','America/Typo','']) assert.equal(tz.validCompetitionTimezone(invalid),null)
  assert.equal(tz.validCompetitionTimezone('America/Montevideo'),'America/Montevideo')
  assert.equal(tz.resolveCompetitionTimezone({}),null)
})
test('10:00 Buenos Aires persists as 13:00 UTC and reopens as 10:00', () => {
  const instant=tz.competitionWallTimeToInstant('2026-10-02T10:00','America/Argentina/Buenos_Aires')
  assert.equal(instant,'2026-10-02T13:00:00.000Z')
  assert.equal(tz.competitionWallTime(instant,'America/Argentina/Buenos_Aires'),'2026-10-02T10:00')
  assert.equal(tz.competitionWallTimeToInstant('2026-10-02T10:00','Asia/Tokyo'),'2026-10-02T01:00:00.000Z')
})
test('DST gap/overlap and impossible date are rejected rather than silently shifted', () => {
  assert.throws(()=>tz.competitionWallTimeToInstant('2026-03-08T02:30','America/New_York'))
  assert.throws(()=>tz.competitionWallTimeToInstant('2026-11-01T01:30','America/New_York'))
  assert.throws(()=>tz.competitionWallTimeToInstant('2026-02-30T10:00','UTC'))
})
test('backend validates IANA again and returns safe 400 before mutation; no free-text persistence',async()=>{
  const validation=await readFile(new URL('../features/competition/events/competition-events.validation.ts',import.meta.url),'utf8')
  const handler=await readFile(new URL('../features/competition/events/competition-events.handlers.ts',import.meta.url),'utf8')
  const selector=await readFile(new URL('../app/(app)/club/competition/TimezoneSelector.tsx',import.meta.url),'utf8')
  assert.match(validation,/validCompetitionTimezone\(b.timezone\)/)
  assert.match(handler,/if\(!config\)return NextResponse.json\(\{error:'Configuración inválida.'\},\{status:400\}\)/)
  assert.match(selector,/type="hidden" name="timezone" value=\{value/)
  assert.match(selector,/onChange\(zone\)/)
})
