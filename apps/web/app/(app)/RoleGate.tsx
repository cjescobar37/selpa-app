'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = useSession()

  const allowedWithoutClub = useMemo(
    () => [
      '/seleccionar-club',
      '/clubs',
      '/clubs/nuevo',
      '/perfil',
      '/player',
    ],
    []
  )

  useEffect(() => {
    if (session.status === 'loading') return

    if (!session.user) {
      router.replace('/login')
      return
    }

    const isAllowed = allowedWithoutClub.some(p => pathname.startsWith(p))

    if (session.isPlatformAdmin) return

    if (!session.activeClubId || !session.isApprovedMember) {
      if (!isAllowed) router.replace('/seleccionar-club')
    }
  }, [
    allowedWithoutClub,
    pathname,
    router,
    session.activeClubId,
    session.isApprovedMember,
    session.isPlatformAdmin,
    session.status,
    session.user,
  ])

  const isAllowedWithoutClub = allowedWithoutClub.some(p => pathname.startsWith(p))
  const ready =
    session.status === 'ready' &&
    Boolean(session.user) &&
    (session.isPlatformAdmin ||
      Boolean(session.activeClubId && session.isApprovedMember) ||
      isAllowedWithoutClub)

  if (!ready) {
    return <div className="px-auth px-authModern px-auth--bridge" aria-hidden="true" />
  }

  // ✅ ACÁ ESTABA TU BUG: faltaba devolver children
  return <>{children}</>
}
