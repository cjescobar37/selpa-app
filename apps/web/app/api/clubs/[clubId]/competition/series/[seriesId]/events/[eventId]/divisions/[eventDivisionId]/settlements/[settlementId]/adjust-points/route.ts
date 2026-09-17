import { NextRequest } from 'next/server'
import { settlementCommand } from '@/features/competition/settlement/competition-settlement.handlers'

type Context = { params: Promise<{ clubId: string; seriesId: string; eventId: string; eventDivisionId: string; settlementId: string }> }

export async function POST(request: NextRequest, context: Context) {
  return settlementCommand(request, await context.params, 'adjust-points')
}
