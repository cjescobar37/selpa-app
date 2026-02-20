import type { ReactNode } from 'react'
import AppNavbarClient from './AppNavbarClient'
import Footer from '@/components/Footer'
import RoleGate from './RoleGate'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppNavbarClient />

      <main className="px-main">
        <div className="px-wrap">
          <RoleGate>
            {children}
          </RoleGate>
        </div>
      </main>

      <Footer />
    </div>
  )
}
