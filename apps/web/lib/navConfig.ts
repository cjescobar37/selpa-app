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
  activePrefixes?: readonly string[]
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
      { label: 'Clubes', href: '/clubes' },
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
      {
        label: 'Inicio',
        href: '/club',
        exact: true,
        requiredAnyCapabilities: ['dashboard:view'],
      },
      {
        label: 'Competencia',
        href: '/club/competition',
        activePrefixes: ['/club/competition', '/club/torneos', '/club/ranking', '/club/calendario', '/club/reglamento', '/club/partidos'],
        requiredAnyCapabilities: ['competition:view', 'competition:manage', 'ranking:view', 'ranking:manage', 'tournaments:view', 'tournaments:create', 'tournaments:update', 'registrations:view', 'groups:generate', 'matches:view', 'playoff:generate'],
      },
      {
        label: 'Jugadores',
        href: '/club/jugadores',
        activePrefixes: ['/club/jugadores', '/club/solicitudes', '/club/inscripciones'],
        requiredAnyCapabilities: ['players:view', 'players:manage', 'memberships:view', 'memberships:manage', 'registrations:view'],
      },
      {
        label: 'Club',
        href: '/club/admin',
        activePrefixes: ['/club/admin', '/club/configuracion', '/club/equipo', '/club/usuarios', '/club/perfil', '/club/finanzas', '/club/contabilidad', '/club/estadisticas', '/club/reportes', '/club/mensajes'],
        requiredAnyCapabilities: ['club:update', 'club:branding', 'club:profile_manage', 'roles:view', 'roles:manage', 'finance:view', 'finance:manage', 'reports:operational_view', 'messages:view', 'audit:view', 'security:manage'],
      },
      {
        label: 'Contenido',
        href: '/club/noticias',
        activePrefixes: ['/club/noticias', '/club/publicidad', '/club/sponsors'],
        requiredAnyCapabilities: ['content:view', 'news:manage', 'sponsors:manage', 'ads:manage'],
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
