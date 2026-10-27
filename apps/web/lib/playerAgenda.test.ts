import assert from 'node:assert/strict'
import test from 'node:test'
import { agendaDay, agendaGroup, agendaRegistrationLabel, groupPlayerAgenda, latestAgendaRegistrations } from './playerAgenda'
const tournament=(id:string,changes={})=>({id,status:'PUBLISHED',starts_on:'2026-11-01',start_date:null,ends_on:null,end_date:null,...changes})
const registration=(id:string,status='CONFIRMED',created_at='2026-10-20T10:00:00Z')=>({id,tournament_id:id,status,created_at})

test('agenda uses Buenos Aires calendar and never shifts a date-only event to the previous day',()=>{
  assert.equal(agendaDay(new Date('2026-10-27T01:00:00Z')),'2026-10-26')
  assert.equal(agendaGroup(tournament('a',{starts_on:'2026-10-27'}),registration('a'),'2026-10-27'),'upcoming')
})
test('each event occurs once: dates, final state and latest registration take precedence',()=>{
  const rows=[tournament('future'),tournament('pending'),tournament('past',{starts_on:'2026-09-10'}),tournament('finished',{status:'FINISHED'}),tournament('cancelled'),tournament('future')]
  const registrations=[registration('future'),registration('pending','PENDING'),registration('past','PENDING'),registration('finished'),registration('cancelled'),registration('cancelled','CANCELLED','2026-10-26T12:00:00Z')]
  const grouped=groupPlayerAgenda(rows,registrations,new Date('2026-10-27T12:00:00Z'))
  assert.deepEqual(grouped.upcoming.map(r=>r.id),['future'])
  assert.deepEqual(grouped.pending.map(r=>r.id),['pending'])
  assert.equal(grouped.history.length,3)
  assert.equal(new Set(Object.values(grouped).flat().map(r=>r.id)).size,5)
  assert.equal(latestAgendaRegistrations([...registrations].reverse()).get('cancelled')?.status,'CANCELLED')
})
test('ongoing events and unknown dates remain useful; unknown confirmation is pending',()=>{
  assert.equal(agendaGroup(tournament('a',{status:'IN_PROGRESS',starts_on:'2026-10-26'}),registration('a'),'2026-10-27'),'upcoming')
  assert.equal(agendaGroup(tournament('a',{starts_on:null}),registration('a'),'2026-10-27'),'upcoming')
  assert.equal(agendaGroup(tournament('a'),undefined,'2026-10-27'),'pending')
  assert.equal(agendaGroup(tournament('a',{ends_on:'2026-10-26'}),registration('a'),'2026-10-27'),'history')
})
test('confirmed registrations assert a place, never a paid obligation',()=>{
  assert.equal(agendaRegistrationLabel('CONFIRMED'),'Cupo confirmado')
  for(const status of ['CONFIRMED','PENDING',null,'UNKNOWN']) assert.doesNotMatch(agendaRegistrationLabel(status),/pagado|acreditado/i)
})
