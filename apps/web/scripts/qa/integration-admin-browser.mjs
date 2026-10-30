/** Content editor QA: synthetic account, mocked empty lists, local image previews only. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {QA_ACTORS} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright'),base=process.env.SELPA_QA_BASE_URL??'http://127.0.0.1:3000',actor=QA_ACTORS.find(a=>a.role==='PLATFORM')
assert.equal(new URL(base).hostname,'127.0.0.1')
const folder=fileURLToPath(new URL('../../../../output/integration-admin-qa/',import.meta.url));await mkdir(folder,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'}),errors=[],writes=[],external=[],checks=[]
try{
 const ctx=await browser.newContext();await ctx.addInitScript(({token,userId})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'QA_ONLY',expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id:userId,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{}}})),actor)
 await ctx.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.hostname);return route.abort()}if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(url.pathname);return route.abort()}if(['/api/platform/news','/api/platform/ads','/api/platform/sponsors'].includes(url.pathname))return route.fulfill({json:{rows:[]}});if(url.pathname==='/api/inbox-summary')return route.fulfill({json:{notifications:0,messages:0,unread:0}});return route.continue()})
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
 for(const width of [320,375,390,430,1280]){
  await page.setViewportSize({width,height:844})
  await page.goto(base+'/platform/noticias',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Nueva noticia',exact:true}).click();await page.getByRole('heading',{name:'Nueva noticia',exact:true}).waitFor()
  await page.locator('.px-newsModal input[type=file]').first().setInputFiles(fileURLToPath(new URL('../../public/mock/player.jpg',import.meta.url)))
  await page.locator('.px-newsModal img[src^="blob:"]').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:folder+'news-local-preview-'+width+'.png',fullPage:true});checks.push({name:'news-local-preview',width})
  await page.goto(base+'/platform/publicidad',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Nueva campaña',exact:true}).click();await page.getByRole('heading',{name:'Nueva campaña',exact:true}).waitFor()
  const file=page.locator('.px-mediaModal input[type=file]').first();if(!await file.count())await page.getByRole('button',{name:'Imagen',exact:true}).click()
  await page.locator('.px-mediaModal input[type=file]').first().setInputFiles(fileURLToPath(new URL('../../public/mock/player.jpg',import.meta.url)))
  await page.locator('.px-mediaModal img[src^="blob:"]').first().waitFor();await page.getByRole('button',{name:'Mobile',exact:true}).click()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:folder+'campaign-local-preview-'+width+'.png',fullPage:true});checks.push({name:'campaign-local-preview',width})
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({result:'PASS',checks,errors,writes,external,saved:false,uploaded:false}))
}finally{await browser.close()}
