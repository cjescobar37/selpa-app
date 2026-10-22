import { NextResponse } from 'next/server'
import { CareerAccessError, verifySelfCareer } from '@/features/player-career/player-career.access'
import { readCareerHistory, readCareerIdentity, readCareerSummary } from '@/features/player-career/player-career.repository'
import { pageNumber } from '@/features/player-career/player-career.rules'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{playerId:string}>}) {
  const headers={'Cache-Control':'private, no-store'}
  try{
    const access=await verifySelfCareer(request),{playerId}=await params,url=new URL(request.url)
    const identity=await readCareerIdentity(playerId,url.searchParams.get('clubId'),access)
    if(!identity)return NextResponse.json({error:'Jugador no disponible.'},{status:404,headers})
    const section=url.searchParams.get('section')??'summary'
    if(!['identity','summary','history','recent'].includes(section))return NextResponse.json({error:'Sección inválida.'},{status:400,headers})
    if(section==='identity')return NextResponse.json({identity},{headers})
    if(!identity.contexts.length)return NextResponse.json({identity,summary:null,rows:[],hasMore:false},{headers})
    if(section==='history'||section==='recent')return NextResponse.json(await readCareerHistory(identity,pageNumber(url.searchParams.get('page')),section==='recent',access),{headers})
    return NextResponse.json({identity,summary:await readCareerSummary(identity,access)},{headers})
  }catch(error){return NextResponse.json({error:'No pudimos leer tu carrera.'},{status:error instanceof CareerAccessError?error.status:503,headers})}
}
