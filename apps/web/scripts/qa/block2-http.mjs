/** Verifies the local synthetic story only; never run against a deployed URL. */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const base='http://127.0.0.1:3100',data='http://127.0.0.1:45433'
const checks=[]
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
async function read(path) {const response=await fetch(base+path,{signal:AbortSignal.timeout(90000)});return {response,json:await response.json()}}
async function check(name,fn){await fn();checks.push({name,result:'PASS'});console.log('PASS',name)}
await check('home uses actual sixth-club identity and published events',async()=>{
  const {response,json}=await read('/api/public/home');assert.equal(response.status,200)
  assert.equal(json.tournaments.find(t=>t.id===id(101)).clubName,'Club QA 6')
  assert.ok(json.tournaments.every(t=>t.status!=='DRAFT'))
  assert.deepEqual(json.unavailableSections,[])
})
await check('public discovery API matches the shared list and excludes drafts/cancellations',async()=>{
  const {response,json}=await read('/api/public/tournaments');assert.equal(response.status,200)
  assert.equal(json.tournaments.length,7);assert.ok(json.tournaments.every(t=>!['DRAFT','CANCELLED'].includes(t.status)))
})
for(const [n,key] of [[104,'finished'],[105,'paused'],[107,'registration_closed'],[108,'registration_open']]) await check(`detail ${n}: ${key}, real capacity and private response`,async()=>{
  const {response,json}=await read(`/api/tournaments/${id(n)}/public-detail`)
  assert.equal(response.status,200);assert.equal(json.status.key,key);assert.match(response.headers.get('cache-control'),/private.*no-store/)
  assert.equal(json.flyerUrl,'/brand/selpa-logo.png');assert.equal(json.viewer.isAuthenticated,false)
  if(n===108)assert.equal(json.capacity.spotsLeft,0)
})
await check('unpublished draft is not readable anonymously',async()=>{
  const {response,json}=await read(`/api/tournaments/${id(109)}/public-detail`);assert.equal(response.status,404);assert.doesNotMatch(JSON.stringify(json),/Borrador privado/)
})
try {
  await fetch(data+'/qa/scenario?failure=platform_news')
  await check('content outage leaves tournaments usable with explicit partial-error marker',async()=>{
    const {response,json}=await read('/api/public/home');assert.equal(response.status,200);assert.ok(json.unavailableSections.includes('content'));assert.ok(json.tournaments.length>0);assert.equal(json.slides.length,0)
  })
  await fetch(data+'/qa/scenario?failure=tournament_registrations')
  await check('registration outage returns retryable detail, never capacity zero',async()=>{
    const {response,json}=await read(`/api/tournaments/${id(101)}/public-detail`);assert.equal(response.status,503);assert.equal(json.capacity,undefined)
  })
  await check('payment read outage preserves confirmed registration and recovers without changing payment data',async()=>{
    const login=await fetch(data+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'player@selpa.test',password:'qa-local-only'})})
    const {access_token:token}=await login.json()
    assert.ok(token)
    const headers={Authorization:`Bearer ${token}`}
    await fetch(data+'/qa/scenario?failure=tournament_payments')
    const failed=await fetch(base+`/api/tournaments/${id(103)}/public-detail`,{headers,signal:AbortSignal.timeout(90000)})
    assert.equal(failed.status,200)
    const {viewer}=await failed.json()
    assert.equal(viewer.myTeam.registrationStatus,'CONFIRMED');assert.equal(viewer.myTeam.paymentLookupUnavailable,true)
    await fetch(data+'/qa/scenario')
    const recovered=await fetch(base+`/api/tournaments/${id(103)}/public-detail`,{headers})
    const payload=await recovered.json()
    assert.equal(payload.viewer.myTeam.paymentLookupUnavailable,false);assert.equal(payload.viewer.myTeam.paymentStatus,null)
  })
  await fetch(data+'/qa/scenario?empty=true')
  await check('valid empty discovery differs from failed read',async()=>{
    const {response,json}=await read('/api/public/tournaments');assert.equal(response.status,200);assert.deepEqual(json.tournaments,[])
  })
} finally {await fetch(data+'/qa/scenario')}
const folder=new URL('../../../../output/block2-qa/',import.meta.url)
await mkdir(folder,{recursive:true});await writeFile(new URL('http-report.json',folder),JSON.stringify({date:new Date().toISOString(),synthetic:true,checks},null,2))
console.log(JSON.stringify({passed:checks.length,failed:0,synthetic:true}))
