// Server-only orchestration; exported client responses are always explicit allowlists.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { MercadoPagoProvider, paymentProviderConfig } from './paymentProviderF1E'
import { VaultProviderSecretStore } from './paymentProviderVaultF1E'
import type { PaymentIntent, ProviderAccount, ProviderRepository } from './paymentProviderFlowF1E'

export const providerHeaders = { 'Cache-Control': 'private, no-store' }
export const providerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function providerRuntime() {
  const config = paymentProviderConfig()
  return config ? { config, store: new VaultProviderSecretStore((name, params) => providerRpc(supabaseAdmin, name, params)),
    provider: new MercadoPagoProvider(config) } : null
}
export async function authenticatedProviderClient(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? '', token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !token) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const result = await client.auth.getUser(token)
  return result.error || !result.data.user ? null : client
}
export async function providerRpc<T>(client: SupabaseClient, name: string, params: Record<string, unknown> = {}): Promise<T> {
  const result = await client.rpc(name, params)
  if (result.error) throw new Error('PAYMENT_DATABASE_REJECTED')
  return result.data as T
}
export function providerRepository(client?: SupabaseClient): ProviderRepository {
  return {
    prepare: (id, key) => providerRpc<PaymentIntent>(client!, 'prepare_club_payment_intent_f1e', { p_obligation_id: id, p_idempotency_key: key }),
    claim: (id, claim) => providerRpc<PaymentIntent | null>(supabaseAdmin, 'claim_club_payment_checkout_f1e', { p_intent_id: id, p_claim: claim }),
    account: id => providerRpc<ProviderAccount>(supabaseAdmin, 'payment_provider_account_internal_f1e', { p_account_id: id }),
    finish: (id, claim, preference, url) => providerRpc(supabaseAdmin, 'finish_club_payment_checkout_f1e', { p_intent_id: id, p_claim: claim, p_preference_id: preference, p_checkout_url: url }),
    fail: (id, claim) => providerRpc(supabaseAdmin, 'fail_club_payment_checkout_f1e', { p_intent_id: id, p_claim: claim }),
    record: (id, fingerprint, payment) => providerRpc(supabaseAdmin, 'record_payment_provider_event_f1e', { p_account_id: id, p_fingerprint: fingerprint, p_payment_id: payment }),
    reconcile: (id, payment) => providerRpc(supabaseAdmin, 'reconcile_payment_provider_event_f1e', { p_event_id: id, p_payment: payment }),
    retry: id => providerRpc(supabaseAdmin, 'record_payment_provider_retry_f1e', { p_event_id: id }),
    reconnect: id => providerRpc(supabaseAdmin, 'mark_payment_provider_reconnect_f1e', { p_account_id: id }),
  }
}
export function providerUnavailable() { return NextResponse.json({ error: 'Los pagos online todavía no están disponibles.' }, { status: 503, headers: providerHeaders }) }
export function providerFailure(status = 503) { return NextResponse.json({ error: 'No pudimos completar la operación. Probá nuevamente o contactá al club.' }, { status, headers: providerHeaders }) }
