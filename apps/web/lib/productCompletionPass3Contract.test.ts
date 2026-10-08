import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
import { createWriteGuard } from './useWriteGuard'
import { readWriteIntent, prepareWriteIntent, type IntentStorage } from './writeIntentRecovery'
import { humanizeUiError } from './productPresentation'
import * as finance from './clubFinanceF1C'
import * as billing from './platformBillingF2'
import { hasClubCapability } from './clubPermissions'

const read=(path:string)=>readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8')
const migration=read('../supabase/migrations/20261008101837_product_write_flows_pass3.sql')
const club='11111111-1111-4111-8111-111111111111', human='22222222-2222-4222-8222-222222222222'
function execute(source:string,dependencies:(name:string)=>unknown,globals:Record<string,unknown>={}) {
  const exports:Record<string,unknown>={}
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,URL,URLSearchParams,Headers,Response,Request,Date,Map,Set,Promise,JSON,crypto:{randomUUID},
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'offline-only'}},
    console:{error:()=>{},warn:()=>{}},require:dependencies,...globals,
  })
  return exports
}
function memory():IntentStorage {const data=new Map<string,string>();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v)},removeItem:k=>{data.delete(k)}}}
const req=(body:unknown,authenticated=true)=>Object.assign(new Request('https://fixture.invalid/api',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer offline-fixture-only'}:{})},body:JSON.stringify(body)}),{nextUrl:new URL('https://fixture.invalid/api')})
const json=(value:unknown)=>JSON.parse(JSON.stringify(value))
type Post=(request:Request,context?:unknown)=>Promise<Response>
function deferred(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return {promise,release}}

test('synchronous guard blocks double click before React rerenders; no auto retry',async()=>{
  const write=createWriteGuard(),barrier=deferred();let commits=0
  const first=write(async()=>{commits++;await barrier.promise})
  await write(async()=>{commits++});assert.equal(commits,1)
  barrier.release();await first
  await assert.rejects(write(async()=>{throw new Error('network')}),/network/)
  await write(async()=>{commits++});assert.equal(commits,2)
})
test('unknown outcome survives refresh; retry preserves exact command/key, edits cannot create another',()=>{
  const storage=memory(),scope='selpa.write-intent.finance:human:club'
  const payload={action:'payment.register',amount:'20',method:'CASH',paidAt:'2026-10-08T12:00:00Z',idempotencyKey:'stable-key'}
  const intent=prepareWriteIntent(storage,scope,payload,'stable-key')
  const reloaded=readWriteIntent(storage,scope)!
  assert.deepEqual(reloaded,intent)
  assert.deepEqual(prepareWriteIntent(storage,scope,payload,'different-key'),intent)
  assert.throws(()=>prepareWriteIntent(storage,scope,{...payload,amount:'100'},'different-key'),/pendiente/)
  assert.equal(readWriteIntent(storage,'other-user:club'),null)
  storage.removeItem(scope);assert.equal(readWriteIntent(storage,scope),null)
})
test('unavailable/corrupt intent storage fails BEFORE dispatch, never erases an unknown receipt',()=>{
  assert.throws(()=>prepareWriteIntent({getItem:()=>null,setItem:()=>{throw new Error()},removeItem:()=>{}},'x',{},'key'),/conservar/)
  const storage=memory();storage.setItem('x','bad json');assert.throws(()=>readWriteIntent(storage,'x'),/recuperar/)
  storage.setItem('x',JSON.stringify({scope:'other-user',key:'key',payload:{}}));assert.throws(()=>readWriteIntent(storage,'x'),/recuperar/)
})

function writeErrors(logs:unknown[][]=[]) {
  return execute(read('./writeFlowServer.ts'),name=>{
    if(name==='next/server')return {NextResponse:{json:Response.json}}
    throw new Error(name)
  },{console:{error:(...args:unknown[])=>logs.push(args)}}) as {writeErrorResponse:(op:string,error:{code:string;message?:string;details?:string;hint?:string})=>Response}
}
for(const [code,kind,status] of [['22023','VALIDATION',400],['42501','FORBIDDEN',403],['23505','CONFLICT',409],['40001','CONFLICT',409],['40P01','CONFLICT',409],['PGRST202','SERVER',503]] as const){
  test(`write error ${code}: human ${kind}, no database/private diagnostics`,async()=>{
    const logs:unknown[][]=[],api=writeErrors(logs)
    const response=api.writeErrorResponse('fixture.operation',{code,message:'private SQL statement',details:'secret-row',hint:'secret-hint'})
    assert.equal(response.status,status);const body=await response.json();assert.equal(body.kind,kind)
    assert.doesNotMatch(JSON.stringify(body),/SQL|PGRST|private|secret|40P01/)
    assert.deepEqual(json(logs),[['[write-flow]',{operation:'fixture.operation',code}]])
  })
}
test('SQL transition boundaries: retained requests, owner context, no HTTP compensation or historical cleanup',()=>{
  assert.match(migration,/status='APPROVED',resolved_club_id=v_club_id/)
  assert.match(migration,/insert into public.club_memberships[\s\S]*'OWNER','APPROVED'/)
  assert.match(migration,/on conflict\(user_id\) do update set active_club_id=excluded.active_club_id/)
  assert.match(migration,/WRITE_OWNER_ACCOUNT_REQUIRED/)
  assert.match(migration,/WRITE_INTENT_CONFLICT/)
  assert.match(migration,/pg_advisory_xact_lock/)
  assert.doesNotMatch(migration,/delete from|truncate |drop table|update public.club_finance|alter table public.club_finance/i)
  for(const path of ['../app/api/club-requests/[id]/route.ts','../app/api/clubs/request-join/route.ts'])assert.doesNotMatch(read(path),/\.insert\(|\.update\(|\.delete\(/)
})
test('PLAYER approval reuses atomic engine, enum comparison typed; STAFF separation remains enforced',()=>{
  assert.match(migration,/public.approve_player_membership_atomic\(p_membership_id\)/)
  assert.match(migration,/'APPROVED'::public.membership_status/)
  assert.match(migration,/v_member.role <> 'PLAYER'/)
  assert.match(migration,/account_assert_identity\(array\[p_user_id\],false\)/)
  assert.match(migration,/account_assert_identity\(array\[v_owner.user_id\],true\)/)
  assert.match(read('../app/api/platform/users-admin/route.ts'),/membership.role === 'PLAYER'[\s\S]*resolve_player_membership_pass3/)
})
test('pair acceptance is atomic and repeatable; overlapping manual insertion guarded without history cleanup',()=>{
  assert.match(migration,/if v_invite.status=v_target then[\s\S]*'replayed',true/)
  assert.match(migration,/insert into public.player_active_partnerships[\s\S]*update public.player_partner_invites set status=v_target/)
  assert.match(migration,/create trigger write_guard_active_partner_pass3/)
  assert.match(migration,/account_guard_partnership runs first/)
  assert.match(migration,/is not distinct from \(old.club_id,old.player1_club_player_id/)
  assert.match(read('../app/(app)/player/page.tsx'),/resolvePartnerInvite[\s\S]*Aceptar pareja/)
})
test('legacy decision delegates to unchanged F1B; obligation/legacy flag are one transaction, no POSTED payment',()=>{
  const integration=migration.slice(migration.indexOf('create function public.resolve_tournament_payment_request_pass3'),migration.indexOf('-- Cover every existing'))
  assert.match(integration,/for update/)
  assert.match(integration,/public.transition_tournament_registration_finance_f1b\(/)
  assert.match(integration,/update public.tournament_payments set status=v_target/)
  assert.match(integration,/update public.tournament_registrations set payment_status=p_status/)
  assert.doesNotMatch(integration,/register_club_finance_payment|club_finance_payments/)
})
test('new privileged RPCs service-only; user approval verifies auth.uid; helper INTERNAL',()=>{
  for(const signature of ['submit_club_request_pass3(uuid,jsonb)','resolve_club_request_pass3(uuid,uuid,text,text)','request_player_membership_pass3(uuid,uuid)','resolve_partner_invite_pass3(uuid,uuid,uuid,text)','resolve_tournament_payment_request_pass3(uuid,uuid,uuid,text,text)','resolve_registration_change_request_pass3(uuid,uuid,uuid,text)']){
    assert.ok(migration.includes(`revoke all on function public.${signature} from public,anon,authenticated;`))
    assert.ok(migration.includes(`grant execute on function public.${signature} to service_role;`))
  }
  assert.match(migration,/v_actor uuid:=auth.uid\(\)/)
  assert.match(migration,/guard_active_partnership_pass3\(\) from public,anon,authenticated,service_role/)
})

function clubRequestsApi({platform=true,fail=''}={}) {
  const calls:Array<{name:string;params:Record<string,unknown>}>=[],receipts=new Map<string,unknown>()
  const admin={auth:{getUser:async()=>({data:{user:{id:human}},error:null})},
    from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:platform?{user_id:human}:null,error:null})};return q},
    rpc:async(name:string,params:Record<string,unknown>)=>{calls.push({name,params});if(fail)return {data:null,error:{code:'23505',message:fail}}
      const id=String(params.p_request_id),result=receipts.get(id)??{ok:true,status:params.p_action==='reject'?'REJECTED':'APPROVED',clubId:club};receipts.set(id,result);return {data:result,error:null}},
  }
  const loaded=execute(read('../app/api/club-requests/[id]/route.ts'),name=>name==='next/server'?{NextResponse:{json:Response.json}}:name.endsWith('supabaseAdmin')?{supabaseAdmin:admin}:name.endsWith('writeFlowServer')?writeErrors():{})
  return {post:loaded.PATCH as Post,calls,receipts}
}
test('real club approval handler: verified actor overrides forged body actor, retry returns same committed club',async()=>{
  const api=clubRequestsApi(),ctx={params:Promise.resolve({id:club})}
  for(let i=0;i<2;i++)assert.equal((await api.post(req({action:'approve',actor_id:'forged'}),ctx)).status,200)
  assert.equal(api.receipts.size,1);assert.ok(api.calls.every(call=>call.params.p_actor_id===human))
})
test('real onboarding handler: guest/unauthorized/no reason stop before privileged RPC',async()=>{
  const api=clubRequestsApi(),ctx={params:Promise.resolve({id:club})}
  assert.equal((await api.post(req({action:'approve'},false),ctx)).status,401)
  assert.equal((await api.post(req({action:'reject'}),ctx)).status,400)
  const denied=clubRequestsApi({platform:false});assert.equal((await denied.post(req({action:'approve'}),ctx)).status,403)
  assert.equal(api.calls.length+denied.calls.length,0)
})
test('real approval conflict: processed opposite decision is human conflict, never false success',async()=>{
  const api=clubRequestsApi({fail:'WRITE_ALREADY_RESOLVED'})
  const response=await api.post(req({action:'approve'}),{params:Promise.resolve({id:club})})
  assert.equal(response.status,409);assert.equal((await response.json()).kind,'CONFLICT');assert.equal(api.receipts.size,0)
})

function financeApi(role:string) {
  let balance=100,received=0;const receipts=new Map<string,unknown>(),payments=new Map<string,{amount:number;reversed:boolean}>();let calls=0
  const api=execute(read('../app/api/clubs/finance/core/route.ts'),name=>{
    if(name==='next/server')return {NextResponse:{json:Response.json}}
    if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(operation:string,p:Record<string,unknown>)=>{
      calls++;const key=String(p.p_idempotency_key);if(receipts.has(key))return {data:receipts.get(key),error:null}
      const id=String(p.p_obligation_id??p.p_payment_id)
      if(operation==='register_club_finance_payment'){
        const amount=Number(p.p_amount);if(amount>balance)return {data:null,error:{code:'23514',message:'CLUB_FINANCE_OVER_ALLOCATION'}}
        payments.set(key,{amount,reversed:false});balance-=amount;received+=amount
      }else{const payment=payments.get(id)!;assert.ok(payment&&!payment.reversed);payment.reversed=true;balance+=payment.amount;received-=payment.amount}
      const data={id:key,balance,received};receipts.set(key,data);return {data,error:null}
    }})}
    if(name.endsWith('clubMembershipServer'))return {requireClubCapability:async()=>({error:hasClubCapability(role,'finance:manage')?null:Response.json({error:'No autorizado'},{status:403})})}
    if(name.endsWith('clubPermissions'))return {hasClubCapability}
    if(name.endsWith('clubFinanceF1C'))return finance
    return {}
  })
  return {post:api.POST as Post,state:()=>({balance,received,payments:payments.size,calls})}
}
test('real Finance API + RPC fixture: cash partial → transfer full → reverse; lost response/retry one payment',async()=>{
  const api=financeApi('OWNER'),storage=memory(),scope='finance-fixture'
  const partialId='33333333-3333-4333-8333-333333333333',completeId='44444444-4444-4444-8444-444444444444'
  const payload={clubId:club,action:'payment.register',id:club,amount:'20',balance:100,method:'CASH',paidAt:'2026-10-08T12:00:00Z',idempotencyKey:partialId}
  prepareWriteIntent(storage,scope,payload,partialId)
  await api.post(req(payload)) // Simulate a committed response lost before the client acknowledges it.
  assert.equal(api.state().balance,80)
  const recovered=readWriteIntent(storage,scope)!
  assert.equal((await api.post(req(recovered.payload))).status,200)
  assert.equal(api.state().payments,1)
  assert.equal((await api.post(req({...payload,amount:'80',balance:80,method:'BANK_TRANSFER',idempotencyKey:completeId}))).status,200)
  assert.equal(api.state().balance,0);assert.equal(api.state().received,100)
  const reversal={clubId:club,action:'payment.reverse',id:completeId,reason:'fixture reversal',idempotencyKey:'reverse-payment'}
  assert.equal((await api.post(req(reversal))).status,200)
  assert.equal(api.state().balance,80);assert.equal(api.state().received,20)
  assert.equal((await api.post(req(reversal))).status,200)
  assert.equal(api.state().balance,80);assert.equal(api.state().received,20);assert.equal(api.state().payments,2)
  assert.equal((await api.post(req({...payload,id:'not-a-uuid'}))).status,400)
  assert.equal((await api.post(req({...payload,amount:'81',balance:100,idempotencyKey:'over-allocation'}))).status,400)
  assert.equal(api.state().balance,80);assert.equal(api.state().payments,2)
})
for(const role of ['PLAYER','PLANILLERO','OPERADOR','guest'])test(`${role}: real Finance API write denied before RPC`,async()=>{
  const api=financeApi(role);assert.equal((await api.post(req({clubId:club}))).status,403);assert.equal(api.state().calls,0)
})
for(const operation of ['SAVE_PLAN','ASSIGN_PLAN','GENERATE_PERIOD','REGISTER_PAYMENT','REVERSE_PAYMENT','CHANGE_PLAN']){
  test(`real Billing API delegates ${operation} once with server identity; Club Admin has no write`,async()=>{
    let calls=0
    const deps=(allowed:boolean)=>(name:string)=>{
      if(name==='next/server')return {NextResponse:{json:Response.json}}
      if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(name:string)=>{assert.equal(name,'execute_platform_billing_f2');calls++;return {data:{ok:true},error:null}}})}
      if(name.endsWith('platformApiAuth'))return {assertPlatformAdmin:async()=>({error:allowed?null:Response.json({error:'No autorizado'},{status:403})})}
      if(name.endsWith('platformBillingF2'))return billing
      return {}
    }
    const body={operation,key:'fixture-operation-key',payload:operation==='SAVE_PLAN'?{price:0}:operation==='REGISTER_PAYMENT'?{amount:20}:{}}
    assert.equal((await (execute(read('./platformBillingF2Server.ts'),deps(true)).billingPost as Post)(req(body))).status,200)
    assert.equal((await (execute(read('./platformBillingF2Server.ts'),deps(false)).billingPost as Post)(req(body))).status,403)
    assert.equal(calls,1)
    assert.equal((await (execute(read('./platformBillingF2Server.ts'),deps(true)).billingPost as Post)(req({...body,payload:{...body.payload,actor_id:'forged'}}))).status,400)
    assert.equal(calls,1)
  })
}

