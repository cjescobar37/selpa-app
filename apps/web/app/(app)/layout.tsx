import type { ReactNode } from 'react'
import AppNavbarClient from './AppNavbarClient'
import Footer from '@/components/Footer'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AppNavbarClient />

      <main className="px-main">
        <div className="px-wrap">{children}</div>
      </main>

      <Footer />
    </div>
  )
}
