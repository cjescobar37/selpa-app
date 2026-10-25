import { ImageResponse } from 'next/og'
import { PWA_STARTUP_SCREENS } from '@/lib/pwa'

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
  // iOS startup images are necessarily static. Paint ONLY the navy canvas:
  // never show a frozen SELPA symbol/wordmark before the animated web layer.
  return new ImageResponse(
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      backgroundColor: '#061b3a',
    }} />,
    { width: screen.pixelWidth, height: screen.pixelHeight },
  )
}
