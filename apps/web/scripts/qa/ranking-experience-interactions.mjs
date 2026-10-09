/** Actual form submissions and recovery, read-only localhost fixture. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {CLUB,id} from './block1-fixture.mjs'
const require=createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE??'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const {chromium}=require('playwright'),base='http://127.0.0.1:3011',fixture='http://127.0.0.1:45432'
const folder=fileURLToPath(new URL('../../../../output/ranking-repair-qa/',import.meta.url))
const browser=await chromium.launch({headless:true,executablePath:process.env.SELPA_QA_BROWSER??'C:/Program Files/Google/Chrome/Application/chrome.exe'})
const context=await browser.newContext(),errors=[],blocked=[],writes=[],checks=[]
await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url())
  if(!['127.0.0.1','localhost'].includes(url.hostname)){blocked.push(url.hostname);return route.abort()}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){writes.push(url.pathname);return route.abort()}
  return route.continue()
})
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
try {
  for(const width of [320,375,390,430,768,1280]) {
    await page.setViewportSize({width,height:844})
    await page.goto(base+'/ranking?clubId='+CLUB,{waitUntil:'networkidle'})
    if(width===390 && await page.locator('[data-rank-tier=leader] img').count()) await page.screenshot({path:folder+'club-mobile-first-viewport.png'})
    await page.locator('input[name=q]').fill('Nombre quinto')
    await Promise.all([page.waitForURL(url=>url.searchParams.get('q')==='Nombre quinto'),page.getByRole('button',{name:'Buscar',exact:true}).click()])
    await page.locator('[data-rank-position="5"]').waitFor()
    assert.equal(await page.locator('[data-rank-position]').count(),1)
    assert.equal(await page.locator('[data-rank-tier=leader]').count(),0)
    const heading=page.getByRole('heading',{name:'Resultados de búsqueda',exact:true});assert.equal(await heading.count(),1)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.screenshot({path:folder+'search-'+width+'.png',fullPage:true})
    await Promise.all([page.waitForURL(url=>!url.searchParams.has('q')),page.getByRole('link',{name:'Quitar búsqueda',exact:true}).click()])
    await page.locator('[data-rank-tier=leader]').waitFor()
    await page.locator('select[name=modality]').selectOption('PAIRS')
    await Promise.all([page.waitForURL(url=>url.searchParams.get('modality')==='PAIRS'),page.getByRole('button',{name:'Buscar',exact:true}).click()])
    await page.waitForFunction(()=>document.querySelector('[data-rank-tier=leader]')?.textContent.includes(' / '))
    assert.equal(new URL(page.url()).searchParams.get('division'),id(21))
    assert.equal(await page.locator('[data-rank-position]').count(),1)
    assert.match(await page.locator('[data-rank-tier=leader]').innerText(),/10\s*PTS/)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    const avatars=await page.locator('[data-rank-tier=leader] span[class*=avatar]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()))
    assert.equal(avatars.length,2)
    assert.ok(avatars[0].bottom<=avatars[1].top || avatars[0].right<=avatars[1].left,'Both pair avatars must be fully visible')
    await page.screenshot({path:folder+'pairs-'+width+'.png',fullPage:true})
    await fetch(fixture+'/qa/ranking-read?value=directory')
    await page.goto(base+'/ranking',{waitUntil:'networkidle'})
    assert.equal(await page.locator('[data-ranking-state=error]').count(),1)
    await fetch(fixture+'/qa/ranking-read?value=ready')
    await page.getByRole('button',{name:'Reintentar',exact:true}).click()
    await page.locator('[class*=clubCard]').first().waitFor()
    assert.equal(await page.locator('[data-ranking-state=error]').count(),0)
    checks.push({width,submittedSearchPosition:5,pairDivision:id(21),indexRetry:'recovered'})
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.deepEqual(writes,[])
  console.log(JSON.stringify({result:'PASS',checks,errors,blocked,writes}))
} finally {await fetch(fixture+'/qa/ranking-read?value=ready');await browser.close()}
