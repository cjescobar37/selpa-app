// app/layout.tsx
import './globals.css'
import { Inter } from 'next/font/google'
import AppShellClient from '@/components/AppShellClient'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-main',
  weight: ['400', '500', '600', '700'],
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
    <html lang="es" className={inter.variable}>
      <body>
        {/* Único layout visual para TODA la app (Navbar + Footer consistentes). */}
        <AppShellClient>{children}</AppShellClient>
      </body>
    </html>
  )
}