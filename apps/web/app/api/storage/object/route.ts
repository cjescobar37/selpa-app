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
      return NextResponse.redirect(rawUrl)
    }

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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error leyendo objeto.' }, { status: 500 })
  }
}
