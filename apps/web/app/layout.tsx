// app/layout.tsx
import './globals.css'
import { Bebas_Neue, Inter, Outfit, Rajdhani } from 'next/font/google'
import AppShellClient from '@/components/AppShellClient'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-brand',
  weight: ['800'],
})

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['400'],
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sport',
  weight: ['600', '700'],
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
    <html lang="es" className={`${inter.variable} ${outfit.variable} ${bebasNeue.variable} ${rajdhani.variable}`}>
      <body>
        {/* Único layout visual para TODA la app (Navbar + Footer consistentes). */}
        <AppShellClient>{children}</AppShellClient>
      </body>
    </html>
  )
}
