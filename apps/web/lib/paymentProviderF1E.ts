// Server adapter. Never import into a client component.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

type ProviderEvent = 'OAUTH_FAILURE' | 'REFRESH_FAILURE' | 'CHECKOUT_FAILURE' | 'WEBHOOK_INVALID'
  | 'PROVIDER_API_UNAVAILABLE' | 'RECONCILIATION_REQUIRED'
// Existing server logs only: fixed event codes, never errors, request bodies or secrets.
export function reportPaymentProviderEvent(event: ProviderEvent) { console.warn('[finance:F1E]', event) }

export type OAuthTokens = { accessToken: string; refreshToken: string; expiresAt: number; accountId: string; liveMode: boolean }
export interface ProviderSecretStore {
  claimCredentials(accountId: string, claim: string, purpose: 'CHECKOUT' | 'WEBHOOK'): Promise<CredentialClaim>
  rotateCredentials(accountId: string, claim: string, tokens: OAuthTokens): Promise<void>
  failRefresh(accountId: string, claim: string, definitive: boolean, uncertain: boolean): Promise<void>
}
export type CredentialClaim = { kind: 'READY'; accessToken: string } | { kind: 'REFRESH'; tokens: OAuthTokens }
  | { kind: 'BUSY' | 'UNCERTAIN' }

