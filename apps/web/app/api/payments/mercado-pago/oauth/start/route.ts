import { NextRequest, NextResponse } from 'next/server'
import { oauthChallenge, sha256 } from '@/lib/paymentProviderF1E'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { providerFailure, providerHeaders, providerRuntime, providerUnavailable } from '@/lib/paymentProviderServerF1E'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const provider = providerRuntime()
  if (!provider) return providerUnavailable()
  const body = await req.json().catch(() => null)
  const clubId = String(body?.clubId ?? '')
  const auth = await requireClubCapability(req, clubId, 'finance:manage')
  if (auth.error) return auth.error
  const flow = oauthChallenge()
  try {
    await provider.store.startOAuth(clubId, auth.user.id, sha256(flow.state), sha256(flow.binding), flow.verifier)
    const response = NextResponse.json({ authorizationUrl: provider.provider.authorizationUrl(flow.state, flow.challenge) }, { headers: providerHeaders })
    response.cookies.set('selpa_mp_oauth', flow.binding, { httpOnly: true, secure: true, sameSite: 'lax',
      path: '/api/payments/mercado-pago/oauth/callback', maxAge: 600 })
    return response
  } catch {
    return providerFailure()
  }
}
