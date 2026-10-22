import { NextResponse } from 'next/server'
import { readCareerIdentity, readMyRanking } from '@/features/player-career/player-career.repository'
import { CareerAccessError, verifySelfCareer } from '@/features/player-career/player-career.access'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const access=await verifySelfCareer(request)
    const identity=await readCareerIdentity(access.userId,new URL(request.url).searchParams.get('clubId'),access)
    if (!identity) return NextResponse.json({error:'No tenés un vínculo deportivo aprobado en este club.'},{status:404,headers})
    return NextResponse.json(await readMyRanking(identity,access),{headers})
  } catch(error) {
    if(error instanceof CareerAccessError)return NextResponse.json({error:'No tenés acceso a esta carrera.'},{status:error.status,headers})
    const sourceCode=error && typeof error==='object' && 'code' in error ? String(error.code) : ''
    const missing=['MODEL_UNAVAILABLE','PGRST202','PGRST205','42P01','42883'].includes(sourceCode)
    return NextResponse.json({code:missing?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE',error:missing
      ?'La lectura del ranking todavía no está instalada en este entorno. Contactá al administrador.'
      :'No pudimos leer tu posición canónica. Reintentá; no mostramos puntos sin verificar.'},{status:503,headers})
  }
}
