'use client'

import type { ReactNode } from 'react'
import Footer from '@/components/Footer'
import AppNavbarClient from '@/components/navbar/AppNavbarClient'
import { SessionProvider } from '@/components/session/SessionProvider'

/**
 * AppShellClient
 * - ÚNICO layout visual: Navbar + Footer idénticos para todas las rutas.
 * - SessionProvider resuelve sesión/rol/club activo y se comparte a todo el árbol.
 */
export default function AppShellClient({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="app-shell">
        <AppNavbarClient />

        <main className="px-main">
          <div className="px-wrap">{children}</div>
        </main>

        <Footer />
      </div>
    </SessionProvider>
  )
}
