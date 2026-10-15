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
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PWA_COLORS.background }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- native OS launch asset, not UI */}
      <img src={`data:image/png;base64,${icon}`} alt="" width={128 * screen.scale} height={128 * screen.scale} />
    </div>,
    { width: screen.pixelWidth, height: screen.pixelHeight },
  )
}
