import fondo1 from '@/app/flyers/fondo1.png'
import fondo2 from '@/app/flyers/fondo2.png'
import fondo3 from '@/app/flyers/fondo3.png'
import fondo4 from '@/app/flyers/fondo4.png'
import fondo5 from '@/app/flyers/fondo5.png'
import fondo6 from '@/app/flyers/fondo6.png'
import fondo7 from '@/app/flyers/fondo7.png'
import fondo8 from '@/app/flyers/fondo8.png'
import fondo9 from '@/app/flyers/fondo9.png'
import fondo10 from '@/app/flyers/fondo10.png'
import fondo11 from '@/app/flyers/fondo11.png'
import fondo12 from '@/app/flyers/fondo12.png'
import fondo13 from '@/app/flyers/fondo13.png'
import fondo14 from '@/app/flyers/fondo14.png'
import fondo15 from '@/app/flyers/fondo15.png'
import fondo16 from '@/app/flyers/fondo16.png'
import fondo17 from '@/app/flyers/fondo17.png'

const flyerBackgroundById: Record<string, string> = {
  fondo1: fondo1.src,
  fondo2: fondo2.src,
  fondo3: fondo3.src,
  fondo4: fondo4.src,
  fondo5: fondo5.src,
  fondo6: fondo6.src,
  fondo7: fondo7.src,
  fondo8: fondo8.src,
  fondo9: fondo9.src,
  fondo10: fondo10.src,
  fondo11: fondo11.src,
  fondo12: fondo12.src,
  fondo13: fondo13.src,
  fondo14: fondo14.src,
  fondo15: fondo15.src,
  fondo16: fondo16.src,
  fondo17: fondo17.src,
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return asObject(parsed)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  if (text.startsWith('/') || /^https?:\/\//i.test(text)) return text
  return null
}

export function getTournamentFlyerUrl(tournament: unknown) {
  const item = asObject(tournament)
  const rules = asObject(item.rules ?? item.rules_json)
  const explicit = [
    item.flyerUrl,
    item.flyer_url,
    item.imageUrl,
    item.image_url,
    item.coverUrl,
    item.cover_url,
    item.posterUrl,
    item.poster_url,
    rules.flyerUrl,
    rules.flyer_url,
    rules.imageUrl,
    rules.image_url,
    rules.coverUrl,
    rules.cover_url,
    rules.posterUrl,
    rules.poster_url,
  ].map(asUrl).find(Boolean)

  if (explicit) return explicit

  const backgroundId = typeof rules.flyer_background === 'string' ? rules.flyer_background : null
  if (backgroundId && flyerBackgroundById[backgroundId]) {
    return flyerBackgroundById[backgroundId]
  }

  return null
}
