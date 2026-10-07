import type { SupabaseClient } from '@supabase/supabase-js'
import { paymentProviderReady } from './paymentProviderF1E'

export async function playerPaymentOptions<T extends { id: string }>(client: SupabaseClient, rows: T[]) {
  if (!paymentProviderReady() || rows.length === 0) return rows
  const result = await client.rpc('get_player_payment_options_f1e', { p_ids: rows.map(row => row.id) })
  if (result.error) throw new Error('PAYMENT_OPTIONS_UNAVAILABLE')
  const options = new Map<string, { payable: boolean; status: string | null }>((result.data ?? []).map((row: { item: { id: string; payable: boolean; status: string | null } }) => [row.item.id, row.item]))
  return rows.map(row => ({ ...row, online_payable: options.get(row.id)?.payable === true,
    payment_status: options.get(row.id)?.status ?? null }))
}
export async function paymentMovementLabels<T extends { id: string }>(client: SupabaseClient, clubId: string | null, rows: T[]) {
  if (!paymentProviderReady() || rows.length === 0) return rows
  const result = await client.rpc('get_payment_movement_labels_f1e', { p_club_id: clubId, p_ids: rows.map(row => row.id) })
  if (result.error) throw new Error('PAYMENT_MOVEMENT_LABELS_UNAVAILABLE')
  const ids = new Set<string>((result.data ?? []).map((row: { item: { id: string } }) => row.item.id))
  return rows.map(row => ids.has(row.id) ? { ...row, provider: 'MERCADO_PAGO' as const } : row)
}