function uiHandler(path:string,name:string,scope:Record<string,unknown>) {
  const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let declaration=''
  function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)declaration=node.getText(ast);ts.forEachChild(node,visit)}visit(ast)
  assert.ok(declaration,`actual handler ${name} must exist`)
  return execute(declaration+`\nexports.handler=${name}`,()=>({}),{write:createWriteGuard(),humanizeUiError,...scope}).handler as (...args:unknown[])=>Promise<unknown>
}
test('actual Staff handler: two submits dispatch once; failed network releases saving and retains email',async()=>{
  const barrier=deferred();let calls=0,saving=false,message='',email='admin@example.invalid'
  const handler=uiHandler('../app/(app)/club/usuarios/page.tsx','createInvite',{
    activeClub:{id:club},canManageTeam:true,email,role:'ADMIN',getToken:async()=>'offline-only',loadClubCore:async()=>{},
    setSaving:(v:boolean)=>{saving=v},setSavingId:()=>{},setMessage:(v:string)=>{message=v},setFlowSuccess:()=>{},setEmailError:()=>{},setSchemaWarning:()=>{},setStaffWarning:()=>{},setEmail:(v:string)=>{email=v},setRole:()=>{},
    fetch:async()=>{calls++;await barrier.promise;throw new TypeError('Failed to fetch')},
  })
  const event={preventDefault:()=>{}}
  const first=handler(event);await handler(event);await Promise.resolve();assert.equal(calls,1)
  barrier.release();await first;assert.equal(saving,false);assert.equal(email,'admin@example.invalid');assert.match(message,/Reintentá/)
})
test('actual config handler: no success before ack, network failure unlocks save',async()=>{
  let saving=false;const banners:Array<{type:string}>=[]
  const handler=uiHandler('../app/(app)/club/configuracion/page.tsx','save',{
    activeClub:{id:club},v:{cuit:''},supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline'}}})}},normalizeUrl:()=>'',
    setSaving:(v:boolean)=>{saving=v},setBanner:(v:{type:string}|null)=>{if(v)banners.push(v)},loadClubData:async()=>{},refresh:async()=>{},fetch:async()=>{throw new TypeError('Failed to fetch')},
  })
  await handler();assert.equal(saving,false);assert.ok(!banners.some(v=>v.type==='success'));assert.equal(banners.at(-1)?.type,'error')
})
test('actual auth reset/update: validation stops writes; concurrent reset dispatched once',async()=>{
  let writes=0;const barrier=deferred(),alerts:Array<{variant:string}>=[]
  const base={setAlert:(v:{variant:string})=>alerts.push(v),setLoading:()=>{},redirectTo:'https://fixture.invalid/auth/callback',supabase:{auth:{resetPasswordForEmail:async()=>{writes++;await barrier.promise;return {error:null}}}}}
  await uiHandler('../app/reset-password/page.tsx','sendReset',{...base,email:'not-an-email'})()
  assert.equal(writes,0)
  const reset=uiHandler('../app/reset-password/page.tsx','sendReset',{...base,email:'qa@example.invalid'})
  const first=reset();await reset();assert.equal(writes,1);barrier.release();await first;assert.equal(alerts.at(-1)?.variant,'success')
  let updates=0
  await uiHandler('../app/update-password/page.tsx','updatePassword',{password:'x',password2:'y',setAlert:base.setAlert,setLoading:()=>{},supabase:{auth:{updateUser:async()=>{updates++;return {error:null}}}}})()
  assert.equal(updates,0)
})
test('real message helper: primary key replay, cross-actor conflict, safe delivery after commit',async()=>{
  const rows=new Map<string,Record<string,unknown>>(),logs:unknown[][]=[]
  const admin={from:()=>{let inserted:Record<string,unknown>|null=null,id='';const q={insert:(row:Record<string,unknown>)=>{inserted=row;return q},select:()=>q,eq:(_k:string,v:string)=>{id=v;return q},single:async()=>{const row=inserted!;if(rows.has(String(row.id)))return {data:null,error:{code:'23505'}};rows.set(String(row.id),row);return {data:{id:row.id},error:null}},maybeSingle:async()=>({data:rows.get(id),error:null})};return q}}
  const api=execute(read('./messageWriteServer.ts'),()=>({supabaseAdmin:admin}),{console:{error:(...args:unknown[])=>logs.push(args)}}) as {insertMessageOnce:(row:Record<string,unknown>)=>Promise<{replayed:boolean}>;afterMessageCommit:(fn:()=>Promise<unknown>)=>Promise<void>}
  const row={id:club,thread_id:club,sender_user_id:human,recipient_user_id:human,subject:'fixture',body:'fixture message',kind:'club_thread',metadata:{}}
  assert.equal((await api.insertMessageOnce(row)).replayed,false);assert.equal((await api.insertMessageOnce(row)).replayed,true);assert.equal(rows.size,1)
  await assert.rejects(api.insertMessageOnce({...row,sender_user_id:'other-user'}))
  await assert.rejects(api.insertMessageOnce({...row,body:'edited after unknown outcome'}))
  await api.afterMessageCommit(async()=>{throw new Error('private notification payload')})
  assert.deepEqual(json(logs),[['[message-delivery]',{code:'DELIVERY_PENDING'}]])
})
test('writes preserve tournament key/created ID, staff owner protection and F2 read-only surface',()=>{
  const wizard=read('../app/(app)/club/torneos/nuevo/page.tsx')
  assert.match(wizard,/return write\(async/);assert.match(wizard,/competitionKeyRef.current \|\| competitionIdempotencyKey/)
  assert.match(wizard,/let tournamentId = createdTournamentRef.current/);assert.match(wizard,/'Idempotency-Key': dateKey/)
  assert.match(read('../app/(app)/club/usuarios/page.tsx'),/member.role === 'OWNER'/)
  assert.doesNotMatch(read('../app/(app)/club/usuarios/page.tsx'),/window.location.reload/)
  assert.match(read('../features/billing/BillingExperience.tsx'),/if\(!platform\|\|!intentScope/)
})

test('cancellation resolution uses one actor-verified RPC; a financial denial is not acknowledged as a saved decision',async()=>{
  const calls:Record<string,unknown>[]=[],admin={auth:{getUser:async()=>({data:{user:{id:human}},error:null})},
    from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q},
    rpc:async(name:string,p:Record<string,unknown>)=>{assert.equal(name,'resolve_registration_change_request_pass3');calls.push(p);return {data:null,error:{code:'23505',message:'F1B_ALLOCATION_UNRESOLVED'}}},
  }
  const api=execute(read('../app/api/clubs/[clubId]/registration-change-requests/[requestId]/route.ts'),name=>
    name==='next/server'?{NextResponse:{json:Response.json}}:name.endsWith('supabaseAdmin')?{supabaseAdmin:admin}:name.endsWith('clubMembershipServer')?{userHasClubCapability:async()=>true}:name.endsWith('writeFlowServer')?writeErrors():{})
  const response=await (api.PATCH as Post)(req({status:'APPROVED',actor_id:'forged'}),{params:Promise.resolve({clubId:club,requestId:club})})
  assert.equal(response.status,409);assert.equal(calls.length,1);assert.equal(calls[0].p_actor_id,human)
  const sql=migration.slice(migration.indexOf('create function public.resolve_registration_change_request_pass3'),migration.indexOf('-- Cover every existing'))
  assert.match(sql,/for update/);assert.match(sql,/'CANCELLED',p_actor_id/)
  assert.ok(sql.indexOf('transition_tournament_registration_finance_f1b')<sql.indexOf('update public.tournament_registration_change_requests'))
  assert.match(sql,/v_request.status=p_status[\s\S]*'replayed',true/)
})
test('notification write waits for owned row acknowledgement; failure never decrements unread or navigates',async()=>{
  let unread=1,navigations=0,ack=false;const errors:string[]=[],filters:unknown[][]=[]
  const q={update:()=>q,eq:(...args:unknown[])=>{filters.push(args);return q},select:()=>q,maybeSingle:async()=>({data:ack?{id:club}:null,error:null})}
  const handler=uiHandler('../components/navbar/AppNavbarClient.tsx','openNotification',{
    notificationWrite:createWriteGuard(),user:{id:human},supabase:{from:()=>q},setNotificationError:(s:string)=>errors.push(s),
    setNotificationPreview:()=>{},setUnreadNotifications:(f:(n:number)=>number)=>{unread=f(unread)},setNavbarOverlay:()=>{},
    cancellationRequestDestination:()=>null,router:{push:()=>{navigations++}},setPreviewModal:()=>{},
  })
  const item={id:club,read:false,href:'/club/solicitudes',type:'fixture'}
  await handler(item);assert.equal(unread,1);assert.equal(navigations,0);assert.match(errors.filter(Boolean)[0],/Reintentá/)
  ack=true;await handler(item);assert.equal(unread,0);assert.equal(navigations,1)
  assert.ok(filters.some(f=>f[0]==='user_id'&&f[1]===human))
})
test('logout failure keeps context and allows retry; menus close only after SDK acknowledgement',async()=>{
  let fail=true,closed=0,loading=false;const errors:string[]=[]
  const handler=uiHandler('../components/navbar/AppNavbarClient.tsx','logout',{
    logoutWrite:createWriteGuard(),setLogoutError:(s:string)=>errors.push(s),setLoggingOut:(b:boolean)=>{loading=b},
    signOut:async()=>{if(fail)throw new TypeError('Failed to fetch')},closeAllMenus:()=>{closed++},
  })
  await handler();assert.equal(closed,0);assert.equal(loading,false);assert.match(errors.at(-1)!,/reintentá/)
  fail=false;await handler();assert.equal(closed,1);assert.equal(loading,false)
})
test('registration retry checks exact committed pair before capacity; wizard stores attempt synchronously and restores created ID',()=>{
  const route=read('../app/api/tournaments/[tournamentId]/registration/submit/route.ts')
  assert.ok(route.indexOf('let row = await committedRegistration')<route.indexOf('const registeredTeamsCount = await'))
  assert.match(route,/if \(!row\) \{[\s\S]*register_team_for_tournament/)
  assert.match(route,/replayed = Boolean\(row\)/);assert.match(route,/afterWriteCommit\('registration_notification'/)
  const wizard=read('../app/(app)/club/torneos/nuevo/page.tsx')
  assert.match(wizard,/createdTournamentId/);assert.match(wizard,/persistAttempt/)
  assert.doesNotMatch(read('../app/(app)/club/configuracion/page.tsx'),/window.location.reload/)
})
test('reversible SQL QA injects failures after sporting writes and validates canonical cash/transfer/reversal without historical cleanup',()=>{
  const qa=read('../supabase/qa/20261008101837_product_write_flows_pass3_validation.sql')
  assert.match(qa,/begin;/i);assert.match(qa,/rollback;/i);assert.match(qa,/pg_temp\./);assert.match(qa,/create trigger/i)
  assert.match(qa,/resolve_registration_change_request_pass3/);assert.match(qa,/register_club_finance_payment/)
  assert.match(qa,/BANK_TRANSFER/);assert.match(qa,/reverse_club_finance_payment/)
  assert.match(qa,/has_function_privilege/)
})

test('real registration handler recovers exact pair at full capacity; no second register or notification; invalid partner stops early',async()=>{
  const partner='33333333-3333-4333-8333-333333333333';let rpcCalls=0,notifications=0,capacityReads=0
  const admin={auth:{getUser:async()=>({data:{user:{id:human}},error:null})},from:(table:string)=>{
    let selection=''
    const players=[human,partner].map(user_id=>({id:user_id,user_id,category:6,gender:'M',approved_at:'2026-01-01',operational_status:'ACTIVE'}))
    const data=()=>table==='tournaments'?{id:club,club_id:club,maxPairs:1}:table==='club_players'?players:
      table==='club_memberships'?players.map(p=>({...p,role:'PLAYER',status:'APPROVED'})):table==='profiles'?players.map(p=>({...p,status:'ACTIVE'})):
      table==='tournament_teams'?[{id:club,player1_user_id:human,player2_user_id:partner}]:{id:club,status:'PENDING'}
    const q={select:(s:string)=>{selection=s;return q},eq:()=>q,in:()=>q,or:()=>q,
      maybeSingle:async()=>({data:data(),error:null}),
      then:(resolve:(v:unknown)=>unknown)=>{if(selection==='team_id,status')capacityReads++;return Promise.resolve({data:data(),error:null}).then(resolve)},
    };return q
  }}
  const api=execute(read('../app/api/tournaments/[tournamentId]/registration/submit/route.ts'),name=>{
    if(name==='next/server')return {NextResponse:{json:Response.json}}
    if(name.endsWith('supabaseAdmin'))return {supabaseAdmin:admin}
    if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async()=>{rpcCalls++;return {data:null,error:null}}})}
    if(name.endsWith('accountRoleServer'))return {playerAccountDenial:async()=>null}
    if(name.endsWith('tournamentHelpers'))return {TOURNAMENT_SELECT:'id',toTournamentView:(row:unknown)=>row}
    if(name.endsWith('tournamentDisplayStatus'))return {getTournamentDisplayStatus:()=>({key:'registration_open'})}
    if(name.endsWith('tournamentRegistrationEligibility'))return {getTournamentRegistrationIneligibility:()=>null}
    if(name.endsWith('clubMembershipRules'))return {isApprovedMembership:()=>true,isClubAdminRole:()=>false}
    if(name.endsWith('operationalNotifications'))return {notifyClubAdmins:async()=>{notifications++}}
    if(name.endsWith('writeFlowServer'))return {...writeErrors(),afterWriteCommit:async(_operation:string,callback:()=>Promise<void>)=>callback()}
    return {}
  })
  const post=api.POST as Post,ctx={params:Promise.resolve({tournamentId:club})}
  const response=await post(req({partnerUserId:partner,paymentMethod:'CASH_ON_SITE_REQUEST'}),ctx)
  assert.equal(response.status,200);assert.equal((await response.json()).replayed,true)
  assert.equal(rpcCalls,0);assert.equal(capacityReads,0);assert.equal(notifications,0)
  assert.equal((await post(req({partnerUserId:'invalid',paymentMethod:'CASH_ON_SITE_REQUEST'}),ctx)).status,400)
})
