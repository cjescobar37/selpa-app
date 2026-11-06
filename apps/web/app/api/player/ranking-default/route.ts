import { NextResponse } from 'next/server'
import { verifySelfCareer, CareerAccessError } from '@/features/player-career/player-career.access'
import { readPersonalRankingDefault } from '@/features/player-career/ranking-default.repository'
import { validId } from '@/features/player-career/player-career.rules'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const access=await verifySelfCareer(request)
    const clubId=new URL(request.url).searchParams.get('clubId')
    if(!validId(clubId))return NextResponse.json({error:'Club inválido.'},{status:400,headers})
    return NextResponse.json({preferred:await readPersonalRankingDefault(access,clubId!)},{headers})
  } catch(error) {
    return NextResponse.json({error:'No pudimos resolver tu contexto deportivo.'},{status:error instanceof CareerAccessError?error.status:503,headers})
  }
}
