import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=readFileSync(new URL('../features/preview-sports-demo/demo-data.ts',import.meta.url),'utf8')
const compiledModule={exports:{}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,process:{env:{}},require:n=>{assert.equal(n,'server-only');return {}}})
const demo=compiledModule.exports
test('DEMO is enabled only on the exact Vercel Preview branch, never Production or a client query',()=>{
  const branch='codex/pwa-universal-preview-20261015'
  assert.equal(demo.sportsDemoEnabled({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:branch}),true)
  for(const env of [{},{VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:branch},{VERCEL_ENV:'development',VERCEL_GIT_COMMIT_REF:branch},{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'main'},{demo:'1'}])assert.equal(demo.sportsDemoEnabled(env),false)
})
test('fixture owns no Supabase/financial calls and all identities explicitly say DEMO',()=>{
  assert.doesNotMatch(source,/supabase|\.from\(|\.rpc\(/i)
  for(const gender of ['M','F']){
    const state=demo.demoRanking({gender})
    assert.equal(state.total,6)
    for(const row of state.ranking.rows){const identity=demo.demoIdentity(row.club_player_id);assert.match(identity.name,/DEMO/);assert.equal(identity.userId,row.user_id);assert.equal(identity.contexts[0].gender,gender);assert.match(identity.publicPath,/^\/preview\/demo\?/);assert.equal(identity.avatarUrl,null)}
  }
  assert.equal(demo.demoIdentity('not-a-demo-player'),null)
})
test('pairs, search, summary and bounded histories use isolated deterministic fixture DTOs',()=>{
  assert.equal(demo.demoRanking({modality:'PAIRS'}).pairs.length,3)
  assert.equal(demo.demoRanking({q:'Santiago'}).ranking.rows[0].position,1)
  assert.equal(demo.demoRanking({q:'no existe'}).ranking.rows.length,0)
  const identity=demo.demoIdentity(demo.DEMO_PLAYER)
  assert.equal(demo.demoSection(identity,'summary').summary.stats.effectiveness,75)
  for(const section of ['history','recent']){const result=demo.demoSection(identity,section);assert.equal(result.hasMore,false);assert.match(result.rows[0].tournament_name,/DEMO/)}
})
test('both page and API guard before loading fixture records; real ranking has no DEMO fallback',()=>{
  const page=readFileSync(new URL('../app/preview/demo/page.tsx',import.meta.url),'utf8'),api=readFileSync(new URL('../app/api/preview/sports-demo/[playerId]/route.ts',import.meta.url),'utf8')
  assert.ok(page.indexOf('if(!sportsDemoEnabled())notFound()')<page.indexOf('const query=await searchParams'))
  assert.ok(api.indexOf('if(!sportsDemoEnabled())')<api.indexOf('demoIdentity(playerId)'))
  assert.match(api,/'X-SELPA-Data-Mode':'DEMO'/);assert.match(api,/status:404/)
  const real=readFileSync(new URL('../app/ranking/page.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(real,/demoRanking\(|demoIdentity\(/)
  assert.match(real,/readRankingContexts/)
})
