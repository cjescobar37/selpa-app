import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { billingDate, billingValidMoney } from './platformBillingF2'
import { billingCsv, billingExportTable, billingXlsx } from './platformBillingF2Export'

const read=(path:string)=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8')
const sql=read('../supabase/migrations/20261007100803_platform_billing_f2_core.sql')
const qa=read('../supabase/qa/20261007100803_platform_billing_f2_validation.sql')
const ui=read('../features/billing/BillingExperience.tsx')

test('F2 is an isolated bounded context: 10 own tables, no F1A-F1F or legacy queries/writes',()=>{
  assert.equal((sql.match(/create table public.platform_billing_/g)??[]).length,10)
  assert.doesNotMatch(sql,/(?:from|join|into|update|table) public\.(?:club_finance_|club_payment_|payments\b|commissions\b|settlements\b|settlement_items\b)/i)
  assert.doesNotMatch(sql,/cron\.schedule|vault\./)
  assert.match(sql,/currency_code = 'ARS'/)
  assert.match(sql,/billing_interval in \('MONTHLY','ANNUAL','FREE'\)/)
  assert.match(sql,/price >= 0 and price < 1000000000000/)
  assert.match(sql,/check \(isfinite\(paid_at\)\)/)
})
test('FREE creates a period, no debt invoice; paid interval $0 derives PAID and no revenue',()=>{
  assert.match(sql,/if pl\.billing_interval <> 'FREE' then/)
  assert.match(sql,/if p_amount = 0 then return/)
  assert.match(sql,/when i\.total = coalesce\(a\.net,0\) then 'PAID'/)
  for(const check of ['FREE','ZERO_INVOICE'])assert.match(qa,new RegExp(`QA_F2_${check}`))
})
test('one current subscription, one canonical consecutive period and one invoice; exact idempotency',()=>{
  assert.match(sql,/unique index platform_billing_one_current_subscription_idx[\s\S]*where status <> 'CANCELLED'/)
  assert.match(sql,/unique \(subscription_id,period_start\)/)
  assert.match(sql,/period_id uuid not null unique/)
  assert.match(sql,/cmd\.operation <> p_operation or cmd\.payload <> p_payload/)
  assert.match(sql,/if cmd\.response is not null then return cmd\.response/)
  assert.match(sql,/v_start is distinct from s\.current_period_end/)
  assert.match(qa,/QA_F2_ONE_INVOICE/)
})
test('issued economics and historical sources immutable; compensating VOID/reversal',()=>{
  assert.match(sql,/BILLING_INVOICE_ECONOMICS_IMMUTABLE/)
  assert.match(sql,/BILLING_REVERSE_PAYMENTS_BEFORE_VOID/)
  assert.match(sql,/BILLING_PAYMENT_IMMUTABLE/)
  assert.match(sql,/BILLING_COMMAND_IMMUTABLE/)
  assert.match(sql,/before update or delete on public\.%I/)
  assert.match(sql,/INVOICE_VOIDED/);assert.match(sql,/PAYMENT_REVERSED/)
  assert.doesNotMatch(sql,/delete from public\.platform_billing_/i)
})
test('multi-invoice allocations use only confirmed POSTED net; lock order and revision support RC/RR',()=>{
  assert.match(sql,/p\.status = 'POSTED'/)
  assert.match(sql,/order by \(x->>'invoice_id'\)::uuid/)
  assert.match(sql,/order by id for update/)
  assert.match(sql,/update public\.platform_billing_invoices set revision=revision\+1/)
  assert.match(sql,/BILLING_OVER_ALLOCATION/)
  assert.match(sql,/BILLING_DUPLICATE_ALLOCATION/)
  assert.match(sql,/jsonb_array_length\(p_payload->'allocations'\) not between 1 and 100/)
  for(const check of ['PARTIAL','FULL_MULTI','REVERSAL','VOID'])assert.match(qa,new RegExp(`QA_F2_${check}`))
})
test('double entry validates exact accounts/amount/source, not merely zero-sum',()=>{
  assert.match(sql,/deferrable initially deferred/)
  assert.match(sql,/account = v_debit and amount = v_amount/)
  assert.match(sql,/account = v_credit and amount = -v_amount/)
  assert.match(sql,/count\(\*\) from public\.platform_billing_postings where journal_id = j\.id\) <> 2/)
  assert.match(sql,/BILLING_INVOICE_JOURNAL_MISSING/)
  assert.match(sql,/BILLING_PAYMENT_INTEGRITY/)
  assert.match(qa,/set constraints all immediate/)
})
test('plan changes are next period by default, snapshots frozen, suspension explicit, arrears derived',()=>{
  assert.match(sql,/coalesce\(\(p_payload->>'immediate'\)::boolean,false\)/)
  assert.match(sql,/next_plan_id=case when v_has_period then null else next_plan_id end/)
  assert.match(sql,/pe\.plan_snapshot->>'price'/)
  assert.match(sql,/financial_status = 'OVERDUE'\) then 'PAST_DUE'/)
  assert.match(sql,/BILLING_SUBSCRIPTION_SUSPENDED/)
  assert.match(sql,/expected_price'[\s\S]*is distinct from pl.price/)
  for(const check of ['NEXT_PLAN','PLAN_SNAPSHOT','SUSPEND','REACTIVATE','OVERDUE_PAST_DUE'])assert.match(qa,new RegExp(`QA_F2_${check}`))
})
test('DB authorization: real JWT platform actor; approved OWNER/ADMIN reads, no service key grants',()=>{
  assert.match(sql,/v_actor uuid := public\.platform_billing_require_admin_f2\(\)/)
  assert.match(sql,/role in \('OWNER','ADMIN'\) and status = 'APPROVED' and approved_at is not null/)
  assert.match(sql,/p_payload \? 'actor_id'/)
  assert.match(sql,/revoke all on table public\.%I from public,anon,authenticated,service_role/)
  assert.doesNotMatch(sql,/grant .* to service_role/i)
  for(const check of ['CROSS_CLUB','CLUB_WRITE','PLAYER','ANON','ACL','ACTOR','DIRECT_WRITES_RLS'])assert.match(qa,new RegExp(`QA_F2_${check}`))
})
test('aggregated reads, stable keyset pagination, Argentina date boundary and bounded exports',()=>{
  assert.match(sql,/\(i\.created_at,i\.id\)<\(p_cursor_at,p_cursor_id\)/)
  assert.match(sql,/limit p_limit\+1/)
  assert.doesNotMatch(sql,/\boffset\b/i)
  assert.match(sql,/\(\(v_to\+1\)::timestamp at time zone 'America\/Argentina\/Buenos_Aires'\)/)
  const exportRoute=read('../app/api/platform/billing/export/route.ts')
  assert.match(exportRoute,/billingAccess\(req,true\)/)
  assert.match(exportRoute,/rows.length>20000/)
  assert.match(exportRoute,/do \{[\s\S]*\} while\(cursor\)/)
})
test('billing dates retain conceptual dates and money requires exact cents',()=>{
  assert.match(billingDate('2026-10-02'),/2.*oct.*2026/)
  assert.equal(billingValidMoney(0),true);assert.equal(billingValidMoney(0,true),false)
  assert.equal(billingValidMoney(0.01,true),true);assert.equal(billingValidMoney(1.001),false)
  assert.equal(billingValidMoney(Infinity),false);assert.equal(billingValidMoney(-1),false)
})
test('CSV and XLSX reuse F1F infrastructure with typed amounts, dates and safe text',async()=>{
  const table=billingExportTable('invoices',[{id:'i',created_at:'2026-10-02T03:00:00Z',invoice_number:'SELPA-1',club_name:'=evil()',period_start:'2026-10-02',period_end:'2026-11-02',due_at:'2026-10-05',total:100.5,allocated_net:20,balance:80.5,financial_status:'PARTIAL'}])
  assert.match(billingCsv(table),/"'=evil\(\)"/);assert.match(billingCsv(table),/100,5/)
  assert.ok(table.rows[0][2] instanceof Date);assert.equal(typeof table.rows[0][6],'number')
  const bytes=await billingXlsx([table]);assert.ok(bytes.length>1000)
  const require=createRequire(import.meta.url);const {unzipSync,strFromU8}=require('fflate')
  const files=unzipSync(new Uint8Array(bytes));const xml=strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(xml,/<c r="G2"[^>]*>\s*<v>100.5<\/v>/)
  assert.match(strFromU8(files['xl/styles.xml']),/071E3D/)
})
test('read-only club UI never renders economic actions; labels warn internal/not fiscal',()=>{
  assert.match(ui,/platform&&row.status==='ISSUED'/)
  assert.match(ui,/platform&&row.status==='POSTED'/)
  assert.match(ui,/Comprobante interno, no fiscal/)
  assert.match(ui,/crypto.randomUUID\(\)/)
  assert.match(ui,/confirmados|confirmado/)
})

