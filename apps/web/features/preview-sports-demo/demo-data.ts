import 'server-only'
import type {CareerIdentity,CareerSummary,RankingContext,SportsStanding} from '@/features/player-career/player-career.types'
import type {RankingSearch} from '@/features/player-career/public-ranking.presentation'

/** Explicit Preview-only sample data. No SDK, credentials, queries or mutations. */
export function sportsDemoEnabled(env:Readonly<Record<string,string|undefined>>=process.env){
  return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='codex/pwa-universal-preview-20261015'
}
const id=(n:number)=>`de000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export const DEMO_CLUB=id(1),DEMO_SEASON=id(2),DEMO_PLAYER=id(101)
const names=['Santiago DEMO','Martín DEMO','Alex DEMO','Nicolás DEMO','Gabriel DEMO','Tomás DEMO']
const women=['Lucía DEMO','Sofía DEMO','Valentina DEMO','Camila DEMO','Julia DEMO','Paula DEMO']
export const demoContexts:RankingContext[]=['INDIVIDUAL','PAIRS'].flatMap((modality,m)=>['M','F'].map((gender,g)=>({clubId:DEMO_CLUB,seasonId:DEMO_SEASON,seasonName:'Temporada DEMO',divisionId:id(10+m*2+g),category:6,categoryName:'6ª categoría',gender,modality,rankedCount:modality==='PAIRS'?3:6})))
function standing(n:number,gender='M'):SportsStanding {
  const context=demoContexts.find(c=>c.gender===gender&&c.modality==='INDIVIDUAL')!
  return {club_player_id:id(201+n+(gender==='F'?20:0)),club_id:DEMO_CLUB,user_id:id(101+n+(gender==='F'?20:0)),player_entry_id:id(301+n+(gender==='F'?20:0)),full_name:(gender==='F'?women:names)[n],avatar_url:null,category:6,category_name:context.categoryName,gender,season_id:DEMO_SEASON,season_name:context.seasonName,division_id:context.divisionId,modality:'INDIVIDUAL',ranking_points:[1240,1130,1080,970,910,850][n],position:n+1,is_tied:false,ordinal:n+1}
}
export function demoIdentity(playerId:string):CareerIdentity|null {
  const player=[...names.map((_,n)=>standing(n)),...women.map((_,n)=>standing(n,'F'))].find(p=>p.user_id===playerId||p.club_player_id===playerId)
  if(!player)return null
  return {userId:player.user_id,name:player.full_name,avatarUrl:null,coverUrl:null,contexts:[{clubPlayerId:player.club_player_id,clubId:DEMO_CLUB,clubName:'Club SELPA · DEMO',category:6,gender:player.gender}],selectedClubPlayerId:player.club_player_id,publicPath:`/preview/demo?view=profile&playerId=${player.user_id}`}
}
export function demoSummary(identity:CareerIdentity):CareerSummary {
  const context=identity.contexts[0],n=context.gender==='F'?women.indexOf(identity.name):names.indexOf(identity.name)
  return {scope:{clubId:DEMO_CLUB,clubPlayerId:identity.selectedClubPlayerId,seasonId:DEMO_SEASON,seasonName:'Temporada DEMO'},standing:standing(n,context.gender??'M'),stats:{tournaments_played:4,matches_played:12,wins:9,losses:3,titles:2,finals:3,semifinals:1,effectiveness:75},statsAvailable:true,statsPeriod:'PUBLIC_CLUB_CAREER',bestResult:{role:'CHAMPION',position:1},partner:null}
}
export function demoSection(identity:CareerIdentity,section:string){
  if(section==='identity')return {identity}
  if(section==='summary')return {identity,summary:demoSummary(identity)}
  if(section==='history')return {rows:[{id:id(800),tournament_id:id(900),tournament_name:'Master de muestra · DEMO',sports_date:'2026-10-01',category:6,category_name:'6ª categoría',partner_name:'Pareja de muestra · DEMO',result_role:'CHAMPION',final_position:1,points:240}],hasMore:false,page:1}
  return {rows:[{id:id(801),tournament_id:id(900),tournament_name:'Master de muestra · DEMO',sports_date:'2026-10-01',won:true}],hasMore:false,page:1}
}
export function demoRanking(query:RankingSearch){
  const gender=query.gender==='F'?'F':'M',modality=query.modality==='PAIRS'?'PAIRS':'INDIVIDUAL'
  const context=demoContexts.find(c=>c.gender===gender&&c.modality===modality)!
  const rows=names.map((_,n)=>standing(n,gender)),search=(query.q??'').trim().slice(0,80).toLocaleLowerCase('es-AR')
  const allPairs=[0,1,2].map(n=>({partnership_id:id(501+n),position:n+1,player1_user_id:rows[n*2].user_id,player2_user_id:rows[n*2+1].user_id,player1_name:rows[n*2].full_name,player2_name:rows[n*2+1].full_name,player1_avatar_url:null,player2_avatar_url:null,player1_points:0,player2_points:0,combined_points:[860,740,620][n],category:6,gender}))
  const individuals=rows.filter(r=>r.full_name.toLocaleLowerCase('es-AR').includes(search)),pairs=allPairs.filter(p=>(p.player1_name+' '+p.player2_name).toLocaleLowerCase('es-AR').includes(search))
  return {clubs:[{id:DEMO_CLUB,name:'Club SELPA · DEMO',logo_url:'/brand/selpa-isotipo.png',theme_key:null}],clubsCount:1,contexts:demoContexts,ranking:{rows:individuals,count:individuals.length,page:1,pageSize:25,context},pairs,total:modality==='PAIRS'?pairs.length:individuals.length,params:{demo:'1',clubId:DEMO_CLUB,season:DEMO_SEASON,division:context.divisionId,gender,modality,category:'6',...(search?{q:query.q}: {})},error:null,presentation:{counts:{M:modality==='PAIRS'?3:6,F:modality==='PAIRS'?3:6},leaderPoints:modality==='PAIRS'?860:1240}}
}
