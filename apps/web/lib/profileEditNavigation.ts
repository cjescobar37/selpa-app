export function profileEditReturn(value:string|null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/mi-cuenta'
  const url=new URL(value,'https://selpa.local')
  if (url.origin!=='https://selpa.local' || !(['/mi-cuenta','/mis-datos','/perfil','/player'].includes(url.pathname) || /^\/player\/carrera\/[0-9a-f-]{36}$/.test(url.pathname))) return '/mi-cuenta'
  return url.pathname+url.search
}
