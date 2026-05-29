import type { AppRole } from '@/components/session/SessionProvider'
import type { ClubCapability } from '@/lib/clubPermissions'

export type NavChild = {
  label: string
  href: string
  activeMatch?: 'exact' | 'prefix' | 'none'
  requiredAnyCapabilities?: readonly ClubCapability[]
}

export type NavItem = {
  label: string
  href: string
  exact?: boolean
  dot?: boolean
  requiredAnyCapabilities?: readonly ClubCapability[]
  children?: NavChild[]
}

export type NavRight = {
  search?: boolean
  notifications?: boolean
  messages?: boolean
  userMenu?: boolean
  login?: boolean
}

export type NavConfig = {
  leftMode: 'brand' | 'club' | 'club-static'
  main: NavItem[]
  right: NavRight
}

export const NAV_CONFIG: Record<AppRole, NavConfig> = {
  guest: {
    leftMode: 'brand',
    main: [
      { label: 'Inicio', href: '/' },
      { label: 'Torneos', href: '/torneos' },
      { label: 'Ranking', href: '/ranking' },
      { label: 'Noticias', href: '/noticias' },
    ],
    right: {
      search: false,
      notifications: false,
      messages: false,
      userMenu: false,
      login: true,
    },
  },

  player: {
    leftMode: 'club',
    main: [
      { label: 'Inicio', href: '/player', exact: true },
      {
        label: 'Torneos',
        href: '/player/torneos',
        children: [
          { label: 'Mis torneos', href: '/player/torneos' },
          { label: 'Calendario del club', href: '/player/torneos/calendario' },
          { label: 'Explorar torneos', href: '/player/torneos/explorar' },
          { label: 'Reglamento', href: '/player/torneos/reglamento' },
        ],
      },
      {
        label: 'Ranking',
        href: '/ranking',
        children: [
          { label: 'Mi ranking', href: '/player/ranking' },
          { label: 'Ranking del club', href: '/player/ranking/club' },
        ],
      },
      { label: 'En vivo', href: '/envivo', dot: true },
      { label: 'Noticias', href: '/noticias' },
    ],
    right: {
      search: false,
      notifications: true,
      messages: true,
      userMenu: true,
      login: false,
    },
  },

  club: {
    leftMode: 'club-static',
    main: [
      { label: 'Inicio', href: '/club', exact: true },
      {
        label: 'Torneos',
        href: '/club/torneos',
        requiredAnyCapabilities: ['tournament:create', 'tournament:update', 'registrations:manage', 'groups:generate', 'playoff:generate'],
        children: [
          { label: 'Calendario', href: '/club/torneos', requiredAnyCapabilities: ['tournament:create', 'tournament:update', 'registrations:manage', 'groups:generate', 'playoff:generate'] },
          { label: 'Crear torneo', href: '/club/torneos/nuevo', requiredAnyCapabilities: ['tournament:create'] },
          { label: 'Reglamento', href: '/club/reglamento', requiredAnyCapabilities: ['content:edit', 'content:publish', 'club:configure'] },
        ],
      },
      {
        label: 'Jugadores',
        href: '/club/jugadores',
        requiredAnyCapabilities: ['tournament:create', 'tournament:update', 'groups:generate', 'playoff:generate', 'matches:update', 'registrations:manage', 'users:manage', 'club:configure'],
        children: [
          { label: 'Gestión', href: '/club/jugadores', requiredAnyCapabilities: ['tournament:create', 'tournament:update', 'groups:generate', 'playoff:generate', 'matches:update', 'registrations:manage', 'users:manage', 'club:configure'] },
          { label: 'Solicitudes', href: '/club/jugadores?tab=solicitudes', requiredAnyCapabilities: ['users:manage', 'roles:manage'] },
          { label: 'Ranking', href: '/club/ranking', requiredAnyCapabilities: ['tournament:create', 'tournament:update', 'groups:generate', 'playoff:generate', 'matches:update', 'registrations:manage', 'users:manage', 'club:configure'] },
        ],
      },
      {
        label: 'Club',
        href: '/club/configuracion',
        requiredAnyCapabilities: ['users:manage', 'roles:manage', 'club:configure', 'club:branding', 'finance:view', 'finance:manage'],
        children: [
          { label: 'Equipo y roles', href: '/club/usuarios', requiredAnyCapabilities: ['users:manage', 'roles:manage'] },
          { label: 'Configuración', href: '/club/configuracion', requiredAnyCapabilities: ['club:configure', 'club:branding'] },
          { label: 'Finanzas', href: '/club/contabilidad', requiredAnyCapabilities: ['finance:view', 'finance:manage'] },
          { label: 'Reportes', href: '/club/reportes', requiredAnyCapabilities: ['finance:view', 'finance:manage', 'users:manage'] },
        ],
      },
      {
        label: 'Contenido',
        href: '/club/noticias',
        requiredAnyCapabilities: ['content:edit', 'content:publish', 'club:configure'],
        children: [
          { label: 'Noticias', href: '/club/noticias', requiredAnyCapabilities: ['content:edit', 'content:publish'] },
          { label: 'Sponsors y publicidad', href: '/club/publicidad', requiredAnyCapabilities: ['content:edit', 'content:publish', 'club:configure'] },
        ],
      },
    ],
    right: {
      search: true,
      notifications: true,
      messages: true,
      userMenu: true,
      login: false,
    },
  },

  platform: {
    leftMode: 'brand',
    main: [
      {
        label: 'Gestión',
        href: '/platform/solicitudes',
        children: [
          { label: 'Solicitudes', href: '/platform/solicitudes' },
          { label: 'Admin Clubs', href: '/platform/clubs' },
          { label: 'Admin Jugadores', href: '/platform/usuarios' },
        ],
      },
      {
        label: 'Finanzas',
        href: '/platform/pagos',
        children: [
          { label: 'Pagos / comisiones', href: '/platform/pagos' },
          { label: 'Liquidaciones', href: '/platform/liquidaciones' },
        ],
      },
      {
        label: 'Contenido',
        href: '/platform/noticias',
        children: [
          { label: 'Noticias Platform', href: '/platform/noticias' },
          { label: 'Publicidad y Sponsors Platform', href: '/platform/publicidad' },
        ],
      },
      { label: 'Analytics', href: '/platform/analytics' },
    ],
    right: {
      search: true,
      notifications: true,
      messages: true,
      userMenu: true,
      login: false,
    },
  },
}
