import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import styles from './PublishedRankingClubCard.module.css'

type PublishedRankingClubCardProps = {
  name: string
  logoUrl?: string | null
  themeKey?: string | null
  href: string
  detail?: string
}

/** Shared club-ranking entry, not a player standing or a category leaderboard. */
export default function PublishedRankingClubCard({ name, logoUrl, themeKey, href, detail }: PublishedRankingClubCardProps) {
  const theme = getClubTheme(themeKey)
  const colors = { '--club-primary': theme.vars.accent, '--club-secondary': theme.vars.accent2 } as CSSProperties
  return <Link className={styles.card} href={href} style={colors} data-ranking-club-card title={name}
    aria-label={`${name}${detail ? ` · ${detail}` : ''} · Ver ranking`}>
    <div className={styles.motif} aria-hidden="true">
      <div className={styles.steps}>{[38, 58, 78, 100].map((height, index) => <i key={height} style={{ height }}><span>{4 - index}</span></i>)}</div>
      <svg viewBox="0 0 220 120"><path d="M28 88 C70 85 96 72 118 61 C146 47 164 31 194 26" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="10"/><path d="M170 22 L198 25 L187 52" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10"/></svg>
    </div>
    <RankingPlayerAvatar name={name} src={buildAssetProxyUrl(logoUrl)} sizes="(max-width: 350px) 64px, 72px" className={styles.logo}/>
    <div className={styles.body}>
      <header className={styles.identity}><span>Competencia del club</span><h3>{name}</h3></header>
      <div className={styles.footer}>
        {detail ? <p>{detail}</p> : <span/>}
        <span className={styles.cta}>Ver ranking <span aria-hidden="true">→</span></span>
      </div>
    </div>
  </Link>
}

export function RankingClubCards({ children }: { children: ReactNode }) {
  return <div className={styles.grid} data-ranking-club-grid>{children}</div>
}
