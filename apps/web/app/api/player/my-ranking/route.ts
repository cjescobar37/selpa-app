import { NextResponse } from 'next/server'
import { readCareerIdentity, readMyRanking } from '@/features/player-career/player-career.repository'
import { CareerAccessError, verifySelfCareer } from '@/features/player-career/player-career.access'
import { myRankingFailure } from '@/features/player-career/my-ranking.state'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const access=await verifySelfCareer(request)
    const identity=await readCareerIdentity(access.userId,new URL(request.url).searchParams.get('clubId'),access)
    if (!identity || !identity.selectedClubPlayerId) return NextResponse.json({code:'NO_MEMBERSHIP',error:'No tenés un vínculo deportivo aprobado en este club.'},{status:404,headers})
    return NextResponse.json(await readMyRanking(identity,access,Number(new URL(request.url).searchParams.get('page')) || 1),{headers})
  } catch(error) {
    if(error instanceof CareerAccessError)return NextResponse.json({code:error.status===401?'AUTH_REQUIRED':'NO_MEMBERSHIP',error:'No tenés acceso a esta carrera.'},{status:error.status,headers})
    const sourceCode=error && typeof error==='object' && 'code' in error ? String(error.code) : ''
    const missing=myRankingFailure(sourceCode)==='MODEL_UNAVAILABLE'
    return NextResponse.json({code:missing?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE',error:missing
      ?'La lectura del ranking todavía no está instalada en este entorno. Contactá al administrador.'
      :'No pudimos leer tu posición canónica. Reintentá; no mostramos puntos sin verificar.'},{status:503,headers})
  }
}