// Exercise the actual route adapter with auth/RPC doubles, not a fake financial engine.
function serverFixture(options:{deny?:boolean;rpcError?:{code:string;message:string}}={}) {
  const calls:Array<{name:string;params:Record<string,unknown>}>=[]
  const response={json:(data:unknown,init?:{status?:number})=>({data,status:init?.status??200})}
  const req={headers:{get:()=> 'Bearer human-jwt'},nextUrl:{searchParams:new URLSearchParams()},json:async()=>({operation:'SAVE_PLAN',key:'same-key-123',payload:{code:'QA',name:'QA',price:100,billing_interval:'MONTHLY'}})}
  const exports:Record<string,unknown>={}
  const code=ts.transpileModule(read('./platformBillingF2Server.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  runInNewContext(code,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon'}},URLSearchParams,
    require:(name:string)=>{
      if(name==='next/server')return {NextResponse:response}
      if(name==='@/lib/platformApiAuth')return {assertPlatformAdmin:async()=>({error:options.deny?response.json({error:'denied'},{status:403}):null,user:{id:'real-human'}})}
      if(name==='@/lib/clubMembershipServer')return {requireClubCapability:async()=>({error:options.deny?response.json({error:'denied'},{status:403}):null})}
      if(name==='@supabase/supabase-js')return {createClient:(_u:string,_k:string,config:{global:{headers:{Authorization:string}}})=>{
        assert.equal(config.global.headers.Authorization,'Bearer human-jwt')
        return {rpc:async(name:string,params:Record<string,unknown>)=>{calls.push({name,params});return {error:options.rpcError??null,data:{items:[],nextCursor:null}}}}
      }}
      if(name==='./platformBillingF2')return {billingLists:['invoices','plans'],billingOperations:['SAVE_PLAN'],billingValidMoney}
      throw new Error(name)
    }})
  return {calls,req,api:exports as {billingPost:(r:unknown)=>Promise<{status:number;data:unknown}>;billingGet:(r:unknown,p:boolean)=>Promise<{status:number}>}}
}
test('actual write adapter rejects unauthorized actor and free actor_id, forwards JWT, not service role',async()=>{
  const denied=serverFixture({deny:true});assert.equal((await denied.api.billingPost(denied.req)).status,403);assert.equal(denied.calls.length,0)
  const allowed=serverFixture();assert.equal((await allowed.api.billingPost(allowed.req)).status,200)
  assert.equal(allowed.calls[0].name,'execute_platform_billing_f2');assert.equal('actor_id' in allowed.calls[0].params,false)
  const spoof=serverFixture();spoof.req.json=async()=>({operation:'SAVE_PLAN',key:'same-key-123',payload:{code:'QA',name:'QA',price:100,billing_interval:'MONTHLY',actor_id:'evil'}} as never)
  assert.equal((await spoof.api.billingPost(spoof.req)).status,400);assert.equal(spoof.calls.length,0)
})
test('actual read adapter validates club scope, export-like listing denial, and concurrency error is 409',async()=>{
  const f=serverFixture();assert.equal((await f.api.billingGet(f.req,false)).status,400)
  f.req.nextUrl.searchParams.set('clubId','11111111-1111-4111-8111-111111111111');f.req.nextUrl.searchParams.set('kind','invoices')
  assert.equal((await f.api.billingGet(f.req,false)).status,200);assert.equal(f.calls[0].params.p_club_id,'11111111-1111-4111-8111-111111111111')
  const denied=serverFixture({deny:true});assert.equal((await denied.api.billingGet(denied.req,true)).status,403)
  const concurrent=serverFixture({rpcError:{code:'40001',message:'serialization'}});assert.equal((await concurrent.api.billingPost(concurrent.req)).status,409)
})
