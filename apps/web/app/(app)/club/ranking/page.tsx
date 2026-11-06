'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import PageHeader from '@/components/navigation/PageHeader'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import PublicRankingExperience, { type PublicRankingExperienceProps } from '@/components/public/PublicRankingExperience'
import RankingVisibilitySettings from '@/components/ranking/RankingVisibilitySettings'
import { readPlayerProfile } from '@/lib/playerProfileRead'
import { hasClubCapability } from '@/lib/clubPermissions'

/** Same board and official views as /ranking. Only the read authorization and
 * publication controls differ; private access is verified by the server. */
export default function ClubRankingPage() {
  const session = useSession()
  const query = useSearchParams().toString()
  const clubId = session.activeClubId
  const canRead = session.status === 'ready' && (session.isPlatformAdmin || (session.role === 'club' && session.isApprovedMember && hasClubCapability(session.clubRole, 'ranking:view')))
  const userId = canRead ? session.user?.id : undefined
  const key = [userId, clubId, session.role, session.clubRole, session.membershipStatus, session.isPlatformAdmin].join(':') + '?' + query
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [result, setResult] = useState<{ key: string; data?: PublicRankingExperienceProps; error?: boolean } | null>(null)
  useEffect(() => {
    if (!userId || !clubId) return
    const controller = new AbortController()
    readPlayerProfile<PublicRankingExperienceProps>('/api/clubs/' + clubId + '/ranking/official?' + query, userId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, error: true }) })
      .finally(() => { if (!controller.signal.aborted) setRefreshing(false) })
    return () => controller.abort()
  }, [userId, clubId, query, key, version])
  function refresh() { setRefreshing(true); setVersion(n => n + 1) }
  const current = result?.key === key ? result : null
  if (current?.data) return <PublicRankingExperience {...current.data} adminActions={<RankingVisibilitySettings clubId={clubId!} onChanged={refresh} />} />
  return <section>
    <PageHeader title="Ranking" tone="dark" compact description={session.activeClub?.name} backHref="/club" />
    {session.status === 'ready' && session.user && !canRead ? <PlayerStatePanel kind="error" title="Acceso no autorizado" message="Necesitás permiso de ranking en este club." compact /> : current?.error ? <><PlayerStatePanel kind="error" title="No pudimos cargar el ranking" message="Verificá tu permiso de ranking y volvé a intentar." compact />
      <button type="button" disabled={refreshing} onClick={refresh} className="selpa-button selpa-button--secondary">{refreshing ? 'Reintentando…' : 'Reintentar'}</button></> :
      <PlayerStatePanel kind="loading" title="Cargando ranking" message={session.status === 'ready' && !clubId ? 'Elegí un club para continuar.' : 'Leyendo la clasificación oficial.'} compact />}
  </section>
}
