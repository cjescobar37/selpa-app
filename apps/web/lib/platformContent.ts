import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const PLATFORM_ASSETS_BUCKET = 'platform-assets'

export type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type NewsPlacement = 'HERO' | 'GRID' | 'ARCHIVE'
export type CampaignStatus = 'ACTIVE' | 'PAUSED'
export type CampaignSlot = 'HOME_HERO' | 'HOME_GRID' | 'HOME_INLINE'
export type SponsorTier = 'SPONSOR' | 'PARTNER' | 'LOCAL'
export type SponsorStatus = 'ACTIVE' | 'PAUSED'

export async function ensurePlatformAssetsBucket() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) throw listError
  const found = (buckets ?? []).find((bucket) => bucket.name === PLATFORM_ASSETS_BUCKET) as
    | { name: string; public?: boolean }
    | undefined

  if (!found) {
    const { error: createError } = await supabaseAdmin.storage.createBucket(PLATFORM_ASSETS_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 10 * 1024 * 1024,
    })
    if (createError) throw createError
    return
  }

  if (!found.public) {
    const { error: updateError } = await supabaseAdmin.storage.updateBucket(PLATFORM_ASSETS_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 10 * 1024 * 1024,
    })
    if (updateError) throw updateError
  }
}

export async function uploadPlatformAsset(file: File, folder: string) {
  await ensurePlatformAssetsBucket()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const safeExt = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`
  const bytes = await file.arrayBuffer()
  const { error } = await supabaseAdmin.storage.from(PLATFORM_ASSETS_BUCKET).upload(path, bytes, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabaseAdmin.storage.from(PLATFORM_ASSETS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadPlatformAssets(files: File[], folder: string) {
  const uploads = files
    .filter((file) => file instanceof File && file.size > 0)
    .map((file) => uploadPlatformAsset(file, folder))

  return Promise.all(uploads)
}

export function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function isMissingRelationMessage(message?: string | null) {
  const msg = String(message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
}

export async function listPublishedContent() {
  const now = new Date().toISOString()
  const [newsRes, adsRes, sponsorsRes] = await Promise.all([
    supabaseAdmin
      .from('platform_news')
      .select('*')
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('platform_ad_campaigns')
      .select('*')
      .eq('status', 'ACTIVE')
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('platform_sponsors')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
  ])

  if (newsRes.error && !isMissingRelationMessage(newsRes.error.message)) throw newsRes.error
  if (adsRes.error && !isMissingRelationMessage(adsRes.error.message)) throw adsRes.error
  if (sponsorsRes.error && !isMissingRelationMessage(sponsorsRes.error.message)) throw sponsorsRes.error

  const news = newsRes.data ?? []
  const heroNews = news.find((item) => item.placement === 'HERO') ?? news[0] ?? null
  const gridNews = news
    .filter((item) => item.id !== heroNews?.id)
    .filter((item) => item.placement === 'GRID' || item.placement === 'HERO')
    .slice(0, 6)

  return {
    heroNews,
    gridNews,
    archiveNews: news,
    ads: adsRes.data ?? [],
    sponsors: sponsorsRes.data ?? [],
  }
}

export function platformContentSetupMessage() {
  return 'Falta aplicar la migración 20260320_platform_content.sql en Supabase.'
}

export async function getNewsBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from('platform_news')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'PUBLISHED')
    .maybeSingle()

  if (error && !isMissingRelationMessage(error.message)) throw error
  if (error) return null
  return data
}
