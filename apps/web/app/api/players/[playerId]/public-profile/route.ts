import { NextResponse } from 'next/server'
import { readCareerIdentity,readCareerSummary } from '@/features/player-career/player-career.repository'
import { editorCareerDto } from '@/features/player-career/player-career.compat'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{playerId:string}>}) {
  const headers={'Cache-Control':'no-store'}
  try {
    const {playerId}=await params
    const identity=await readCareerIdentity(playerId,new URL(request.url).searchParams.get('clubId'))
    if (!identity) return NextResponse.json({error:'Jugador no disponible.'},{status:404,headers})
    return NextResponse.json(editorCareerDto(identity,await readCareerSummary(identity)),{headers})
  } catch {return NextResponse.json({error:'Perfil deportivo no disponible.'},{status:503,headers})}
}
