import { NextRequest, NextResponse } from 'next/server'
import { reportPaymentProviderEvent, sha256 } from '@/lib/paymentProviderF1E'
import { processPaymentWebhook } from '@/lib/paymentProviderFlowF1E'
import { providerFailure, providerHeaders, providerRepository, providerRuntime, providerUnavailable, providerUuid } from '@/lib/paymentProviderServerF1E'

export const runtime = 'nodejs'
export const maxDuration = 20
export async function POST(req: NextRequest) {
  const provider = providerRuntime()
  if (!provider) return providerUnavailable()
  const accountId = req.nextUrl.searchParams.get('account') ?? '', paymentId = req.nextUrl.searchParams.get('data.id') ?? ''
  const signature = req.headers.get('x-signature') ?? '', requestId = req.headers.get('x-request-id') ?? ''
  if (!providerUuid.test(accountId) || !provider.provider.verifyWebhook(signature, requestId, paymentId)) {
    reportPaymentProviderEvent('WEBHOOK_INVALID')
    return providerFailure(401)
  }
  const raw = await req.text()
  if (raw.length > 8192) return providerFailure(413)
  try {
    const body = JSON.parse(raw)
    if (body.type !== 'payment' || String(body.data?.id ?? '') !== paymentId) return providerFailure(400)
    const status = await processPaymentWebhook(providerRepository(), provider.store, provider.provider, {
      accountId, paymentId, signature, requestId, fingerprint: sha256(`${accountId}:${paymentId}:${requestId}:${signature}`),
    })
    return NextResponse.json({ received: true, status }, { headers: providerHeaders })
  } catch {
    // MP retries non-2xx. The durable inbox survives API outages; no tokens or provider bodies are logged.
    return providerFailure()
  }
}
