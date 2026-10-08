// Tab-scoped recovery. Stores command data only, never tokens/cookies/credentials.
// An unknown response is not permission to start a different financial command.
export type WriteIntent = { scope: string; key: string; payload: Record<string, unknown> }
export interface IntentStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function readWriteIntent(storage: IntentStorage, scope: string): WriteIntent | null {
  const raw = storage.getItem(scope)
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (value?.scope !== scope || typeof value.key !== 'string' || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) throw new Error()
    return value as WriteIntent
  } catch { throw new Error('No pudimos recuperar el intento anterior. Verificá los movimientos antes de volver a operar.') }
}

export function prepareWriteIntent(storage: IntentStorage, scope: string, payload: Record<string, unknown>, key: string): WriteIntent {
  const previous = readWriteIntent(storage, scope)
  if (previous) {
    if (JSON.stringify(previous.payload) !== JSON.stringify(payload)) {
      throw new Error('Hay una operación pendiente de confirmar. Reintentá ese mismo intento antes de registrar otro.')
    }
    return previous
  }
  const intent = { scope, key, payload }
  // If persistence is unavailable, stop before dispatching an economic write.
  try { storage.setItem(scope, JSON.stringify(intent)) }
  catch { throw new Error('No pudimos conservar este intento. Habilitá el almacenamiento de esta pestaña antes de registrar el cobro.') }
  return intent
}

export class ConfirmedWriteRejection extends Error {}
