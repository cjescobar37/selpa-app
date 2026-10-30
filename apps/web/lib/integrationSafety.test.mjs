import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync,readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('development runtime is unavailable in a Preview production runtime and never invokes git',()=>{
 let gitCalls=0;const exports={};class NextResponse extends Response {static json(value,options){return Response.json(value,options)}}
 const code=ts.transpileModule(source('app/api/dev/local-runtime/route.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 runInNewContext(code,{exports,process:{env:{NODE_ENV:'production'}},require:name=>name==='next/server'?{NextResponse}:name==='node:child_process'?{execFileSync:()=>{gitCalls++;throw Error('git must not run')}}:(()=>{throw Error(name)})()})
 assert.equal(exports.GET().status,404);assert.equal(gitCalls,0)
})
test('QA player mutation endpoints and the QA tournament page are excluded from the deployable app',()=>{
 assert.equal(existsSync(new URL('../app/api/dev/qa-e2e-players/route.ts',import.meta.url)),false)
 assert.equal(existsSync(new URL('../app/(app)/club/qa-e2e-open-octubre/page.tsx',import.meta.url)),false)
})
test('the integration Preview cannot enable the historical sports sample routes',()=>{
 const exports={};const code=ts.transpileModule(source('features/preview-sports-demo/demo-data.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 runInNewContext(code,{exports,require:name=>{assert.equal(name,'server-only');return {}}})
 assert.equal(exports.sportsDemoEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/selpa-full-integration-20261030'}),false)
 assert.equal(exports.sportsDemoEnabled({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'codex/pwa-universal-preview-20261015'}),false)
})
