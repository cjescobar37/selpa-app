import type { AppRole } from '@/components/session/SessionProvider'

export type NavItem = {
  label: string
  href: string
  exact?: boolean
  dot?: boolean
  children?: Array<{ label: string; href: string }>
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
        href: '/torneos',
        children: [
          { label: 'Calendario', href: '/torneos/calendario' },
          { label: 'Reglamento', href: '/torneos/reglamento' },
        ],
      },
      {
        label: 'Ranking',
        href: '/ranking',
        children: [
          { label: 'Mi ranking', href: '/player/ranking' },
          { label: 'Masculino', href: '/ranking/masculino' },
          { label: 'Femenino', href: '/ranking/femenino' },
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
      { label: 'Dashboard', href: '/club', exact: true },
      {
        label: 'Torneos',
        href: '/club/torneos',
        children: [
          { label: 'Calendario', href: '/club/torneos' },
          { label: 'Inscripciones', href: '/club/inscripciones' },
          { label: 'Partidos', href: '/club/partidos' },
        ],
      },
      {
        label: 'Jugadores',
        href: '/club/jugadores',
        children: [
          { label: 'Lista', href: '/club/jugadores' },
          { label: 'Ranking', href: '/club/ranking' },
        ],
      },
      {
        label: 'Gestión',
        href: '/club/contabilidad',
        children: [
          { label: 'Contabilidad', href: '/club/contabilidad' },
          { label: 'Usuarios', href: '/club/usuarios' },
          { label: 'Reportes', href: '/club/reportes' },
        ],
      },
      {
        label: 'Contenido',
        href: '/club/noticias',
        children: [
          { label: 'Noticias', href: '/club/noticias' },
          { label: 'Reglamento', href: '/club/reglamento' },
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
      { label: 'Dashboard', href: '/platform', exact: true },
      {
        label: 'Gestión',
        href: '/platform/clubs',
        children: [
          { label: 'Solicitudes', href: '/platform/solicitudes' },
          { label: 'Clubs', href: '/platform/clubs' },
          { label: 'Usuarios', href: '/platform/usuarios' },
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