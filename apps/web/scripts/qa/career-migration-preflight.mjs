/** Emits ONLY read-only SQL; never applies the migration or opens a connection. */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const source = readFileSync(new URL('../../supabase/migrations/20261009100429_player_career_read_models.sql', import.meta.url), 'utf8')
const sql = source.replace(/--[^\n]*/g, '').replaceAll('\r\n', '\n')
const definitions = [...sql.matchAll(/create view public\.([a-z_]+) with \(security_invoker = true\) as\n([\s\S]*?);/g)]
if (definitions.length !== 5) throw Error('Expected exactly five security-invoker views')
const names = definitions.map(row => row[1])
const inline = body => names.reduce((text, name) => text.replaceAll(`public.${name}`, name), body)
const ctes = definitions.map(([, name, body]) => `${name} AS (${inline(body)})`).join(',\n')
const rpc = sql.match(/set search_path='' as \$\$([\s\S]*?)\$\$/)?.[1]
if (!rpc) throw Error('Expected the exact career summary RPC body')
const summary = inline(rpc.trim().replace(/;$/, '').replaceAll('p_club_player_id', "'00000000-0000-0000-0000-000000000000'::uuid").replaceAll('p_season_id', 'null::uuid'))
const compatibilityQuery = `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='5s'; SET LOCAL ROLE service_role;
WITH ${ctes}, summary AS (${summary})
SELECT ${[...names, 'summary'].map((name, i) => `(SELECT count(*) FROM (SELECT * FROM ${name} LIMIT 0) empty_${i}) AS check_${i}`).join(',\n')}; ROLLBACK;`
const inventoryQuery = `SELECT json_build_object(
 'server_version', current_setting('server_version'),
 'objects', (SELECT json_agg(json_build_object('name',name,'exists',to_regclass('public.'||name) IS NOT NULL)) FROM unnest(ARRAY[${names.map(n => `'${n}'`).join(',')}]) name),
 'rpc_exists', to_regprocedure('public.read_player_career_summary(uuid,uuid)') IS NOT NULL,
 'version_applied', EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009100429'),
 'service_role', (SELECT json_build_object('exists',true,'bypassrls',rolbypassrls) FROM pg_roles WHERE rolname='service_role'));`
// Catalog-only postflight: missing objects remain missing, never repaired here.
const postflightQuery = `SELECT json_build_object(
 'views', (SELECT json_agg(json_build_object('name',c.relname,'options',c.reloptions,
 'definition',pg_get_viewdef(c.oid,true),'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
 'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
 'service_select',has_table_privilege('service_role',c.oid,'SELECT')))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='v' AND c.relname IN (${names.map(n => `'${n}'`).join(',')})),
 'rpc', (SELECT json_build_object('definition',pg_get_functiondef(p.oid),'result',pg_get_function_result(p.oid),
 'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE'))
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.read_player_career_summary(uuid,uuid)')));`
console.log(JSON.stringify({ sha256: createHash('sha256').update(source).digest('hex'), inventoryQuery, compatibilityQuery, postflightQuery }))
