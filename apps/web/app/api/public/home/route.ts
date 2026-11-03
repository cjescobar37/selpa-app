import { NextResponse } from 'next/server'
import { getPublicHomeData } from '@/lib/publicHomeData'

export async function GET() {
  try {
    const data = await getPublicHomeData()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'No pudimos cargar Comunidad SELPA. Intentá nuevamente.' }, { status: 500 })
  }
}
