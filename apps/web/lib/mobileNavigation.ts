import type { AppRole } from '@/components/session/SessionProvider'
import { hasAnyClubPermission } from './clubPermissions'
import { NAV_CONFIG, type NavItem } from './navConfig'

export type MobileNavIcon = 'home' | 'trophy' | 'ranking' | 'clubs' | 'messages' | 'profile' | 'players' | 'settings' | 'management' | 'billing' | 'content' | 'analytics'
export type MobileNavItem = { label: string; href: string; icon: MobileNavIcon; activePrefixes: readonly string[] }

/** Select canonical routes rather than maintaining another permission model. */
export function getMobileNavigation(role: AppRole, clubRole?: string | null, approvedClub = true): MobileNavItem[] {
  const config = NAV_CONFIG[role]
  if (role === 'club' && !approvedClub) return []
  if (role === 'player') {
    const home = config.main.find(item => item.href === '/player')!
    const tournaments = config.main.find(item => item.href === '/player/torneos')!
    const ranking = config.main.flatMap(item => item.children ?? []).find(item => item.href === '/player/ranking')!
    return [
      { ...home, icon: 'home', activePrefixes: ['/actividad', '/seleccionar-club', '/unir-mi-club', '/player/pagos'] },
      { ...tournaments, icon: 'trophy', activePrefixes: ['/player/torneos', '/torneos'] },
      { ...ranking, icon: 'ranking', activePrefixes: ['/player/ranking', '/ranking', '/jugadores', '/preview/demo'] },
      { label: 'Perfil', href: '/perfil', icon: 'profile', activePrefixes: ['/perfil', '/mi-cuenta', '/mis-datos', '/ajustes', '/player/carrera'] },
    ]
  }
  const icons: Record<Exclude<AppRole, 'player'>, MobileNavIcon[]> = {
    guest: ['home', 'trophy', 'ranking', 'clubs'], club: ['home', 'trophy', 'players', 'settings'],
    platform: ['management', 'billing', 'content', 'analytics'],
  }
  return config.main.slice(0, 4).flatMap((item: NavItem, index) => {
    if (role === 'club' && item.requiredAnyCapabilities?.length && !hasAnyClubPermission(clubRole, item.requiredAnyCapabilities)) return []
    const prefixes = item.activePrefixes ?? (item.exact || item.href === '/' ? [] : [item.href, ...(item.children ?? []).map(child => child.href)])
    return [{ label: item.label, href: item.href, icon: icons[role][index], activePrefixes: role === 'guest' && item.href === '/ranking' ? [...prefixes, '/jugadores', '/preview/demo'] : role === 'guest' && item.href === '/clubes' ? [...prefixes, '/clubs'] : prefixes }]
  })
}

export function mobileActiveHref(items: readonly MobileNavItem[], pathname: string): string | undefined {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (path === '/platform') return items.find(item => item.icon === 'management')?.href
  if (/^\/player\/[0-9a-f-]{36}$/i.test(path)) return items.find(item => item.href === '/player')?.href
  let match: MobileNavItem | undefined, score = -1
  for (const item of items) {
    if (path === item.href) return item.href
    for (const prefix of item.activePrefixes) if ((path === prefix || path.startsWith(prefix + '/')) && prefix.length > score) { match = item; score = prefix.length }
  }
  return match?.href
}

export function showMobileNavigation(pathname: string): boolean {
  if (/^\/(?:login|register|reset-password|update-password|completar-perfil|auth|api|pwa)(?:\/|$)/.test(pathname)) return false
  if (/^\/torneos\/[^/]+\/inscripcion(?:\/|$)/.test(pathname)) return false
  if (/^\/club\/torneos\/(?:nuevo|crear|[^/]+\/editar)(?:\/|$)/.test(pathname)) return false
  return !/(?:^|\/)(?:planillero|checkout)(?:\/|$)/.test(pathname)
}

export function isMobileKeyboardOpen(fullHeight: number, height: number, scale: number, editing: boolean): boolean {
  return editing && Math.abs(scale - 1) <= .1 && fullHeight - height > 140
}
