import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { calculateCommissionForPayment } from '@/lib/platformFinance'

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const paymentId = String(body?.payment_id ?? '')
    const commissionRateBps = Number(body?.commission_rate_bps)

    if (!paymentId) return NextResponse.json({ error: 'Falta payment_id.' }, { status: 400 })
    if (!Number.isInteger(commissionRateBps)) {
      return NextResponse.json({ error: 'commission_rate_bps inválido.' }, { status: 400 })
    }

    const result = await calculateCommissionForPayment({
      paymentId,
      commissionRateBps,
      ruleSnapshot: body?.rule_snapshot ?? null,
    })

    if (result.created) {
      await logPlatformAction({
        actorUserId: auth.user!.id,
        action: 'finance.commission.calculate',
        entityType: 'commission',
        entityId: result.commission.id,
        entityLabel: result.commission.payment_id,
        metadata: {
          payment_id: result.commission.payment_id,
          club_id: result.commission.club_id,
          tournament_id: result.commission.tournament_id,
          base_amount: result.commission.base_amount,
          commission_rate_bps: result.commission.commission_rate_bps,
          commission_amount: result.commission.commission_amount,
          club_net_amount: result.commission.club_net_amount,
          currency: result.commission.currency,
        },
        req,
      })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude calcular la comisión.' }, { status: 500 })
  }
}
