import { NextRequest, NextResponse } from 'next/server'
import { authenticatedProviderClient, providerFailure, providerHeaders, providerRpc, providerRuntime, providerUnavailable, providerUuid } from '@/lib/paymentProviderServerF1E'
import { requireClubCapability } from '@/lib/clubMembershipServer'

export async function GET(req: NextRequest) {
  const clubId = req.nextUrl.searchParams.get('clubId') ?? ''
  if (!providerUuid.test(clubId)) return providerFailure(400)
  const auth = await requireClubCapability(req, clubId, 'finance:view')
  if (auth.error) return auth.error
  if (!providerRuntime()) return NextResponse.json({ enabled: false, status: 'NOT_CONNECTED', reconciliation_required: 0 }, { headers: providerHeaders })
  const client = await authenticatedProviderClient(req)
  if (!client) return providerFailure(401)
  try {
    const data = await providerRpc<Record<string, unknown>>(client, 'get_club_payment_provider_f1e', { p_club_id: clubId })
    return NextResponse.json({ enabled: true, status: data.status, reconciliation_required: data.reconciliation_required, issues: data.issues }, { headers: providerHeaders })
  } catch { return providerFailure() }
}

export async function DELETE(req: NextRequest) {
  if (!providerRuntime()) return providerUnavailable()
  const clubId = req.nextUrl.searchParams.get('clubId') ?? ''
  const auth = await requireClubCapability(req, clubId, 'finance:manage')
  if (auth.error) return auth.error
  const client = await authenticatedProviderClient(req)
  if (!client) return providerFailure(401)
  try {
    await providerRpc(client, 'disconnect_payment_provider_f1e', { p_club_id: clubId })
    return NextResponse.json({ status: 'DISCONNECTED' }, { headers: providerHeaders })
  } catch { return providerFailure() }
}
