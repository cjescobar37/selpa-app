/** Chrome visual/interactions only. Synthetic tournament DTOs, never live
 * registration, payment-provider certification or economic writes. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {CLUB,PLAYER,id,QA_TOKEN} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright'),base=(process.env.SELPA_QA_BASE_URL??'http://127.0.0.1:3000'),tournament=id(91000)
const folder=fileURLToPath(new URL('../../../../output/premium-recovery-qa/',import.meta.url));await mkdir(folder,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),errors=[],writes=[],external=[],checks=[]
const partner={clubPlayerId:id(2003),userId:id(1003),name:'Pareja de prueba local',avatarUrl:'/mock/player.jpg',category:6,gender:'M',approved:true}
let registration='PENDING',payment='PENDING',wizardStep=1
const detail=()=>({tournament:{id:tournament,clubId:CLUB,name:'Torneo de prueba local',status:'OPEN',gender:'MALE',type:'OPEN',format:'GROUPS_ELIMINATION',segment:'ADULT',category:6,startDate:'2026-12-10',endDate:'2026-12-12',registrationDeadline:'2026-12-09T23:00:00Z',pricePerPlayer:1000,minPairs:8,maxPairs:16,pointsTotal:100,rulesSummary:{description:null,competitionSystem:null,venueName:null,tiebreaker:null,courtsCount:2,courts:[],scheduleMode:null,pointsMode:null}},
  club:{id:CLUB,name:'Club Central',logoUrl:null,themeKey:null,city:null,province:null,address:null},status:{key:'registration_open',label:'Inscripción abierta',priority:1,className:''},flyerUrl:null,
  labels:{category:'6ª categoría',gender:'Caballeros',segment:'Adultos',tournamentType:'Open'},dates:{startDate:'2026-12-10',endDate:'2026-12-12',registrationDeadline:'2026-12-09'},price:{pricePerPlayer:1000},capacity:{registeredTeamsCount:8,maxPairs:16,spotsLeft:8},
  viewer:{isAuthenticated:true,isClubAdmin:false,isStaffAccount:false,isPlayerInClub:true,isRegisteredInTournament:registration!==null,clubPlayer:{id:id(2006),userId:PLAYER,name:'Nombre quinto',category:6,gender:'M',approved:true},
    myTeam:registration===null?null:{id:id(91001),registrationId:id(91002),registrationStatus:registration,paymentStatus:payment,paymentMethod:'CASH_ON_SITE_REQUEST',registrationChangeRequest:null,players:[{userId:PLAYER,name:'Nombre quinto',avatarUrl:'/mock/player.jpg'},{userId:partner.userId,name:partner.name,avatarUrl:partner.avatarUrl}]},activePartnership:{id:id(91003),partner}}})
await context.addInitScript(({token,userId,tournament,partner})=>{
  // Exercise the clipboard fallback; this is not native Web Share/iOS QA.
  Object.defineProperty(navigator,'share',{value:undefined,configurable:true})
  localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'QA_ONLY',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,email:'fixture@invalid.test',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}}}))
  localStorage.setItem(`pamprax:tournament-signup:${tournament}:${userId}`,JSON.stringify({selectedPartner:partner,selectedAvailabilitySlots:['T1','T2'],selectedPaymentMethod:'CASH_ON_SITE_REQUEST',currentStep:1}))
},{token:QA_TOKEN,userId:PLAYER,tournament,partner})
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.hostname);return route.abort()}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(url.pathname);return route.abort()}
  if(url.pathname===`/api/tournaments/${tournament}/public-detail`)return route.fulfill({json:detail()})
  return route.continue()
})
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
async function shot(name,width,selector='section[aria-label="Carrera deportiva"]') {
  const data=await page.locator(selector).first().evaluate(node=>({x:node.getBoundingClientRect().x,width:node.getBoundingClientRect().width,document:document.documentElement.scrollWidth,viewport:innerWidth,padding:getComputedStyle(node).paddingInlineStart}))
  assert.ok(data.document<=width,`${name}: ${JSON.stringify(data)}`)
  if(width<=430){assert.equal(data.x,8,name);assert.equal(data.width,width-16,name)}
  checks.push({name,width,...data});await page.screenshot({path:`${folder}${name}-${width}.png`,fullPage:true})
}
try {
  for(const width of [320,375,390,430,768,1280]) {
    await page.setViewportSize({width,height:844})
    await page.goto(`${base}/jugadores/${PLAYER}?clubId=${CLUB}`,{waitUntil:'networkidle'})
    await page.getByText('#5',{exact:true}).waitFor()
    assert.equal(await page.locator('section[aria-label="Identidad del jugador"] img:visible').count(),2)
    assert.doesNotMatch(await page.locator('section[aria-label="Carrera deportiva"]').innerText(),/PRIVATE_PHONE|birth_date|private-6|@invalid/)
    await shot('profile',width)
    if(width===390)await page.screenshot({path:folder+'profile-first-viewport-390.png'})
    await page.getByRole('button',{name:'Compartir perfil',exact:true}).click()
    await page.getByText('Enlace público copiado',{exact:true}).waitFor()
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),new RegExp(`/jugadores/${PLAYER}`))
    await page.goto(`${base}/jugadores/${id(90000)}`,{waitUntil:'networkidle'})
    await page.getByRole('heading',{name:'Jugador sin club',exact:true}).waitFor()
    assert.match(await page.locator('main').last().innerText(),/Tu próximo capítulo/)
    assert.equal(await page.locator('main').last().getByText('#1',{exact:true}).count(),0)
    await shot('profile-global',width)
    for(const [state,pay] of [['PENDING','PENDING'],['PENDING','APPROVED'],['CONFIRMED','APPROVED']]) {
      registration=state;payment=pay
      for(const suffix of ['', '/inscripcion']) {
        await page.goto(`${base}/torneos/${tournament}${suffix}`,{waitUntil:'networkidle'})
        await page.getByRole('heading',{name:state==='CONFIRMED'?'INSCRIPCIÓN CONFIRMADA':'SOLICITUD REGISTRADA',exact:true}).waitFor()
        assert.equal(await page.getByRole('heading',{name:'YA ESTÁS DENTRO',exact:true}).count(),0)
        await shot(`registration-${state}-${pay}${suffix?'wizard':''}`,width,suffix?'.tournamentSignupPage':'.tournamentPublicDetail')
      }
    }
    registration=null;payment=null
    await page.goto(`${base}/torneos/${tournament}/inscripcion`,{waitUntil:'networkidle'})
    for(wizardStep=1;wizardStep<=4;wizardStep++) {
      await page.locator('.tournamentSignupPage__steps button').nth(wizardStep-1).click()
      await page.locator('.tournamentSignupPage__stepPanel').evaluate(async node=>{await Promise.all(node.getAnimations().map(animation=>animation.finished))})
      await shot('wizard-step-'+wizardStep,width,'.tournamentSignupPage')
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[])
  console.log(JSON.stringify({result:'PASS',checks,errors,writes,external,backend:'SYNTHETIC_READ_ONLY',nativeSafari:false}))
} finally {await browser.close()}
