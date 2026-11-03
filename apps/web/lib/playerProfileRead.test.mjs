import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
const require=createRequire(new URL('../package.json',import.meta.url))
const ts=require('typescript')
const sdk=require('@supabase/supabase-js')
function moduleFrom(file, globals) {
  const exports={}
  runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,TypeError,...globals})
  return exports
}
function setup(statuses, options={}) {
  let reads=0,refreshes=0,sessionReads=0
  const attempts=[],delays=[],diagnostics=[]
  const session=()=>({user:{id:options.otherUser?'other':'player'},access_token:refreshes?'renewed':'initial'})
  const auth={getCurrentSession:async()=>{const index=sessionReads++;return {data:{session:options.sessions ? options.sessions[Math.min(index,options.sessions.length-1)] : session()},error:options.sessionErrors?.[Math.min(index,options.sessionErrors.length-1)]??null}},supabase:{auth:{refreshSession:async()=>{refreshes++;return {data:{session:session()},error:options.refreshError?new Error('EXPIRED'):null}}}}}
  const api=moduleFrom('./playerProfileRead.ts',{require:name=>name==='@supabase/supabase-js'?sdk:auth,fetch:async(url,init)=>{
    attempts.push({url,token:init.headers.Authorization,signal:init.signal})
    const value=statuses[Math.min(reads++,statuses.length-1)]
    if(value==='network')throw new TypeError('Failed to fetch')
    return {status:value,ok:value===200,json:async()=>{if(options.invalidJson)throw new SyntaxError('Invalid JSON');return {memberships:[]}}}
  },setTimeout:(callback,delay)=>{delays.push(delay);if(!options.holdBackoff)queueMicrotask(callback);return delays.length},clearTimeout:()=>{},console:{warn:(...args)=>diagnostics.push(args)}})
  return {read:api.readPlayerProfile,attempts,delays,diagnostics,counts:()=>({reads,refreshes}),sessionCounts:()=>sessionReads}
}

for(const status of [0,503])test(`session transport ${status} recovers before the first private GET`,async()=>{
 const session={user:{id:'player'},access_token:'initial'}
 const app=setup([200],{sessions:[null,session],sessionErrors:[new sdk.AuthRetryableFetchError('Synthetic auth transport failure',status),null]})
 await app.read('/api/profile','player',new AbortController().signal)
 assert.equal(app.sessionCounts(),2);assert.equal(app.counts().reads,1);assert.deepEqual(app.delays,[300])
})
test('session transport retries remain bounded and share the HTTP backoff budget',async()=>{
 const session={user:{id:'player'},access_token:'initial'},failure=new sdk.AuthRetryableFetchError('Synthetic auth transport failure',503)
 const app=setup([503,200],{sessions:[null,session],sessionErrors:[failure,null]})
 await app.read('/api/profile','player',new AbortController().signal)
 assert.equal(app.sessionCounts(),3);assert.equal(app.counts().reads,2);assert.deepEqual(app.delays,[300,900])
 const persistent=setup([200],{sessions:[null],sessionErrors:[failure]})
 await assert.rejects(persistent.read('/api/profile','player',new AbortController().signal))
 assert.equal(persistent.sessionCounts(),3);assert.equal(persistent.counts().reads,0);assert.deepEqual(persistent.delays,[300,900])
})
test('non-transient SDK session denial never retries or issues a private GET',async()=>{
 const app=setup([200],{sessions:[null],sessionErrors:[new sdk.AuthApiError('Synthetic denied session',403,'forbidden')]})
 await assert.rejects(app.read('/api/profile','player',new AbortController().signal))
 assert.equal(app.sessionCounts(),1);assert.equal(app.counts().reads,0);assert.deepEqual(app.delays,[])
})
test('profile GET waits for session and recovers an expired JWT once',async()=>{
 const app=setup([401,200]);await app.read('/api/profile','player',new AbortController().signal)
 assert.deepEqual(app.counts(),{reads:2,refreshes:1});assert.deepEqual(app.attempts.map(x=>x.token),['Bearer initial','Bearer renewed'])
})
for(const status of ['network',500,502,503,504])test(`profile GET recovers a transient ${status} failure with backoff`,async()=>{
 const app=setup([status,200]);await app.read('/api/profile','player',new AbortController().signal);assert.equal(app.counts().reads,2);assert.deepEqual(app.delays,[300])
})
for(const status of [401,403,500,503])test(`persistent ${status} stays an error with bounded requests`,async()=>{
 const app=setup([status]);await assert.rejects(app.read('/api/profile','player',new AbortController().signal));assert.equal(app.counts().reads,status===401?2:[500,503].includes(status)?3:1)
})

