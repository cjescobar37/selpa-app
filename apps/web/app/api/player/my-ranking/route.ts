import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { playerAccountDenial } from '@/lib/accountRoleServer'
import { readCareerIdentity, readMyRanking } from '@/features/player-career/player-career.repository'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const auth=request.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return NextResponse.json({error:'Sesión inválida.'},{status:401,headers})
    const {data,error}=await supabaseAdmin.auth.getUser(auth.slice(7))
    if (error || !data.user) return NextResponse.json({error:'Sesión inválida.'},{status:401,headers})
    const denial=await playerAccountDenial(data.user.id);if (denial) return denial
    const identity=await readCareerIdentity(data.user.id,new URL(request.url).searchParams.get('clubId'))
    if (!identity) return NextResponse.json({error:'No tenés un vínculo deportivo aprobado en este club.'},{status:404,headers})
    return NextResponse.json(await readMyRanking(identity),{headers})
  } catch(error) {
    const sourceCode=error && typeof error==='object' && 'code' in error ? String(error.code) : ''
    const missing=['MODEL_UNAVAILABLE','PGRST202','PGRST205','42P01','42883'].includes(sourceCode)
    return NextResponse.json({code:missing?'MODEL_UNAVAILABLE':'READ_UNAVAILABLE',error:missing
      ?'La lectura del ranking todavía no está instalada en este entorno. Contactá al administrador.'
      :'No pudimos leer tu posición canónica. Reintentá; no mostramos puntos sin verificar.'},{status:503,headers})
  }
}
