import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {createClient} from '@supabase/supabase-js'
const {tournamentRegistrationAvailability:availability}=await import(new URL('./tournamentRegistrationAvailability.ts',import.meta.url).href)
const {compareTournamentDates,normalizeTournamentSearch}=await import(new URL('./publicTournamentDiscovery.ts',import.meta.url).href)
const helpers=await import(new URL('./tournamentHelpers.ts',import.meta.url).href)
const statuses=await import(new URL('./tournamentDisplayStatus.ts',import.meta.url).href)
const membershipRules=await import(new URL('./clubMembershipRules.ts',import.meta.url).href)
const {agendaGroup,playerHomeCommitment}=await import(new URL('./playerAgenda.ts',import.meta.url).href)
const now=new Date('2026-11-01T20:00:00Z')
for(const status of ['FINISHED','COMPLETED','CANCELLED','DRAFT','PAUSED']) test(`new registration presentation is closed for ${status} without deadline`,()=>{
  assert.equal(availability({status,startDate:'2026-12-01'},undefined,now).open,false)
})
test('deadline uses business time, full capacity is blocked, unknown capacity stays unknown',()=>{
  assert.equal(availability({status:'OPEN',registrationDeadline:'2026-11-01T16:59'},undefined,now).open,false)
  assert.equal(availability({status:'OPEN',registrationDeadline:'2026-11-01T17:01'},undefined,now).open,true)
  assert.equal(availability({status:'OPEN'},{maxPairs:16,spotsLeft:0},now).title,'Cupo completo')
  assert.equal(availability({status:'OPEN'},{maxPairs:null,spotsLeft:null},now).open,true)
  assert.equal(availability({status:'OPEN',startDate:'2026-09-01',endDate:'2026-09-02'},undefined,now).open,false)
})
test('search ignores accents and dates without value stay last in both orders',()=>{
  assert.ok(normalizeTournamentSearch('Copa Pádel en Córdoba').includes(normalizeTournamentSearch('padel en cordoba')))
  const rows=[{id:1,startDate:null},{id:2,startDate:'2026-12-01'},{id:3,startDate:'2026-10-01'},{id:4,startDate:'bad'}]
  assert.deepEqual([...rows].sort(compareTournamentDates).map(x=>x.id),[3,2,1,4])
  assert.deepEqual([...rows].sort((a,b)=>compareTournamentDates(a,b,true)).map(x=>x.id),[2,3,1,4])
})
test('a running tournament without end date stays in player agenda after its start day',()=>{
  const tournament={id:'t',status:'RUNNING',starts_on:null,start_date:'2026-10-30',ends_on:null,end_date:null}
  const registration={id:'r',tournament_id:'t',status:'CONFIRMED',created_at:'2026-10-29'}
  assert.equal(agendaGroup(tournament,registration,'2026-11-01'),'upcoming')
  assert.equal(agendaGroup({...tournament,status:'FINISHED'},registration,'2026-11-01'),'history')
})
test('Home priority uses actual registrations, honors latest cancellation and prefers confirmed commitment',()=>{
  const row=id=>({id,status:'OPEN',starts_on:'2026-12-01',start_date:null,ends_on:null,end_date:null})
  const reg=(id,status,date='2026-10-01')=>({id:id+date,tournament_id:id,status,created_at:date})
  const rows=['discovery','cancelled','pending','confirmed'].map(row)
  const registrations=[reg('cancelled','CONFIRMED'),reg('cancelled','CANCELLED','2026-10-02'),reg('pending','PENDING'),reg('confirmed','CONFIRMED')]
  let next=playerHomeCommitment(rows,registrations,now)
  assert.equal(next.tournament.id,'confirmed');assert.equal(next.confirmed,true)
  next=playerHomeCommitment(rows,registrations.filter(r=>r.tournament_id!=='confirmed'),now)
  assert.equal(next.tournament.id,'pending');assert.equal(next.confirmed,false)
  assert.equal(playerHomeCommitment(rows,[],now),null)
})

