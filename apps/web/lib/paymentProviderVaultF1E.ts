// Server-only, account/state-scoped Vault boundary. No generic get(secret UUID).
import type { CredentialClaim, OAuthTokens, ProviderSecretStore } from './paymentProviderF1E'

export type VaultRpc = <T>(name: string, params?: Record<string, unknown>) => Promise<T>
export class VaultProviderSecretStore implements ProviderSecretStore {
  private rpc: VaultRpc
  constructor(rpc: VaultRpc) { this.rpc = rpc }
  startOAuth(clubId: string, actorId: string, stateHash: string, bindingHash: string, verifier: string) {
    return this.rpc<void>('start_payment_provider_oauth_f1e', {
      p_club_id: clubId, p_actor_id: actorId, p_state_hash: stateHash, p_binding_hash: bindingHash, p_verifier: verifier,
    })
  }
  consumeOAuth(stateHash: string, bindingHash: string) {
    return this.rpc<{ club_id: string; verifier: string }>('consume_payment_provider_oauth_f1e', {
      p_state_hash: stateHash, p_binding_hash: bindingHash,
    })
  }
  completeOAuth(stateHash: string, tokens: OAuthTokens) {
    return this.rpc<void>('complete_payment_provider_oauth_f1e', { p_state_hash: stateHash, ...this.tokenParams(tokens) })
  }
  claimCredentials(accountId: string, claim: string, purpose: 'CHECKOUT' | 'WEBHOOK') {
    return this.rpc<CredentialClaim>('claim_payment_provider_credentials_f1e', { p_account_id: accountId, p_claim: claim, p_purpose: purpose })
  }
  rotateCredentials(accountId: string, claim: string, tokens: OAuthTokens) {
    return this.rpc<void>('rotate_payment_provider_credentials_f1e', { p_account_id: accountId, p_claim: claim, ...this.tokenParams(tokens) })
  }
  failRefresh(accountId: string, claim: string, definitive: boolean, uncertain: boolean) {
    return this.rpc<void>('fail_payment_provider_refresh_f1e', {
      p_account_id: accountId, p_claim: claim, p_definitive: definitive, p_uncertain: uncertain,
    })
  }
  private tokenParams(tokens: OAuthTokens) {
    return { p_provider_account_id: tokens.accountId, p_access_token: tokens.accessToken, p_refresh_token: tokens.refreshToken,
      p_token_expires_at: new Date(tokens.expiresAt).toISOString(), p_live_mode: tokens.liveMode }
  }
}
