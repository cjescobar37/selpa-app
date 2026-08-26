import { notFound } from 'next/navigation'
import PublicClubHomeExperience, {
  type PublicClubCampaign,
  type PublicClubNews,
  type PublicClubRankingSummary,
  type PublicClubTournament,
} from '@/components/public/PublicClubHomeExperience'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { BRAND } from '@/lib/branding'
import { getTournamentCircuitContexts } from '@/features/competition/events/competition-events.repository'

export const dynamic = 'force-dynamic'

type ClubRow = {
  id: string
  name: string
  city: string | null
  province: string | null
  country: string | null
  logo_url: string | null
  theme_key: string | null
  is_active: boolean | null
}

type ClubPlayerRow = {
  id: string
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  approved_at: string | null
}

type CampaignRow = {
  id: string
  slot_id: string
  title: string
  description: string | null
  image_url: string | null
  target_url: string | null
  render_config?: unknown
  status: string
  starts_at: string | null
  ends_at: string | null
  placements?: Array<{ placement_key?: string | null }> | null
  sponsor?: { name?: string | null } | Array<{ name?: string | null }> | null
}

type ClubNewsRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_url: string | null
  metadata: {
    featured_rank?: number | null
  } | null
  published_at: string | null
  created_at: string | null
}

const publicSponsorSlots = ['CLUB_HOME_HERO', 'CLUB_HOME_AFTER_TOURNAMENTS', 'CLUB_HOME_AFTER_NEWS']

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'M' || normalized === 'MALE') return 'Masculino'
  if (normalized === 'F' || normalized === 'FEMALE') return 'Femenino'
  if (normalized.includes('MIX')) return 'Mixto'
  return 'Rama abierta'
}

function categoryLabel(value?: number | null) {
  return value ? `${value}ta` : 'Categoría abierta'
}

function playerName(player: ClubPlayerRow) {
  return player.display_name || `Jugador ${BRAND.name}`
}

function isVisibleCampaign(row: CampaignRow, now: number) {
  if (!['active', 'scheduled'].includes(String(row.status ?? '').toLowerCase())) return false
  const starts = row.starts_at ? new Date(row.starts_at).getTime() : null
  const ends = row.ends_at ? new Date(row.ends_at).getTime() : null
  if (starts && Number.isFinite(starts) && starts > now) return false
  if (ends && Number.isFinite(ends) && ends < now) return false
  return true
}

function isFinished(status?: string | null) {
  const normalized = String(status ?? '').toUpperCase()
  return ['FINISHED', 'COMPLETED', 'CLOSED', 'ARCHIVED'].includes(normalized)
}

function tournamentSortDate(tournament: { startDate?: string | null; registrationDeadline?: string | null }) {
  return new Date(tournament.startDate ?? tournament.registrationDeadline ?? '2999-12-31').getTime()
}

function toPublicCampaign(row: CampaignRow, slotId = row.slot_id): PublicClubCampaign {
  const sponsor = Array.isArray(row.sponsor) ? row.sponsor[0] : row.sponsor
  return {
    id: row.id,
    slotId,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    targetUrl: row.target_url,
    renderConfig: row.render_config,
    sponsorName: sponsor?.name ?? null,
  }
}

function buildRankingSummary(players: ClubPlayerRow[]): PublicClubRankingSummary[] {
  const groups = new Map<string, PublicClubRankingSummary>()

  for (const player of players) {
    const gender = normalizeGender(player.gender)
    const label = categoryLabel(player.category)
    const key = `${label}:${gender}`
    const points = Number(player.ranking_points ?? 0)
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        key,
        label,
        gender,
        players: 1,
        leaderName: playerName(player),
        leaderPoints: points,
      })
      continue
    }

    current.players += 1
    if (points > current.leaderPoints) {
      current.leaderName = playerName(player)
      current.leaderPoints = points
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.players - a.players || b.leaderPoints - a.leaderPoints || a.label.localeCompare(b.label))
    .slice(0, 6)
}

