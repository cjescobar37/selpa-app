import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCompetitionPointsSource, getLedgerPointsByEntry } from '@/features/competition/points/competition-points.service'
import type { CompetitionRankingBasePlayer, CompetitionRankingResult } from './competition-ranking.types'

type DivisionRow = { id: string; branch_id: string; category_id: string | null }
type BranchRow = { id: string; slug: string }
type CategoryRow = { id: string; legacy_category_id: number | null; name: string }
type EntryRow = { id: string; club_player_id: string; division_id: string }
type PlayerRow = { id: string; user_id: string; display_name: string | null; ranking_points: number | null; approved_at: string | null }
type ProfileRow = { user_id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }

function fullName(profile: ProfileRow | undefined, fallback: string | null) {
  return profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || fallback || 'Jugador'
}

export async function readCompetitionRanking(clubId: string): Promise<CompetitionRankingResult> {
  const { data: seasons, error: seasonError } = await supabaseAdmin.from('competition_seasons')
    .select('id').eq('club_id', clubId).eq('status', 'ACTIVE').order('id').limit(2)
  if (seasonError) throw new Error('No pude leer la temporada competitiva.')
  if (!seasons?.length) throw new Error('El club no tiene una temporada competitiva activa.')
  if (seasons.length > 1) throw new Error('El club tiene más de una temporada competitiva activa.')
  const seasonId = String(seasons[0].id)

  const { data: divisionsData, error: divisionsError } = await supabaseAdmin.from('competition_divisions')
    .select('id,branch_id,category_id').eq('club_id', clubId).eq('season_id', seasonId)
    .eq('modality', 'INDIVIDUAL').eq('is_active', true).is('segment_id', null)
  if (divisionsError) throw new Error('No pude leer las divisiones competitivas.')
  const divisions = (divisionsData ?? []) as DivisionRow[]
  const divisionIds = divisions.map((row) => row.id)
  if (!divisionIds.length) return { seasonId, players: [], categories: [] }

  const branchIds = [...new Set(divisions.map((row) => row.branch_id))]
  const categoryIds = [...new Set(divisions.map((row) => row.category_id).filter((id): id is string => Boolean(id)))]
  const [{ data: branchesData, error: branchesError }, { data: categoriesData, error: categoriesError }, { data: entriesData, error: entriesError }] = await Promise.all([
    supabaseAdmin.from('competition_branches').select('id,slug').eq('club_id', clubId).in('id', branchIds),
    supabaseAdmin.from('competition_categories').select('id,legacy_category_id,name').eq('club_id', clubId).in('id', categoryIds),
    supabaseAdmin.from('competition_player_entries').select('id,club_player_id,division_id').eq('club_id', clubId).eq('status', 'ACTIVE').is('valid_until', null).in('division_id', divisionIds),
  ])
  if (branchesError) throw new Error('No pude leer las ramas competitivas.')
  if (categoriesError) throw new Error('No pude leer las categorías competitivas.')
  if (entriesError) throw new Error('No pude leer las asignaciones competitivas.')

  const branches = new Map(((branchesData ?? []) as BranchRow[]).map((row) => [row.id, row]))
  const categories = new Map(((categoriesData ?? []) as CategoryRow[]).map((row) => [row.id, row]))
  const divisionById = new Map(divisions.map((row) => [row.id, row]))
  const entries = (entriesData ?? []) as EntryRow[]
  const playerIds = [...new Set(entries.map((row) => row.club_player_id))]
  if (!playerIds.length) return { seasonId, players: [], categories: [] }

  const { data: playersData, error: playersError } = await supabaseAdmin.from('club_players')
    // Stage 3 migrates membership and divisions first; points remain legacy until the ledger exists.
    .select('id,user_id,display_name,ranking_points,approved_at').eq('club_id', clubId)
    .not('approved_at', 'is', null).in('id', playerIds)
  if (playersError) throw new Error('No pude leer los jugadores competitivos.')
  const players = (playersData ?? []) as PlayerRow[]
  if (!players.length) return { seasonId, players: [], categories: [] }
  const userIds = [...new Set(players.map((row) => row.user_id))]
  const { data: profilesData, error: profilesError } = await supabaseAdmin.from('profiles')
    .select('user_id,display_name,first_name,last_name,avatar_url').in('user_id', userIds)
  if (profilesError) throw new Error('No pude leer los perfiles competitivos.')
  const profiles = new Map(((profilesData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]))
  const playersById = new Map(players.map((row) => [row.id, row]))
  const pointsSource = getCompetitionPointsSource()
  const ledgerPoints = pointsSource === 'ledger' ? await getLedgerPointsByEntry(clubId, seasonId) : null
  const seen = new Set<string>()
  const result: CompetitionRankingBasePlayer[] = []

  for (const entry of [...entries].sort((a, b) => a.division_id.localeCompare(b.division_id) || a.club_player_id.localeCompare(b.club_player_id))) {
    if (seen.has(entry.club_player_id)) throw new Error(`El jugador ${entry.club_player_id} tiene más de una asignación individual sin segmento en la temporada activa.`)
    const division = divisionById.get(entry.division_id)
    const player = playersById.get(entry.club_player_id)
    const branch = division ? branches.get(division.branch_id) : undefined
    const category = division?.category_id ? categories.get(division.category_id) : undefined
    const gender = branch?.slug === 'caballeros' ? 'M' : branch?.slug === 'damas' ? 'F' : null
    if (!division || !player || !gender || !category?.legacy_category_id || category.legacy_category_id < 1 || category.legacy_category_id > 7) continue
    const legacyPoints = Number.isFinite(player.ranking_points ?? NaN) ? Number(player.ranking_points) : 0
    const points = pointsSource === 'ledger' ? ledgerPoints?.get(entry.id) : legacyPoints
    if (points === undefined) throw new Error(`El ledger no devolvió la entrada competitiva ${entry.id}.`)
    seen.add(entry.club_player_id)
    result.push({
      playerEntryId: entry.id,
      playerId: player.id, userId: player.user_id, fullName: fullName(profiles.get(player.user_id), player.display_name),
      avatarUrl: profiles.get(player.user_id)?.avatar_url ?? null, category: category.legacy_category_id,
      categoryName: category.name, gender, points,
      approvedAt: player.approved_at, divisionId: division.id,
    })
  }

  const usedCategories = new Map(result.map((row) => [row.category, { id: row.category, name: row.categoryName }]))
  return { seasonId, players: result, categories: [...usedCategories.values()].sort((a, b) => a.id - b.id) }
}
