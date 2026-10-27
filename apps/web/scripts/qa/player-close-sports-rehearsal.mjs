import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createFixture,CLUB,CLUB_PLAYER,SEASON,id} from './block1-fixture.mjs'
import {addSportsPrivacyFixture} from '../../lib/testHelpers/sportsPrivacyFixture.mjs'
import {typedSchema} from './player-close-schema.mjs'
const document=new URL('../../../../docs/player-close-20261027/',import.meta.url)
const metadata=JSON.parse(await readFile(new URL('schema-contract.json',document),'utf8'))
const fixtureSource=await readFile(new URL('./block1-fixture.mjs',import.meta.url),'utf8')
const names=new Set([...fixtureSource.matchAll(/create table (\w+)/g)].map(m=>'public.'+m[1]))
for(const name of ['competition_segments','competition_series','competition_series_events'])names.add('public.'+name)
const schemaSql=typedSchema(metadata.tables,{names})
const db=await createFixture({installReadModels:false,schemaSql})
const report={engine:'PGlite / PostgreSQL; isolated synthetic sports data',metadataTables:names.size,checks:[]}
const files=['20261009100429_player_career_read_models.sql','20261022135243_public_sports_visibility_reads.sql']
const sql=await Promise.all(files.map(file=>readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')))
async function snapshot(){
  const rows={}
  for(const name of names)rows[name]=(await db.query('select to_jsonb(t) as row from '+name+' t order by md5(to_jsonb(t)::text)')).rows
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
try {
  await addSportsPrivacyFixture(db,{installReadModels:false,schemaReady:true})
  for(const table of ['competition_divisions','competition_branches','competition_categories','competition_segments'])await db.exec(`update ${table} set is_visible=true,is_active=true`)
  await db.query('update competition_seasons set is_public=(club_id=$1)',[CLUB])
  for(const table of metadata.tables.filter(t=>names.has(t.name)&&t.rls_enabled))await db.exec('alter table '+table.name+' enable row level security')
  const before=await snapshot();report.baselineHash=before
  for(const migration of sql)await db.exec(migration)
  assert.equal(await snapshot(),before);report.checks.push('exact migration pair leaves base rows unchanged')
  const own=(await db.query('select position,ranking_points from competition_player_standings_read where club_player_id=$1',[CLUB_PLAYER])).rows[0]
  assert.ok(own.position>0);assert.ok(Number(own.ranking_points)>0)
  assert.equal((await db.query('select * from public_player_standings_read where club_id=$1',[id(2)])).rows.length,0)
  assert.equal((await db.query('select * from competition_player_standings_read where user_id=$1',[id(1002)])).rows.length,0)
  report.checks.push('own category and points; private club and STAFF isolation')
  await db.exec('set role service_role')
  assert.ok((await db.query('select * from public_player_standings_read where season_id=$1',[SEASON])).rows.length>0)
  assert.equal((await db.query('select * from public_player_standings_read where club_id=$1',[id(2)])).rows.length,0)
  await db.exec('reset role')
  for(const role of ['anon','authenticated']){await db.exec('begin;set local role '+role);await assert.rejects(db.query('select * from public_player_standings_read'),/permission denied/);await db.exec('rollback')}
  report.checks.push('backend grant works; direct anon/authenticated reads denied')
  await db.exec(await readFile(new URL('sports-rollback.sql',document),'utf8'))
  assert.equal(await snapshot(),before)
  assert.equal((await db.query("select to_regclass('public.public_player_standings_read') as model")).rows[0].model,null)
  report.rollbackHash=await snapshot();report.checks.push('rollback restores absent objects and identical base data')
  for(const migration of sql)await db.exec(migration)
  assert.deepEqual((await db.query('select position,ranking_points from competition_player_standings_read where club_player_id=$1',[CLUB_PLAYER])).rows[0],own)
  report.checks.push('re-enable restores identical official position and points')
  report.status='PASS'
}catch(error){report.status='FAIL';report.failure=String(error.message);throw error}finally{
  const output=process.env.SELPA_REHEARSAL_REPORT
  if(output)await writeFile(output,JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2));await db.close()
}
