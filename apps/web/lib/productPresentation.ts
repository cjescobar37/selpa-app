/** Keep user-facing copy human; technical diagnostics belong only on the server. */
export function humanizeUiError(value: unknown, fallback = 'No pudimos completar esta acción. Intentá nuevamente.') {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const message = value.trim()
  if (/invalid login credentials/i.test(message)) return 'El email o la contraseña no son correctos.'
  if (/email not confirmed/i.test(message)) return 'Confirmá tu email antes de ingresar.'
  if (/rate limit|too many requests/i.test(message)) return 'Hubo demasiados intentos. Esperá unos minutos y volvé a intentar.'
  if (/auth session missing|jwt expired|invalid refresh token/i.test(message)) return 'La sesión expiró. Volvé a iniciar sesión.'
  if (/same password/i.test(message)) return 'Elegí una contraseña distinta de la anterior.'
  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)) return 'No pudimos conectar. Revisá tu conexión y reintentá.'
  if (/\b(?:TypeError|ReferenceError|SyntaxError)\b|\n\s+at\s/i.test(message)) return fallback
  if (/invalid input syntax|violates .*constraint|\b(?:22P02|22007|22008|23502|23503|23514|57014|08006|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/i.test(message)) return fallback
  if (/PGRST\d+|\bSQLSTATE\b|\b(?:42P01|42883|42501|23505|40001)\b|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|schema cache|permission denied|relation .* does not exist|column .* does not exist|function .* does not exist|(?:access_token|refresh_token|authorization|stack trace)\b/i.test(message)) return fallback
  return message.slice(0, 240)
}

export function publicRankingGender(value: unknown): 'M' | 'F' | 'all' {
  if (value === 'F' || value === 'FEMALE' || value === 'damas') return 'F'
  if (value === 'M' || value === 'MALE' || value === 'caballeros') return 'M'
  return 'all'
}

export const clubRequestRequiredLabels = {
  club_name: 'Nombre del club', email: 'Email de contacto', city: 'Ciudad', province: 'Provincia',
  admin_name: 'Nombre del administrador', admin_email: 'Email del administrador',
} as const
