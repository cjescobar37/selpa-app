/** Synthetic, read-only Data API for Home/Tournaments browser QA. No .env or live connection. */
import http from 'node:http'
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const clubs = Array.from({length:6},(_,i)=>({id:id(i+1),name:`Club QA ${i+1}`,city:'Ciudad QA',province:'Provincia QA',address:null,is_active:true,status:'ACTIVE',theme_key:'cyan',logo_url:null,created_at:`2026-10-${20-i}`}))
const tournaments = [
  {id:id(101),name:'Open próximo de categoría sexta',status:'OPEN',start_date:'2026-12-20',end_date:'2026-12-21',registration_deadline:'2026-12-19T20:00:00-03:00',gender:'MALE',club_id:id(6),category:6,max_pairs:16},
  {id:id(102),name:'Copa Damas — nombre largo para revisar títulos en teléfonos pequeños',status:'OPEN',start_date:'2026-12-22',end_date:'2026-12-23',gender:'FEMALE',club_id:id(2),category:5,max_pairs:null},
  {id:id(103),name:'Torneo en juego',status:'RUNNING',start_date:'2026-11-01',end_date:'2026-12-01',gender:'MIXED',club_id:id(1),category:6,max_pairs:16},
  {id:id(104),name:'Torneo finalizado sin deadline',status:'FINISHED',start_date:'2026-10-20',end_date:'2026-10-21',gender:'MALE',club_id:id(1),category:6,max_pairs:16},
  {id:id(105),name:'Torneo pausado',status:'PAUSED',start_date:'2026-12-24',gender:'MALE',club_id:id(1),category:6,max_pairs:16},
  {id:id(106),name:'Torneo cancelado',status:'CANCELLED',start_date:'2026-12-24',gender:'MALE',club_id:id(1),category:6,max_pairs:16},
  {id:id(107),name:'Inscripción vencida',status:'OPEN',start_date:'2026-12-25',registration_deadline:'2026-10-01T12:00:00Z',gender:'MALE',club_id:id(1),category:6,max_pairs:16},
  {id:id(108),name:'Torneo con cupo completo',status:'OPEN',start_date:'2026-12-26',gender:'MALE',club_id:id(1),category:6,max_pairs:2},
  {id:id(109),name:'Borrador privado QA',status:'DRAFT',start_date:'2026-12-26',gender:'MALE',club_id:id(1),category:6,max_pairs:2},
].map(row=>({type:'OPEN',tournament_type:'OPEN',format:'GROUPS_ELIMINATION',segment:'LIBRES',min_pairs:2,price_per_player:15000,points_total:0,rules_json:{flyer_mode:'MANUAL',flyer_manual_url:'/brand/selpa-logo.png'},created_at:'2026-10-01',...row}))
const registrations = [101,103,104,108].flatMap(n=>[0,1].map(i=>({id:id(2000+n*2+i),tournament_id:id(n),club_id:tournaments.find(t=>t.id===id(n)).club_id,team_id:id(3000+n*2+i),status:i?'PENDING':'CONFIRMED'})))
const tables = {clubs,tournaments,tournament_registrations:registrations,club_players:[],platform_news:[{id:id(500),title:'Noticia de prueba local',slug:'noticia-qa-local',excerpt:'Contenido sintético para verificar navegación.',body:'Solo QA local.',status:'PUBLISHED',placement:'HERO',club_id:null,published_at:'2026-10-31T16:00:00Z',cover_url:null,gallery_urls:[]}],platform_ad_campaigns:[],platform_sponsors:[],platform_admins:[],club_memberships:[],profiles:[]}
const player={id:id(700),aud:'authenticated',role:'authenticated',email:'player@selpa.test',created_at:'2026-01-01T00:00:00Z',user_metadata:{display_name:'Jugador QA'}}
const token=[{alg:'HS256',typ:'JWT'},{sub:player.id,aud:'authenticated',role:'authenticated',exp:4102444800},'QA_ONLY'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
tables.profiles=[{id:player.id,user_id:player.id,first_name:'Jugador',last_name:'QA',display_name:'Jugador QA',birth_date:'1990-01-01',gender:'MALE',country_code:'AR',country:'Argentina',province_id:'qa',city_id:'qa',city:'Ciudad QA',phone_e164:'+00000000000',dominant_hand:'RIGHT',preferred_position:'BOTH'}]
tables.user_settings=[{user_id:player.id,active_club_id:id(1)}]
tables.club_memberships=[{id:id(701),user_id:player.id,club_id:id(1),role:'PLAYER',status:'APPROVED',approved_at:'2026-01-01T00:00:00Z'}]
tables.club_players=[{id:id(702),user_id:player.id,club_id:id(1),display_name:'Jugador QA',category:6,gender:'MALE',approved_at:'2026-01-01T00:00:00Z',operational_status:'ACTIVE',ranking_points:null}]
tables.tournament_teams=registrations.map((r,index)=>({id:r.team_id,club_id:r.club_id,tournament_id:r.tournament_id,player1_user_id:index%2?id(704):player.id,player2_user_id:id(703)}))
tables.tournament_registrations=registrations.map(r=>({...r,created_at:'2026-10-20T12:00:00Z'}))
tables.player_active_partnerships=[];tables.player_partner_invites=[];tables.notifications=[];tables.messages=[]
tables.tournament_payments=[];tables.tournament_registration_change_requests=[]
// Explicit local-only staff persona for read-only Club Admin browser checks.
const qaRole=process.env.SELPA_QA_CLUB_ROLE
if(['OWNER','ADMIN','OPERADOR','PLANILLERO'].includes(qaRole)) {
  tables.club_memberships[0].role=qaRole
  tables.tournament_groups=[];tables.tournament_matches=[]
  tables.competition_series_event_tournament_links=[];tables.competition_series=[]
  tables.categories=[{id:6,name:'6ª categoría'},{id:5,name:'5ª categoría'}]
}
let failure=''
let empty=false
const matches=(row,key,expression)=>{
  if(expression.startsWith('not.')) return !matches(row,key,expression.slice(4))
  const dot=expression.indexOf('.'),op=expression.slice(0,dot),value=expression.slice(dot+1)
  if(op==='in') return value.slice(1,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(row[key]))
  if(op==='is') return value==='null' ? row[key]==null : String(row[key])===value
  if(op==='eq') return String(row[key])===value
  if(op==='neq') return String(row[key])!==value
  if(op==='lte') return String(row[key])<=value
  if(op==='gte') return String(row[key])>=value
  return false
}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:45433')
  const send=(status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range',...headers});res.end(JSON.stringify(body))}
  if(req.method==='OPTIONS') return send(200,{})
  if(url.pathname==='/qa/scenario') {failure=url.searchParams.get('failure')??'';empty=url.searchParams.get('empty')==='true';return send(200,{synthetic:true,failure,empty})}
  // Synthetic login is local-only; it creates no user, record or external session.
  if(url.pathname==='/auth/v1/token' && req.method==='POST') {
    let body='';for await(const chunk of req)body+=chunk
    const input=JSON.parse(body)
    if(input.email!==player.email||input.password!=='qa-local-only')return send(400,{message:'Invalid synthetic credentials'})
    return send(200,{access_token:token,refresh_token:'qa-local-only',token_type:'bearer',expires_in:3600,user:player})
  }
  if(url.pathname==='/auth/v1/logout')return send(200,{})
  if(url.pathname==='/auth/v1/user')return req.headers.authorization===`Bearer ${token}`?send(200,player):send(401,{message:'No synthetic session'})
  // Whitelisted read RPCs only, so the payment filters can be reviewed without a live ledger.
  if(req.method==='POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    if(req.headers.authorization!==`Bearer ${token}`)return send(401,{message:'No synthetic session'})
    const rpc=url.pathname.split('/').at(-1)
    const allowed=['get_player_finance_overview_f1d','list_player_finance_obligations_f1d','list_player_finance_movements_f1d']
    if(!allowed.includes(rpc))return send(405,{message:'QA read-only fixture'})
    if(failure===rpc)return send(503,{message:'Synthetic read failure'})
    let body='';for await(const chunk of req)body+=chunk
    const params=JSON.parse(body || '{}')
    const obligations=['PENDING','PARTIAL','PAID','CANCELLED'].map((status,index)=>({
      id:id(900+index),created_at:'2026-11-01T12:00:00Z',club_id:id(1),club_name:'Club QA 1',
      tournament_name:`Cargo QA ${status}`,concept:'Inscripción sintética',debtor_type:'USER',debtor_name:'Jugador QA',
      original_amount:15000,allocated_net:status==='PAID'?15000:status==='PARTIAL'?5000:0,
      balance:status==='PENDING'?15000:status==='PARTIAL'?10000:0,currency_code:'ARS',financial_status:status,
    }))
    if(rpc==='get_player_finance_overview_f1d')return send(200,{currency_code:'ARS',total_pending:25000,total_paid:20000,open_obligations:2})
    if(rpc==='list_player_finance_obligations_f1d')return send(200,obligations.filter(row=>!params.p_filter||params.p_filter==='ALL'||row.financial_status===params.p_filter).map(item=>({item})))
    return send(200,[])
  }
  // All other mutations are denied. This server never forwards requests elsewhere.
  if(!['GET','HEAD'].includes(req.method)) return send(405,{message:'QA read-only fixture'})
  if(url.pathname==='/qa/health') return send(200,{synthetic:true})
  if(url.pathname.startsWith('/auth/')) return send(401,{message:'No synthetic session'})
  const table=url.pathname.split('/').at(-1)
  if(failure==='all'||failure===table) return send(503,{message:'Synthetic read failure'})
  if(!Object.hasOwn(tables,table)) return send(404,{message:'Synthetic relation does not exist',code:'42P01'})
  let rows=empty?[]:[...tables[table]]
  for(const [key,value] of url.searchParams) {
    if(['select','order','limit','offset'].includes(key)) continue
    if(key==='or') rows=rows.filter(row=>value.slice(1,-1).split(',').some(part=>{const dot=part.indexOf('.');return matches(row,part.slice(0,dot),part.slice(dot+1))}))
    else rows=rows.filter(row=>matches(row,key,value))
  }
  const total=rows.length
  for(const order of [...url.searchParams.getAll('order')].reverse()) {
    const fields=order.split(',')
    rows.sort((a,b)=>{for(const field of fields){const [key,direction]=field.split('.');const d=String(a[key]??'').localeCompare(String(b[key]??''));if(d)return direction==='desc'?-d:d}return 0})
  }
  rows=rows.slice(Number(url.searchParams.get('offset')??0),Number(url.searchParams.get('offset')??0)+Number(url.searchParams.get('limit')??1000))
  const select=url.searchParams.get('select')
  if(select&&select!=='*'&&!select.includes('(')) rows=rows.map(row=>Object.fromEntries(select.split(',').map(key=>[key,row[key]??null])))
  const singular=String(req.headers.accept).includes('vnd.pgrst.object')
  if(singular && !rows.length)return send(406,{code:'PGRST116',details:'The result contains 0 rows',message:'JSON object requested'})
  return send(200,singular?rows[0]:rows,{'content-range':`0-${Math.max(0,rows.length-1)}/${total}`})
}).listen(45433,'127.0.0.1',()=>console.log('BLOCK2_SYNTHETIC_DATA http://127.0.0.1:45433'))
