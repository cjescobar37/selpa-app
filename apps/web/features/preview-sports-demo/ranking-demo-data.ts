import 'server-only'
import fixture from './ranking-qa-fixture.json'
import { DEMO_CLUB, DEMO_SEASON, demoRanking } from './demo-data'
import { rankingContext, rankingSearchParams, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import type { RankingContext, SportsStanding } from '@/features/player-career/player-career.types'
import type { PairRankingRow } from '@/components/ranking/PairRankingBoard'
import type { PublicRankingExperienceProps } from '@/components/public/PublicRankingExperience'

/** Server deployment environment, never a search parameter or browser flag. */
export function rankingDemoEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.VERCEL_ENV === 'preview'
}
const id = (n: number) => 'de000000-0000-4000-8000-' + String(n).padStart(12, '0')
const photo = (name?: string) => name ? '/mock/' + name : null
const identity = (name: string) => id(10000 + [...new Set(fixture.pairs.flatMap(p => p.players.map(player => player.name)))].indexOf(name))
const women = demoRanking({ gender: 'F', modality: 'INDIVIDUAL' })
const womenPairs = demoRanking({ gender: 'F', modality: 'PAIRS' }).pairs
const contexts: RankingContext[] = [
  { modality: 'PAIRS', gender: 'M', category: 6, segmentId: id(35), segmentName: 'Libres', rankedCount: fixture.pairs.length },
  { modality: 'PAIRS', gender: 'M', category: 6, rankedCount: 0 },
  { modality: 'INDIVIDUAL', gender: 'M', category: 6, rankedCount: fixture.individual.length },
  { modality: 'INDIVIDUAL', gender: 'M', category: 7, rankedCount: 0 },
  { modality: 'PAIRS', gender: 'F', category: 6, rankedCount: womenPairs.length },
  { modality: 'INDIVIDUAL', gender: 'F', category: 6, rankedCount: women.ranking.rows.length },
  { modality: 'PAIRS', gender: 'MIXED', category: 6, segmentId: id(35), segmentName: 'Libres', rankedCount: 1 },
].map((c, index) => ({ clubId: DEMO_CLUB, seasonId: DEMO_SEASON, seasonName: 'Temporada 2026 · DEMO',
  divisionId: id(100 + index), categoryName: c.category + 'ª categoría', ...c }))

/** Frozen C-proposal fixtures + the existing historical Damas and mixed QA fixture.
 * No sports repository, SDK, auth, SQL, financial fields or real club IDs. */
export function rankingDemoState(input: Record<string, unknown>): PublicRankingExperienceProps {
  const safe = rankingSearchParams(input)
  const modality = safe.modality === 'PAIRS' ? 'PAIRS' : 'INDIVIDUAL'
  const gender = safe.gender === 'F' || safe.gender === 'MIXED' ? safe.gender : 'M'
  const request: RankingSearch = { ...safe, gender, modality }
  const context = rankingContext(contexts, request, modality)
  const query = (safe.q ?? '').trim().slice(0, 80)
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR')
  let rows: SportsStanding[] = [], pairs: PairRankingRow[] = []
  if (context?.category === 6 && gender === 'M' && modality === 'INDIVIDUAL') {
    rows = fixture.individual.map((player, index) => ({
      club_player_id: id(20000 + index), club_id: DEMO_CLUB, user_id: identity(player.name), player_entry_id: id(30000 + index),
      full_name: player.name, avatar_url: photo(player.photo), category: 6, category_name: context.categoryName,
      gender, season_id: DEMO_SEASON, season_name: context.seasonName, division_id: context.divisionId, modality,
      ranking_points: player.points, position: player.position, is_tied: false, ordinal: index + 1,
    }))
  }
  if (context?.category === 6 && gender === 'M' && modality === 'PAIRS' && context.segmentId) {
    pairs = fixture.pairs.map((pair, index) => ({ partnership_id: id(40000 + index), position: pair.position,
      player1_user_id: identity(pair.players[0].name), player2_user_id: identity(pair.players[1].name),
      player1_name: pair.players[0].name, player2_name: pair.players[1].name,
      player1_avatar_url: photo(pair.players[0].photo), player2_avatar_url: photo(pair.players[1].photo),
      player1_points: 0, player2_points: 0, combined_points: pair.total, category: 6, gender,
    }))
  }
  if (context && gender === 'F') {
    if (modality === 'PAIRS') pairs = womenPairs
    else rows = women.ranking.rows.map(row => ({ ...row, division_id: context.divisionId, season_name: context.seasonName }))
  }
  if (context && gender === 'MIXED' && modality === 'PAIRS') {
    // Existing addPremiumRankingFixture: Jugador 20 + Victoria, combined_points=100.
    pairs = [{ partnership_id: id(40100), position: 1, player1_user_id: id(1020), player2_user_id: id(21001),
      player1_name: 'Jugador 20', player2_name: 'Victoria · apellido largo para prueba mobile',
      player1_avatar_url: null, player2_avatar_url: null, player1_points: 0, player2_points: 0, combined_points: 100, category: 6, gender }]
  }
  const needle = normalize(query)
  rows = rows.filter(row => normalize(row.full_name).includes(needle))
  pairs = pairs.filter(pair => normalize(pair.player1_name + ' ' + pair.player2_name).includes(needle))
  const total = modality === 'PAIRS' ? pairs.length : rows.length
  const page = Math.max(1, Math.min(1000, Math.floor(Number(safe.page) || 1))), pageSize = 25
  return {
    clubs: [{ id: DEMO_CLUB, name: 'Club SELPA', logo_url: '/brand/selpa-isotipo.png', theme_key: null }], clubsCount: 1,
    contexts, ranking: { rows: rows.slice((page - 1) * pageSize, page * pageSize), count: rows.length, page, pageSize, context },
    pairs: pairs.slice((page - 1) * pageSize, page * pageSize), total,
    params: { demo: '1', clubId: DEMO_CLUB, season: DEMO_SEASON, gender, modality,
      ...(context ? { division: context.divisionId, category: String(context.category) } : {}),
      ...(query ? { q: query } : {}), ...(page > 1 ? { page: String(page) } : {}) },
    seasons: [{ id: DEMO_SEASON, name: 'Temporada 2026 · DEMO' }], enabledBranches: ['M', 'F', 'MIXED'],
    error: null, presentation: { counts: { M: modality === 'PAIRS' ? fixture.pairs.length : fixture.individual.length,
      F: modality === 'PAIRS' ? womenPairs.length : women.ranking.rows.length },
      leaderPoints: modality === 'PAIRS' ? pairs[0]?.combined_points ?? null : rows[0]?.ranking_points ?? null },
    demo: true, demoReadOnly: true,
  }
}
