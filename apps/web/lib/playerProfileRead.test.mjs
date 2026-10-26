import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
const require=createRequire(new URL('../package.json',import.meta.url))
const ts=require('typescript')
function moduleFrom(file, globals) {
  const exports={}
  runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,TypeError,...globals})
  return exports
}
function setup(statuses, options={}) {
  let reads=0,refreshes=0
  const attempts=[]
  const session=()=>({user:{id:options.otherUser?'other':'player'},access_token:refreshes?'renewed':'initial'})
  const auth={getCurrentSession:async()=>({data:{session:session()}}),supabase:{auth:{refreshSession:async()=>{refreshes++;return {data:{session:session()},error:options.refreshError?new Error('EXPIRED'):null}}}}}
  const api=moduleFrom('./playerProfileRead.ts',{require:()=>auth,fetch:async(url,init)=>{
    attempts.push({url,token:init.headers.Authorization,signal:init.signal})
    const value=statuses[Math.min(reads++,statuses.length-1)]
    if(value==='network')throw new TypeError('Failed to fetch')
    return {status:value,ok:value===200,json:async()=>({memberships:[]})}
  }})
  return {read:api.readPlayerProfile,attempts,counts:()=>({reads,refreshes})}
}
test('profile GET waits for session and recovers an expired JWT once',async()=>{
 const app=setup([401,200]);await app.read('/api/profile','player',new AbortController().signal)
 assert.deepEqual(app.counts(),{reads:2,refreshes:1});assert.deepEqual(app.attempts.map(x=>x.token),['Bearer initial','Bearer renewed'])
})
for(const status of ['network',502,503,504])test(`profile GET recovers one transient ${status} failure`,async()=>{
 const app=setup([status,200]);await app.read('/api/profile','player',new AbortController().signal);assert.equal(app.counts().reads,2)
})
for(const status of [401,403,500,503])test(`persistent ${status} stays an error with bounded requests`,async()=>{
 const app=setup([status]);await assert.rejects(app.read('/api/profile','player',new AbortController().signal));assert.equal(app.counts().reads,[401,503].includes(status)?2:1)
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
