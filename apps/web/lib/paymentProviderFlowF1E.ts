import { randomUUID } from 'node:crypto'
import { accountAccessToken, validCheckoutUrl, type OAuthTokens, type PaymentProvider, type ProviderSecretStore } from './paymentProviderF1E'

export interface ProviderOAuthStore {
  consumeOAuth(stateHash: string, bindingHash: string): Promise<{ club_id: string; verifier: string }>
  completeOAuth(stateHash: string, tokens: OAuthTokens): Promise<void>
}
export async function completeProviderOAuth(store: ProviderOAuthStore, provider: PaymentProvider,
  stateHash: string, bindingHash: string, code: string, liveMode: boolean) {
  const flow = await store.consumeOAuth(stateHash, bindingHash)
  const tokens = await provider.exchangeOAuth(code, flow.verifier)
  if (tokens.liveMode !== liveMode) throw new Error('PAYMENT_PROVIDER_MODE_MISMATCH')
  await store.completeOAuth(stateHash, tokens)
  return { clubId: flow.club_id }
}

export type PaymentIntent = { id: string; status: string; amount: number; currency_code: 'ARS'; marketplace_fee: number;
  provider_account_id: string; external_reference: string; expires_at: string; checkout_url: string | null;
  stale_preferences?: Array<{ account_id: string; preference_id: string }> }
export type ProviderAccount = { id: string; provider_account_id: string; status: string }
export interface ProviderRepository {
  prepare(obligationId: string, key: string): Promise<PaymentIntent>
  claim(intentId: string, claim: string): Promise<PaymentIntent | null>
  account(id: string): Promise<ProviderAccount>
  finish(id: string, claim: string, preferenceId: string, url: string): Promise<void>
  fail(id: string, claim: string): Promise<void>
  record(accountId: string, fingerprint: string, paymentId: string): Promise<string>
  reconcile(eventId: string, payment: Awaited<ReturnType<PaymentProvider['getPayment']>>): Promise<string>
  retry(eventId: string): Promise<void>
  reconnect(accountId: string): Promise<void>
}

export async function createPaymentCheckout(repo: ProviderRepository, store: ProviderSecretStore, provider: PaymentProvider,
  input: { obligationId: string; key: string; origin: string }) {
  const intent = await repo.prepare(input.obligationId, input.key)
  if (intent.status === 'CHECKOUT_READY' && intent.checkout_url && validCheckoutUrl(intent.checkout_url)) return { checkoutUrl: intent.checkout_url }
  if (intent.status !== 'CREATED') throw new Error('PAYMENT_ALREADY_PROCESSING')
  const claim = randomUUID(), claimed = await repo.claim(intent.id, claim)
  if (!claimed) throw new Error('PAYMENT_ALREADY_PROCESSING')
  let accountId: string | null = null
  try {
    for (const stale of claimed.stale_preferences ?? []) {
      const account = await repo.account(stale.account_id)
      await provider.expireCheckout(await accountAccessToken(account.id, store, provider), stale.preference_id)
    }
    const account = await repo.account(claimed.provider_account_id)
    accountId = account.id
    if (account.status !== 'CONNECTED') throw new Error('PAYMENT_PROVIDER_NOT_CONNECTED')
    const token = await accountAccessToken(account.id, store, provider)
    const checkout = await provider.createCheckout(token, {
      amount: Number(claimed.amount), currency: 'ARS', marketplaceFee: Number(claimed.marketplace_fee),
      reference: claimed.external_reference, expiresAt: claimed.expires_at, idempotencyKey: claimed.id,
      returnUrl: `${input.origin}/player/pagos?paymentReturn=${claimed.external_reference}`,
      notificationUrl: `${input.origin}/api/payments/mercado-pago/webhook?account=${account.id}`,
    })
    await repo.finish(claimed.id, claim, checkout.id, checkout.url)
    return { checkoutUrl: checkout.url }
  } catch (cause) {
    if (accountId && cause instanceof Error && cause.message === 'PAYMENT_PROVIDER_RECONNECT_REQUIRED') await repo.reconnect(accountId)
    // Preference creation may have succeeded despite a timeout. Never blindly create a second one.
    await repo.fail(intent.id, claim)
    throw new Error('PAYMENT_CHECKOUT_REQUIRES_REVIEW')
  }
}

export async function processPaymentWebhook(repo: ProviderRepository, store: ProviderSecretStore, provider: PaymentProvider,
  input: { signature: string; requestId: string; paymentId: string; accountId: string; fingerprint: string }) {
  if (!provider.verifyWebhook(input.signature, input.requestId, input.paymentId)) throw new Error('PAYMENT_SIGNATURE_INVALID')
  const eventId = await repo.record(input.accountId, input.fingerprint, input.paymentId)
  try {
    const account = await repo.account(input.accountId)
    const token = await accountAccessToken(account.id, store, provider, 'WEBHOOK')
    // DB validates identity, collector, reference, amount and currency from the API snapshot.
    const payment = await provider.getPayment(token, input.paymentId)
    return await repo.reconcile(eventId, payment)
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'PAYMENT_PROVIDER_RECONNECT_REQUIRED') await repo.reconnect(input.accountId)
    await repo.retry(eventId)
    throw new Error('PAYMENT_PROVIDER_RETRY_REQUIRED')
  }
}
