'use client'

import { Suspense, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Footer from '@/components/Footer'
import AppNavbarClient from '@/components/navbar/AppNavbarClient'
import { ActiveClubThemeProvider } from '@/components/ActiveClubThemeProvider'
import { SessionProvider, useSession } from '@/components/session/SessionProvider'
import { ToastViewport } from '@/components/ui/ToastViewport'
import { HomeInstallHost, HomeInstallProvider } from '@/components/pwa/HomeInstallPlacement'
import { isHomeMobilePilotRoute } from '@/lib/homeMobilePilot'
import homePilot from '@/components/home/HomeMobilePilot.module.css'
import MobileBottomNav from '@/components/navigation/MobileBottomNav'
import { useMobileKeyboard } from '@/components/navigation/useMobileKeyboard'
import { getMobileNavigation, showMobileNavigation } from '@/lib/mobileNavigation'
import mobile from '@/components/navigation/MobileNavigation.module.css'

/**
 * AppShellClient
 * - ÚNICO layout visual: Navbar + Footer idénticos para todas las rutas.
 * - SessionProvider resuelve sesión/rol/club activo y se comparte a todo el árbol.
 */
export default function AppShellClient({ children }: { children: ReactNode }) {
  return <SessionProvider><ActiveClubThemeProvider><HomeInstallProvider><AppShellContent>{children}</AppShellContent></HomeInstallProvider></ActiveClubThemeProvider></SessionProvider>
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const session = useSession()
  const keyboard = useMobileKeyboard()
  const mobileItems = getMobileNavigation(session.role, session.clubRole, Boolean(session.activeClubId && session.isApprovedMember))
  const mobileVisible = showMobileNavigation(pathname) && !keyboard && mobileItems.length > 0
  const isAuthRoute = ['/login', '/register', '/reset-password', '/update-password', '/completar-perfil'].includes(pathname)
  const isClubAdminRoute = pathname === '/club' || pathname.startsWith('/club/')
  const pilotClass = isHomeMobilePilotRoute(pathname)
    ? ` ${homePilot.shell} ${pathname === '/' ? homePilot.publicHome : homePilot.playerHome}`
    : ''

  return (
    <>
          <div data-mobile-nav={mobileVisible ? 'visible' : 'hidden'} className={`app-shell ${mobile.shell}${isAuthRoute ? ' app-shell--auth' : ''}${pathname === '/register' ? ' app-shell--authRegister' : ''}${isClubAdminRoute ? ' app-shell--club' : ''}${pilotClass}`}>
            <Suspense fallback={null}>
              <AppNavbarClient />
            </Suspense>

            <main className="px-main">
              <div className="px-wrap">{children}</div>
            </main>

            <HomeInstallHost />
            <Footer compact={isAuthRoute} />
            {mobileVisible && session.status === 'ready' ? <MobileBottomNav items={mobileItems} pathname={pathname} /> : null}
          </div>
          <ToastViewport />
    </>
  )
}
