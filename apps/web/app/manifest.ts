import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/branding'
import { PWA_COLORS } from '@/lib/pwa'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND.name.toUpperCase(),
    short_name: BRAND.name.toUpperCase(),
    description: BRAND.tagline,
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: PWA_COLORS.background,
    theme_color: PWA_COLORS.theme,
    prefer_related_applications: false,
    icons: [
      { src: '/pwa/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The existing square artwork already keeps the mark inside the safe circle.
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
