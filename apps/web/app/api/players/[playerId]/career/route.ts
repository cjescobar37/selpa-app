import { NextResponse } from 'next/server'
import { readCareerHistory, readCareerIdentity, readCareerSummary } from '@/features/player-career/player-career.repository'
import { pageNumber } from '@/features/player-career/player-career.rules'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{playerId:string}>}) {
  const headers={'Cache-Control':'no-store'}
  try {
    const url=new URL(request.url);const {playerId}=await params
    const identity=await readCareerIdentity(playerId,url.searchParams.get('clubId'))
    if (!identity) return NextResponse.json({error:'Jugador no disponible.'},{status:404,headers})
    const section=url.searchParams.get('section') ?? 'summary'
    if (section==='identity') return NextResponse.json({identity},{headers})
    if (section==='history' || section==='recent') return NextResponse.json(await readCareerHistory(identity,pageNumber(url.searchParams.get('page')),section==='recent'),{headers})
    if (section!=='summary') return NextResponse.json({error:'Sección inválida.'},{status:400,headers})
    return NextResponse.json({identity,summary:await readCareerSummary(identity)},{headers})
  } catch { return NextResponse.json({error:'La lectura deportiva no está disponible. Tu perfil sigue intacto.'},{status:503,headers}) }
}
