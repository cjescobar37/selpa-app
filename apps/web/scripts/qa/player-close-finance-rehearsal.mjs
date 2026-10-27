/** Local read-model rehearsal. No .env, network, provider requests or financial inserts. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createFixture,CLUB,PLAYER,QA_ACTORS,id} from './block1-fixture.mjs'
import {typedSchema} from './player-close-schema.mjs'
const docs=new URL('../../../../docs/player-close-20261027/',import.meta.url)
const metadata=JSON.parse(await readFile(new URL('schema-contract.json',docs),'utf8'))
const db=await createFixture({installReadModels:false,schemaSql:typedSchema(metadata.tables)})
const report={engine:'PGlite / PostgreSQL; metadata column types',financialRowsCreated:0,checks:[]}
const migrations=['20261006114657_20261002170000_club_finance_f1c_read_model.sql','20261006165334_20261006152334_player_finance_f1d_read_model.sql']
const files=await Promise.all(migrations.map(f=>readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8')))
const financeTables=metadata.tables.filter(t=>/^public\.(club_finance_|club_payment_|platform_billing_)/.test(t.name))
async function digest(){const state={};for(const table of financeTables)state[table.name]=(await db.query('select to_jsonb(t) as row from '+table.name+' t order by md5(to_jsonb(t)::text)')).rows;return createHash('sha256').update(JSON.stringify(state)).digest('hex')}
function definition(sql,name){const regex=new RegExp('create(?: or replace)? function public\\.'+name+'\\s*\\(','i');const at=sql.search(regex);if(at<0)throw Error('Missing function '+name);const start=sql.indexOf('$$',at);const end=sql.indexOf('$$;',start+2);if(start<0||end<0)throw Error('Unsupported function delimiter');return sql.slice(at,end+3)}
try {
  for(const table of metadata.tables.filter(table=>table.rls_enabled))await db.exec('alter table '+table.name+' enable row level security')
  await db.exec(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`)
  const capabilities=await readFile(new URL('../../supabase/migrations/20260730170000_competition_series_stage5a2.sql',import.meta.url),'utf8')
  await db.exec(definition(capabilities,'has_club_capability'))
  const baseline=await digest();report.baselineHash=baseline
  for(const file of files)await db.exec(file)
  assert.equal(await digest(),baseline)
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[PLAYER])
  const overview=(await db.query('select get_player_finance_overview_f1d(null) as data')).rows[0].data
  assert.equal(Number(overview.total_pending),0);assert.equal(Number(overview.total_paid),0)
  assert.equal((await db.query('select * from list_player_finance_obligations_f1d(null,$1,21,null,null)',['ALL'])).rows.length,0)
  assert.equal((await db.query('select * from list_player_finance_movements_f1d(null,21,null,null)')).rows.length,0)
  await assert.rejects(db.query('select get_club_finance_overview_f1c($1)',[CLUB]),e=>e.code==='42501')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[QA_ACTORS.find(a=>a.role==='ADMIN').userId])
  assert.ok((await db.query('select get_club_finance_overview_f1c($1) as data',[CLUB])).rows[0].data)
  await assert.rejects(db.query('select get_club_finance_overview_f1c($1)',[id(2)]),e=>e.code==='42501')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[QA_ACTORS.find(a=>a.role==='PLANILLERO').userId])
  await assert.rejects(db.query('select get_club_finance_overview_f1c($1)',[CLUB]),e=>e.code==='42501')
  report.checks.push('F1D reads empty canonical tables; F1C denies PLAYER, PLANILLERO and foreign club')
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(db.query('select get_player_finance_overview_f1d(null)'),e=>e.code==='42501')
  await db.exec('reset role;set role anon')
  await assert.rejects(db.query('select get_player_finance_overview_f1d(null)'),e=>e.code==='42501')
  await db.exec('reset role')
  report.checks.push('absent identity and direct anonymous RPC denied')
  const contracts=()=>db.query("select p.proname,pg_get_functiondef(p.oid) as definition,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%f1c' or p.proname like '%f1d') order by p.proname")
  const original=(await contracts()).rows
  const candidate=await readFile(new URL('finance-read-candidate.sql',docs),'utf8')
  await db.exec(candidate);await db.exec(candidate)
  assert.deepEqual((await contracts()).rows,original)
  report.checks.push('read repair candidate reapplies without changing function contracts or ACL')
  await db.exec('revoke execute on function public.get_player_finance_overview_f1d(uuid) from authenticated')
  for(const row of original){
    await db.exec(row.definition)
    const signature=(await db.query('select oid::regprocedure::text as signature from pg_proc where proname=$1',[row.proname])).rows[0].signature
    await db.exec('revoke all on function '+signature+' from public,anon,authenticated,service_role')
    for(const [role,allowed] of [['authenticated',row.authenticated_execute],['anon',row.anon_execute],['service_role',row.service_execute]])if(allowed)await db.exec('grant execute on function '+signature+' to '+role)
  }
  assert.deepEqual((await contracts()).rows,original)
  report.checks.push('saved function definitions and grants restore the prior read contract')
  await db.exec(await readFile(new URL('read-model-preflight.sql',docs),'utf8'))
  report.checks.push('proposed catalog preflight parses and executes read-only in isolation')
  assert.equal(await digest(),baseline);report.finalHash=await digest()
  report.checks.push('no financial entities, balances, movements, provider state or F2 rows created or changed')
  report.status='PASS'
}catch(error){report.status='FAIL';report.failure=String(error.message);throw error}finally{if(process.env.SELPA_REHEARSAL_REPORT)await writeFile(process.env.SELPA_REHEARSAL_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await db.close()}