test('two transient failures share a bounded backoff budget, including mixed network and API failures',async()=>{
 const app=setup(['network',500,200]);await app.read('/api/profile','player',new AbortController().signal)
 assert.equal(app.counts().reads,3);assert.deepEqual(app.delays,[300,900])
 assert.doesNotMatch(JSON.stringify(app.diagnostics),/Bearer|initial|renewed|\/api\/profile|userId/)
})

test('profile waits for a matching session before issuing any private request',async()=>{
 const session={user:{id:'player'},access_token:'initial'}
 const app=setup([200],{sessions:[null,session]});await app.read('/api/profile','player',new AbortController().signal)
 assert.equal(app.counts().reads,1);assert.deepEqual(app.delays,[300])
 const missing=setup([200],{sessions:[null]});await assert.rejects(missing.read('/api/profile','player',new AbortController().signal));assert.equal(missing.counts().reads,0);assert.deepEqual(missing.delays,[300,900])
})

test('account changes during retry never send the previous profile request with the next account token',async()=>{
 const app=setup([503,200],{sessions:[{user:{id:'player'},access_token:'initial'},{user:{id:'other'},access_token:'other-token'}]})
 await assert.rejects(app.read('/api/profile','player',new AbortController().signal),/PROFILE_ACCOUNT_CHANGED/)
 assert.equal(app.counts().reads,1)
})

test('aborting a navigation cancels retry backoff without a second request',async()=>{
 const app=setup([503,200],{holdBackoff:true}),controller=new AbortController()
 const pending=app.read('/api/profile','player',controller.signal)
 await new Promise(resolve=>setImmediate(resolve));controller.abort()
 await assert.rejects(pending);assert.equal(app.counts().reads,1)
})

test('invalid response contracts and missing identity do not trigger retries',async()=>{
 const app=setup([200],{invalidJson:true});await assert.rejects(app.read('/api/profile','player',new AbortController().signal));assert.equal(app.counts().reads,1);assert.deepEqual(app.delays,[])
 const empty=setup([200]);await assert.rejects(empty.read('/api/profile','',new AbortController().signal));assert.equal(empty.counts().reads,0)
})
test('changed account and aborted navigation never issue a private request',async()=>{
 const app=setup([200],{otherUser:true});await assert.rejects(app.read('/api/profile','player',new AbortController().signal));assert.equal(app.counts().reads,0)
 const other=setup([200]);const controller=new AbortController();controller.abort();await assert.rejects(other.read('/api/profile','player',controller.signal));assert.equal(other.counts().reads,0)
})
test('photo editor links preserve own=1 and focus inside club-selection return URL',()=>{
 const {profileEditorHref}=moduleFrom('./profileEditorHref.ts',{})
 const direct=new URL(profileEditorHref('/player/carrera/id/editar?own=1','cover'),'https://selpa.local')
 assert.equal(direct.searchParams.get('own'),'1');assert.equal(direct.searchParams.get('focus'),'cover')
 const nested=new URL(profileEditorHref('/seleccionar-club?next='+encodeURIComponent('/player/carrera/id/editar?own=1'),'avatar'),'https://selpa.local')
 const next=new URL(nested.searchParams.get('next'),'https://selpa.local');assert.equal(next.searchParams.get('own'),'1');assert.equal(next.searchParams.get('focus'),'avatar')
})
