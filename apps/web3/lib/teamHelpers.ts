import { supabase } from '@/lib/supabaseClient'

export type ResolvedPlayer = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}

export function playerName(p: ResolvedPlayer | null | undefined): string {
  if (!p) return 'Jugador'
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || 'Jugador'
}

/**
 * Given a list of user_ids, fetch profiles and return a map userId -> ResolvedPlayer
 */
export async function resolveProfiles(userIds: string[]): Promise<Record<string, ResolvedPlayer>> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return {}

  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name, first_name, last_name, email')
    .in('user_id', unique)

  const map: Record<string, ResolvedPlayer> = {}
  for (const p of (data ?? []) as any[]) {
    map[p.user_id] = {
      user_id: p.user_id,
      display_name: p.display_name ?? null,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      email: p.email ?? null,
    }
  }
  return map
}
