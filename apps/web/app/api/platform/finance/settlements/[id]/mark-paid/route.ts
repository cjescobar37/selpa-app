import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { markSettlementPaid } from '@/lib/platformFinance'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const result = await markSettlementPaid({
      settlementId: id,
      actorUserId: auth.user!.id,
      paidAt: body?.paid_at ? String(body.paid_at) : null,
    })

    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'finance.settlement.mark_paid',
      entityType: 'settlement',
      entityId: result.settlement.id,
      entityLabel: `${result.settlement.period_start} - ${result.settlement.period_end}`,
      metadata: {
        club_id: result.settlement.club_id,
        previous_status: result.previousStatus,
        next_status: result.settlement.status,
        gross_amount: result.settlement.gross_amount,
        commission_amount: result.settlement.commission_amount,
        net_amount: result.settlement.net_amount,
        currency: result.settlement.currency,
        paid_at: result.settlement.paid_at,
      },
      req,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude marcar la liquidación como pagada.' }, { status: 500 })
  }
}
