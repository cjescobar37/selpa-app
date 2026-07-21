import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { extractStorageParts } from '@/lib/clubAssets'

export async function GET(req: NextRequest) {
  try {
    const rawUrl = req.nextUrl.searchParams.get('url')
    if (!rawUrl) {
      return NextResponse.json({ error: 'Falta url.' }, { status: 400 })
    }

    const parsed = extractStorageParts(rawUrl)
    if (!parsed) {
      return NextResponse.json({ error: 'La URL no corresponde a un objeto permitido.' }, { status: 400 })
    }

    const publicClubAsset = parsed.bucket === 'club-logos' && /^(logos|tournament-flyers)\/[0-9a-f-]+\//i.test(parsed.path)
    const publicClubRule = parsed.bucket === 'club-rules' && /^rules\/[0-9a-f-]+\//i.test(parsed.path)
    let allowed = publicClubAsset || publicClubRule

    if (parsed.bucket === 'player-assets' && /^(avatars|covers)\/[0-9a-f-]+\//i.test(parsed.path)) {
      const [avatarOwner, coverOwner] = await Promise.all([
        supabaseAdmin.from('profiles').select('user_id').eq('avatar_url', rawUrl).limit(1).maybeSingle(),
        supabaseAdmin.from('profiles').select('user_id').eq('cover_url', rawUrl).limit(1).maybeSingle(),
      ])
      allowed = Boolean(avatarOwner.data?.user_id || coverOwner.data?.user_id)
    }

    if (parsed.bucket === 'platform-assets') {
      const [newsCover, newsGallery, sponsor, ad] = await Promise.all([
        supabaseAdmin.from('platform_news').select('id').eq('cover_url', rawUrl).eq('status', 'PUBLISHED').limit(1).maybeSingle(),
        supabaseAdmin.from('platform_news').select('id').contains('gallery_urls', [rawUrl]).eq('status', 'PUBLISHED').limit(1).maybeSingle(),
        supabaseAdmin.from('platform_sponsors').select('id').eq('logo_url', rawUrl).eq('status', 'ACTIVE').limit(1).maybeSingle(),
        supabaseAdmin.from('platform_ad_campaigns').select('id').eq('image_url', rawUrl).eq('status', 'ACTIVE').limit(1).maybeSingle(),
      ])
      allowed = Boolean(newsCover.data?.id || newsGallery.data?.id || sponsor.data?.id || ad.data?.id)
    }

    if (!allowed) return NextResponse.json({ error: 'No autorizado para leer este objeto.' }, { status: 403 })

    const { data, error } = await supabaseAdmin.storage.from(parsed.bucket).download(parsed.path)
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No pude leer el archivo.' }, { status: 404 })
    }

    const bytes = await data.arrayBuffer()
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error leyendo objeto.' }, { status: 500 })
  }
}
