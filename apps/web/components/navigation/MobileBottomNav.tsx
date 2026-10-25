'use client'

import Link from 'next/link'
import { BarChart3, Building2, Home, LayoutGrid, Medal, MessageCircle, Newspaper, Settings, Trophy, UsersRound, WalletCards } from 'lucide-react'
import type { MobileNavIcon, MobileNavItem } from '@/lib/mobileNavigation'
import { mobileActiveHref } from '@/lib/mobileNavigation'
import styles from './MobileNavigation.module.css'

const icons = { home: Home, trophy: Trophy, ranking: Medal, clubs: Building2, messages: MessageCircle,
  players: UsersRound, settings: Settings, management: LayoutGrid, billing: WalletCards, content: Newspaper, analytics: BarChart3 } satisfies Record<MobileNavIcon, typeof Home>

export default function MobileBottomNav({ items, pathname }: { items: readonly MobileNavItem[]; pathname: string }) {
  const activeHref = mobileActiveHref(items, pathname)
  return <nav className={styles.nav} aria-label="Navegación principal móvil" data-mobile-bottom-nav>
    {items.map(item => { const Icon = icons[item.icon]; return <Link key={item.href} href={item.href} aria-current={item.href === activeHref ? 'page' : undefined}>
      <Icon size={22} strokeWidth={1.8} aria-hidden="true" /><span>{item.label}</span>
    </Link> })}
  </nav>
}
