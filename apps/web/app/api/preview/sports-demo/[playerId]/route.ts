import {NextResponse} from 'next/server'
import {demoIdentity,demoSection,sportsDemoEnabled} from '@/features/preview-sports-demo/demo-data'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{playerId:string}>}){
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex','X-SELPA-Data-Mode':'DEMO'}
  if(!sportsDemoEnabled())return NextResponse.json({error:'No disponible.'},{status:404,headers})
  const {playerId}=await params,identity=demoIdentity(playerId),section=new URL(request.url).searchParams.get('section')??'summary'
  if(!identity)return NextResponse.json({error:'Jugador DEMO no disponible.'},{status:404,headers})
  if(!['identity','summary','history','recent'].includes(section))return NextResponse.json({error:'Sección inválida.'},{status:400,headers})
  return NextResponse.json({mode:'DEMO',...demoSection(identity,section)},{headers})
}
