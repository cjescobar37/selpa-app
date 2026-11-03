const discoveryPaths = new Set(['/torneos', '/torneos/calendario', '/player/torneos', '/player/torneos/explorar', '/player/torneos/calendario'])

/** Only tournament discovery routes can be used as a return destination. */
export function tournamentReturnTo(value?: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/torneos'
  try {
    const url = new URL(value, 'https://selpa.local')
    if (url.origin !== 'https://selpa.local' || !discoveryPaths.has(url.pathname)) return '/torneos'
    const filters = new URLSearchParams()
    for (const key of ['q', 'categoria', 'rama', 'club']) {
      const filter = url.searchParams.get(key)
      if (filter) filters.set(key, filter)
    }
    return url.pathname + (filters.size ? `?${filters}` : '')
  } catch {
    return '/torneos'
  }
}

export function tournamentDetailHref(id: string, returnTo?: string) {
  const path = `/torneos/${encodeURIComponent(id)}`
  return returnTo ? `${path}?${new URLSearchParams({ returnTo: tournamentReturnTo(returnTo) })}` : path
}
