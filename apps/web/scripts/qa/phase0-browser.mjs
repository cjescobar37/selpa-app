/** Real local Chrome QA. Synthetic Auth/Data API; no submit, checkout or live writes. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {PLAYER,CLUB,id,QA_TOKEN,QA_ACTORS} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright')
const base='http://127.0.0.1:3011',fixture='http://127.0.0.1:45432'
const folder=fileURLToPath(new URL('../../../../output/block1-qa/phase0/',import.meta.url));await mkdir(folder,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const errors=[],external=[],writes=[],measures=[],permissions=[]
async function api(path,token) {
  const res=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}})
  return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')}
}
async function scenario(value,fail='') {assert.equal((await fetch(fixture+`/qa/finance?value=${value}&fail=${fail}`)).status,200)}
async function context(actor) {
  const ctx=await browser.newContext()
  await ctx.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url())
    if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push({host:url.hostname,type:req.resourceType()});return route.abort()}
    if(!['GET','HEAD','OPTIONS'].includes(req.method()) && !url.pathname.startsWith('/rest/v1/rpc/') && !url.pathname.includes('_next')){writes.push(req.method()+' '+url.pathname);return route.abort()}
    if(url.pathname==='/api/inbox-summary') return route.fulfill({json:{notifications:0,messages:0,unread:0}})
    return route.continue()
  })
  if(actor) await ctx.addInitScript(({token,userId})=>{
    localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:4102444800,expires_in:3600,token_type:'bearer',
      user:{id:userId,email:'qa@invalid.test',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:'2026-01-01T00:00:00Z'}}))
  },actor)
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {ctx,page}
}
async function measure(page,name,width) {
  const data=await page.evaluate(()=>{
    const root=document.querySelector('main main'),header=root?.querySelector('header'),wrap=document.querySelector('.px-main > .px-wrap')
    return {width:innerWidth,document:document.documentElement.scrollWidth,root:root?.getBoundingClientRect().toJSON(),header:header?.getBoundingClientRect().toJSON(),
      shellPadding:wrap?getComputedStyle(wrap).paddingInlineStart:null,pagePadding:root?getComputedStyle(root).paddingInlineStart:null}
  })
  assert.ok(data.document<=width,`${name} ${JSON.stringify(data)}`)
  if(width<=430){assert.equal(data.root.x,8);assert.equal(data.root.width,width-16);assert.equal(data.header.x,8);assert.equal(data.pagePadding,'0px');assert.equal(data.shellPadding,'8px')}
  measures.push({route:name,...data})
  await page.screenshot({path:folder+`${name}-${width}.png`,fullPage:true})
}
try {
  await scenario('empty')
  assert.equal((await api('/api/player/finance')).status,401)
  assert.equal((await api('/api/player/finance','invalid')).status,401)
  assert.equal((await api('/api/clubs/billing?clubId='+CLUB)).status,401)
  assert.equal((await api('/api/clubs/billing?clubId='+CLUB,QA_TOKEN)).status,403)
  for(const actor of QA_ACTORS) {
    const payments=await api('/api/player/finance',actor.token)
    assert.equal(payments.status,403)
    const billing=await api('/api/clubs/billing?clubId='+CLUB,actor.token)
    assert.equal(billing.status,['OWNER','ADMIN'].includes(actor.role)?200:403)
    if(['OWNER','ADMIN'].includes(actor.role))assert.equal((await api('/api/clubs/billing?clubId='+id(2),actor.token)).status,403)
    permissions.push({role:actor.role,payments:payments.status,billing:billing.status})
  }
  const player=await context({token:QA_TOKEN,userId:PLAYER}),owner=await context(QA_ACTORS[0])
  for(const width of [320,375,390,430,768,1280]) {
    await player.page.setViewportSize({width,height:844});await owner.page.setViewportSize({width,height:844})
    await scenario('empty')
    await player.page.goto(base+'/player/pagos',{waitUntil:'networkidle'})
    await player.page.getByText('No tenés pagos pendientes.',{exact:true}).waitFor()
    await measure(player.page,'pagos-empty',width)
    await player.page.getByRole('button',{name:'Movimientos',exact:true}).click()
    await player.page.getByText('Todavía no hay movimientos.',{exact:true}).waitFor()
    await measure(player.page,'movimientos-empty',width)
    await owner.page.goto(base+'/club/facturacion',{waitUntil:'networkidle'})
    await owner.page.getByText('Tu club todavía no tiene un plan asignado. Contactá a SELPA.',{exact:true}).waitFor()
    await measure(owner.page,'facturacion-empty',width)
    await owner.page.getByRole('button',{name:'Pagos',exact:true}).click()
    await owner.page.getByText('No hay registros en esta vista.',{exact:true}).waitFor()
    await measure(owner.page,'billing-payments-empty',width)
    await scenario('populated')
    await player.page.reload({waitUntil:'networkidle'})
    await player.page.getByText('Pendiente de la pareja',{exact:true}).first().waitFor()
    assert.equal(await player.page.getByText('Pendiente de la pareja',{exact:true}).count(),2)
    assert.ok(await player.page.getByText('Cargo cancelado · sin saldo pendiente',{exact:true}).count())
    await measure(player.page,'pagos-data',width)
    await player.page.getByRole('button',{name:'Movimientos',exact:true}).click()
    await player.page.getByText('Cobro revertido',{exact:true}).waitFor()
    await measure(player.page,'movimientos-data',width)
    await owner.page.reload({waitUntil:'networkidle'})
    await owner.page.getByRole('heading',{name:'Plan Club',exact:true}).waitFor()
    await owner.page.getByRole('button',{name:'Facturas',exact:true}).click()
    await owner.page.getByRole('heading',{name:'SELPA-QA-1',exact:true}).waitFor()
    assert.equal(await owner.page.getByRole('button',{name:/Registrar pago|Anular|Revertir|Generar/}).count(),0)
    await measure(owner.page,'facturacion-data',width)
    await owner.page.getByRole('button',{name:'Pagos',exact:true}).click()
    await owner.page.getByText('SELPA-QA-1: $',{exact:false}).waitFor()
    await measure(owner.page,'billing-payments-data',width)
    await owner.page.goto(base+'/mis-datos',{waitUntil:'networkidle'})
    await owner.page.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor()
    await measure(owner.page,'staff-account',width)
    await owner.page.getByRole('link',{name:/Datos personales/}).click()
    await owner.page.getByRole('heading',{name:'Datos personales',exact:true}).waitFor()
    await measure(owner.page,'staff-account-editor',width)
    await owner.page.goto(base+'/mis-datos',{waitUntil:'networkidle'})
    await owner.page.getByRole('link',{name:/Preferencias/}).click()
    await owner.page.getByRole('heading',{name:'Preferencias',exact:true}).waitFor()
    await measure(owner.page,'staff-preferences',width)
  }
  // Initial and list failures stay errors, never a fake $0 / empty success. Retry recovers.
  await player.page.setViewportSize({width:390,height:844});await owner.page.setViewportSize({width:390,height:844})
  await scenario('empty','get_player_finance_overview_f1d')
  assert.equal((await api('/api/player/finance',QA_TOKEN)).status,503)
  await player.page.goto(base+'/player/pagos',{waitUntil:'networkidle'})
  await player.page.getByRole('alert').getByText('No pudimos cargar tus pagos',{exact:true}).waitFor()
  assert.equal(await player.page.getByText('No tenés pagos pendientes.',{exact:true}).count(),0)
  await measure(player.page,'pagos-error',390)
  await scenario('empty');await player.page.getByRole('button',{name:'Reintentar'}).click()
  await player.page.getByText('No tenés pagos pendientes.',{exact:true}).waitFor()
  await scenario('empty','list_player_finance_obligations_f1d')
  await player.page.getByRole('button',{name:'Pagados',exact:true}).click()
  await player.page.getByText('No pudimos cargar esta lista',{exact:true}).waitFor()
  assert.equal(await player.page.getByText('Todavía no hay cargos pagados.',{exact:true}).count(),0)
  await scenario('empty');await player.page.getByRole('button',{name:'Reintentar'}).click()
  await player.page.getByText('Todavía no hay cargos pagados.',{exact:true}).waitFor()
  for(const failed of ['get_platform_billing_overview_f2','list_platform_billing_f2']) {
    await scenario('empty',failed)
    const r=await api(`/api/clubs/billing?clubId=${CLUB}&kind=${failed.startsWith('get_')?'overview':'payments'}`,QA_ACTORS[0].token)
    assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.body),/PGRST|Synthetic|subscription/)
    await owner.page.goto(base+'/club/facturacion',{waitUntil:'networkidle'})
    if(failed.startsWith('list_'))await owner.page.getByRole('button',{name:'Pagos',exact:true}).click()
    await owner.page.getByRole('alert').filter({hasText:'No pudimos cargar Facturación.'}).waitFor()
    assert.equal(await owner.page.getByText('No hay registros en esta vista.',{exact:true}).count(),0)
    await measure(owner.page,'facturacion-error-'+failed,390)
    await scenario('empty');await owner.page.getByRole('button',{name:'Reintentar'}).click()
    await owner.page.getByRole('alert').filter({hasText:'No pudimos cargar Facturación.'}).waitFor({state:'hidden'})
  }
  for(const actor of QA_ACTORS) {
    const {ctx,page}=await context(actor)
    for(const width of [390,1280]) {
      await page.setViewportSize({width,height:844});await page.goto(base+'/mis-datos',{waitUntil:'networkidle'})
      await page.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor()
      await page.locator(width===390?'.px-mobileUserBtn':'.px-userBtn').click()
      const menu=page.getByRole('menu').filter({has:page.getByRole('link',{name:'Mi cuenta',exact:true})})
      assert.equal(await menu.getByRole('link',{name:'Mi cuenta',exact:true}).count(),1)
      assert.equal(await menu.getByRole('link',{name:/^Preferencias$|^Seguridad$|^Mis datos$|^Mi perfil$|^Mis pagos$/}).count(),0)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
      await page.screenshot({path:folder+`staff-menu-${actor.role}-${width}.png`,fullPage:true})
      await menu.getByRole('link',{name:'Mi cuenta',exact:true}).click()
      assert.ok(await page.getByRole('link',{name:/Preferencias/}).count())
      assert.ok(await page.getByRole('link',{name:/Cuenta y seguridad/}).count())
    }
    await page.goto(base+'/player/pagos',{waitUntil:'networkidle'})
    await page.waitForURL(actor.role==='PLATFORM'?'**/platform':'**/club')
    assert.equal(await page.getByRole('heading',{name:'Mis pagos',exact:true}).count(),0)
    await ctx.close()
  }
  await player.page.goto(base+'/club/facturacion',{waitUntil:'networkidle'});await player.page.waitForURL('**/player')
  assert.equal(await player.page.getByRole('heading',{name:'Facturación',exact:true}).count(),0)
  const guest=await context();await guest.page.goto(base+'/player/pagos',{waitUntil:'networkidle'});await guest.page.waitForURL('**/login?next=**');await guest.ctx.close()
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
  // Guest redirect loads preexisting login-provider icons. Block those images;
  // any external data/provider request is an unexpected failure, not a fixture.
  assert.ok(external.every(r=>r.host==='www.svgrepo.com'&&r.type==='image'))
  console.log(JSON.stringify({result:'PASS_LOCAL_CHROME_SYNTHETIC_RPC',permissions,measures,pageErrors:errors,blockedExternalImages:external,writes,nativeSafari:false,liveProduction:false},null,2))
  await player.ctx.close();await owner.ctx.close()
} finally {await scenario('empty');await browser.close()}
