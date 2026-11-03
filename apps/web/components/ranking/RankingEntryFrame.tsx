'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useSession } from '@/components/session/SessionProvider'

/** The ranking remains server-rendered. Only the personal marker depends on auth. */
export default function RankingEntryFrame({ href, userIds, className, position, tier, id, label, children }: {
  href: string | null; userIds: string[]; className: string; position: number;
  tier: string; id: string; label: string; children: ReactNode;
}) {
  const session = useSession()
  const mine = session.status === 'ready' && session.role === 'player' && Boolean(session.user && userIds.includes(session.user.id))
  const props = { className, id: `rank-${id}`, 'aria-label': label, 'data-rank-position': position, 'data-rank-tier': tier, 'data-self': mine ? 'true' : undefined }
  return href ? <Link {...props} href={href}>{children}{mine ? <span data-ranking-self-label>Vos</span> : null}</Link>
    : <article {...props}>{children}{mine ? <span data-ranking-self-label>Vos</span> : null}</article>
}
