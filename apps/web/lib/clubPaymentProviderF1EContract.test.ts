import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ComponentType } from 'react'
import { MercadoPagoProvider, accountAccessToken, oauthChallenge, paymentProviderConfig, providerPaymentSnapshot,
  reportPaymentProviderEvent, verifyMercadoPagoWebhook, type OAuthTokens, type PaymentProvider, type ProviderSecretStore } from './paymentProviderF1E'
import { completeProviderOAuth, createPaymentCheckout, processPaymentWebhook, type PaymentIntent, type ProviderRepository } from './paymentProviderFlowF1E'
import { VaultProviderSecretStore, type VaultRpc } from './paymentProviderVaultF1E'
import { financeMovementMethod } from './clubFinanceF1C'
import { playerPaymentOptions } from './paymentProviderReadsF1E'

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const sql = source('../supabase/migrations/20261007004843_20261006170250_club_payment_provider_f1e_foundation.sql')
const qa = source('../supabase/qa/20261006170250_club_payment_provider_f1e_validation.sql')
const checkoutRoute = source('../app/api/player/finance/checkout/route.ts')
const content = source('../app/(app)/player/pagos/PlayerFinanceContent.tsx')
const player = source('../app/(app)/player/pagos/page.tsx')
const config = { clientId: 'test-client', clientSecret: 'test-client-secret', webhookSecret: 'test-hook-secret',
  redirectUri: 'https://selpa.test/api/payments/mercado-pago/oauth/callback', origin: 'https://selpa.test', liveMode: false }
const payment = { id: '123456789', status: 'approved', amount: '80', currency: 'ARS', collector_id: '123',
  external_reference: '00000000-0000-4000-8000-000000000002', paid_at: '2026-10-06T17:00:00.000Z', captured: true, live_mode: false }
const tokens: OAuthTokens = { accessToken: 'private-access', refreshToken: 'private-refresh', accountId: '123', expiresAt: Date.now() + 600000, liveMode: false }
const configuredEnv: Record<string, string> = { PAYMENTS_MERCADO_PAGO_ENABLED: 'true', PAYMENTS_MERCADO_PAGO_LIVE_MODE: 'false',
  PAYMENTS_PUBLIC_ORIGIN: config.origin, MERCADO_PAGO_CLIENT_ID: config.clientId, MERCADO_PAGO_CLIENT_SECRET: config.clientSecret,
  MERCADO_PAGO_WEBHOOK_SECRET: config.webhookSecret, MERCADO_PAGO_REDIRECT_URI: config.redirectUri }

function memoryStore(initial: OAuthTokens = tokens) {
  let current = { ...initial }, holder: string | null = null, uncertain = false
  const store: ProviderSecretStore = {
    async claimCredentials(_id, claim) {
      if (uncertain) return { kind: 'UNCERTAIN' }
      if (holder) return { kind: 'BUSY' }
      if (current.expiresAt > Date.now() + 60000) return { kind: 'READY', accessToken: current.accessToken }
      holder = claim; return { kind: 'REFRESH', tokens: { ...current } }
    },
    async rotateCredentials(_id, claim, next) { assert.equal(claim, holder); current = { ...next }; holder = null },
    async failRefresh(_id, claim, _definitive, isUncertain) { assert.equal(claim, holder); uncertain = isUncertain; if (!isUncertain) holder = null },
  }
  return { store, current: () => current }
}

