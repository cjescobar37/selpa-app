import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const campaignId = String(body?.campaignId ?? '')
  const placementKey = String(body?.placementKey ?? '')
  const eventType = String(body?.eventType ?? '')
  const sessionKey = String(body?.sessionKey ?? '')
  if (!campaignId || !placementKey || !['impression', 'click'].includes(eventType) || sessionKey.length < 16) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('record_club_ad_event', {
    p_campaign_id: campaignId,
    p_placement_key: placementKey,
    p_event_type: eventType,
    p_session_key: sessionKey,
  })
  if (error) return NextResponse.json({ ok: false }, { status: 400 })
  return NextResponse.json({ ok: Boolean(data) })
}
