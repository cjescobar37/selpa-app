import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOpenGroupInitialFixture } from './tournamentOpen/groupFixtures'
import { calculateTournamentGroupStandings } from './tournamentStandings'
import { buildDependencyAwareGroupSchedule, canonicalFourTeamDependencies, deriveGroupMatchNumbers, missingCanonicalFourTeamDependencies, resolveFourTeamFinalOrder, resolveGroupDependencies, type GroupDependencyMatch } from './tournamentGroupDependencies'

const initial:GroupDependencyMatch[]=[
  {id:'a1',groupId:'a',groupOrder:1,groupMatchNumber:1,round:1,team1Id:'t1',team2Id:'t4',winnerTeamId:null},
  {id:'a2',groupId:'a',groupOrder:1,groupMatchNumber:2,round:1,team1Id:'t2',team2Id:'t3',winnerTeamId:null},
]
const specs=canonicalFourTeamDependencies(initial as [GroupDependencyMatch,GroupDependencyMatch])
const dependent=specs.map((spec,index):GroupDependencyMatch=>({id:`a${index+3}`,groupId:'a',groupOrder:1,round:2,team1Id:null,team2Id:null,...spec}))

test('deriva A-01..A-04 sin columna group_match_number y preserva match_order global',()=>{
  const rows=[
    {id:'a1',groupId:'a',round:1,matchOrder:1},
    {id:'a2',groupId:'a',round:1,matchOrder:2},
    {id:'b1',groupId:'b',round:1,matchOrder:3},
    {id:'a3',groupId:'a',round:2,matchOrder:18},
    {id:'a4',groupId:'a',round:2,matchOrder:19},
  ]
  const numbers=deriveGroupMatchNumbers(rows)
  assert.deepEqual(rows.map(row=>numbers.get(row.id)),[1,2,1,3,4])
  assert.deepEqual(rows.map(row=>row.matchOrder),[1,2,3,18,19])
})

