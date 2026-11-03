/** Local synthetic QA only. Never loads env files or accepts a remote target. */
import assert from 'node:assert/strict'
import {CLUB,SEASON,PLAYER,QA_TOKEN,QA_ACTORS,id} from './block1-fixture.mjs'
const base='http://127.0.0.1:3000', fixture='http://127.0.0.1:45432', results=[]
assert.equal((await (await fetch(fixture+'/qa/profile-read')).json()).synthetic,true,'Requires the explicit local ranking V2 fixture')
async function api(path,token,status,body) {
  const response=await fetch(base+path,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'PATCH',body:JSON.stringify(body)}:{})})
  const data=await response.json()
  assert.equal(response.status,status,path+' expected '+status+' received '+response.status+' '+(data.code??data.error??''))
  return {response,data}
}
const official='/api/clubs/'+CLUB+'/ranking/official'
const visibility='/api/clubs/'+CLUB+'/ranking/visibility'
const owner=QA_ACTORS.find(a=>a.role==='OWNER').token
async function scenario(path) {assert.equal((await fetch(fixture+path)).status,200)}
try {
  let publicPage=await fetch(base+'/ranking?clubId='+CLUB)
  assert.equal(publicPage.status,200)
  let firstHtml=await publicPage.text();const redirect=firstHtml.match(/content="[01];url=([^"]+)"/);if(redirect){const target=redirect[1].replaceAll('&amp;','&');assert.ok(target.startsWith('/ranking?'));publicPage=await fetch(base+target);firstHtml=await publicPage.text()}const url=new URL(publicPage.url)
  assert.equal(url.searchParams.get('modality'),'PAIRS');assert.equal(url.searchParams.get('gender'),'M')
  const html=firstHtml
  assert.ok(html.includes('data-rank-tier="leader"'));assert.ok(html.includes('data-rank-tier="challenger"'));assert.ok(html.includes('data-rank-tier="row"'))
  results.push({check:'public-default-canonical-pairs-m-top5-and-compact-list',status:200})
  await api(official,null,401);await api(official,QA_TOKEN,403)
  results.push({check:'private-api-denies-anon-and-player',status:'PASS'})
  for(const actor of QA_ACTORS) {
    const status=actor.role==='PLANILLERO'?403:200
    const {data}=await api(official,actor.token,status)
    if(status===200) {
      assert.equal(data.params.modality,'PAIRS');assert.equal(data.params.gender,'M');assert.equal(data.pairs.length,19)
      assert.equal(data.pairs[0].combined_points,1900);assert.equal(data.ranking.context.segmentName,'Libres')
      assert.doesNotMatch(JSON.stringify(data),/private-|@invalid|phone|birth_date|financial|ledger/i)
    }
    results.push({check:'internal-role-'+actor.role,status})
  }
  const ownQuery='?clubId='+CLUB+'&season='+SEASON+'&division='+id(21)+'&modality=PAIRS&userId='+id(1001)+'&scope=club'
  const own=await api('/api/player/club-ranking-position'+ownQuery,QA_TOKEN,200)
  assert.equal(own.data.position.position,19);assert.equal(own.data.position.points,10);assert.equal(own.data.position.page,1)
  assert.equal(own.data.position.id,PLAYER+':'+id(1010))
  await api('/api/player/club-ranking-position'+ownQuery,null,401)
  await api('/api/player/club-ranking-position'+ownQuery,owner,403)
  const foreign=await api('/api/player/club-ranking-position?clubId='+CLUB+'&season='+SEASON+'&division='+id(22)+'&modality=INDIVIDUAL',QA_TOKEN,200)
  assert.equal(foreign.data.position,null)
  results.push({check:'own-official-position-outside-top5-user-spoof-and-foreign-division-denied',status:'PASS'})
  const before=await api(official,owner,200)
  for(const actor of QA_ACTORS.filter(a=>['OPERADOR','PLANILLERO'].includes(a.role)))await api(visibility,actor.token,403)
  await api(visibility,QA_TOKEN,403)
  const config=await api(visibility,owner,200),mixed=config.data.branches.find(b=>b.slug==='mixto')
  assert.equal(mixed.is_visible,true)
  const patch={id:mixed.id,visible:false,expectedUpdatedAt:mixed.updated_at,is_public:true,points:999999,club_id:id(2)}
  const hidden=await api(visibility,owner,200,patch)
  assert.equal(hidden.data.branch.is_visible,false)
  await api(visibility,owner,409,patch)
  const withoutMixed=await api(official,owner,200)
  assert.equal(withoutMixed.data.contexts.some(c=>c.gender==='MIXED'),true)
  assert.equal(withoutMixed.data.enabledBranches.includes('MIXED'),true)
  const hiddenInternal=await api(official+'?gender=MIXED&modality=PAIRS',owner,200)
  assert.equal(hiddenInternal.data.unpublishedContext,true);assert.equal(hiddenInternal.data.pairs.length,1)
  const publicHidden=await fetch(base+'/ranking?clubId='+CLUB+'&division='+id(21)+'&season='+SEASON+'&gender=M&category=6&modality=PAIRS')
  const publicHiddenHtml=await publicHidden.text()
  const branchNav=publicHiddenHtml.match(/<nav[^>]*aria-label="Ranking por rama"[^>]*>[\s\S]*?<\/nav>/)?.[0]
  assert.ok(branchNav);assert.equal(branchNav.includes('Mixto'),false)
  assert.deepEqual(withoutMixed.data.pairs,before.data.pairs)
  await api(visibility,owner,200,{id:mixed.id,visible:true,expectedUpdatedAt:hidden.data.branch.updated_at})
  results.push({check:'publication-owner-only-club-scope-CAS-conflict-no-point-or-season-mutation',status:'PASS'})
  await scenario('/qa/sports-privacy?value=private')
  const privatePublic=await fetch(base+'/ranking?clubId='+CLUB+'&scope=club')
  const privateHtml=await privatePublic.text()
  assert.equal(privatePublic.status,200);assert.ok(privateHtml.includes('Sin ranking disponible'));assert.ok(!privateHtml.includes('data-rank-tier="leader"'))
  const internal=await api(official,owner,200)
  assert.equal(internal.data.privateSeason,true);assert.equal(internal.data.pairs.length,19)
  const privateOwn=await api('/api/player/club-ranking-position'+ownQuery,QA_TOKEN,200);assert.equal(privateOwn.data.position,null)
  results.push({check:'private-season-public-and-player-do-not-read-competitors-admin-still-reads',status:'PASS'})
  await scenario('/qa/sports-privacy?value=public')
  const mixedRead=await api(official+'?gender=MIXED&modality=PAIRS',owner,200)
  assert.equal(mixedRead.data.pairs.length,1);assert.equal(mixedRead.data.pairs[0].combined_points,100)
  assert.equal(mixedRead.data.ranking.context.gender,'MIXED')
  const mixedIndividual=await api(official+'?gender=MIXED&modality=INDIVIDUAL',owner,200)
  assert.equal(mixedIndividual.data.ranking.context,null);assert.equal(mixedIndividual.data.ranking.rows.length,0)
  results.push({check:'mixed-pairs-official-projection-and-individual-model-absence-preserved',status:'PASS'})
  await scenario('/qa/ranking-read?value=missing')
  const failure=await fetch(base+'/ranking?clubId='+CLUB+'&division='+id(21)+'&season='+SEASON+'&gender=M&category=6&modality=PAIRS'),failureHtml=await failure.text()
  assert.ok(failureHtml.includes('data-ranking-state="error"'));assert.ok(failureHtml.includes('MODEL_UNAVAILABLE'));assert.ok(!failureHtml.includes('data-rank-tier="leader"'))
  results.push({check:'missing-model-is-error-never-fake-empty-or-legacy-points',status:'PASS'})
} finally {
  await scenario('/qa/sports-privacy?value=public')
  await scenario('/qa/ranking-read?value=ready')
  const current=await api(visibility,owner,200)
  const mixed=current.data.branches.find(b=>b.slug==='mixto')
  if(mixed && !mixed.is_visible)await api(visibility,owner,200,{id:mixed.id,visible:true,expectedUpdatedAt:mixed.updated_at})
}
console.log(JSON.stringify({checks:results.length,status:'PASS',results},null,2))