function loadModule(file,client,content,extra={}) {
  const compiledModule={exports:{}}
  const imports={'@/lib/supabaseAdmin':{supabaseAdmin:client},'@/lib/tournamentHelpers':helpers,'@/lib/branding':{BRAND:{name:'SELPA'}},'@/lib/platformContent':{listPublishedContent:content},...extra}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:compiledModule,exports:compiledModule.exports,process:{env:{NODE_ENV:'production'}},require:name=>{assert.ok(name in imports,name);return imports[name]}})
  return compiledModule.exports
}
function dataClient(tables,{fail='',failCounts=false,failCode}={}) {
  const requests=[]
  const client=createClient('http://127.0.0.1:45433','qa-local-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init={})=>{
    const url=new URL(input instanceof Request?input.url:String(input)),table=url.pathname.split('/').at(-1)
    requests.push({table,params:url.searchParams,method:init.method??'GET'})
    if(table===fail||(failCounts&&init.method==='HEAD')) return Response.json({message:'PRIVATE INTERNAL DIAGNOSTIC',code:failCode},{status:503})
    let rows=[...(tables[table]??[])]
    for(const [field,filter] of url.searchParams) {
      if(['select','order','limit'].includes(field))continue
      if(filter.startsWith('not.is.null'))rows=rows.filter(row=>row[field]!=null)
      else if(filter==='is.null')rows=rows.filter(row=>row[field]==null)
      else if(filter.startsWith('not.in.')) {const values=filter.slice(8,-1).replaceAll('"','').split(',');rows=rows.filter(row=>!values.includes(String(row[field])))}
      else if(filter.startsWith('in.')) {const values=filter.slice(4,-1).replaceAll('"','').split(',');rows=rows.filter(row=>values.includes(String(row[field])))}
      else if(filter.startsWith('neq.')) rows=rows.filter(row=>String(row[field])!==filter.slice(4))
      else if(filter.startsWith('eq.')) rows=rows.filter(row=>String(row[field])===filter.slice(3))
    }
    const order=url.searchParams.get('order')??''
    rows.sort((a,b)=>String(a.start_date??'').localeCompare(String(b.start_date??''))*(order.includes('desc')?-1:1))
    const total=rows.length
    rows=rows.slice(0,Number(url.searchParams.get('limit')??1000))
    return new Response(init.method==='HEAD'?null:JSON.stringify(rows),{status:200,headers:{'content-type':'application/json','content-range':`0-${Math.max(0,rows.length-1)}/${total}`}})
  }}})
  return {client,requests}
}
const tournament={id:'t',name:'Copa Pádel',club_id:'sixth',status:'OPEN',start_date:'2026-12-01',category:6,max_pairs:16}
const tables={tournaments:[tournament],clubs:Array.from({length:6},(_,n)=>({id:n===5?'sixth':`club${n}`,name:`Club ${n+1}`,is_active:true})),club_players:[{club_id:'sixth',category:null,approved_at:'2026-01-01'}],tournament_registrations:[{tournament_id:'t',team_id:'a',status:'CONFIRMED'},{tournament_id:'t',team_id:'a',status:'PENDING'},{tournament_id:'t',team_id:'b',status:'PENDING'},{tournament_id:'t',team_id:'c',status:'CANCELLED'},{tournament_id:'t',team_id:'d',status:'REJECTED'}]}
const content=async()=>({archiveNews:[{id:'news',title:'Noticia',placement:'HERO'}],ads:[],sponsors:[]})
test('home resolves sixth club and counts distinct active teams, not duplicated requests',async()=>{
  const {client}=dataClient(tables),result=await loadModule('./publicHomeData.ts',client,content).getPublicHomeData()
  assert.equal(result.tournaments[0].clubName,'Club 6')
  assert.equal(result.tournaments[0].registeredPairs,2)
  assert.deepEqual(Array.from(result.unavailableSections),[])
})
test('failed content does not block tournaments; failed tournament read is explicit and preserves content',async()=>{
  let result=await loadModule('./publicHomeData.ts',dataClient(tables).client,async()=>{throw Error('PRIVATE INTERNAL')}).getPublicHomeData()
  assert.equal(result.tournaments.length,1);assert.ok(result.unavailableSections.includes('content'));assert.equal(result.slides.length,0)
  result=await loadModule('./publicHomeData.ts',dataClient(tables,{fail:'tournaments'}).client,content).getPublicHomeData()
  assert.equal(result.slides.length,1);assert.equal(result.tournaments.length,0);assert.ok(result.unavailableSections.includes('tournaments'))
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE INTERNAL/)
})
test('failed registration read does not invent zero; failed counts are unknown',async()=>{
  const result=await loadModule('./publicHomeData.ts',dataClient(tables,{fail:'tournament_registrations',failCounts:true}).client,content).getPublicHomeData()
  assert.equal(result.tournaments[0].registeredPairs,null);assert.equal(result.metrics.players,null);assert.ok(result.unavailableSections.includes('tournamentDetails'))
})
test('public discovery reserves upcoming space despite more than 96 finished events',async()=>{
  const history=Array.from({length:110},(_,n)=>({...tournament,id:`old${n}`,status:'FINISHED',start_date:'2025-01-01'}))
  const {client,requests}=dataClient({...tables,tournaments:[...history,tournament]})
  const result=await loadModule('./publicTournamentItems.ts',client).getPublicTournamentItems()
  assert.equal(result.tournaments.length,25);assert.equal(result.tournaments[0].id,'t');assert.equal(result.tournaments[0].registeredPairs,2)
  assert.equal(requests.filter(r=>r.table==='tournaments').length,2)
  assert.equal(requests.filter(r=>r.table==='tournament_registrations').length,1)
  assert.ok(requests.every(r=>r.method==='GET'))
})

