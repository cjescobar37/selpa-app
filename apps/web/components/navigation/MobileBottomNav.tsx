'use client'

import Link from 'next/link'
import Image from 'next/image'
import { BarChart3, Building2, Home, LayoutGrid, Medal, MessageCircle, Newspaper, Settings, Trophy, UserRound, UsersRound, WalletCards } from 'lucide-react'
import type { MobileNavIcon, MobileNavItem } from '@/lib/mobileNavigation'
import { mobileActiveHref } from '@/lib/mobileNavigation'
import { CLUB_THEMES } from '@/lib/clubThemes'
import styles from './MobileNavigation.module.css'

const icons = { home: Home, trophy: Trophy, ranking: Medal, clubs: Building2, messages: MessageCircle,
  profile: UserRound, players: UsersRound, settings: Settings, management: LayoutGrid, billing: WalletCards, content: Newspaper, analytics: BarChart3 } satisfies Record<MobileNavIcon, typeof Home>

// Page scopes override the session theme without fetching or changing the active club.
// Values come exclusively from the canonical, finite palette; only navigation tokens change.
const pageThemeRules = Object.values(CLUB_THEMES).map(theme =>
  `.${styles.shell}:has([data-mobile-club-theme="${theme.key}"]){--selpa-nav-accent:${theme.vars.accent};--selpa-nav-detail:${theme.vars.accent2}}`
).join('')

export default function MobileBottomNav({ items, pathname, profileAvatarUrl }: { items: readonly MobileNavItem[]; pathname: string; profileAvatarUrl?: string | null }) {
  const activeHref = mobileActiveHref(items, pathname)
  return <><style>{pageThemeRules}</style><nav className={styles.nav} aria-label="Navegación principal móvil" data-mobile-bottom-nav>
    {items.map(item => { const Icon = icons[item.icon], profile = item.icon === 'profile'; return <Link key={item.href} href={item.href} aria-current={item.href === activeHref ? 'page' : undefined}>
      {profile ? <span className={styles.profileIcon} aria-hidden="true">{profileAvatarUrl ? <Image src={profileAvatarUrl} alt="" fill sizes="26px" unoptimized/> : <Icon size={20} strokeWidth={1.8}/>}</span> : <Icon size={22} strokeWidth={1.8} aria-hidden="true" />}
      <span className={styles.label}>{item.label}</span>
    </Link> })}
  </nav></>
}
