import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { getMobileNavigation, mobileActiveHref } from './mobileNavigation'
import { myRankingFailure, myRankingMessages, myRankingState } from '../features/player-career/my-ranking.state'
import { rankingBranchHref } from '../features/player-career/public-ranking.presentation'
const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('player navigation keeps the four approved destinations and account compatibility',()=>{
  const links=getMobileNavigation('player')
  assert.deepEqual(links.map(link=>link.label),['Inicio','Torneos','Mi ranking','Perfil'])
  assert.equal(mobileActiveHref(links,'/mi-cuenta'),'/perfil')
  assert.equal(mobileActiveHref(links,'/mis-datos'),'/perfil')
  const navbar=source('components/navbar/AppNavbarClient.tsx').split("if (role === 'player') {")[1].split("if (role === 'club')")[0]
  for(const href of ['/perfil','/actividad','/player/pagos','/mi-cuenta']) assert.ok(navbar.includes(`href="${href}"`))
  for(const duplicate of ['Mi perfil','Mis datos','Mis torneos','Mi ranking','Preferencias']) assert.ok(!navbar.includes('>'+duplicate+'<'))
})
test('ranking distinguishes membership, official entry, publication and a real read failure',()=>{
  assert.equal(myRankingState({hasSeason:false,hasEntry:false,hasStanding:false,isPublic:false}),'NO_OFFICIAL_RANKING')
  assert.equal(myRankingState({hasSeason:true,hasEntry:false,hasStanding:false,isPublic:true}),'NO_SPORTS_ENTRY')
  assert.equal(myRankingState({hasSeason:true,hasEntry:true,hasStanding:true,isPublic:false}),'PRIVATE_SEASON')
  assert.equal(myRankingState({hasSeason:true,hasEntry:true,hasStanding:false,isPublic:true}),'NO_OFFICIAL_RANKING')
  assert.equal(myRankingState({hasSeason:true,hasEntry:true,hasStanding:true,isPublic:true}),'READY')
  for(const code of ['42P01','42883','PGRST202','PGRST205','MODEL_UNAVAILABLE']) assert.equal(myRankingFailure(code),'MODEL_UNAVAILABLE')
  for(const code of ['42501','57014',null,'NETWORK']) assert.equal(myRankingFailure(code),'READ_UNAVAILABLE')
  assert.notEqual(myRankingMessages.MODEL_UNAVAILABLE.title,myRankingMessages.NO_SPORTS_ENTRY.title)
})
test('ranking pagination uses official rows and never publishes private competitors',()=>{
  const repository=source('features/player-career/player-career.repository.ts').split('export async function readMyRanking')[1].split('export async function readPublicClubs')[0]
  assert.match(repository,/state==='PRIVATE_SEASON'\) return empty/)
  assert.match(repository,/if \(!context.data\) return empty/)
  assert.match(repository,/public_player_standings_read/)
  assert.match(repository,/range\(\(current-1\)\*PAGE_SIZE,current\*PAGE_SIZE-1\)/)
  assert.doesNotMatch(repository,/visible:\s*true[\s\S]*\[me,/)
})
test('changing branch retains compatible category and clears foreign division and pagination',()=>{
  const params={clubId:'club',division:'old',season:'season',modality:'INDIVIDUAL',category:'6',page:'3',q:'Ana'}
  const url=new URL(rankingBranchHref(params,'F',6,[]),'https://test.invalid')
  assert.equal(url.searchParams.get('division'),null)
  assert.equal(url.searchParams.get('category'),null)
  assert.equal(url.searchParams.get('page'),null)
  assert.equal(url.searchParams.get('season'),'season')
  assert.equal(url.searchParams.get('q'),'Ana')
})