export default async function PublicClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params

  const { data: clubData } = await supabaseAdmin
    .from('clubs')
    .select('id,name,city,province,country,logo_url,theme_key,is_active')
    .eq('id', clubId)
    .maybeSingle()

  const club = clubData as ClubRow | null
  if (!club || club.is_active === false) notFound()

  const [{ data: playerRows }, { data: tournamentRows }] = await Promise.all([
    supabaseAdmin
      .from('club_players')
      .select('id,display_name,category,gender,ranking_points,approved_at')
      .eq('club_id', clubId)
      .not('approved_at', 'is', null)
      .order('ranking_points', { ascending: false, nullsFirst: false }),
    supabaseAdmin
      .from('tournaments')
      .select(TOURNAMENT_SELECT)
      .eq('club_id', clubId)
      .not('status', 'in', '("DRAFT","CANCELLED","ARCHIVED")')
      .order('starts_on', { ascending: true, nullsFirst: false })
      .order('start_date', { ascending: true, nullsFirst: false })
      .limit(96),
  ])

  const players = ((playerRows ?? []) as ClubPlayerRow[])
  const tournamentViews = (tournamentRows ?? [])
    .map((row) => toTournamentView(row))
    .filter((item): item is TournamentView => Boolean(item))
  const tournamentIds = tournamentViews.map((item) => item.id).filter(Boolean)
  const [registrationResult, circuitContexts] = await Promise.all([
    tournamentIds.length
      ? supabaseAdmin
        .from('tournament_registrations')
        .select('tournament_id,status')
        .in('tournament_id', tournamentIds)
      : Promise.resolve({ data: [] }),
    getTournamentCircuitContexts(supabaseAdmin, clubId, tournamentIds),
  ])
  const registrationRows = registrationResult.data
  const registrationsByTournamentId = new Map<string, number>()
  for (const row of (registrationRows ?? []) as Array<{ tournament_id: string | null; status: string | null }>) {
    if (!row.tournament_id || String(row.status ?? '').toUpperCase() === 'CANCELLED') continue
    registrationsByTournamentId.set(row.tournament_id, (registrationsByTournamentId.get(row.tournament_id) ?? 0) + 1)
  }
  const tournaments: PublicClubTournament[] = tournamentViews
    .filter((item) => {
      if (isFinished(item.status)) return false
      const status = getTournamentDisplayStatus(item).key
      return status === 'live' || status === 'registration_open' || status === 'upcoming'
    })
    .sort((a, b) => {
      const statusA = getTournamentDisplayStatus(a)
      const statusB = getTournamentDisplayStatus(b)
      const byStatus = statusA.priority - statusB.priority
      if (byStatus !== 0) return byStatus
      return tournamentSortDate(a) - tournamentSortDate(b)
    })
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      type: item.type,
      gender: item.gender,
      segment: item.segment,
      category: item.category,
      startDate: item.startDate,
      endDate: item.endDate,
      registrationDeadline: item.registrationDeadline,
      pricePerPlayer: item.pricePerPlayer,
      maxPairs: item.maxPairs,
      registeredPairs: registrationsByTournamentId.get(item.id) ?? 0,
      rules: item.rules,
      circuit: circuitContexts[item.id] ?? null,
    }))

  let campaignRows: CampaignRow[] = []
  let clubNews: PublicClubNews[] = []
  const [{ data: campaignsData, error: campaignsError }, { data: newsData, error: newsError }] = await Promise.all([
    supabaseAdmin
      .from('club_ad_campaigns')
      .select('id,slot_id,title,description,image_url,target_url,render_config,status,starts_at,ends_at,sponsor:club_sponsors(name),placements:club_ad_campaign_placements(placement_key)')
      .eq('club_id', clubId)
      .in('slot_id', publicSponsorSlots)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('platform_news')
      .select('id,slug,title,excerpt,cover_url,metadata,published_at,created_at')
      .eq('club_id', clubId)
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(24),
  ])

  if (!campaignsError) campaignRows = (campaignsData ?? []) as CampaignRow[]
  if (!newsError) {
    clubNews = ((newsData ?? []) as ClubNewsRow[])
      .sort((a, b) => {
        const rankA = Number(a.metadata?.featured_rank ?? 99)
        const rankB = Number(b.metadata?.featured_rank ?? 99)
        if (rankA !== rankB) return rankA - rankB
        return new Date(b.published_at ?? b.created_at ?? 0).getTime() - new Date(a.published_at ?? a.created_at ?? 0).getTime()
      })
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        excerpt: item.excerpt,
        coverUrl: item.cover_url,
        featuredRank: item.metadata?.featured_rank ?? null,
        publishedAt: item.published_at ?? item.created_at,
      }))
  }

  // Server render time is intentionally captured once to evaluate campaign vigency.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const campaignsBySlot = publicSponsorSlots.reduce<Record<string, PublicClubCampaign | null>>((acc, slot) => {
    const row = campaignRows.find((item) => {
      const slots = item.placements?.map((placement) => String(placement.placement_key ?? '').toUpperCase()) ?? []
      return (slots.includes(slot) || String(item.slot_id ?? '').toUpperCase() === slot) && isVisibleCampaign(item, now)
    })
    acc[slot] = row ? toPublicCampaign(row, slot) : null
    return acc
  }, {})

  const categories = new Set(players.map((player) => player.category).filter((value): value is number => typeof value === 'number'))

  return (
    <PublicClubHomeExperience
      club={{
        id: club.id,
        name: club.name,
        city: club.city,
        province: club.province,
        country: club.country,
        logoUrl: club.logo_url,
        themeKey: club.theme_key,
      }}
      stats={{
        players: players.length,
        tournaments: tournamentViews.length,
        categories: categories.size,
      }}
      heroCampaign={campaignsBySlot.CLUB_HOME_HERO ?? null}
      campaignsBySlot={campaignsBySlot}
      tournaments={tournaments}
      rankingSummary={buildRankingSummary(players)}
      news={clubNews}
    />
  )
}
