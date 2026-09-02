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

  return (
    <div className="px-wrap px-publicFrame">
      <PublicRankingExperience players={publicPlayers} clubs={clubs} initialClubId={initialClubId} initialCategory={initialCategory} />
    </div>
  )
}
