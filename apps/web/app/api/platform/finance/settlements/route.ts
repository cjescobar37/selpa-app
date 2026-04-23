import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function isMissingFinanceTable(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('public.settlements') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('settlements') && msg.includes('does not exist'))
  )
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const status = req.nextUrl.searchParams.get('status')
  const clubId = req.nextUrl.searchParams.get('club_id')
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 50), 1), 200)

  let query = supabaseAdmin
    .from('settlements')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (clubId) query = query.eq('club_id', clubId)

  const { data, error } = await query
  if (isMissingFinanceTable(error)) {
    return NextResponse.json(
      { code: 'FINANCE_NOT_INITIALIZED', error: 'Finanzas aún no inicializadas.', rows: [], clubs: [] },
      { status: 503 },
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const clubIds = Array.from(new Set(rows.map((row: any) => row.club_id).filter(Boolean)))
  const [rowClubsRes, allClubsRes] = await Promise.all([
    clubIds.length ? supabaseAdmin.from('clubs').select('id,name').in('id', clubIds) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from('clubs').select('id,name,status').order('name', { ascending: true }),
  ])

  if (rowClubsRes.error) return NextResponse.json({ error: rowClubsRes.error.message }, { status: 500 })
  if (allClubsRes.error) return NextResponse.json({ error: allClubsRes.error.message }, { status: 500 })

  const clubsMap = new Map((rowClubsRes.data ?? []).map((club: any) => [club.id, club]))
  const enriched = rows.map((row: any) => ({
    ...row,
    club_name: clubsMap.get(row.club_id)?.name ?? 'Club',
  }))

  return NextResponse.json({ rows: enriched, clubs: allClubsRes.data ?? [] })
}
