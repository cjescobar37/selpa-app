import 'server-only'
import type { NextRequest } from 'next/server'
import { authorizeCompetitionCatalog } from '@/features/competition/catalogs/competition-catalogs.auth'

export type ClubRankingAccess = Readonly<{ clubId: string }>
const verified = new WeakSet<object>()

/** Request-local proof; URL parameters never authorize an unpublished season. */
export async function authorizeClubRankingRead(req: NextRequest, clubId: string) {
  const auth = await authorizeCompetitionCatalog(req, clubId, 'read')
  if (auth.error) return { access: undefined, error: auth.error }
  const access = Object.freeze({ clubId })
  verified.add(access)
  return { access, error: null }
}

export function assertClubRankingRead(access: ClubRankingAccess | undefined, clubId: string) {
  if (!access) return false
  if (!verified.has(access) || access.clubId !== clubId) throw new Error('RANKING_ACCESS_DENIED')
  return true
}
