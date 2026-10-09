/** Local-only mock Data API backed by the actual read projections in PGlite. */
import http from 'node:http'
import {createFixture,PLAYER,QA_TOKEN,QA_ACTORS} from './block1-fixture.mjs'
import {financeReadRpcs,financeRpcResult} from './phase0-finance-fixture.mjs'
const db=await createFixture()
let unavailable=false
let financeScenario='empty',financeFail=''
const identifier=s=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw Error('identifier');return '"'+s+'"'}
function predicate(key,expression,values) {
  const field=identifier(key)
  const bind=value=>{values.push(value);return '$'+values.length}
  if(expression.startsWith('not.')) return 'not ('+predicate(key,expression.slice(4),values)+')'
  const dot=expression.indexOf('.'),op=expression.slice(0,dot),raw=expression.slice(dot+1)
  if(op==='is') return field+' is '+(raw==='null'?'null':raw==='true'?'true':'false')
  if(op==='in') return field+' in ('+raw.replace(/^\(|\)$/g,'').split(',').map(v=>bind(v.replace(/^"|"$/g,''))).join(',')+')'
  const ops={eq:'=',neq:'<>',lt:'<',lte:'<=',gt:'>',gte:'>=',ilike:'ilike'}
  if(!ops[op]) throw Error('operator '+op)
  return field+' '+ops[op]+' '+bind(raw)
}
const server=http.createServer(async(request,response)=>{
  const headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range'}
  const send=(code,body,extra={})=>{response.writeHead(code,{...headers,...extra});response.end(JSON.stringify(body))}
  if(request.method==='OPTIONS') return send(200,{})
  const url=new URL(request.url,'http://127.0.0.1:45432')
  if(url.pathname==='/qa/health') return send(200,{ready:true})
  if(url.pathname==='/qa/unavailable') {unavailable=url.searchParams.get('value')==='true';return send(200,{unavailable})}
  if(url.pathname==='/qa/finance') {
    const scenario=url.searchParams.get('value')??'empty'
    if(!['empty','populated'].includes(scenario)) return send(400,{message:'Invalid QA scenario'})
    financeScenario=scenario;financeFail=url.searchParams.get('fail')??''
    return send(200,{financeScenario,financeFail})
  }
  if(url.pathname==='/auth/v1/user') {
    const actor=QA_ACTORS.find(a=>request.headers.authorization==='Bearer '+a.token)
    if(!actor && request.headers.authorization!=='Bearer '+QA_TOKEN) return send(401,{message:'Invalid QA token'})
    return send(200,{id:actor?.userId??PLAYER,email:actor?'qa-staff@invalid.test':'private-6@invalid.test',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},created_at:'2026-01-01T00:00:00Z'})
  }
  // Reject mutations even in the synthetic store. Explicit read-only RPC allowlist.
  const rpcName=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1):null
  if(!['GET','HEAD'].includes(request.method) && rpcName!=='read_player_career_summary' && !financeReadRpcs.has(rpcName)) return send(405,{message:'READ_ONLY_QA'})
  try {
    if(url.pathname.startsWith('/rest/v1/rpc/')) {
      let body='';for await(const chunk of request) body+=chunk
      const args=JSON.parse(body||'{}')
      if(financeReadRpcs.has(rpcName)) {
        if(financeFail===rpcName) return send(503,{code:'PGRST202',message:'Synthetic internal QA diagnostic'})
        return send(200,financeRpcResult(rpcName,args,financeScenario))
      }
      if(unavailable) return send(503,{message:'QA unavailable'})
      const result=await db.query('select * from read_player_career_summary($1,$2)',[args.p_club_player_id,args.p_season_id])
      return send(200,result.rows)
    }
    const table=url.pathname.split('/').at(-1)
    if(!url.pathname.startsWith('/rest/v1/')) return send(404,{message:'QA route missing'})
    if(unavailable && /career|standings/.test(table))return send(503,{message:'QA unavailable'})
    const values=[],where=[]
    for(const [key,value] of url.searchParams) {
      if(['select','order','limit','offset'].includes(key))continue
      if(key==='or') {
        const alternatives=value.replace(/^\(|\)$/g,'').split(',')
        where.push('('+alternatives.map(v=>{const dot=v.indexOf('.');return predicate(v.slice(0,dot),v.slice(dot+1),values)}).join(' or ')+')')
      } else where.push(predicate(key,value,values))
    }
    const filter=where.length?' where '+where.join(' and '):''
    const count=Number((await db.query('select count(*) as n from '+identifier(table)+filter,values)).rows[0].n)
    const columns=url.searchParams.get('select') ?? '*'
    // Relationship select syntax belongs to unrelated existing endpoints; this
    // fixture deliberately does not pretend to implement the full Data API.
    const select=columns==='*'?'*':columns.split(',').map(identifier).join(',')
    const order=url.searchParams.get('order')?.split(',').map(part=>{const [field,dir,nulls]=part.split('.');return identifier(field)+' '+(dir==='desc'?'desc':'asc')+(nulls==='nullslast'?' nulls last':'')}).join(',')
    const offset=Math.max(0,Number(url.searchParams.get('offset'))||0),limit=Math.max(0,Number(url.searchParams.get('limit'))||1000)
    const result=await db.query('select '+select+' from '+identifier(table)+filter+(order?' order by '+order:'')+' limit '+limit+' offset '+offset,values)
    const countHeader={'content-range':`${offset}-${Math.max(offset,offset+result.rows.length-1)}/${count}`}
    const single=request.headers.accept?.includes('application/vnd.pgrst.object')
    if(single && result.rows.length!==1) return send(406,{code:'PGRST116',details:`The result contains ${result.rows.length} rows`,message:'JSON object requested, multiple (or no) rows returned'},countHeader)
    return send(200,single?result.rows[0]:result.rows,countHeader)
  } catch(error) {return send(400,{message:error.message,code:'QA_QUERY'})}
})
server.listen(45432,'127.0.0.1',()=>console.log('BLOCK1_SYNTHETIC_DATA_API http://127.0.0.1:45432'))
process.on('SIGINT',()=>{server.close();void db.close()})
