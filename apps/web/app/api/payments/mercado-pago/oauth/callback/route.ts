import { NextRequest, NextResponse } from 'next/server'
import { sha256 } from '@/lib/paymentProviderF1E'
import { completeProviderOAuth } from '@/lib/paymentProviderFlowF1E'
import { providerRuntime, providerUnavailable } from '@/lib/paymentProviderServerF1E'

export const runtime = 'nodejs'
export async function GET(req: NextRequest) {
  const provider = providerRuntime()
  if (!provider) return providerUnavailable()
  const state = req.nextUrl.searchParams.get('state') ?? '', binding = req.cookies.get('selpa_mp_oauth')?.value ?? ''
  const code = req.nextUrl.searchParams.get('code') ?? ''
  let connected = false
  let connectedClubId: string | null = null
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(binding) || !code || code.length > 1000) throw new Error('PAYMENT_OAUTH_INVALID')
    const flow = await completeProviderOAuth(provider.store, provider.provider, sha256(state), sha256(binding), code, provider.config.liveMode)
    connected = true
    connectedClubId = flow.clubId
  } catch { /* Generic redirect only; no provider bodies, tokens or errors are exposed. */ }
  const destination = new URL('/club/contabilidad', provider.config.origin)
  destination.searchParams.set('provider', connected ? 'connected' : 'failed')
  if (connectedClubId) destination.searchParams.set('providerClub', connectedClubId)
  const response = NextResponse.redirect(destination, 303)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.cookies.set('selpa_mp_oauth', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/payments/mercado-pago/oauth/callback', maxAge: 0 })
  return response
}
