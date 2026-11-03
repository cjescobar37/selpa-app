import { NextResponse } from 'next/server'
import { getPublicTournamentItems } from '@/lib/publicTournamentItems'

export const dynamic = 'force-dynamic'

/** Same public discovery DTO for visitors and Player exploration. No viewer data. */
export async function GET() {
  try {
    return NextResponse.json(await getPublicTournamentItems(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'No pudimos cargar los torneos. Intentá nuevamente.' }, { status: 503 })
  }
}
