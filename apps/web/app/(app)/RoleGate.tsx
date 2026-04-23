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
      <div className="px-auth">
        <div className="px-authCard">
          <div className="px-authTop">
            <div className="px-authBrand">
              <div className="px-authLogo">PX</div>
              <div className="px-authBrandText">
                <h1 className="px-authTitle">Accediendo…</h1>
                <p className="px-authSub">Verificando permisos y club activo</p>
              </div>
            </div>
          </div>

          <div className="px-authBody">
            <div className="px-help" style={{ marginBottom: 10 }}>
              Si tarda más de lo normal, podés salir y volver a entrar.
            </div>

            <div className="px-authRow" style={{ justifyContent: 'flex-end' }}>
              <button
                className="px-btn px-btn--ghost"
                onClick={async () => {
                  await session.signOut()
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ✅ ACÁ ESTABA TU BUG: faltaba devolver children
  return <>{children}</>
}
