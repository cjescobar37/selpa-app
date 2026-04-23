import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { logPlatformAction } from '@/lib/platformAudit'
import { refundPayment } from '@/lib/platformFinance'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const result = await refundPayment({
      paymentId: id,
      refundedAmount: body?.refunded_amount == null ? null : Number(body.refunded_amount),
      refundReason: body?.refund_reason ? String(body.refund_reason) : null,
      actorUserId: auth.user!.id,
    })

    await logPlatformAction({
      actorUserId: auth.user!.id,
      action: 'finance.payment.refund',
      entityType: 'payment',
      entityId: result.payment.id,
      entityLabel: result.payment.provider_payment_id || result.payment.id,
      metadata: {
        previous_status: result.previousStatus,
        next_status: result.payment.status,
        refunded_amount: result.refundedAmount,
        total_refunded_amount: result.totalRefundedAmount,
        amount: result.payment.amount,
        club_id: result.payment.club_id,
        user_id: result.payment.user_id,
        tournament_id: result.payment.tournament_id,
        registration_id: result.payment.registration_id,
        refund_reason: result.payment.refund_reason,
      },
      req,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude registrar el reembolso.' }, { status: 500 })
  }
}
