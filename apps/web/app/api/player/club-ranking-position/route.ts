import { NextRequest, NextResponse } from 'next/server'
import { CareerAccessError, verifySelfCareer } from '@/features/player-career/player-career.access'
import { readOwnPublishedRanking, readRankingContexts } from '@/features/player-career/player-career.repository'
import { validId } from '@/features/player-career/player-career.rules'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(req: NextRequest) {
  try {
    const access = await verifySelfCareer(req)
    const clubId = req.nextUrl.searchParams.get('clubId')
    const season = req.nextUrl.searchParams.get('season')
    const division = req.nextUrl.searchParams.get('division')
    const modality = req.nextUrl.searchParams.get('modality')
    if (![clubId, season, division].every(validId) || !['PAIRS', 'INDIVIDUAL'].includes(modality ?? '')) {
      return NextResponse.json({ error: 'Contexto inválido.' }, { status: 400, headers })
    }
    // Resolve through public contexts again; a direct URL cannot read a private
    // season, disabled branch, foreign division or someone else's position.
    const contexts = await readRankingContexts(clubId!, season)
    const context = contexts.find(c => c.divisionId === division && c.modality === modality)
    return NextResponse.json({ position: context ? await readOwnPublishedRanking(context, access) : null }, { headers })
  } catch (error) {
    const status = error instanceof CareerAccessError ? error.status : 503
    return NextResponse.json({ error: status === 503 ? 'No pudimos leer tu posición.' : 'Sesión no autorizada.' }, { status, headers })
  }
}
