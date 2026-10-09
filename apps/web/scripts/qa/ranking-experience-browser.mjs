/** Six-width real Chrome QA, synthetic PostgreSQL only. Never contacts live DB. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {CLUB,id} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright'),base='http://127.0.0.1:3011',fixture='http://127.0.0.1:45432'
const folder=fileURLToPath(new URL('../../../../output/ranking-repair-qa/',import.meta.url));await mkdir(folder,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const errors=[],external=[],writes=[],checks=[]
async function mode(value){assert.equal((await fetch(fixture+'/qa/ranking-read?value='+value)).status,200)}
async function tie(value){assert.equal((await fetch(fixture+'/qa/ranking-tie?value='+value)).status,200)}
const ctx=await browser.newContext()
await ctx.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url())
  if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.hostname);return route.abort()}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(request.method()+' '+url.pathname);return route.abort()}
  return route.continue()
})
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
async function visit(path){const result=await page.goto(base+path,{waitUntil:'networkidle'});assert.equal(result.status(),200)}
async function shot(name,width){
  const data=await page.evaluate(()=>{const root=document.querySelector('[data-public-ranking]');return {width:innerWidth,document:document.documentElement.scrollWidth,root:root.getBoundingClientRect().toJSON(),padding:getComputedStyle(root).paddingInlineStart}})
  assert.ok(data.document<=width,`${name}: ${JSON.stringify(data)}`)
  if(width<=430){assert.equal(data.root.x,8);assert.equal(data.root.width,width-16);assert.equal(data.padding,'0px')}
  const body=await page.locator('[data-public-ranking]').innerText();assert.doesNotMatch(body,/999999|999\.999|Vista demo|Ranking pendiente de lectura|PRIVATE_PHONE|@invalid\.test/)
  checks.push({name,...data});await page.screenshot({path:folder+name+'-'+width+'.png',fullPage:true})
}
try {
  await mode('ready');await tie(false)
  for(const width of [320,375,390,430,768,1280]) {
    await page.setViewportSize({width,height:844})
    await visit('/ranking');await page.getByRole('heading',{name:'Ranking SELPA',exact:true}).waitFor()
    assert.equal(await page.getByText('2 categorías activas',{exact:true}).count(),1)
    assert.equal(await page.locator('[data-public-ranking] img').count(),1)
    await shot('index',width)
    await visit('/ranking?clubId='+CLUB)
    assert.equal(new URL(page.url()).searchParams.get('gender'),'M')
    assert.equal(await page.locator('[data-rank-tier=leader]').count(),1)
    assert.equal(await page.locator('[data-rank-tier=challenger]').count(),4)
    assert.equal(await page.locator('[data-rank-tier=row]').count(),20)
    const leader=page.locator('[data-rank-tier=leader]');assert.match(await leader.innerText(),/N°1 actual|9\.900/)
    assert.equal(await leader.locator('img').evaluate(el=>el.complete && el.naturalWidth>0),true)
    const failed=page.locator('[data-rank-position="3"]');assert.equal(await failed.locator('img').count(),0);assert.match(await failed.innerText(),/ÁT/)
    const branchNav=page.getByRole('navigation',{name:'Ranking por rama'})
    assert.match(await branchNav.innerText(),/Caballeros\s*59[\s\S]*Damas\s*3/)
    await shot('club',width)
    await Promise.all([page.waitForURL(url=>url.searchParams.get('page')==='2'),page.getByRole('link',{name:'Siguiente',exact:true}).click()])
    await page.locator('[data-rank-position="26"]').waitFor()
    assert.equal(await page.locator('[data-rank-tier=leader]').count(),0)
    assert.equal(Number(await page.locator('[data-rank-position]').first().getAttribute('data-rank-position')),26)
    await shot('page2',width)
    await Promise.all([page.waitForURL(url=>url.searchParams.get('gender')==='F' && !url.searchParams.has('page')),page.getByRole('navigation',{name:'Ranking por rama'}).getByRole('link',{name:/Damas/}).click()])
    await page.locator('[data-rank-tier=leader]').filter({hasText:'Victoria'}).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('gender'),'F');assert.equal(new URL(page.url()).searchParams.has('page'),false)
    assert.match(await page.locator('[data-rank-tier=leader]').innerText(),/Victoria/)
    assert.equal(await page.locator('[data-rank-position="2"]').count(),2)
    await shot('damas',width)
    await visit('/ranking?clubId='+CLUB+'&q=Nombre%20quinto')
    assert.equal(await page.locator('[data-rank-position]').count(),1);assert.equal(await page.locator('[data-rank-position="5"]').count(),1)
    assert.equal(await page.locator('[data-rank-tier=leader]').count(),0)
    assert.match(await page.locator('[data-rank-position="5"]').innerText(),/490 pts del liderazgo/)
    await shot('search',width)
    await visit('/ranking?clubId='+CLUB+'&q=sin-coincidencia-qa')
    await page.getByRole('heading',{name:'No encontramos ese nombre',exact:true}).waitFor();assert.equal(await page.locator('[data-ranking-state=error]').count(),0)
    await shot('no-search-results',width)
    await visit('/ranking?clubId='+CLUB+'&division='+id(25))
    await page.getByRole('heading',{name:'El próximo nombre puede ser el tuyo',exact:true}).waitFor();assert.equal(await page.locator('[data-rank-position]').count(),0)
    await shot('unpublished',width)
    await visit('/ranking?clubId='+CLUB+'&modality=PAIRS')
    assert.equal(new URL(page.url()).searchParams.get('division'),id(21))
    assert.equal(await page.locator('[data-rank-tier=leader]').count(),1);assert.equal(await page.locator('[data-rank-tier=leader] span[class*=avatar]').count(),2)
    assert.match(await page.locator('[data-rank-tier=leader]').innerText(),/10\s*PTS/)
    await shot('pairs',width)
    await tie(true);await visit('/ranking?clubId='+CLUB)
    assert.equal(await page.locator('[data-rank-position="1"]').count(),2)
    assert.equal(await page.getByText('N°1 · Liderazgo compartido',{exact:true}).count(),2)
    assert.equal(await page.locator('[data-rank-position="2"]').count(),0)
    await shot('tie',width);await tie(false)
    for(const state of ['missing','transport','context']) {
      await mode(state);await visit('/ranking?clubId='+CLUB)
      await page.getByRole('heading',{name:'El ranking no está disponible por el momento',exact:true}).waitFor()
      assert.equal(await page.locator('[data-ranking-state=empty]').count(),0);assert.equal(await page.locator('[data-rank-position]').count(),0)
      assert.equal(await page.getByRole('navigation',{name:'Páginas de ranking'}).count(),0)
      assert.equal(await page.locator('[data-read-issue]').getAttribute('data-read-issue'),state==='missing'?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE')
      assert.match(await page.locator('[data-ranking-state=error]').innerText(),/Club Central/i)
      await shot('error-'+state,width)
      await mode('ready');await page.getByRole('button',{name:'Reintentar',exact:true}).click()
      await page.locator('[data-rank-tier=leader]').waitFor();assert.equal(await page.locator('[data-ranking-state=error]').count(),0)
    }
    await mode('directory');await visit('/ranking');assert.equal(await page.locator('[data-ranking-state=error]').count(),1)
    await shot('index-error',width);await mode('ready')
  }
  await visit('/ranking/caballeros?clubId='+CLUB+'&q=Nombre%20quinto');assert.equal(await page.locator('[data-rank-position="5"]').count(),1)
  await visit('/ranking/damas?clubId='+CLUB);assert.match(await page.locator('[data-rank-tier=leader]').innerText(),/Victoria/)
  await visit('/ranking?clubId='+CLUB+'&category=6&gender=F&division='+id(20));assert.equal(new URL(page.url()).searchParams.get('division'),id(24))
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[])
  console.log(JSON.stringify({result:'PASS',checks,errors,external,writes,nativeSafari:false,liveProduction:false},null,2))
} finally {await mode('ready');await tie(false);await browser.close()}
