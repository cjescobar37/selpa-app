'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutGrid,
  Medal,
  MessageCircle,
  Newspaper,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { hasAnyClubPermission, type ClubCapability } from '@/lib/clubPermissions'
import styles from './ClubAdminHubNav.module.css'

type HubIcon = 'tournaments' | 'calendar' | 'circuits' | 'ranking' | 'divisions' | 'points' | 'rules' | 'players' | 'requests' | 'registrations' | 'team' | 'finance' | 'analytics' | 'reports' | 'profile' | 'settings' | 'messages' | 'news' | 'sponsors' | 'ads'

export type ClubAdminHubLink = {
  href: string
  label: string
  description: string
  icon: HubIcon
  requiredAnyCapabilities: readonly ClubCapability[]
  group?: 'primary' | 'secondary'
}

type Props = {
  label: string
  primaryLabel?: string
  secondaryLabel?: string
  items: readonly ClubAdminHubLink[]
  variant?: 'default' | 'competition'
}

const icons: Record<HubIcon, LucideIcon> = {
  tournaments: Trophy,
  calendar: CalendarDays,
  circuits: Medal,
  ranking: BarChart3,
  divisions: LayoutGrid,
  points: Sparkles,
  rules: FileText,
  players: Users,
  requests: Bell,
  registrations: ClipboardList,
  team: ShieldCheck,
  finance: BadgeDollarSign,
  analytics: BarChart3,
  reports: FileText,
  profile: Users,
  settings: Settings2,
  messages: MessageCircle,
  news: Newspaper,
  sponsors: Sparkles,
  ads: BadgeDollarSign,
}

export default function ClubAdminHubNav({ label, primaryLabel = 'Operación', secondaryLabel = 'Configuración', items, variant = 'default' }: Props) {
  const { clubRole } = useSession()
  const pathname = usePathname()
  const visible = items.filter((item) => hasAnyClubPermission(clubRole, item.requiredAnyCapabilities))
  const primary = visible.filter((item) => item.group !== 'secondary')
  const secondary = visible.filter((item) => item.group === 'secondary')

  if (!visible.length) return null

  const renderGroup = (groupItems: ClubAdminHubLink[], title?: string) => groupItems.length ? <section className={styles.group} aria-label={title}>
    {title ? <span className={styles.groupLabel}>{title}</span> : null}
    <div className={styles.grid}>
      {groupItems.map((item) => {
        const Icon = icons[item.icon]
        const active = pathname === item.href || (item.href !== '/club' && pathname.startsWith(`${item.href}/`))
        return <Link key={item.href} className={`${styles.link} ${active ? styles.active : ''}`} href={item.href} aria-current={active ? 'page' : undefined}>
          <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </Link>
      })}
    </div>
  </section> : null

  return <nav className={`${styles.hub} ${variant === 'competition' ? styles.competition : ''}`} aria-label={label}>
    {renderGroup(primary, secondary.length ? primaryLabel : undefined)}
    {renderGroup(secondary, secondaryLabel)}
  </nav>
}
