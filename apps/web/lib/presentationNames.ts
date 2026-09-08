const CLUB_SUFFIX_WORDS = new Set([
  'club',
  'padel',
  'pádel',
  'sports',
  'sport',
  'deportivo',
  'deportiva',
  'asociación',
  'asociacion',
])

export function getFirstPresentationName(value?: string | null) {
  const clean = String(value ?? '').trim()
  if (!clean) return 'Usuario'
  const identity = clean.includes('@') ? clean.split('@')[0] : clean
  return identity.split(/[\s._-]+/).find(Boolean) ?? 'Usuario'
}

export function getClubPresentationName(value?: string | null) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Sin club'

  const distinctiveWords = clean.split(' ').filter((word) => !CLUB_SUFFIX_WORDS.has(word.toLocaleLowerCase('es-AR')))
  if (distinctiveWords.length === 0) return clean
  const first = distinctiveWords[0].toLocaleLowerCase('es-AR')
  const wordCount = ['el', 'la', 'los', 'las'].includes(first) ? 2 : 1
  return distinctiveWords.slice(0, wordCount).join(' ')
}
