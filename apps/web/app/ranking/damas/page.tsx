import RankingPublicPage from '../page'

export const dynamic = 'force-dynamic'

export default async function RankingDamasPage({ searchParams }: {
  searchParams?: Promise<{ clubId?: string; club?: string; category?: string }>
}) {
  return RankingPublicPage({ searchParams: Promise.resolve({ ...await searchParams, gender: 'F' }) })
}
