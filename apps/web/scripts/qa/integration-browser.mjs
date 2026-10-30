/** Integration-only Chrome QA. Synthetic PostgreSQL; all business writes blocked. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {PLAYER,CLUB,CLUB_PLAYER,QA_TOKEN,QA_ACTORS,id} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright'),base=process.env.SELPA_QA_BASE_URL??'http://127.0.0.1:3000',fixture='http://127.0.0.1:45432'
assert.equal(new URL(base).hostname,'127.0.0.1')
const folder=fileURLToPath(new URL('../../../../output/integration-qa/',import.meta.url));await mkdir(folder,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const checks=[],errors=[],writes=[],external=[],apiChecks=[]
async function api(path,token){const response=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')}}
async function privacy(mode){assert.equal((await fetch(fixture+'/qa/sports-privacy?value='+mode)).status,200)}
async function context(width){
 const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<=430,hasTouch:width<=430})
 await ctx.addInitScript(({token,userId})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'QA_ONLY',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}}})),{token:QA_TOKEN,userId:PLAYER})
 await ctx.route('**/*',route=>{const request=route.request(),url=new URL(request.url())
  if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.hostname);return route.abort()}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(request.method()+' '+url.pathname);return route.abort()}
  if(url.pathname==='/api/public/home')return route.fulfill({json:{slides:[],newsArchive:[],tournaments:[],ads:[],sponsors:[],clubs:[],metrics:{clubs:2,players:60}}})
  if(url.pathname==='/api/inbox-summary')return route.fulfill({json:{notifications:0,messages:0,unread:0}})
  if(url.pathname.endsWith('/active-partnerships'))return route.fulfill({json:{partnerships:[]}})
  if(url.pathname.endsWith('/partner-invites'))return route.fulfill({json:{invites:[]}})
  if(url.pathname==='/api/message-threads')return route.fulfill({json:{threads:[]}})
  return route.continue()
 })
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page}
}
async function go(page,path){assert.equal((await page.goto(base+path,{waitUntil:'networkidle'})).status(),200)}
async function shot(page,name,width,selector){
 const data=await page.locator(selector).first().evaluate(node=>({x:node.getBoundingClientRect().x,width:node.getBoundingClientRect().width,padding:getComputedStyle(node).paddingInlineStart,document:document.documentElement.scrollWidth,viewport:innerWidth}))
 assert.ok(data.document<=width,name+' overflow '+JSON.stringify(data));if(width<=430){assert.equal(data.x,8,name);assert.equal(data.width,width-16,name)}
 checks.push({name,...data});await page.screenshot({path:folder+name+'-'+width+'.png',fullPage:true})
}
try{
 await privacy('public')
 for(const width of [320,375,390,430,768,1280]){
  const {ctx,page}=await context(width)
  await go(page,'/player');await page.locator('[data-player-mode=space]').waitFor();await shot(page,'home-space',width,'.homeModeSwitch')
  await page.locator('.homeModeSwitch button').filter({hasText:'Comunidad SELPA'}).click();await page.getByRole('heading',{name:'Nuestro calendario',exact:true}).waitFor()
  const currentMonth=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(new Date()).toLowerCase()
  assert.ok((await page.locator('.modePublicHomeEmbed').innerText()).toLowerCase().includes(currentMonth))
  await shot(page,'home-community',width,'.homeModeSwitch')
  await page.locator('.homeModeSwitch button').filter({hasText:'Mi espacio'}).click();await page.locator('[data-player-mode=space]').waitFor()
  if(width<=430){
   const nav=page.locator('[data-mobile-bottom-nav]');assert.deepEqual(await nav.locator('a').allTextContents(),['Inicio','Torneos','Mi ranking','Perfil'])
   assert.equal(await nav.getByRole('link',{name:'Perfil',exact:true}).locator('img').count(),1)
   await page.getByRole('button',{name:'Mensajes',exact:true}).click();await page.getByRole('menu',{name:'Mensajes',exact:true}).waitFor()
   assert.equal(await page.getByRole('link',{name:'Ver todos los mensajes',exact:true}).getAttribute('href'),'/player/mensajes')
   await page.keyboard.press('Escape')
  }
  await go(page,'/perfil');await page.waitForURL('**/player/carrera/'+CLUB_PLAYER);await page.getByText('Mi perfil · SELPA',{exact:true}).waitFor()
  const hero=page.locator('section[aria-label="Identidad del jugador"]');assert.equal(await hero.getAttribute('data-profile-owner'),'true')
  assert.match(await hero.getByRole('link',{name:'Cambiar portada',exact:true}).getAttribute('href'),/focus=cover/)
  assert.match(await hero.getByRole('link',{name:'Cambiar foto de perfil',exact:true}).getAttribute('href'),/focus=avatar/)
  assert.equal(await hero.getByRole('link',{name:'Editar perfil',exact:true}).count(),1)
  assert.equal(await hero.getByRole('link',{name:'Datos deportivos',exact:true}).count(),1)
  await shot(page,'own-profile',width,'section[aria-label="Carrera deportiva"]')
  await hero.getByRole('button',{name:/Ver foto de perfil de/}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
  await hero.getByRole('link',{name:'Cambiar portada',exact:true}).click();await page.locator('#player-profile-cover-file').waitFor({state:'attached'})
  assert.equal(await page.locator('#player-profile-avatar-file').count(),1);await shot(page,'own-photo-editor',width,'.club-panel.player-premium')
  await go(page,'/completar-perfil?edit=personal');await page.getByRole('heading',{name:'Datos personales',exact:true}).waitFor();assert.ok(await page.locator('#complete-gender').count());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await shot(page,'personal-editor',width,'.px-onboardingBody')
  await go(page,'/completar-perfil?edit=sports');await page.getByRole('heading',{name:'Tu perfil deportivo',exact:true}).waitFor();assert.ok(await page.getByText('Mano hábil',{exact:true}).count());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await shot(page,'sports-editor',width,'.px-onboardingBody');await ctx.close()
 }
 await privacy('private')
 const privateMine=await api('/api/player/my-ranking?clubId='+CLUB,QA_TOKEN);assert.equal(privateMine.status,200);assert.equal(privateMine.body.state,'PRIVATE_SEASON');assert.equal(privateMine.body.summary.standing.position,5);assert.equal(privateMine.body.summary.standing.ranking_points,9410);assert.equal(privateMine.body.participants.visible,false);assert.deepEqual(privateMine.body.individual,[])
 const spoof=await api('/api/player/my-ranking?clubId='+CLUB+'&userId='+id(1001),QA_TOKEN);assert.equal(spoof.body.summary.standing.user_id,PLAYER)
 assert.equal((await api('/api/player/my-ranking?clubId='+CLUB)).status,401);assert.equal((await api('/api/player/my-ranking?clubId='+CLUB,QA_ACTORS[0].token)).status,403)
 assert.equal((await api('/api/player/career/'+id(2010)+'?section=summary',QA_TOKEN)).status,403)
 const published=await api('/api/players/'+PLAYER+'/career?clubId='+CLUB);assert.equal(published.status,404)
 const own=await api('/api/player/career/'+CLUB_PLAYER+'?section=summary',QA_TOKEN);assert.equal(own.status,200);assert.equal(own.body.summary.standing.position,5);assert.match(own.cache,/no-store/)
 apiChecks.push({privateSeason:true,ownStatus:own.status,ownPosition:5,ownPoints:9410,otherParticipantsVisible:false,publicCareerStatus:published.status,impersonationRejected:true,anonymous:401,staff:403,otherPlayer:403})
 const {ctx,page}=await context(390);await go(page,'/player/ranking');await page.getByText('Temporada no pública',{exact:true}).waitFor();await page.getByText('Posición oficial',{exact:true}).waitFor();assert.equal(await page.locator('section[aria-label="Participantes de mi división"]').count(),0)
 await shot(page,'my-ranking-private',390,'main main');await go(page,'/ranking?clubId='+CLUB);assert.equal(await page.locator('[data-rank-position]').count(),0);await shot(page,'public-ranking-private',390,'[data-public-ranking]');await ctx.close()
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[])
 console.log(JSON.stringify({result:'PASS',checks,apiChecks,errors,writes,external,backend:'SYNTHETIC_ONLY',nativeSafari:false},null,2))
}finally{await privacy('public');await browser.close()}
