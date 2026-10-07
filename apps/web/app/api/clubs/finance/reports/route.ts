import { NextRequest, NextResponse } from 'next/server'
import { financeAccess, financeFailure, financeRangeParams } from '@/lib/clubFinanceF1FServer'
export async function GET(req: NextRequest) {
  const clubId = req.nextUrl.searchParams.get('clubId') ?? ''
  const access = await financeAccess(req, clubId)
  if (access.error || !access.client) return access.error
  const range = financeRangeParams(req.nextUrl.searchParams)
  if (!range) return NextResponse.json({ error: 'Elegí un rango válido de hasta 367 días.' }, { status: 400 })
  const result = await access.client.rpc('get_club_finance_report_f1f', { p_club_id: clubId, ...range })
  if (result.error) return financeFailure(result.error)
  return NextResponse.json({ report: result.data }, { headers: { 'Cache-Control': 'no-store' } })
}
