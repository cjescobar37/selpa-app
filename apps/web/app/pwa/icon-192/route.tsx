import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-static'

// Render the existing icon at the platform's requested size. No new artwork,
// image dependency, remote fetch, user/session data or runtime caching layer.
export function GET() {
  const icon = readFileSync(join(process.cwd(), 'app/icon.png')).toString('base64')
  return new ImageResponse(
    // ImageResponse renders embedded data URIs, not next/image network requests.
    // eslint-disable-next-line @next/next/no-img-element -- metadata image, not DOM UI
    <img src={`data:image/png;base64,${icon}`} alt="" width={192} height={192} />,
    { width: 192, height: 192 },
  )
}
