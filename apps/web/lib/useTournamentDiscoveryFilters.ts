'use client'

import { usePathname, useSearchParams } from 'next/navigation'

/** URL state survives detail → Back, refresh and shared discovery links. */
export function useTournamentDiscoveryFilters() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  function updateFilters(changes: Record<string, string>) {
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all') url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    // Next must copy its own router state; passing __NA bypasses its update.
    const dialogKey = window.history.state?.selpaDialog
    window.history.replaceState(dialogKey ? { selpaDialog: dialogKey } : null, '', url)
  }
  return {
    returnTo: pathname + (searchParams.size ? `?${searchParams}` : ''),
    query: searchParams.get('q') ?? '', category: searchParams.get('categoria') ?? 'all',
    gender: searchParams.get('rama') ?? 'all', club: searchParams.get('club') ?? 'all', updateFilters,
  }
}
