import { NextResponse } from 'next/server'
import { CareerAccessError, verifyAdminCareer } from '@/features/player-career/player-career.access'
import { readCareerHistory, readCareerIdentity, readCareerSummary } from '@/features/player-career/player-career.repository'
import { pageNumber } from '@/features/player-career/player-career.rules'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{clubId:string;playerId:string}>}) {
  const headers={'Cache-Control':'private, no-store'}
  try{
    const {clubId,playerId}=await params,access=await verifyAdminCareer(request,clubId),url=new URL(request.url)
    const identity=await readCareerIdentity(playerId,clubId,access)
    if(!identity)return NextResponse.json({error:'Jugador no disponible.'},{status:404,headers})
    const section=url.searchParams.get('section')??'summary'
    if(!['summary','history','recent'].includes(section))return NextResponse.json({error:'Sección inválida.'},{status:400,headers})
    if(section!=='summary')return NextResponse.json(await readCareerHistory(identity,pageNumber(url.searchParams.get('page')),section==='recent',access),{headers})
    return NextResponse.json({identity,summary:await readCareerSummary(identity,access)},{headers})
  }catch(error){return NextResponse.json({error:'No tenés acceso a la carrera de este club.'},{status:error instanceof CareerAccessError?error.status:503,headers})}
}
