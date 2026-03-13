import HomeHero from '@/components/HomeHero'
import StatsRow from '@/components/StatsRow'
import RankingTable from '@/components/RankingTable'

export default function PlayerHomePage() {
  // Mock temporal: se reemplaza por datos reales una vez estabilizado el backend.
  const player = {
    rank: 1,
    name: 'KUN AGUERO',
    countryCode: 'Santa Rosa',
    points: 19800,
    pairedWith: 'Pinche Kun Aguero',
    birthDate: '24/07/1999',
    height: '1.79',
    bornIn: 'Catamarca',
    avatarUrl: '/mock/avatar.jpg',
    photoUrl: '/mock/player.jpg',
  }

  const stats = { matches: 229, wins: 210, winRate: 91.7 }

  const rows = [
    { tournament: 'Premier Padel Finals', category: 'GNP Acapulco Major', date: '11/12/2025', round: 'Winner', points: 1500 },
    { tournament: 'Premier Padel Major', category: 'Doha Major', date: '22/11/2025', round: 'Winner', points: 2000 },
  ]

  return (
    <div className="home-shell">
      <div className="home-panel">
        <HomeHero player={player} />
        <StatsRow stats={stats} />
        <RankingTable rows={rows} />
      </div>
    </div>
  )
}
