import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { generateSettlement } from '@/lib/platformFinance'

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const clubId = String(body?.club_id ?? '')
    const periodStart = String(body?.period_start ?? '')
    const periodEnd = String(body?.period_end ?? '')

    if (!clubId) return NextResponse.json({ error: 'Falta club_id.' }, { status: 400 })
    if (!periodStart) return NextResponse.json({ error: 'Falta period_start.' }, { status: 400 })
    if (!periodEnd) return NextResponse.json({ error: 'Falta period_end.' }, { status: 400 })

    const result = await generateSettlement({
      clubId,
      periodStart,
      periodEnd,
      actorUserId: auth.user!.id,
      notes: body?.notes ? String(body.notes) : null,
    })

    if (result.generated) {
      await logPlatformAction({
        actorUserId: auth.user!.id,
        action: 'finance.settlement.generate',
        entityType: 'settlement',
        entityId: result.settlement.id,
        entityLabel: `${result.settlement.period_start} - ${result.settlement.period_end}`,
        metadata: {
          club_id: result.settlement.club_id,
          period_start: result.settlement.period_start,
          period_end: result.settlement.period_end,
          gross_amount: result.settlement.gross_amount,
          commission_amount: result.settlement.commission_amount,
          net_amount: result.settlement.net_amount,
          payments_count: result.settlement.payments_count,
          currency: result.settlement.currency,
        },
        req,
      })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude generar la liquidación.' }, { status: 500 })
  }
}