test('grupo de cuatro crea A-01/A-02 y reserva A-03/A-04 con winners y losers',()=>{
  const fixture=buildOpenGroupInitialFixture([1,2,3,4].map(seed=>({teamId:`t${seed}`,seed})))
  assert.equal(fixture.initialMatches.length,2)
  assert.deepEqual(specs.map(item=>[item.groupMatchNumber,item.source1.outcome,item.source2.outcome]),[[3,'WINNER','WINNER'],[4,'LOSER','LOSER']])
})
test('resultado A-01 propaga ganador y perdedor sin inventar el lado de A-02',()=>{
  const resolved=resolveGroupDependencies([{...initial[0]!,winnerTeamId:'t1'},initial[1]!,...dependent])
  assert.equal(resolved[2]!.team1Id,'t1');assert.equal(resolved[2]!.team2Id,null)
  assert.equal(resolved[3]!.team1Id,'t4');assert.equal(resolved[3]!.team2Id,null)
})
test('resultado A-02 completa A-03 y A-04',()=>{
  const resolved=resolveGroupDependencies([{...initial[0]!,winnerTeamId:'t1'},{...initial[1]!,winnerTeamId:'t2'},...dependent])
  assert.deepEqual(resolved.slice(2).map(match=>[match.team1Id,match.team2Id]),[['t1','t2'],['t4','t3']])
})
test('retry reconoce la estructura completa y no duplica cruces',()=>{
  assert.equal(missingCanonicalFourTeamDependencies(initial as [GroupDependencyMatch,GroupDependencyMatch],[1,2,3,4]).length,0)
  assert.equal(missingCanonicalFourTeamDependencies(initial as [GroupDependencyMatch,GroupDependencyMatch],[1,2]).length,2)
})
test('resultado existente se conserva y posiciones finales son 1/2/3/4 deportivas',()=>{
  const played=[{...initial[0]!,winnerTeamId:'t1'},{...initial[1]!,winnerTeamId:'t2'}, {...dependent[0]!,team1Id:'t1',team2Id:'t2',winnerTeamId:'t2'}, {...dependent[1]!,team1Id:'t4',team2Id:'t3',winnerTeamId:'t3'}]
  assert.deepEqual(resolveFourTeamFinalOrder(played),['t2','t1','t3','t4'])
  const standings=calculateTournamentGroupStandings({groups:[{id:'a',tournament_id:'x',name:'A',size:4}],groupTeams:[1,2,3,4].map(seed=>({group_id:'a',tournament_id:'x',team_id:`t${seed}`,seed})),matches:played.map(match=>({...match,group_id:'a',phase:'GROUP',status:'PLAYED',team1_id:match.team1Id,team2_id:match.team2Id,winner_team_id:match.winnerTeamId,score:{}}))})
  assert.deepEqual(standings[0]!.standings.map(row=>row.team_id),['t2','t1','t3','t4'])
  assert.deepEqual(standings[0]!.qualifiers.map(row=>row.team_id),['t2','t1','t3'])
  assert.equal(played[0]!.winnerTeamId,'t1')
})
test('grupo de cuatro no inventa clasificados antes de completar A-03 y A-04',()=>{
  const incomplete=[{...initial[0]!,winnerTeamId:'t1'},{...initial[1]!,winnerTeamId:'t2'}, {...dependent[0]!,team1Id:'t1',team2Id:'t2',winnerTeamId:'t2'}]
  const standings=calculateTournamentGroupStandings({groups:[{id:'a',tournament_id:'x',name:'A',size:4}],groupTeams:[1,2,3,4].map(seed=>({group_id:'a',tournament_id:'x',team_id:`t${seed}`,seed})),matches:incomplete.map(match=>({...match,group_id:'a',phase:'GROUP',status:'PLAYED',team1_id:match.team1Id,team2_id:match.team2Id,winner_team_id:match.winnerTeamId,score:{}}))})
  assert.equal(standings[0]!.qualifiers.length,0)
})
test('grupo de tres mantiene round-robin de tres partidos sin dependencias',()=>{
  const fixture=buildOpenGroupInitialFixture([1,2,3].map(seed=>({teamId:`g${seed}`,seed})))
  assert.equal(fixture.initialMatches.length,3);assert.ok(fixture.initialMatches.every(match=>match.team1Id&&match.team2Id))
  const standings=calculateTournamentGroupStandings({groups:[{id:'g',tournament_id:'x',name:'G',size:3}],groupTeams:[1,2,3].map(seed=>({group_id:'g',tournament_id:'x',team_id:`g${seed}`,seed})),matches:[]})
  assert.equal(standings[0]!.qualifiers.length,2)
})
test('scheduler asigna 19 partidos, respeta dependencias/descanso, usa dos complejos y es determinístico',()=>{
  const matches:GroupDependencyMatch[]=[...initial,...dependent]
  for(let group=2;group<=6;group++)for(let number=1;number<=3;number++)matches.push({id:`g${group}m${number}`,groupId:`g${group}`,groupOrder:group,groupMatchNumber:number,round:number,team1Id:`g${group}t${number}`,team2Id:`g${group}t${number===3?1:number+1}`})
  const args={matches,courts:[{id:'c1',name:'Cancha 1',complex_name:'Cristal',source:'OWN_CLUB' as const},{id:'c2',name:'Cancha 2',complex_name:'Cristal',source:'OWN_CLUB' as const},{id:'c3',name:'Cancha 1',complex_name:'BLP',source:'EXTERNAL_COMPLEX' as const}],date:'2026-10-02',startTime:'10:00',endTime:'22:00',matchDurationMinutes:90,minimumRestMinutes:90}
  const first=buildDependencyAwareGroupSchedule(args),second=buildDependencyAwareGroupSchedule(args)
  assert.equal(first.capacity.totalCapacity,24);assert.equal(first.assignments.length,19);assert.deepEqual(first,second)
  assert.equal(first.unassignedMatchIds.length,0);assert.equal(new Set(first.assignments.map(item=>item.court_complex_name)).size,2)
  assert.ok(first.assignments.every(item=>item.scheduled_at&&item.court_name&&item.court_id&&item.court_source&&item.court_complex_name))
  const byId=new Map(first.assignments.map(item=>[item.match_id,Date.parse(item.scheduled_at)]))
  assert.ok(byId.get('a3')!-byId.get('a1')!>=180*60_000);assert.ok(byId.get('a3')!-byId.get('a2')!>=180*60_000);assert.ok(byId.get('a4')!-byId.get('a1')!>=180*60_000)
  const courtSlots=new Set(first.assignments.map(item=>`${item.scheduled_at}:${item.court_id}`));assert.equal(courtSlots.size,19)
  for(const team of ['t1','t2','t3','t4']){
    const slots=matches.filter(match=>match.team1Id===team||match.team2Id===team).map(match=>byId.get(match.id)!).sort((a,b)=>a-b)
    for(let index=1;index<slots.length;index++)assert.ok(slots[index]!-slots[index-1]!>=180*60_000)
  }
})
