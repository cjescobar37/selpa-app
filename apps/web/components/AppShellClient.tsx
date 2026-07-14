'use client'

import { Suspense, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Footer from '@/components/Footer'
import AppNavbarClient from '@/components/navbar/AppNavbarClient'
import { SessionProvider } from '@/components/session/SessionProvider'

/**
 * AppShellClient
 * - ÚNICO layout visual: Navbar + Footer idénticos para todas las rutas.
 * - SessionProvider resuelve sesión/rol/club activo y se comparte a todo el árbol.
 */
export default function AppShellClient({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = pathname === '/login' || pathname === '/register' || pathname === '/reset-password'

  return (
    <SessionProvider>
      <div className={`app-shell${isAuthRoute ? ' app-shell--auth' : ''}${pathname === '/register' ? ' app-shell--authRegister' : ''}`}>
        <Suspense fallback={null}>
          <AppNavbarClient />
        </Suspense>

        <main className="px-main">
          <div className="px-wrap">{children}</div>
        </main>

        <Footer compact={isAuthRoute} />
      </div>
    </SessionProvider>
  )
}
