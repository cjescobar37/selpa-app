import { NextResponse } from 'next/server'
import { getPublicHomeData } from '@/lib/publicHomeData'

export async function GET() {
  try {
    const data = await getPublicHomeData()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude cargar el home público.' }, { status: 500 })
  }
}
