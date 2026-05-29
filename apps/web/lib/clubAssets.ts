import { supabase } from '@/lib/supabaseClient'

export const CLUB_LOGO_BUCKET_CANDIDATES = ['club-logos', 'club-assets', 'clubs'] as const
export const CLUB_RULES_BUCKET_CANDIDATES = ['club-rules', 'club-assets', 'clubs'] as const
export const PLAYER_PROFILE_BUCKET = 'player-assets'

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

export function getClubInitials(name?: string | null) {
  if (!name) return 'SC'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SC'
}

export function buildLocalPreview(file: File | null | undefined) {
  return file ? URL.createObjectURL(file) : null
}

export function extractStorageParts(rawUrl?: string | null) {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl)
    const path = decodeURIComponent(url.pathname)

    const publicMarker = '/storage/v1/object/public/'
    const signMarker = '/storage/v1/object/sign/'

    if (path.includes(publicMarker)) {
      const rest = path.split(publicMarker)[1] || ''
      const [bucket, ...pathParts] = rest.split('/')
      const objectPath = pathParts.join('/')
      if (!bucket || !objectPath) return null
      return { bucket, path: objectPath }
    }

    if (path.includes(signMarker)) {
      const rest = path.split(signMarker)[1] || ''
      const [bucket, ...pathParts] = rest.split('/')
      const objectPath = pathParts.join('/')
      if (!bucket || !objectPath) return null
      return { bucket, path: objectPath }
    }

    return null
  } catch {
    return null
  }
}

export function buildAssetProxyUrl(rawUrl?: string | null) {
  if (!rawUrl) return null
  return `/api/storage/object?url=${encodeURIComponent(rawUrl)}`
}

export async function resolveStorageUrl(rawUrl?: string | null) {
  if (!rawUrl) return null
  return buildAssetProxyUrl(rawUrl)
}

async function uploadToFirstAvailableBucket(params: {
  buckets: readonly string[]
  file: File
  objectPath: string
}) {
  const { buckets, file, objectPath } = params

  let sawBucketNotFound = false
  let sawPolicyIssue = false
  let lastError: string | null = null

  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    })

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
      return {
        bucket,
        objectPath,
        publicUrl: data.publicUrl,
      }
    }

    const msg = error.message?.toLowerCase?.() || ''
    if (msg.includes('bucket not found')) sawBucketNotFound = true
    if (
      msg.includes('policy') ||
      msg.includes('not allowed') ||
      msg.includes('unauthorized') ||
      msg.includes('permission')
    ) {
      sawPolicyIssue = true
    }

    lastError = error.message
  }

  if (sawBucketNotFound) {
    throw new Error(
      'No existe un bucket configurado para este archivo en Supabase Storage. Creá el bucket correspondiente o cargá una URL manual.'
    )
  }

  if (sawPolicyIssue) {
    throw new Error(
      'El bucket existe pero tu usuario no tiene permisos para subir archivos. Revisá las policies de Storage.'
    )
  }

  throw new Error(lastError || 'No pude subir el archivo al storage.')
}

export async function uploadClubLogo(params: {
  file: File
  clubId?: string | null
  folder?: string
}) {
  const { file, clubId, folder = 'logos' } = params

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const safeBase = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'club-logo'
  const objectPath = `${folder}/${clubId || 'pending'}/${Date.now()}-${safeBase}.${ext}`

  return uploadToFirstAvailableBucket({
    buckets: CLUB_LOGO_BUCKET_CANDIDATES,
    file,
    objectPath,
  })
}

export async function uploadClubRulesPdf(params: {
  file: File
  clubId?: string | null
  folder?: string
}) {
  const { file, clubId, folder = 'rules' } = params

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('El reglamento debe ser un archivo PDF.')
  }

  const safeBase = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || 'reglamento'
  const objectPath = `${folder}/${clubId || 'pending'}/${Date.now()}-${safeBase}.pdf`

  return uploadToFirstAvailableBucket({
    buckets: CLUB_RULES_BUCKET_CANDIDATES,
    file,
    objectPath,
  })
}

export async function uploadPlayerProfileImage(params: {
  file: File
  userId?: string | null
  kind: 'avatar' | 'cover'
}) {
  const { file, userId, kind } = params

  if (!file.type.toLowerCase().startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen.')
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const safeBase = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || `player-${kind}`
  const folder = kind === 'avatar' ? 'avatars' : 'covers'
  const objectPath = `${folder}/${userId || 'pending'}/${Date.now()}-${safeBase}.${ext}`

  const { error } = await supabase.storage.from(PLAYER_PROFILE_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  })

  if (error) {
    const msg = error.message?.toLowerCase?.() || ''
    if (msg.includes('bucket not found')) {
      throw new Error('No existe el bucket player-assets en Supabase Storage.')
    }
    throw new Error(error.message || 'No pude subir la imagen del perfil.')
  }

  const { data } = supabase.storage.from(PLAYER_PROFILE_BUCKET).getPublicUrl(objectPath)
  return {
    bucket: PLAYER_PROFILE_BUCKET,
    objectPath,
    publicUrl: data.publicUrl,
  }
}
