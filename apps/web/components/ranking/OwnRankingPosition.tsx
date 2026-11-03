'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { readPlayerProfile } from '@/lib/playerProfileRead'
import { rankingHref, type RankingSearch } from '@/features/player-career/public-ranking.presentation'
import type { RankingContext } from '@/features/player-career/player-career.types'
import styles from './OwnRankingPosition.module.css'

type Position = { id: string; position: number; points: number; page: number; name: string }
export default function OwnRankingPosition({ context, params }: { context: RankingContext; params: RankingSearch }) {
  const session = useSession()
  const userId = session.status === 'ready' && session.role === 'player' ? session.user?.id : undefined
  const key = `${userId}:${context.clubId}:${context.seasonId}:${context.divisionId}:${context.modality}`
  const [result, setResult] = useState<{ key: string; position: Position | null } | null>(null)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    const query = new URLSearchParams({ clubId: context.clubId, season: context.seasonId, division: context.divisionId, modality: context.modality })
    readPlayerProfile<{ position: Position | null }>(`/api/player/club-ranking-position?${query}`, userId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, position: data.position }) })
      // An optional personal marker must never turn a public leaderboard into an error.
      .catch(() => { if (!controller.signal.aborted) setResult({ key, position: null }) })
    return () => controller.abort()
  }, [userId, key, context.clubId, context.seasonId, context.divisionId, context.modality])
  if (!userId || result?.key !== key || !result.position) return null
  const mine = result.position
  return <aside className={styles.position} aria-label="Tu posición oficial" data-own-ranking>
    <span><small>{context.modality === 'PAIRS' ? 'Tu mejor puesto' : 'Tu posición'}</small><strong>#{mine.position}</strong></span>
    <span className={styles.points}><strong>{mine.points.toLocaleString('es-AR')}</strong> pts</span>
    <Link href={rankingHref(params, { q: undefined, page: String(mine.page) }) + `#rank-${mine.id}`}>Ver mi puesto</Link>
  </aside>
}
