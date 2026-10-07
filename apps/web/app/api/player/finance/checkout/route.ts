import { NextRequest, NextResponse } from 'next/server'
import { createPaymentCheckout } from '@/lib/paymentProviderFlowF1E'
import { authenticatedProviderClient, providerFailure, providerHeaders, providerRepository, providerRpc, providerRuntime, providerUnavailable, providerUuid } from '@/lib/paymentProviderServerF1E'

export const runtime = 'nodejs'
export async function GET(req: NextRequest) {
  if (!providerRuntime()) return providerUnavailable()
  const reference = req.nextUrl.searchParams.get('reference') ?? ''
  if (!providerUuid.test(reference)) return providerFailure(400)
  const client = await authenticatedProviderClient(req)
  if (!client) return providerFailure(401)
  try {
    const status = await providerRpc<string>(client, 'get_player_payment_return_f1e', { p_reference: reference })
    return NextResponse.json({ status }, { headers: providerHeaders })
  } catch { return providerFailure(403) }
}
export async function POST(req: NextRequest) {
  const provider = providerRuntime()
  if (!provider) return providerUnavailable()
  const client = await authenticatedProviderClient(req)
  if (!client) return providerFailure(401)
  const body = await req.json().catch(() => null)
  if (!body || Object.keys(body).some(key => !['obligationId', 'idempotencyKey'].includes(key))
    || !providerUuid.test(body.obligationId ?? '') || !providerUuid.test(body.idempotencyKey ?? '')) return providerFailure(400)
  try {
    const checkout = await createPaymentCheckout(providerRepository(client), provider.store, provider.provider,
      { obligationId: body.obligationId, key: body.idempotencyKey, origin: provider.config.origin })
    return NextResponse.json(checkout, { headers: providerHeaders })
  } catch { return providerFailure(409) }
}
