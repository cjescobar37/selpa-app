'use client'

import { Suspense, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Footer from '@/components/Footer'
import AppNavbarClient from '@/components/navbar/AppNavbarClient'
import { ActiveClubThemeProvider } from '@/components/ActiveClubThemeProvider'
import { SessionProvider } from '@/components/session/SessionProvider'

/**
 * AppShellClient
 * - ÚNICO layout visual: Navbar + Footer idénticos para todas las rutas.
 * - SessionProvider resuelve sesión/rol/club activo y se comparte a todo el árbol.
 */
export default function AppShellClient({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = ['/login', '/register', '/reset-password', '/update-password', '/completar-perfil'].includes(pathname)

  return (
    <SessionProvider>
      <ActiveClubThemeProvider>
        <div className={`app-shell${isAuthRoute ? ' app-shell--auth' : ''}${pathname === '/register' ? ' app-shell--authRegister' : ''}`}>
          <Suspense fallback={null}>
            <AppNavbarClient />
          </Suspense>

          <main className="px-main">
            <div className="px-wrap">{children}</div>
          </main>

          <Footer compact={isAuthRoute} />
        </div>
      </ActiveClubThemeProvider>
    </SessionProvider>
  )
}
