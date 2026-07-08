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
    return (
      <div className="px-auth px-authModern px-loginAuth px-auth--gate">
        <div className="px-authCard">
          <div className="px-authTop">
            <div className="px-authBrand">
              <div className="px-authBrandText">
                <span className="px-authMark" aria-label="SELPA logo">
                  <img src="/brand/selpa-wordmark-clean-dark.png" alt="SELPA" />
                </span>
              </div>
            </div>
          </div>

          <div className="px-authBody">
            <div className="px-loginLoading" role="status" aria-live="polite">
              <span className="px-loginLoading__mark" aria-hidden="true">
                <span className="px-spinner" />
              </span>
              <div>
                <strong>Ingresando...</strong>
                <p>Preparando tu espacio</p>
              </div>
              <span className="px-loginLoading__line" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ✅ ACÁ ESTABA TU BUG: faltaba devolver children
  return <>{children}</>
}
