'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import SelpaLoader from '@/components/SelpaLoader'
import { useSession } from '@/components/session/SessionProvider'
import { isGlobalProfileComplete } from '@/lib/globalProfile'
import { hasAnyClubPermission, type ClubCapability } from '@/lib/clubPermissions'

function isPublicGuestRoute(pathname: string) {
  return /^\/torneos\/[^/]+(?:\/inscripcion)?$/.test(pathname)
}

function requiredClubCapabilities(pathname: string, currentPath: string): readonly ClubCapability[] {
  if (pathname === '/club') return ['dashboard:view']
  if (pathname.startsWith('/club/configuracion')) return ['club:update', 'club:branding']
  if (pathname.startsWith('/club/usuarios') || pathname.startsWith('/club/equipo')) return ['roles:view']
  if (pathname.startsWith('/club/finanzas') || pathname.startsWith('/club/contabilidad')) return ['finance:view']
  if (pathname.startsWith('/club/reportes')) return ['finance:view', 'memberships:view']
  if (pathname.startsWith('/club/noticias')) return ['news:manage']
  if (pathname.startsWith('/club/publicidad') || pathname.startsWith('/club/sponsors')) return ['sponsors:manage', 'ads:manage']
  if (pathname.startsWith('/club/solicitudes') || (pathname === '/club/jugadores' && currentPath.includes('tab=solicitudes'))) return ['memberships:view']
  if (pathname.startsWith('/club/jugadores')) return ['players:view']
  if (pathname.startsWith('/club/ranking')) return ['ranking:view']
  if (pathname === '/club/torneos/nuevo' || pathname === '/club/torneos/crear') return ['tournaments:create']
  if (/^\/club\/torneos\/[^/]+\/editar$/.test(pathname)) return ['tournaments:update']
  if (pathname.startsWith('/club/inscripciones')) return ['registrations:view']
  if (pathname.startsWith('/club/partidos')) return ['matches:view']
  if (pathname.startsWith('/club/torneos') || pathname.startsWith('/club/calendario') || pathname.startsWith('/club/reglamento')) return ['tournaments:view']
  if (pathname.startsWith('/club/mensajes')) return ['messages:view']
  return ['club:view']
}

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()
  const publicGuestRoute = isPublicGuestRoute(pathname)
  const isClubAdminRoute = pathname === '/club' || pathname.startsWith('/club/')
  const hasAdministrativeClubRole = session.clubRole === 'OWNER' || session.clubRole === 'ADMIN' || session.clubRole === 'PLANILLERO'
  const requiresPlayerProfile = session.role === 'player'
  const currentPath = useMemo(() => {
    if (typeof window === 'undefined') return pathname
    return `${pathname}${window.location.search}`
  }, [pathname])

  const allowedWithoutClub = useMemo(
    () => [
      '/seleccionar-club',
      '/clubs',
      '/clubs/nuevo',
      '/perfil',
      '/mis-datos',
      '/ajustes',
      '/actividad',
      '/notificaciones',
      '/mensajes',
      '/player/mensajes',
    ],
    []
  )

  useEffect(() => {
    if (publicGuestRoute) return
    if (session.status === 'loading') return

    if (!session.user) {
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`)
      return
    }

    if (requiresPlayerProfile && !isGlobalProfileComplete(session.globalProfile)) {
      router.replace(`/completar-perfil?next=${encodeURIComponent(currentPath)}`)
      return
    }

    const isAllowed = pathname === '/player' || allowedWithoutClub.some(p => pathname.startsWith(p))

    if (session.isPlatformAdmin) return

    if (isClubAdminRoute) {
      if (!session.activeClubId || !session.isApprovedMember) {
        router.replace('/seleccionar-club')
        return
      }
      if (!hasAdministrativeClubRole) {
        router.replace('/player')
        return
      }
      if (!hasAnyClubPermission(session.clubRole, requiredClubCapabilities(pathname, currentPath))) {
        router.replace('/club')
        return
      }
    }

    if (!session.activeClubId || !session.isApprovedMember) {
      if (!isAllowed) router.replace('/seleccionar-club')
    }
  }, [
    allowedWithoutClub,
    currentPath,
    pathname,
    publicGuestRoute,
    requiresPlayerProfile,
    router,
    session.activeClubId,
    session.globalProfile,
    session.clubRole,
    session.isApprovedMember,
    session.isPlatformAdmin,
    session.role,
    session.status,
    session.user,
    hasAdministrativeClubRole,
    isClubAdminRoute,
  ])

  const isAllowedWithoutClub = pathname === '/player' || allowedWithoutClub.some(p => pathname.startsWith(p))
  if (publicGuestRoute) return <>{children}</>

  const ready =
    session.status === 'ready' &&
    Boolean(session.user) &&
    (!requiresPlayerProfile || isGlobalProfileComplete(session.globalProfile)) &&
    (session.isPlatformAdmin ||
      Boolean(session.activeClubId && session.isApprovedMember && (!isClubAdminRoute || (
        hasAdministrativeClubRole && hasAnyClubPermission(session.clubRole, requiredClubCapabilities(pathname, currentPath))
      ))) ||
      isAllowedWithoutClub)

  if (!ready) {
    return (
      <div className="px-auth px-authModern px-auth--bridge">
        <SelpaLoader title="Preparando tu perfil..." subtitle="Cargando tu información" />
      </div>
    )
  }

  return <>{children}</>
}
