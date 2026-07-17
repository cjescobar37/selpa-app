function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function toOrigin(rawOrigin: string) {
  try {
    return new URL(rawOrigin.startsWith('http') ? rawOrigin : `https://${rawOrigin}`).origin
  } catch {
    return null
  }
}

function configuredSiteOrigin() {
  const rawOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    ''

  if (!rawOrigin) return null
  return toOrigin(rawOrigin)
}

export function getAuthOrigin(requestOrigin: string) {
  const configured = configuredSiteOrigin()
  if (configured && (process.env.NODE_ENV !== 'production' || !isLocalOrigin(configured))) return configured

  if (process.env.NODE_ENV !== 'production') return requestOrigin

  const request = toOrigin(requestOrigin)
  if (request && !isLocalOrigin(request)) return request

  throw new Error('Missing a public site origin for auth redirects.')
}

export function buildConfirmEmailRedirectUrl(requestOrigin: string) {
  return new URL('/auth/confirm?next=%2Fauth%2Fpost-login', getAuthOrigin(requestOrigin)).toString()
}
