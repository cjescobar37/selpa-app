// app/layout.tsx
import './globals.css'
import { Manrope } from 'next/font/google'
import AppShellClient from '@/components/AppShellClient'

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-main',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata = {
  title: 'Padelix',
  description: 'Club Atlético Padelix',
}

// viewport OK
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        {/* Único layout visual para TODA la app (Navbar + Footer consistentes). */}
        <AppShellClient>{children}</AppShellClient>
      </body>
    </html>
  )
}
