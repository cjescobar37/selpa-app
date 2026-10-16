import { ImageResponse } from 'next/og'
import { PWA_STARTUP_SCREENS } from '@/lib/pwa'
import { PWA_OPENING } from '@/lib/pwaOpening'
import { getPwaOpeningArtwork } from '@/lib/pwaOpeningArtwork.server'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return PWA_STARTUP_SCREENS.map(({ id }) => ({ screen: id }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ screen: string }> }) {
  const { screen: id } = await params
  const screen = PWA_STARTUP_SCREENS.find(item => item.id === id)
  if (!screen) return new Response(null, { status: 404 })
  const artwork = getPwaOpeningArtwork()
  const s = screen.scale
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#061b3a', backgroundImage: PWA_OPENING.backgroundImage, backgroundSize: '100% 100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: PWA_OPENING.gap * s }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: PWA_OPENING.medallion * s, height: PWA_OPENING.medallion * s, borderRadius: '50%', border: `${s}px solid rgba(83,199,217,.35)`, background: 'linear-gradient(145deg, #061b3a, #071426)', boxShadow: `0 ${18 * s}px ${44 * s}px rgba(2,6,23,.4)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- original isotipo, not the installed square icon */}
          <img src={artwork.symbol} alt="" width={PWA_OPENING.symbol * s} height={PWA_OPENING.symbol * s} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- original wordmark, never a substituted font/logo */}
        <img src={artwork.wordmark} alt="" width={PWA_OPENING.wordmarkWidth * s} height={PWA_OPENING.wordmarkHeight * s} style={{ objectFit: 'contain' }} />
        <div style={{ width: PWA_OPENING.accentWidth * s, height: PWA_OPENING.accentHeight * s, borderRadius: s * 2, background: 'linear-gradient(90deg, #53c7d9, #ff4e72)', opacity: .6 }} />
      </div>
    </div>,
    { width: screen.pixelWidth, height: screen.pixelHeight },
  )
}
