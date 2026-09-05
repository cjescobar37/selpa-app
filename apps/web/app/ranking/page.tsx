import PublicRankingExperience, { type PublicRankingPlayer } from '@/components/public/PublicRankingExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { BRAND } from '@/lib/branding'

export const dynamic = 'force-dynamic'

type ClubPlayerRow = {
  id: string
  club_id: string
  user_id: string | null
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
}

type ClubRow = {
  id: string
  name: string
  logo_url: string | null
  theme_key: string | null
}

type ProfileRow = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

type PairProjectionRow = {
  club_id: string
  player1_user_id: string
  player2_user_id: string
  pair_key: string
  total_points: number
}

function displayName(player: ClubPlayerRow, profile?: ProfileRow | null) {
  const fullName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  return fullName || profile?.display_name || player.display_name || `Jugador ${BRAND.name}`
}

export default async function RankingPublicPage({
  searchParams,
}: {
  searchParams?: Promise<{ clubId?: string; club?: string; category?: string }>
}) {
  const params = await searchParams
  const initialClubId = params?.clubId ?? params?.club ?? null
  const initialCategory = params?.category ?? null
  const { data: playersData } = await supabaseAdmin
    .from('club_players')
    .select('id,club_id,user_id,display_name,category,gender,ranking_points,approved_at')
    .not('approved_at', 'is', null)
    .order('ranking_points', { ascending: false, nullsFirst: false })
    .limit(240)

  const players = (playersData ?? []) as ClubPlayerRow[]
  const clubIds = Array.from(new Set(players.map((player) => player.club_id).filter(Boolean)))
  const userIds = Array.from(new Set(players.map((player) => player.user_id).filter(Boolean))) as string[]

  const [{ data: clubRows }, { data: profileRows }] = await Promise.all([
    clubIds.length ? supabaseAdmin.from('clubs').select('id,name,logo_url,theme_key').in('id', clubIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabaseAdmin.from('profiles').select('user_id,display_name,first_name,last_name,avatar_url').in('user_id', userIds) : Promise.resolve({ data: [] }),
  ])

  const clubsById = new Map(((clubRows ?? []) as ClubRow[]).map((club) => [club.id, club]))
  const profilesByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
  const playersByUser = new Map(players.filter((player) => player.user_id).map((player) => [player.user_id as string, player]))

  const publicPlayers: PublicRankingPlayer[] = players.map((player) => {
    const club = clubsById.get(player.club_id)
    const profile = player.user_id ? profilesByUser.get(player.user_id) : null
    return {
      id: player.id,
      clubId: player.club_id,
      clubName: club?.name ?? `Club ${BRAND.name}`,
      clubLogoUrl: club?.logo_url ?? null,
      clubThemeKey: club?.theme_key ?? null,
      name: displayName(player, profile),
      avatarUrl: profile?.avatar_url ?? null,
      category: player.category,
      gender: player.gender,
      points: Number(player.ranking_points ?? 0),
    }
  })

  const clubs = Array.from(new Set(publicPlayers.map((player) => player.clubName))).sort((a, b) => a.localeCompare(b))

  const { data: projectionData, error: projectionError } = clubIds.length
    ? await supabaseAdmin.from('competition_pair_ranking_projection').select('club_id,player1_user_id,player2_user_id,pair_key,total_points').in('club_id', clubIds)
    : { data: [], error: null }

  const publicPairs = projectionError ? [] : ((projectionData ?? []) as PairProjectionRow[])
    .map((pair) => {
      const player1 = playersByUser.get(pair.player1_user_id)
      const player2 = playersByUser.get(pair.player2_user_id)
      if (!player1 || !player2 || player1.club_id !== pair.club_id || player2.club_id !== pair.club_id) return null
      const profile1 = profilesByUser.get(pair.player1_user_id)
      const profile2 = profilesByUser.get(pair.player2_user_id)
      return {
        partnership_id: pair.pair_key,
        player1_user_id: '',
        player2_user_id: '',
        player1_name: displayName(player1, profile1),
        player2_name: displayName(player2, profile2),
        player1_avatar_url: profile1?.avatar_url ?? null,
        player2_avatar_url: profile2?.avatar_url ?? null,
        player1_points: Number(pair.total_points),
        player2_points: Number(pair.total_points),
        combined_points: Number(pair.total_points),
        category: player1.category,
        gender: player1.gender,
        clubId: pair.club_id,
      }
    })
    .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
    .sort((a, b) => a.clubId.localeCompare(b.clubId) || b.combined_points - a.combined_points || a.partnership_id.localeCompare(b.partnership_id))
    .map((pair, index, all) => {
      const prior = all.slice(0, index).filter((item) => item.clubId === pair.clubId)
      const priorSameIndex = prior.findIndex((item) => item.combined_points === pair.combined_points)
      return { ...pair, position: priorSameIndex >= 0 ? priorSameIndex + 1 : prior.length + 1 }
    })

  return (
    <div className="px-wrap px-publicFrame">
      <PublicRankingExperience players={publicPlayers} pairs={publicPairs} clubs={clubs} initialClubId={initialClubId} initialCategory={initialCategory} />
    </div>
  )
}