export type ProviderConfig = { clientId: string; clientSecret: string; webhookSecret: string; redirectUri: string; origin: string; liveMode: boolean }
export function paymentProviderConfig(env: Readonly<Record<string, string | undefined>> = process.env): ProviderConfig | null {
  if (env.PAYMENTS_MERCADO_PAGO_ENABLED !== 'true') return null
  const { MERCADO_PAGO_CLIENT_ID: clientId, MERCADO_PAGO_CLIENT_SECRET: clientSecret,
    MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret, MERCADO_PAGO_REDIRECT_URI: redirectUri,
    PAYMENTS_PUBLIC_ORIGIN: origin } = env
  if (!clientId || !clientSecret || !webhookSecret || !redirectUri || !origin) return null
  try {
    const url = new URL(origin), redirect = new URL(redirectUri)
    if (url.protocol !== 'https:' || redirect.origin !== url.origin
      || redirect.pathname !== '/api/payments/mercado-pago/oauth/callback' || url.pathname !== '/' || url.search || url.hash) return null
  } catch { return null }
  return { clientId, clientSecret, webhookSecret, redirectUri, origin: new URL(origin).origin,
    liveMode: env.PAYMENTS_MERCADO_PAGO_LIVE_MODE === 'true' }
}
export function paymentProviderReady() { return Boolean(paymentProviderConfig()) }
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export function oauthChallenge() {
  const state = randomBytes(32).toString('base64url'), binding = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  return { state, binding, verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export type ProviderPayment = { id: string; status: string; amount: string; currency: string; collector_id: string;
  external_reference: string; paid_at: string | null; captured: boolean; live_mode: boolean }
export type CheckoutInput = { reference: string; amount: number; currency: 'ARS'; marketplaceFee: number; expiresAt: string;
  returnUrl: string; notificationUrl: string; idempotencyKey: string }
export interface PaymentProvider {
  authorizationUrl(state: string, challenge: string): string
  exchangeOAuth(code: string, verifier: string): Promise<OAuthTokens>
  refreshOAuth(tokens: OAuthTokens): Promise<OAuthTokens>
  createCheckout(token: string, input: CheckoutInput): Promise<{ id: string; url: string }>
  expireCheckout(token: string, preferenceId: string): Promise<void>
  getPayment(token: string, paymentId: string): Promise<ProviderPayment>
  verifyWebhook(signature: string, requestId: string, dataId: string): boolean
}

export function verifyMercadoPagoWebhook(secret: string, signature: string, requestId: string, dataId: string) {
  if (!secret || !/^[0-9]+$/.test(dataId) || !/^[a-zA-Z0-9-]{1,160}$/.test(requestId)) return false
  const match = /^ts=(\d{1,16}),v1=([a-f0-9]{64})$/.exec(signature.replace(/\s+/g, ''))
  if (!match) return false
  // MP's signed manifest uses data.id from the query, request-id and ts. Retries may be delayed;
  // inbox fingerprint + unique payment binding provides replay protection (no arbitrary five-minute rejection).
  const expected = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${match[1]};`).digest()
  return timingSafeEqual(expected, Buffer.from(match[2], 'hex'))
}

export function validCheckoutUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['www.mercadopago.com.ar', 'mercadopago.com.ar', 'sandbox.mercadopago.com.ar'].includes(url.hostname) && !url.username && !url.password && !url.port }
  catch { return false }
}
function providerId(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
  const result = String(value ?? '')
  if (!/^\d{1,40}$/.test(result)) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
  return result
}
export function providerPaymentSnapshot(raw: Record<string, unknown>): ProviderPayment {
  const amount = String(raw.transaction_amount ?? '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0
    || typeof raw.live_mode !== 'boolean' || typeof raw.captured !== 'boolean') throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
  const paidAt = typeof raw.date_approved === 'string' && Number.isFinite(Date.parse(raw.date_approved)) ? new Date(raw.date_approved).toISOString() : null
  const status = ['approved', 'pending', 'in_process', 'authorized', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(String(raw.status)) ? String(raw.status) : 'unknown'
  const reference = String(raw.external_reference ?? '')
  return { id: providerId(raw.id), status, amount, currency: /^[A-Z]{3}$/.test(String(raw.currency_id)) ? String(raw.currency_id) : '',
    collector_id: providerId(raw.collector_id), external_reference: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference) ? reference.toLowerCase() : '',
    paid_at: paidAt, captured: raw.captured, live_mode: raw.live_mode }
}

export class MercadoPagoProvider implements PaymentProvider {
  private config: ProviderConfig
  private transport: typeof fetch
  constructor(config: ProviderConfig, transport: typeof fetch = fetch) { this.config = config; this.transport = transport }
  private async api(path: string, method: string, token?: string, body?: unknown, key?: string) {
    const response = await this.transport(`https://api.mercadopago.com${path}`, {
      method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'X-Idempotency-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(cause => { reportPaymentProviderEvent('PROVIDER_API_UNAVAILABLE'); throw cause })
    if (!response.ok) {
      const invalid = await response.json().catch(() => ({})) as { error?: string }
      const reconnect = [401, 403].includes(response.status) || (path === '/oauth/token' && invalid.error === 'invalid_grant')
      if (path === '/oauth/token' && response.status === 429) throw new Error('PAYMENT_PROVIDER_REFRESH_RETRY')
      if (!reconnect) reportPaymentProviderEvent('PROVIDER_API_UNAVAILABLE')
      throw new Error(reconnect ? 'PAYMENT_PROVIDER_RECONNECT_REQUIRED' : 'PAYMENT_PROVIDER_UNAVAILABLE')
    }
    return await response.json() as Record<string, unknown>
  }
  authorizationUrl(state: string, challenge: string) {
    const params = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', platform_id: 'mp',
      redirect_uri: this.config.redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' })
    return `https://auth.mercadopago.com/authorization?${params}`
  }
  private tokens(raw: Record<string, unknown>): OAuthTokens {
    if (typeof raw.access_token !== 'string' || typeof raw.refresh_token !== 'string'
      || !raw.access_token || !raw.refresh_token
      || !Number.isFinite(Number(raw.expires_in)) || Number(raw.expires_in) <= 0 || typeof raw.live_mode !== 'boolean') throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
    return { accessToken: raw.access_token, refreshToken: raw.refresh_token, accountId: providerId(raw.user_id),
      expiresAt: Date.now() + Number(raw.expires_in) * 1000, liveMode: raw.live_mode }
  }
  async exchangeOAuth(code: string, verifier: string) {
    return this.tokens(await this.api('/oauth/token', 'POST', undefined, { client_id: this.config.clientId,
      client_secret: this.config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri, code_verifier: verifier }))
  }
  async refreshOAuth(tokens: OAuthTokens) {
    const next = this.tokens(await this.api('/oauth/token', 'POST', undefined, { client_id: this.config.clientId,
      client_secret: this.config.clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }))
    if (next.accountId !== tokens.accountId || next.liveMode !== tokens.liveMode) throw new Error('PAYMENT_PROVIDER_OWNERSHIP_MISMATCH')
    return next
  }
  async createCheckout(token: string, input: CheckoutInput) {
    const raw = await this.api('/checkout/preferences', 'POST', token, {
      items: [{ id: input.reference, title: 'Saldo de inscripción SELPA', currency_id: 'ARS', quantity: 1, unit_price: input.amount }],
      external_reference: input.reference, marketplace_fee: input.marketplaceFee,
      expires: true, expiration_date_to: input.expiresAt,
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      auto_return: 'approved', notification_url: input.notificationUrl,
    }, input.idempotencyKey)
    const url = String(this.config.liveMode ? raw.init_point : raw.sandbox_init_point)
    if (!raw.id || !validCheckoutUrl(url)) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
    return { id: String(raw.id), url }
  }
  async expireCheckout(token: string, id: string) {
    await this.api(`/checkout/preferences/${encodeURIComponent(id)}`, 'PUT', token, { expires: true, expiration_date_to: new Date(Date.now() - 1000).toISOString() })
  }
  async getPayment(token: string, id: string) { return providerPaymentSnapshot(await this.api(`/v1/payments/${providerId(id)}`, 'GET', token)) }
  verifyWebhook(signature: string, requestId: string, dataId: string) { return verifyMercadoPagoWebhook(this.config.webhookSecret, signature, requestId, dataId) }
}

export async function loadProviderCredentials(accountId: string, store: ProviderSecretStore, provider: PaymentProvider,
  purpose: 'CHECKOUT' | 'WEBHOOK' = 'CHECKOUT') {
  const claim = randomUUID()
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await store.claimCredentials(accountId, claim, purpose)
    if (result.kind === 'READY') return result.accessToken
    if (result.kind === 'UNCERTAIN') throw new Error('PAYMENT_REFRESH_REQUIRES_REVIEW')
    if (result.kind === 'REFRESH') return refreshProviderCredentials(accountId, claim, result.tokens, store, provider)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('PAYMENT_REFRESH_BUSY')
}
export async function refreshProviderCredentials(accountId: string, claim: string, previous: OAuthTokens,
  store: ProviderSecretStore, provider: PaymentProvider) {
  let receivedCompleteResponse = false
  try {
    const next = await provider.refreshOAuth(previous)
    if (!next.accessToken || !next.refreshToken || !Number.isFinite(next.expiresAt) || next.expiresAt <= Date.now()
      || next.accountId !== previous.accountId || next.liveMode !== previous.liveMode) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE')
    receivedCompleteResponse = true
    await store.rotateCredentials(accountId, claim, next)
    return next.accessToken
  } catch (cause) {
    reportPaymentProviderEvent('REFRESH_FAILURE')
    const message = cause instanceof Error ? cause.message : ''
    const definitive = message === 'PAYMENT_PROVIDER_RECONNECT_REQUIRED'
    // Timeout/invalid response/DB failure after rotation may have consumed the remote refresh token.
    // Keep old secrets + claim for review; only a definite non-auth HTTP failure can retry the old token.
    const uncertain = receivedCompleteResponse || message !== 'PAYMENT_PROVIDER_REFRESH_RETRY'
    await store.failRefresh(accountId, claim, definitive, uncertain).catch(() => undefined)
    throw new Error(definitive ? 'PAYMENT_PROVIDER_RECONNECT_REQUIRED' : uncertain ? 'PAYMENT_REFRESH_REQUIRES_REVIEW' : 'PAYMENT_PROVIDER_UNAVAILABLE')
  }
}
export const accountAccessToken = loadProviderCredentials
