import type { SupabaseClient } from '@supabase/supabase-js'

type Individual = { player_id?: string | null; avatar_url?: string | null }
type Pair = { player1_user_id?: string | null; player2_user_id?: string | null; player1_avatar_url?: string | null; player2_avatar_url?: string | null }
const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null

/** Enrich only authorized ranking rows, in one server-side profiles batch. */
export async function enrichCompetitionRankingAvatars<I extends Individual, P extends Pair>(client: SupabaseClient, individual: I[], pairs: P[]) {
  const ids = [...new Set([
    ...individual.map(row => row.player_id),
    ...pairs.flatMap(row => [row.player1_user_id, row.player2_user_id]),
  ].filter((id): id is string => Boolean(id)))]
  if (!ids.length) return { individual, pairs }
  const { data, error } = await client.from('profiles').select('user_id,avatar_url').in('user_id', ids)
  if (error) {
    console.error('[COMPETITION RANKING AVATARS]', { code: error.code })
    return { individual, pairs }
  }
  const avatars = new Map((data ?? []).map(row => [row.user_id, clean(row.avatar_url)]))
  return {
    individual: individual.map(row => ({ ...row, avatar_url: avatars.get(row.player_id ?? '') ?? clean(row.avatar_url) })),
    pairs: pairs.map(row => ({
      ...row,
      player1_avatar_url: avatars.get(row.player1_user_id ?? '') ?? clean(row.player1_avatar_url),
      player2_avatar_url: avatars.get(row.player2_user_id ?? '') ?? clean(row.player2_avatar_url),
    })),
  }
}