function detailRoute({status='OPEN',user=null,capability=false,platform=false,fail='',failCode,player=false,extraTables={}}={}) {
  const {client}=dataClient({...tables,tournaments:[{...tournament,status}],platform_admins:platform?[{user_id:user.id}]:[],...extraTables},{fail,failCode})
  const db={from:client.from.bind(client),auth:{getUser:async()=>({data:{user},error:null})}}
  return loadModule('../app/api/tournaments/[tournamentId]/public-detail/route.ts',db,undefined,{
    'next/server':{NextResponse:{json:(data,options)=>Response.json(data,options)}},
    '@/lib/accountRoleServer':{nonPlayerAccountIds:async()=>new Set(user&&!player?[user.id]:[])},
    '@/lib/tournamentDisplayStatus':statuses,
    '@/lib/tournamentFlyers':{getTournamentFlyerUrl:()=>null,getTournamentPosterUrl:()=>null},
    '@/lib/tournamentLabels':{formatCategoryLabel:()=> '6ª',formatGenderLabel:()=> 'Caballeros',formatSegmentLabel:()=> 'Libres'},
    '@/lib/tournamentTiebreakers':{groupTiebreakerCriterionOptions:[],groupTiebreakerFinalOptions:[],normalizeGroupTiebreakerConfig:()=>({order:[],final:''})},
    '@/lib/clubMembershipRules':membershipRules,
    '@/lib/clubMembershipServer':{userHasClubCapability:async(userId,clubId,key)=>{assert.equal(userId,user.id);assert.equal(clubId,'sixth');assert.equal(key,'tournaments:view');return capability}},
  })
}
const detailRequest=authorized=>new Request('http://localhost/api/tournaments/t/public-detail',{headers:authorized?{Authorization:'Bearer qa-only'}:{}})
const detailParams={params:Promise.resolve({tournamentId:'t'})}
test('draft detail stays private for guests and unrelated accounts',async()=>{
  for(const user of [null,{id:'other-staff'}]) {
    const response=await detailRoute({status:'DRAFT',user}).GET(detailRequest(Boolean(user)),detailParams)
    assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/Copa|rules|sixth/)
  }
})
test('draft detail honors scoped club capability or verified platform admin',async()=>{
  for(const authorization of [{capability:true},{platform:true}]) {
    const response=await detailRoute({status:'DRAFT',user:{id:'admin'},...authorization}).GET(detailRequest(true),detailParams)
    assert.equal(response.status,200)
    assert.equal(response.headers.get('cache-control'),'private, no-store')
    assert.equal(response.headers.get('vary'),'Authorization')
  }
})
test('failed capacity or viewer read is retryable, never an invented zero or new registration',async()=>{
  for(const fail of ['tournament_registrations','club_memberships']) {
    const response=await detailRoute({fail,user:{id:'player'}}).GET(detailRequest(true),detailParams)
    assert.equal(response.status,503)
    assert.doesNotMatch(await response.text(),/registeredTeamsCount|isRegisteredInTournament|PRIVATE INTERNAL/)
  }
})

const registeredPlayerTables={
  club_players:[{id:'cp',user_id:'player',club_id:'sixth',approved_at:'2026-01-01'}],
  tournament_teams:[{id:'team',tournament_id:'t',club_id:'sixth',player1_user_id:'player'}],
  tournament_registrations:[{id:'registration',tournament_id:'t',club_id:'sixth',team_id:'team',status:'CONFIRMED',created_at:'2026-01-01'}],
}
test('payment read failure or missing infrastructure preserves registration and marks payment unavailable',async()=>{
  for(const failCode of [undefined,'42P01']) {
    const response=await detailRoute({user:{id:'player'},player:true,extraTables:registeredPlayerTables,fail:'tournament_payments',failCode}).GET(detailRequest(true),detailParams)
    assert.equal(response.status,200)
    const {viewer}=await response.json()
    assert.equal(viewer.isRegisteredInTournament,true);assert.equal(viewer.myTeam.registrationStatus,'CONFIRMED')
    assert.equal(viewer.myTeam.paymentLookupUnavailable,true);assert.equal(viewer.myTeam.paymentStatus,null)
  }
})
test('a successful payment read distinguishes no payment from actual approval',async()=>{
  for(const status of [null,'APPROVED']) {
    const payments=status?[{id:'p',status,tournament_id:'t',registration_id:'registration',team_id:'team'}]:[]
    const response=await detailRoute({user:{id:'player'},player:true,extraTables:{...registeredPlayerTables,tournament_payments:payments}}).GET(detailRequest(true),detailParams)
    const {viewer}=await response.json()
    assert.equal(viewer.myTeam.paymentLookupUnavailable,false);assert.equal(viewer.myTeam.paymentStatus,status)
  }
})
