import { NextRequest, NextResponse } from 'next/server'
import { assertClubCommercialManager } from '@/lib/clubCommercialServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertClubCommercialManager(req, clubId, 'ads:manage')
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin
    .from('club_ad_events')
    .select('campaign_id,event_type,occurred_at')
    .eq('club_id', clubId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const metrics: Record<string, { impressions: number; clicks: number; firstAt: string | null; lastAt: string | null }> = {}
  for (const event of data ?? []) {
    const row = metrics[event.campaign_id] ?? { impressions: 0, clicks: 0, firstAt: null, lastAt: null }
    if (event.event_type === 'impression') row.impressions += 1
    if (event.event_type === 'click') row.clicks += 1
    row.firstAt = !row.firstAt || event.occurred_at < row.firstAt ? event.occurred_at : row.firstAt
    row.lastAt = !row.lastAt || event.occurred_at > row.lastAt ? event.occurred_at : row.lastAt
    metrics[event.campaign_id] = row
  }
  return NextResponse.json({ metrics })
}
