'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import SelpaLoader from '@/components/SelpaLoader'
import { useSession } from '@/components/session/SessionProvider'
import { isGlobalProfileComplete } from '@/lib/globalProfile'

function isPublicGuestRoute(pathname: string) {
  return /^\/torneos\/[^/]+(?:\/inscripcion)?$/.test(pathname)
}

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()
  const publicGuestRoute = isPublicGuestRoute(pathname)
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

    const isAllowed = pathname === '/player' || pathname.startsWith('/club/jugadores/') || allowedWithoutClub.some(p => pathname.startsWith(p))

    if (session.isPlatformAdmin) return

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
    session.isApprovedMember,
    session.isPlatformAdmin,
    session.role,
    session.status,
    session.user,
  ])

  const isAllowedWithoutClub = pathname === '/player' || pathname.startsWith('/club/jugadores/') || allowedWithoutClub.some(p => pathname.startsWith(p))
  if (publicGuestRoute) return <>{children}</>

  const ready =
    session.status === 'ready' &&
    Boolean(session.user) &&
    (!requiresPlayerProfile || isGlobalProfileComplete(session.globalProfile)) &&
    (session.isPlatformAdmin ||
      Boolean(session.activeClubId && session.isApprovedMember) ||
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
