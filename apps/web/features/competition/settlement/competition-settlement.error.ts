type SupabaseCodedError = Error & { code?: string; details?: string; hint?: string; supabaseMessage?: string }

export function classifySettlementInfrastructureError(value: SupabaseCodedError | null) {
  const message = value?.supabaseMessage ?? value?.message ?? ''
  if (value?.code === 'PGRST202') return {
    status: 503,
    body: { error: 'PostgREST no encuentra la firma de la función de settlement en su cache.', code: value.code, detail: message, hint: value.hint },
  }
  if (value?.code?.startsWith('PGRST')) return {
    status: 502,
    body: { error: 'PostgREST rechazó la operación de settlement.', code: value.code, detail: message, details: value.details, hint: value.hint },
  }
  return {
    status: 500,
    body: { error: 'No se pudo gestionar el settlement.', code: value?.code, detail: message, details: value?.details, hint: value?.hint },
  }
}
