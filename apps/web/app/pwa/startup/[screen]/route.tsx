import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PWA_COLORS, PWA_STARTUP_SCREENS } from '@/lib/pwa'

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
  const icon = readFileSync(join(process.cwd(), 'app/icon.png')).toString('base64')
  const wordmark = readFileSync(join(process.cwd(), 'public/brand/selpa-wordmark-clean-dark.png')).toString('base64')
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PWA_COLORS.background }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * screen.scale, transform: `translateY(-${12 * screen.scale}px)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- original artwork in a native OS launch asset */}
        <img src={`data:image/png;base64,${icon}`} alt="" width={112 * screen.scale} height={112 * screen.scale} />
        {/* eslint-disable-next-line @next/next/no-img-element -- original wordmark, never a substituted font/logo */}
        <img src={`data:image/png;base64,${wordmark}`} alt="" width={164 * screen.scale} height={164 * 79 / 549 * screen.scale} />
      </div>
    </div>,
    { width: screen.pixelWidth, height: screen.pixelHeight },
  )
}
