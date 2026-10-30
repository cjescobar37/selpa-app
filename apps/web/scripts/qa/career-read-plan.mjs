/** Print a read-only compatibility/plan query. Never installs projections.
 * Expands the pending migration's five SELECTs into CTEs, preserving its SQL.
 * Execute only through an authorized read-only connection. */
import {readFileSync} from 'node:fs'
const sql=readFileSync(new URL('../../supabase/migrations/20261009100429_player_career_read_models.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'')
const definitions=[...sql.matchAll(/create view public\.([a-z_]+) with \(security_invoker = true\) as\n([\s\S]*?);/g)]
if(definitions.length!==5)throw Error('Expected all five exact read models')
const names=definitions.map(d=>d[1])
const ctes=definitions.map(([,name,body])=>`${name} as (${names.reduce((text,n)=>text.replaceAll('public.'+n,n),body)})`).join(',\n')
const club='7c70723b-8244-4117-9a2e-b9a129f661a9',season='38763b95-7450-4780-a984-99bc41ded6f0'
const query=`begin transaction read only; set local statement_timeout='5s'; set local role service_role;
explain (analyze,buffers,format text) with ${ctes}
select club_player_id,position,ranking_points from competition_player_standings_read
where club_id='${club}' and season_id='${season}' order by ordinal limit 25; rollback;`
console.log(JSON.stringify({query}))
