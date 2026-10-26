import { getCurrentSession, supabase } from './supabaseClient'

/** Read-only profile requests. Recover one expired token or transient transport
 * failure; never retry a denied permission or conceal a persistent failure. */
export async function readPlayerProfile<T>(url: string, userId: string, signal: AbortSignal): Promise<T> {
  let renewed = false
  let retried = false
  for (;;) {
    signal.throwIfAborted()
    const { data, error } = await getCurrentSession()
    signal.throwIfAborted()
    if (error || !data.session?.access_token || data.session.user.id !== userId) throw new Error('PROFILE_SESSION_UNAVAILABLE')
    let response: Response
    try {
      response = await fetch(url, { cache: 'no-store', signal, headers: { Authorization: `Bearer ${data.session.access_token}` } })
    } catch (error) {
      if (signal.aborted || retried || !(error instanceof TypeError)) throw error
      retried = true
      continue
    }
    if (response.status === 401 && !renewed) {
      renewed = true
      const refresh = await supabase.auth.refreshSession()
      if (refresh.error || refresh.data.session?.user.id !== userId) throw new Error('PROFILE_SESSION_EXPIRED')
      continue
    }
    if ([502, 503, 504].includes(response.status) && !retried) { retried = true; continue }
    if (!response.ok) throw new Error('PROFILE_READ_UNAVAILABLE')
    return response.json() as Promise<T>
  }
}
