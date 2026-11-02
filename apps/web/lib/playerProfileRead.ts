import { getCurrentSession, supabase } from './supabaseClient'

const retryDelays = [300, 900]

function waitForRetry(delay: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** GET only: wait for the matching session, recover one expired token, and allow
 * two delayed retries for transport/5xx failures. Never retry denied access,
 * another account, or an invalid response contract. Abort also cancels backoff. */
export async function readPlayerProfile<T>(url: string, userId: string, signal: AbortSignal): Promise<T> {
  if (!userId) throw new Error('PROFILE_SESSION_UNAVAILABLE')
  let renewed = false
  let retries = 0
  async function retry(stage: 'session' | 'transport' | 'http', status?: number) {
    if (retries >= retryDelays.length) return false
    // No URL, user IDs, tokens, response bodies or personal data in diagnostics.
    console.warn('[PlayerProfileRead] recovering', { stage, status, attempt: retries + 1 })
    await waitForRetry(retryDelays[retries++], signal)
    return true
  }
  for (;;) {
    signal.throwIfAborted()
    const { data, error } = await getCurrentSession()
    signal.throwIfAborted()
    if (data.session && data.session.user.id !== userId) throw new Error('PROFILE_ACCOUNT_CHANGED')
    if (error) throw new Error('PROFILE_SESSION_UNAVAILABLE')
    if (!data.session?.access_token) {
      if (await retry('session')) continue
      throw new Error('PROFILE_SESSION_UNAVAILABLE')
    }
    let response: Response
    try {
      response = await fetch(url, { cache: 'no-store', signal, headers: { Authorization: `Bearer ${data.session.access_token}` } })
    } catch (error) {
      if (signal.aborted || !(error instanceof TypeError) || !await retry('transport')) throw error
      continue
    }
    if (response.status === 401 && !renewed) {
      renewed = true
      const refresh = await supabase.auth.refreshSession()
      signal.throwIfAborted()
      if (refresh.error || refresh.data.session?.user.id !== userId) throw new Error('PROFILE_SESSION_EXPIRED')
      continue
    }
    if ([500, 502, 503, 504].includes(response.status) && await retry('http', response.status)) continue
    if (!response.ok) throw new Error('PROFILE_READ_UNAVAILABLE')
    return response.json() as Promise<T>
  }
}
