import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const sql=await readFile(new URL('../supabase/migrations/20260915110511_competition_extended_playoff_tiers.sql',import.meta.url),'utf8')
const { POINT_RESULT_CODES }=await import(new URL('../features/competition/points-schemes/points-schemes.types.ts',import.meta.url).href)
const { buildHomologationTeamResults }=await import(new URL('../features/competition/homologation/competition-homologation-review.ts',import.meta.url).href)
test('seven canonical codes; Master editor renders optional tiers without activating scheme',async()=>{
  assert.deepEqual(POINT_RESULT_CODES,['CHAMPION','RUNNER_UP','SEMIFINALIST','QUARTERFINALIST','EIGHTH_FINALIST','SIXTEENTH_FINALIST','PARTICIPANT'])
  const ui=await readFile(new URL('../app/(app)/club/competition/PointsSchemesAdmin.tsx',import.meta.url),'utf8')
  assert.match(ui,/POINT_RESULT_CODES\.map/)
  assert.match(ui,/Sin configurar/)
})
test('real review tiers remain distinct, ordered and do not invent ordinal placements',()=>{
  const roles=['PARTICIPANT','SIXTEENTH_FINALIST','EIGHTH_FINALIST','QUARTERFINALIST','SEMIFINALIST','RUNNER_UP','CHAMPION']
  const rows=buildHomologationTeamResults([],roles.map((result_role,i)=>({tournament_team_id:String(i),result_role,final_position:null})))
  assert.deepEqual(rows.map((r: {resultRole:string})=>r.resultRole),POINT_RESULT_CODES)
  assert.equal(rows[4].resultLabel,'Octavos')
  assert.equal(rows[5].resultLabel,'Dieciseisavos')
})
test('SQL maps actual played ROUND_OF_16/32 losers; empty-side BYE cannot receive a tier',()=>{
  for(const [phase,role] of [['ROUND_OF_16','EIGHTH_FINALIST'],['ROUND_OF_32','SIXTEENTH_FINALIST']]){
    const block=sql.slice(sql.indexOf("set result_role='"+role+"'"))
    const statement=block.slice(0,block.indexOf(';'))
    assert.ok(statement.includes("m.phase='"+phase+"'"))
    assert.match(statement,/m\.status='PLAYED'/)
    assert.match(statement,/m\.team1_id is not null and m\.team2_id is not null/)
    assert.match(statement,/winner_team_id in\(m.team1_id,m.team2_id\)/)
  }
})
test('optional tiers retain required base five and generic settlement/reversal implementation',()=>{
  assert.match(sql,/not between 5 and 7/)
  assert.match(sql,/return keys @> array\['CHAMPION'/)
  assert.doesNotMatch(sql,/create or replace function public\.(calculate_competition_event_settlement|publish_competition_event_settlement|reverse)/)
  assert.doesNotMatch(sql,/update public\.(competition_point_transactions|club_players)/)
  assert.match(sql,/participant_snapshot=p.participant_snapshot \|\| jsonb_build_object\('result_role',r.result_role/)
})
