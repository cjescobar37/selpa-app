// app/layout.tsx
import './globals.css'
import './pwa.css'
import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Inter, Outfit, Rajdhani } from 'next/font/google'
import AppShellClient from '@/components/AppShellClient'
import { BRAND } from '@/lib/branding'
import { PWA_COLORS, PWA_STARTUP_SCREENS } from '@/lib/pwa'
import PwaOpening from '@/components/pwa/PwaOpening'
import { PWA_OPENING, PWA_OPENING_BOOTSTRAP, PWA_OPENING_CANVAS_CSS } from '@/lib/pwaOpening'
import { getPwaOpeningArtwork } from '@/lib/pwaOpeningArtwork.server'

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

export const metadata: Metadata = {
  title: BRAND.name.toUpperCase(),
  description: BRAND.tagline,
  applicationName: BRAND.name.toUpperCase(),
  // Next emits the modern mobile-web-app-capable tag; retain the Apple spelling
  // as well for older iOS Home Screen implementations.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  appleWebApp: {
    capable: true,
    title: BRAND.name.toUpperCase(),
    statusBarStyle: 'black-translucent',
    startupImage: PWA_STARTUP_SCREENS.map(screen => ({ url: `/pwa/startup/${screen.id}?v=${PWA_OPENING.version}`, media: screen.media })),
  },
}

// viewport OK
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Opaque counterpart of the existing --px-nav-bg, not a new brand color.
  themeColor: PWA_COLORS.theme,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${outfit.variable} ${bebasNeue.variable} ${rajdhani.variable}`}>
      <head>
        <style id="selpa-opening-canvas">{PWA_OPENING_CANVAS_CSS}</style>
        <script id="selpa-opening-bootstrap" dangerouslySetInnerHTML={{ __html: PWA_OPENING_BOOTSTRAP }} />
      </head>
      <body>
        <PwaOpening artwork={getPwaOpeningArtwork()} />
        {/* Único layout visual para TODA la app (Navbar + Footer consistentes). */}
        <AppShellClient>{children}</AppShellClient>
      </body>
    </html>
  )
}
