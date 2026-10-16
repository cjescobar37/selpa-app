import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Immutable original artwork, inline in the first frame. No installed icon is rewritten.
let artwork: { symbol: string; wordmark: string } | undefined
export function getPwaOpeningArtwork() {
  return artwork ??= {
    symbol: `data:image/png;base64,${readFileSync(join(process.cwd(), 'public/brand/selpa-isotipo.png')).toString('base64')}`,
    wordmark: `data:image/png;base64,${readFileSync(join(process.cwd(), 'public/brand/selpa-wordmark-clean.png')).toString('base64')}`,
  }
}
