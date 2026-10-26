/** Keep existing own=1 and nested club-selection return URLs intact. */
export function profileEditorHref(href: string, focus: 'avatar' | 'cover' | 'details') {
  const url = new URL(href, 'https://selpa.local')
  const next = url.pathname === '/seleccionar-club' ? url.searchParams.get('next') : null
  if (next) url.searchParams.set('next', profileEditorHref(next, focus))
  else url.searchParams.set('focus', focus)
  return `${url.pathname}${url.search}${url.hash}`
}
