'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import SelpaLoader from '@/components/SelpaLoader'
import { useSession } from '@/components/session/SessionProvider'

function isPublicGuestRoute(pathname: string) {
  return /^\/torneos\/[^/]+(?:\/inscripcion)?$/.test(pathname)
}

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()
  const publicGuestRoute = isPublicGuestRoute(pathname)
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

    const isAllowed = allowedWithoutClub.some(p => pathname.startsWith(p))

    if (session.isPlatformAdmin) return

    if (!session.activeClubId || !session.isApprovedMember) {
      if (!isAllowed) router.replace('/seleccionar-club')
    }
  }, [
    allowedWithoutClub,
    currentPath,
    pathname,
    publicGuestRoute,
    router,
    session.activeClubId,
    session.isApprovedMember,
    session.isPlatformAdmin,
    session.status,
    session.user,
  ])

  const isAllowedWithoutClub = allowedWithoutClub.some(p => pathname.startsWith(p))
  if (publicGuestRoute) return <>{children}</>

  const ready =
    session.status === 'ready' &&
    Boolean(session.user) &&
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

  // ✅ ACÁ ESTABA TU BUG: faltaba devolver children
  return <>{children}</>
}
