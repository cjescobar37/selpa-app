import { NextResponse } from 'next/server'
import { listPublishedContent } from '@/lib/platformContent'

export async function GET() {
  try {
    const data = await listPublishedContent()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude cargar contenido público.' }, { status: 500 })
  }
}