function setup() {
  const counts = { checkouts: 0, fails: 0, snapshots: [] as unknown[], recorded: 0 }
  const intent: PaymentIntent = { id: 'intent', status: 'CREATED', amount: 80, currency_code: 'ARS', marketplace_fee: 0,
    provider_account_id: 'account', external_reference: payment.external_reference, expires_at: '2026-10-06T18:00:00Z', checkout_url: null }
  let claimed = false
  const store = memoryStore().store
  const provider: PaymentProvider = { authorizationUrl() { return 'https://auth.mercadopago.com/authorization' },
    async exchangeOAuth() { return tokens }, async refreshOAuth() { return tokens },
    async createCheckout(_token, input) { counts.checkouts++; assert.equal(input.amount, 80); assert.equal(input.currency, 'ARS'); assert.equal(input.marketplaceFee, 0); return { id: 'preference', url: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=p' } },
    async expireCheckout() {}, async getPayment() { return payment }, verifyWebhook() { return true } }
  const events = new Map<string, string>()
  const repo: ProviderRepository = { async prepare() { return intent }, async claim() { if (claimed) return null; claimed = true; return intent },
    async account() { return { id: 'account', provider_account_id: '123', status: 'CONNECTED' } },
    async finish(_id, _claim, _preference, url) { intent.status = 'CHECKOUT_READY'; intent.checkout_url = url },
    async fail() { counts.fails++; intent.status = 'RECONCILIATION_REQUIRED' },
    async record(_account, fingerprint) { if (!events.has(fingerprint)) { events.set(fingerprint, 'event'); counts.recorded++ } return events.get(fingerprint)! },
    async reconcile(_id, snapshot) { counts.snapshots.push(snapshot); return 'PROCESSED' }, async retry() {}, async reconnect() {} }
  return { counts, repo, provider, store, intent }
}

test('disabled by default; Vault runtime is scoped and never a plaintext fallback', () => {
  assert.equal(paymentProviderConfig({}), null)
  assert.equal(paymentProviderConfig({ PAYMENTS_MERCADO_PAGO_ENABLED: 'true' }), null)
  assert.match(sql, /PAYMENT_VAULT_REQUIRED/)
  assert.match(source('./paymentProviderServerF1E.ts'), /new VaultProviderSecretStore/)
})
test('OAuth random state/binding and S256 challenge; no password flow or token client JSON', () => {
  const a = oauthChallenge(), b = oauthChallenge()
  assert.notEqual(a.state, b.state); assert.notEqual(a.binding, a.state)
  assert.equal(a.verifier.length, 64); assert.equal(a.challenge.length, 43)
  const url = new URL(new MercadoPagoProvider(config).authorizationUrl(a.state, a.challenge))
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('state'), a.state)
  assert.ok(!url.toString().includes(config.clientSecret))
  assert.match(sql, /binding_hash = p_binding_hash[\s\S]*expires_at > now\(\) and consumed_at is null/)
  assert.match(sql, /public.has_club_capability\(v.club_id, 'finance:manage'\)/)
})
test('real HMAC verifier accepts the signed manifest and rejects tampering/missing IDs', () => {
  const signature = 'ts=1760000000,v1=' + createHmac('sha256', 'secret').update('id:123;request-id:request-1;ts:1760000000;').digest('hex')
  assert.equal(verifyMercadoPagoWebhook('secret', signature, 'request-1', '123'), true)
  for (const [key, request, id] of [['wrong', 'request-1', '123'], ['secret', 'request-1', '124'], ['secret', 'request-2', '123'], ['secret', '', '123']])
    assert.equal(verifyMercadoPagoWebhook(key, signature, request, id), false)
})
test('JWT visibility covers TEAM player1/player2 and USER only debtor; zero/disconnected denied in real QA', () => {
  assert.match(sql, /public.player_finance_visible_obligations_f1d\(null\) where id = p_obligation_id/)
  assert.match(sql, /v_balance <= 0/)
  assert.match(sql, /status = 'CONNECTED'/)
  for (const marker of ['PLAYER1', 'PLAYER2', 'OUTSIDER', 'USER', 'ZERO', 'DISCONNECTED']) assert.ok(qa.includes(`QA_F1E_${marker}`))
})
test('amount comes from canonical net balance; no frontend amount/currency accepted', () => {
  assert.match(sql, /club_finance_obligation_projection_internal\(o.club_id, o.id\)->>'balance'/)
  assert.match(sql, /auth.uid\(\), v_balance, p_idempotency_key/)
  assert.match(checkoutRoute, /!\['obligationId', 'idempotencyKey'\].includes\(key\)/)
})
test('one claimant creates Checkout Pro; ready retry returns the exact same checkout without another preference', async () => {
  const s = setup(), input = { obligationId: 'o', key: 'key', origin: config.origin }
  const attempts = await Promise.allSettled([createPaymentCheckout(s.repo, s.store, s.provider, input), createPaymentCheckout(s.repo, s.store, s.provider, input)])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  const again = await createPaymentCheckout(s.repo, s.store, s.provider, input)
  assert.equal(again.checkoutUrl, s.intent.checkout_url)
  assert.equal(s.counts.checkouts, 1)
  assert.ok(!JSON.stringify(again).includes('private-access'))
  assert.match(sql, /unique index club_payment_intent_active_f1e_idx[\s\S]*where status in \('CREATED', 'CHECKOUT_READY', 'PENDING'\)/)
})
test('ambiguous preference failure enters reconciliation and cannot create another checkout', async () => {
  const s = setup(); s.provider.createCheckout = async () => { throw new Error('timeout after remote create') }
  const input = { obligationId: 'o', key: 'key', origin: config.origin }
  await assert.rejects(createPaymentCheckout(s.repo, s.store, s.provider, input), /REQUIRES_REVIEW/)
  await assert.rejects(createPaymentCheckout(s.repo, s.store, s.provider, input), /ALREADY_PROCESSING/)
  assert.equal(s.counts.fails, 1)
})
test('refresh rotates access AND refresh under the account claim and rejects account changes', async () => {
  const transport: typeof fetch = async () => new Response(JSON.stringify({access_token:'new-access',refresh_token:'new-refresh',
    user_id:123,expires_in:3600,live_mode:false}))
  const adapter = new MercadoPagoProvider(config, transport)
  const next = await adapter.refreshOAuth(tokens)
  assert.equal(next.accessToken, 'new-access'); assert.equal(next.accountId, '123')
  await assert.rejects(adapter.refreshOAuth({...tokens,accountId:'other'}), /OWNERSHIP_MISMATCH/)
  const s = memoryStore({ ...tokens, expiresAt: 0 })
  assert.equal(await accountAccessToken('account', s.store, adapter), 'new-access')
  assert.equal(s.current().accessToken, 'new-access'); assert.equal(s.current().refreshToken, 'new-refresh')
})
test('API outage keeps inbox evidence and requests retry; revoked provider connection is marked for reconnect', async () => {
  const s = setup(), input = {signature:'signature',requestId:'request',paymentId:payment.id,accountId:'account',fingerprint:'fingerprint'}
  let retries = 0, reconnects = 0
  s.repo.retry = async () => { retries++ }; s.repo.reconnect = async () => { reconnects++ }
  s.provider.getPayment = async () => { throw new Error('PAYMENT_PROVIDER_RECONNECT_REQUIRED') }
  await assert.rejects(processPaymentWebhook(s.repo,s.store,s.provider,input), /RETRY_REQUIRED/)
  assert.equal(s.counts.recorded,1); assert.equal(s.counts.snapshots.length,0)
  assert.equal(retries,1); assert.equal(reconnects,1)
})
test('webhook calls API for evidence, rejects invalid signature before inbox, deduplicates notification', async () => {
  const s = setup(), input = { signature: 'signature', requestId: 'request', paymentId: payment.id, accountId: 'account', fingerprint: 'fingerprint' }
  s.provider.verifyWebhook = () => false
  await assert.rejects(processPaymentWebhook(s.repo, s.store, s.provider, input), /SIGNATURE_INVALID/)
  assert.equal(s.counts.recorded, 0)
  s.provider.verifyWebhook = () => true
  await processPaymentWebhook(s.repo, s.store, s.provider, input)
  await processPaymentWebhook(s.repo, s.store, s.provider, input)
  assert.equal(s.counts.recorded, 1)
  assert.deepEqual(s.counts.snapshots[0], payment)
  assert.match(sql, /'OTHER', 'mp:' \|\| e.provider_payment_id/)
  assert.match(sql, /i.finance_payment_id is not null[\s\S]*i.provider_payment_id = e.provider_payment_id/)
})
test('provider API normalizer rejects invalid money and keeps only minimal non-PII evidence', () => {
  const raw = { id: 123456789, transaction_amount: 80, currency_id: 'ARS', status: 'approved', collector_id: 123,
    external_reference: payment.external_reference, captured: true, live_mode: false, date_approved: payment.paid_at,
    payer: { email: 'private@test' }, card: { number: 'private' } }
  assert.deepEqual(providerPaymentSnapshot(raw), payment)
  assert.throws(() => providerPaymentSnapshot({ ...raw, transaction_amount: -1 }))
  assert.throws(() => providerPaymentSnapshot({ ...raw, id: Number.MAX_SAFE_INTEGER + 1 }))
  assert.ok(!JSON.stringify(providerPaymentSnapshot(raw)).includes('private'))
})
test('wrong amount, currency, collector/reference and manual race never persist invalid F1A money', () => {
  for (const marker of ['AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'PROVIDER_OWNERSHIP_MISMATCH', 'EXTERNAL_REFERENCE_MISMATCH', 'BALANCE_CHANGED']) assert.ok(sql.includes(marker))
  assert.match(sql, /public.register_club_finance_payment\(/)
  assert.match(sql, /when others then[\s\S]*v_reason := 'LEDGER_REJECTED_'/)
  assert.match(sql, /'RECONCILIATION_REQUIRED'/)
  assert.doesNotMatch(sql, /insert into public.club_finance_(?:payments|allocations|journals)|update public.club_finance_(?:payments|obligations)/)
  for (const marker of ['APPROVED_ONCE', 'REJECTED', 'AMOUNT', 'CURRENCY', 'MANUAL_RACE']) assert.ok(qa.includes(`QA_F1E_${marker}`))
})
test('provider bridge is service-only, delegated actor revalidated, no F1A grant/lifecycle changes', () => {
  assert.match(sql, /auth.role\(\) is distinct from 'service_role'/)
  assert.match(sql, /public.has_club_capability\(i.club_id, 'finance:manage'\)/)
  assert.match(sql, /reconcile_payment_provider_event_f1e\(uuid, jsonb\) to service_role/)
  assert.doesNotMatch(sql, /grant .*club_finance_payments|create or replace|tournament_payments/)
  assert.match(sql, /club_provider_events_immutable before update or delete/)
})

test('provider account and OAuth state contain only Vault UUID refs, never token/verifier values', () => {
  const accountTable = sql.split('create table public.club_payment_provider_accounts (')[1].split('\n);')[0]
  const stateTable = sql.split('create table public.club_payment_oauth_states (')[1].split('\n);')[0]
  for (const name of ['access_token_secret_id', 'refresh_token_secret_id']) assert.match(accountTable, new RegExp(`${name} uuid`))
  assert.match(accountTable, /token_expires_at timestamptz/)
  assert.doesNotMatch(accountTable, /(?:access_token|refresh_token)\s+(?:text|jsonb)/)
  assert.match(stateTable, /pkce_verifier_secret_id uuid/)
  assert.doesNotMatch(stateTable, /verifier\s+text|secret_reference|verifier_reference/)
  assert.match(sql, /vault.create_secret\(p_access_token, null, 'SELPA F1E access'\)/)
  assert.match(sql, /vault.create_secret\(p_refresh_token, null, 'SELPA F1E refresh'\)/)
})
test('OAuth success stores both credentials through scoped Vault completion; Vault failure never returns connected', async () => {
  const s = setup(); let consumed = 0, connected = false
  const store = { async consumeOAuth() { consumed++; return { club_id: 'club', verifier: 'private-pkce' } },
    async completeOAuth(_hash: string, next: OAuthTokens) { assert.deepEqual(next, tokens); connected = true } }
  assert.deepEqual(await completeProviderOAuth(store, s.provider, 'statehash', 'bindinghash', 'code', false), { clubId: 'club' })
  assert.equal(connected, true); assert.equal(consumed, 1)
  connected = false
  store.completeOAuth = async () => { throw new Error('Vault unavailable') }
  await assert.rejects(completeProviderOAuth(store, s.provider, 'statehash', 'bindinghash', 'code', false))
  assert.equal(connected, false)
  assert.match(sql, /v_access := vault.create_secret[\s\S]*v_refresh := vault.create_secret[\s\S]*insert into public.club_payment_provider_accounts/)
})
test('invalid refresh preserves old secrets; concurrent callers rotate once and receive the same access', async () => {
  const s = setup(), bad = memoryStore({ ...tokens, expiresAt: 0 })
  s.provider.refreshOAuth = async () => ({ ...tokens, accessToken: '', refreshToken: '' })
  await assert.rejects(accountAccessToken('account', bad.store, s.provider), /REQUIRES_REVIEW/)
  assert.equal(bad.current().accessToken, tokens.accessToken); assert.equal(bad.current().refreshToken, tokens.refreshToken)
  const shared = memoryStore({ ...tokens, expiresAt: 0 }); let refreshes = 0
  s.provider.refreshOAuth = async () => { refreshes++; await new Promise(resolve => setTimeout(resolve, 20)); return { ...tokens, accessToken: 'rotated-a', refreshToken: 'rotated-r' } }
  const results = await Promise.all([accountAccessToken('account', shared.store, s.provider), accountAccessToken('account', shared.store, s.provider)])
  assert.deepEqual(results, ['rotated-a', 'rotated-a']); assert.equal(refreshes, 1)
  assert.equal(shared.current().refreshToken, 'rotated-r')
  assert.match(sql, /vault.update_secret\(a.access_token_secret_id, p_access_token\)/)
  assert.match(sql, /vault.update_secret\(a.refresh_token_secret_id, p_refresh_token\)/)
  assert.match(sql, /refresh_claim is distinct from p_claim/)
})
test('transient refresh can retry unchanged credentials; definitive revocation requests reconnect', async () => {
  const s = setup(), store = memoryStore({ ...tokens, expiresAt: 0 })
  s.provider.refreshOAuth = async () => { throw new Error('PAYMENT_PROVIDER_REFRESH_RETRY') }
  await assert.rejects(accountAccessToken('account', store.store, s.provider), /UNAVAILABLE/)
  s.provider.refreshOAuth = async () => tokens
  assert.equal(await accountAccessToken('account', store.store, s.provider), tokens.accessToken)
  s.provider.refreshOAuth = async () => { throw new Error('PAYMENT_PROVIDER_RECONNECT_REQUIRED') }
  await assert.rejects(accountAccessToken('account', memoryStore({ ...tokens, expiresAt: 0 }).store, s.provider), /RECONNECT_REQUIRED/)
})
test('rotation persistence failure/timeout keeps old credentials and blocks blind remote retries', async () => {
  const s = setup(), old = { ...tokens, expiresAt: 0 }, state = memoryStore(old)
  let calls = 0
  s.provider.refreshOAuth = async () => { calls++; return { ...tokens, accessToken: 'new-a', refreshToken: 'new-r' } }
  state.store.rotateCredentials = async () => { throw new Error('Vault unavailable after provider rotation') }
  await assert.rejects(accountAccessToken('account', state.store, s.provider), /REQUIRES_REVIEW/)
  await assert.rejects(accountAccessToken('account', state.store, s.provider), /REQUIRES_REVIEW/)
  assert.equal(calls, 1); assert.deepEqual(state.current(), old)
  const timedOut = memoryStore(old)
  s.provider.refreshOAuth = async () => { throw new Error('request timeout') }
  await assert.rejects(accountAccessToken('account', timedOut.store, s.provider), /REQUIRES_REVIEW/)
  assert.deepEqual(timedOut.current(), old)
})
test('HTTP surfaces are allowlisted, never send OAuth credentials or raw Vault errors to the browser', () => {
  const start = source('../app/api/payments/mercado-pago/oauth/start/route.ts')
  const callback = source('../app/api/payments/mercado-pago/oauth/callback/route.ts')
  const settings = source('../app/api/clubs/finance/provider/route.ts')
  const webhook = source('../app/api/payments/mercado-pago/webhook/route.ts')
  for (const route of [start, callback, settings, webhook, checkoutRoute]) {
    assert.doesNotMatch(route, /NextResponse.json\((?:tokens|flow|secret|provider|data|cause)\b/)
    assert.doesNotMatch(route, /console[.]|error:.*(?:message|accessToken|refreshToken|verifier)/)
  }
  assert.match(start, /NextResponse.json\(\{ authorizationUrl:/)
  assert.match(callback, /NextResponse.redirect\(destination, 303\)/)
  assert.match(settings, /enabled: true, status: data.status, reconciliation_required: data.reconciliation_required, issues: data.issues/)
})
test('Vault wrapper never requests arbitrary secrets; credentials only cross the service RPC boundary', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = []
  const rpc: VaultRpc = async <T>(name: string, params: Record<string, unknown> = {}) => { calls.push({ name, params }); return undefined as T }
  const store = new VaultProviderSecretStore(rpc)
  await store.startOAuth('club', 'actor', 'hash', 'binding', 'pkce')
  await store.completeOAuth('hash', tokens)
  await store.rotateCredentials('account', 'claim', tokens)
  assert.equal(calls[0].params.p_actor_id, 'actor')
  for (const call of calls.slice(1)) { assert.equal(call.params.p_access_token, tokens.accessToken); assert.equal(call.params.p_refresh_token, tokens.refreshToken) }
  assert.ok(calls.every(call => !/get_any_secret|secret_id/.test(call.name + JSON.stringify(Object.keys(call.params)))))
})
test('PKCE consumed atomically; client Vault ACL private; service_role keeps managed trusted-backend privileges', () => {
  assert.match(sql, /pkce_verifier_secret_id = null[\s\S]*delete from vault.secrets where id = v.pkce_verifier_secret_id/)
  assert.match(sql, /expires_at <= now\(\) or consumed_at is not null/)
  assert.match(sql, /revoke all on schema vault from public, anon, authenticated;/)
  assert.match(sql, /revoke all on table vault.secrets, vault.decrypted_secrets from public, anon, authenticated;/)
  assert.doesNotMatch(sql, /revoke[^;]*\bvault\b[^;]*service_role|granted by supabase_admin|set role supabase_admin/i)
  assert.match(sql, /service_role is the trusted backend role and retains Supabase-managed Vault privileges/)
  assert.match(qa, /for outcome in select unnest\(array\['anon','authenticated'\]\)/)
  assert.doesNotMatch(qa, /array\['anon','authenticated','service_role'\]/)
  assert.match(qa, /QA_F1E_SECRET_RPC_ACL/)
  assert.doesNotMatch(sql, /delete from public.club_(?:finance|payment_intents|payment_provider_events|payment_provider_event_results)/)
  for (const marker of ['VAULT_REFS', 'VAULT_ACL', 'PKCE_DELETED', 'ROTATION', 'DISCONNECT_HISTORY']) assert.ok(qa.includes(`QA_F1E_${marker}`))
})
test('prepare uses v_intent + ci/cp; no PLpgSQL variable shadows an SQL relation alias anywhere in F1E', () => {
  const functions = [...sql.matchAll(/create function public\.(\w+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g)]
  const prepare = functions.find(match => match[1] === 'prepare_club_payment_intent_f1e')?.[2]
  assert.ok(prepare)
  assert.match(prepare, /v_intent public.club_payment_intents%rowtype/)
  assert.match(prepare, /club_payment_intents ci join public.club_finance_payments cp/)
  assert.match(prepare, /cp.id = ci.finance_payment_id/)
  assert.doesNotMatch(prepare, /\bi public.club_payment_intents%rowtype|club_payment_intents (?:as )?i\b/)
  for (const [, name, body] of functions) {
    const declarations = body.match(/\bdeclare\b([\s\S]*?)\bbegin\b/i)?.[1] ?? ''
    const variables = [...declarations.matchAll(/\b(\w+)\s+(?:public\.\w+%rowtype|record|jsonb|text|uuid|numeric|timestamptz)\b/gi)].map(match => match[1])
    const aliases = [...body.matchAll(/\b(?:from|join|update|into)\s+(?:public|vault)\.\w+\s+(?:as\s+)?(\w+)/gi)].map(match => match[1])
    for (const variable of variables) assert.ok(!aliases.includes(variable), `${name}: PLpgSQL ${variable} shadows SQL alias`)
  }
})
test('normal runtime uses VaultProviderSecretStore scoped RPCs, never raw Vault or generic secret getters', () => {
  const vault = source('./paymentProviderVaultF1E.ts')
  const server = source('./paymentProviderServerF1E.ts')
  const allowed = new Set(['start_payment_provider_oauth_f1e','consume_payment_provider_oauth_f1e',
    'complete_payment_provider_oauth_f1e','claim_payment_provider_credentials_f1e',
    'rotate_payment_provider_credentials_f1e','fail_payment_provider_refresh_f1e'])
  const calls = [...vault.matchAll(/'([a-z_]+_f1e)'/g)].map(match => match[1])
  assert.equal(calls.length, allowed.size)
  for (const call of calls) assert.ok(allowed.has(call))
  assert.match(server, /new VaultProviderSecretStore/)
  for (const runtime of [vault, server, source('./paymentProviderF1E.ts'), source('./paymentProviderFlowF1E.ts'), source('./paymentProviderReadsF1E.ts')]) {
    assert.doesNotMatch(runtime, /vault\.decrypted_secrets|\.schema\(['"]vault['"]\)|\.from\(['"](?:secrets|decrypted_secrets)['"]\)|get_any_secret|list_secrets/)
  }
  // Supabase session.access_token is the user's JWT, not a provider OAuth secret.
  for (const client of [player, content, source('../features/finance/PaymentProviderPanel.tsx')])
    assert.doesNotMatch(client, /supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY|VaultProviderSecretStore|\b(?:accessToken|refreshToken|access_token_secret_id|refresh_token_secret_id)\b|(?:provider|tokens)[.]access_token/)
})
test('browser return only reads status; player CTA gated by server options; manual method set unchanged', () => {
  assert.match(player, /Estamos verificando tu pago/)
  assert.doesNotMatch(player, /register_club_finance_payment|[.]rpc\(/)
  assert.match(content, /row.online_payable && onPay/)
  assert.equal(financeMovementMethod({ method: 'OTHER', provider: 'MERCADO_PAGO' }), 'Mercado Pago')
  assert.equal(financeMovementMethod({ method: 'OTHER' }), 'Otro')
})
test('REST adapter sends seller token + zero fee, stable reference and return URL, never a client amount', async () => {
  let body: Record<string, unknown> = {}
  const transport: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.mercadopago.com/checkout/preferences')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer seller-access')
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ id: 'pref', sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=p' }))
  }
  const adapter = new MercadoPagoProvider(config, transport)
  await adapter.createCheckout('seller-access', { reference: payment.external_reference, amount: 80, currency: 'ARS', marketplaceFee: 0,
    expiresAt: '2026-10-06T18:00:00Z', returnUrl: 'https://selpa.test/player/pagos', notificationUrl: 'https://selpa.test/webhook', idempotencyKey: 'intent' })
  assert.equal(body.marketplace_fee, 0)
  assert.equal(body.external_reference, payment.external_reference)
  assert.equal((body.items as Array<{ unit_price: number }>)[0].unit_price, 80)
})

test('actual HTTP handlers fail closed before auth/provider/ledger work with flag OFF or each missing credential', async () => {
  const environments = [{ ...configuredEnv, PAYMENTS_MERCADO_PAGO_ENABLED: 'false' },
    ...['PAYMENTS_PUBLIC_ORIGIN','MERCADO_PAGO_CLIENT_ID','MERCADO_PAGO_CLIENT_SECRET','MERCADO_PAGO_WEBHOOK_SECRET','MERCADO_PAGO_REDIRECT_URI']
      .map(key => ({ ...configuredEnv, [key]: '' }))]
  const routes: Array<[string, string[]]> = [
    ['../app/api/payments/mercado-pago/oauth/start/route.ts', ['POST']],
    ['../app/api/payments/mercado-pago/oauth/callback/route.ts', ['GET']],
    ['../app/api/payments/mercado-pago/webhook/route.ts', ['POST']],
    ['../app/api/player/finance/checkout/route.ts', ['GET','POST']],
    ['../app/api/clubs/finance/provider/route.ts', ['DELETE']],
  ]
  for (const env of environments) for (const [path, handlers] of routes) {
    const exports: Record<string, (request: unknown) => Promise<Response>> = {}
    const unexpected = new Proxy({}, { get() { throw new Error('Disabled route touched auth/provider/ledger') } })
    runInNewContext(ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports, require(name: string) { return name === '@/lib/paymentProviderServerF1E' ? {
        providerRuntime: () => paymentProviderConfig(env),
        providerUnavailable: () => Response.json({ error: 'Los pagos online todavía no están disponibles.' }, { status: 503 }),
      } : unexpected },
    })
    for (const handler of handlers) {
      const result = await exports[handler](unexpected)
      assert.equal(result.status, 503, `${path} ${handler}`)
      const body = await result.json()
      assert.deepEqual(Object.keys(body), ['error'])
      assert.doesNotMatch(body.error, /MERCADO_PAGO_|SECRET|TOKEN|SUPABASE|env/i)
    }
  }
  assert.match(source('./paymentProviderServerF1E.ts'), /const config = paymentProviderConfig\(\)/)
  assert.match(source('./paymentProviderReadsF1E.ts'), /if \(!paymentProviderReady\(\) \|\| rows.length === 0\) return rows/)
})

test('club panel renders unavailable without a connect CTA; enabled has a usable connect action', () => {
  const exports: { ProviderPanelView?: ComponentType<Record<string, unknown>> } = {}
  const require = createRequire(import.meta.url)
  runInNewContext(ts.transpileModule(source('../features/finance/PaymentProviderPanel.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name: string) {
    if (name.endsWith('.module.css')) return { default: {} }
    if (name === '@/lib/clubFinanceF1C') return { formatFinanceMoney: (amount: number) => String(amount) }
    return require(name)
  } })
  assert.ok(exports.ProviderPanelView)
  const props = { canManage: true, busy: false, error: '', note: '', onConnect() {}, onDisconnect() {}, onRefresh() {} }
  const disabled = renderToStaticMarkup(createElement(exports.ProviderPanelView, { ...props,
    data: { enabled: false, status: 'NOT_CONNECTED', reconciliation_required: 0 } }))
  assert.match(disabled, /No disponible/)
  assert.doesNotMatch(disabled, /Conectar Mercado Pago/)
  const enabled = renderToStaticMarkup(createElement(exports.ProviderPanelView, { ...props,
    data: { enabled: true, status: 'NOT_CONNECTED', reconciliation_required: 0 } }))
  assert.match(enabled, /Conectar Mercado Pago/)
})

test('flag OFF and incomplete config leave player reads unchanged, with no payment eligibility RPC or CTA', async () => {
  const keys = Object.keys(configuredEnv), previous = keys.map(key => process.env[key])
  const rows = [{ id: 'obligation', balance: 80 }]
  const client = { async rpc() { throw new Error('Disabled player read called provider RPC') } } as unknown as Parameters<typeof playerPaymentOptions>[0]
  const environments: Array<Record<string, string>> = [{ ...configuredEnv, PAYMENTS_MERCADO_PAGO_ENABLED: 'false' }, { ...configuredEnv, MERCADO_PAGO_CLIENT_SECRET: '' }]
  try {
    for (const env of environments) {
      for (const key of keys) process.env[key] = env[key]
      const result = await playerPaymentOptions(client, rows)
      assert.equal(result, rows)
      assert.ok(result.every(row => !('online_payable' in row)))
    }
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
  }
  assert.match(content, /row.online_payable && onPay/)
})

test('checkout allowlist and callback/return URLs use the configured origin, not localhost or legacy domains', async () => {
  for (const origin of ['https://selpa-preview.example.vercel.app', 'https://selpa.com.ar']) {
    const s = setup()
    s.provider.createCheckout = async (_token, input) => {
      assert.equal(input.returnUrl, `${origin}/player/pagos?paymentReturn=${payment.external_reference}`)
      assert.equal(input.notificationUrl, `${origin}/api/payments/mercado-pago/webhook?account=account`)
      return { id: 'preference', url: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=p', accessToken: 'must-not-leak' }
    }
    const result = await createPaymentCheckout(s.repo, s.store, s.provider, { obligationId: 'obligation', key: 'key', origin })
    assert.deepEqual(Object.keys(result), ['checkoutUrl'])
    assert.ok(!JSON.stringify(result).includes('must-not-leak'))
    assert.ok(paymentProviderConfig({ ...configuredEnv, PAYMENTS_PUBLIC_ORIGIN: origin,
      MERCADO_PAGO_REDIRECT_URI: `${origin}/api/payments/mercado-pago/oauth/callback` }))
  }
  const callback = source('../app/api/payments/mercado-pago/oauth/callback/route.ts')
  assert.match(callback, /new URL\('\/club\/contabilidad', provider.config.origin\)/)
  const getReturn = checkoutRoute.split('export async function GET')[1].split('export async function POST')[0]
  assert.match(getReturn, /get_player_payment_return_f1e/)
  assert.doesNotMatch(getReturn, /reconcile|register_club_finance_payment|createPaymentCheckout|providerRepository/)
  for (const runtime of [callback, source('./paymentProviderFlowF1E.ts')]) assert.doesNotMatch(runtime, /localhost|pamprax/)
})

test('minimal observability logs fixed event codes only, never caught exceptions or credential values', () => {
  const original = console.warn, logs: unknown[][] = []
  try {
    console.warn = (...args: unknown[]) => { logs.push(args) }
    for (const event of ['OAUTH_FAILURE','REFRESH_FAILURE','CHECKOUT_FAILURE','WEBHOOK_INVALID','PROVIDER_API_UNAVAILABLE','RECONCILIATION_REQUIRED'] as const)
      reportPaymentProviderEvent(event)
  } finally { console.warn = original }
  assert.equal(logs.length, 6)
  for (const args of logs) assert.equal(args.length, 2)
  assert.ok(logs.every(args => args[0] === '[finance:F1E]' && /^[A-Z_]+$/.test(String(args[1]))))
  assert.doesNotMatch(JSON.stringify(logs), /private-access|private-refresh|test-client-secret|test-hook-secret/)
  const route = source('../app/api/payments/mercado-pago/webhook/route.ts')
  assert.ok(route.indexOf('verifyWebhook(') < route.indexOf('await req.text()'))
  assert.ok(route.indexOf('verifyWebhook(') < route.indexOf('await processPaymentWebhook('))
})
