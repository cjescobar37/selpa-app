import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClubCard = {
  id: string
  name: string
  city: string | null
  province: string | null
  logo_url: string | null
  players: number
  tournaments: number
  categories: number[]
}

function getClubInitials(name?: string | null) {
  if (!name) return 'SC'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SC'
}

function buildAssetProxyUrl(rawUrl?: string | null) {
  if (!rawUrl) return null
  return `/api/storage/object?url=${encodeURIComponent(rawUrl)}`
}

export default async function ClubesPublicPage() {
  const [{ data: clubRows }, { data: playerRows }, { data: tournamentRows }] = await Promise.all([
    supabaseAdmin
      .from('clubs')
      .select('id,name,city,province,logo_url')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('club_players')
      .select('club_id,category')
      .not('approved_at', 'is', null),
    supabaseAdmin
      .from('tournaments')
      .select('club_id,status')
      .neq('status', 'DRAFT'),
  ])

  const statsByClub = new Map<string, { players: number; tournaments: number; categories: Set<number> }>()

  for (const row of playerRows ?? []) {
    const clubId = String((row as any).club_id ?? '')
    if (!clubId) continue
    const stats = statsByClub.get(clubId) ?? { players: 0, tournaments: 0, categories: new Set<number>() }
    stats.players += 1
    const category = Number((row as any).category)
    if (Number.isFinite(category)) stats.categories.add(category)
    statsByClub.set(clubId, stats)
  }

  for (const row of tournamentRows ?? []) {
    const clubId = String((row as any).club_id ?? '')
    if (!clubId) continue
    const stats = statsByClub.get(clubId) ?? { players: 0, tournaments: 0, categories: new Set<number>() }
    stats.tournaments += 1
    statsByClub.set(clubId, stats)
  }

  const clubs: ClubCard[] = (clubRows ?? []).map((club: any) => {
    const stats = statsByClub.get(String(club.id))
    return {
      id: String(club.id),
      name: String(club.name ?? 'Club Pamprax'),
      city: club.city ?? null,
      province: club.province ?? null,
      logo_url: club.logo_url ?? null,
      players: stats?.players ?? 0,
      tournaments: stats?.tournaments ?? 0,
      categories: stats ? Array.from(stats.categories).sort((a, b) => a - b) : [],
    }
  })

  return (
    <main className="publicClubsPage">
      <section className="publicClubsHero">
        <span>Clubes Pamprax</span>
        <h1>Comunidades activas</h1>
        <p>Explorá clubes, torneos, jugadores y categorías disponibles dentro del circuito.</p>
      </section>

      <section className="publicClubsGrid">
        {clubs.length ? clubs.map((club) => {
          const logo = buildAssetProxyUrl(club.logo_url)
          const location = [club.city, club.province].filter(Boolean).join(' · ') || 'Club Pamprax'
          const nameSize = club.name.length > 30 ? '22px' : club.name.length > 18 ? '26px' : club.name.length > 15 ? '30px' : undefined
          return (
            <Link className="publicClubCard" href={`/clubs/${club.id}`} key={club.id} aria-label={`Ver club ${club.name}`}>
              <span className={`publicClubLogo ${logo ? 'has-image' : ''}`}>
                {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : getClubInitials(club.name)}
              </span>
              <div className="publicClubBody">
                <small>Club activo</small>
                <h2 style={nameSize ? { ['--club-name-size' as string]: nameSize } : undefined}>{club.name}</h2>
                <p>{location}</p>
                <div className="publicClubStats">
                  <span><b>{club.players}</b> jugadores</span>
                  <span><b>{club.tournaments}</b> torneos</span>
                </div>
              </div>
              <span className="publicClubAction">
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          )
        }) : (
          <div className="publicClubsEmpty">
            <strong>Todavía no hay clubes públicos</strong>
            <p>Cuando se activen clubes, van a aparecer en este listado.</p>
          </div>
        )}
      </section>
    </main>
  )
}
