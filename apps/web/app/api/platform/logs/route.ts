import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function isMissingAuditTable(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return (
    msg.includes('public.platform_audit_logs') ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('platform_audit_logs') && msg.includes('does not exist'))
  )
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const action = req.nextUrl.searchParams.get('action')?.trim()
  const entityType = req.nextUrl.searchParams.get('entity_type')?.trim()
  const actorId = req.nextUrl.searchParams.get('actor_user_id')?.trim()
  const queryText = req.nextUrl.searchParams.get('q')?.trim()
  const dateFrom = req.nextUrl.searchParams.get('date_from')?.trim()
  const dateTo = req.nextUrl.searchParams.get('date_to')?.trim()
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') ?? 100), 1), 200)

  let query = supabaseAdmin
    .from('platform_audit_logs')
    .select('id,actor_user_id,action,entity_type,entity_id,entity_label,metadata,ip_address,user_agent,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) query = query.eq('action', action)
  if (entityType) query = query.eq('entity_type', entityType)
  if (actorId) query = query.eq('actor_user_id', actorId)
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`)
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)
  if (queryText) query = query.or(`action.ilike.%${queryText}%,entity_type.ilike.%${queryText}%,entity_label.ilike.%${queryText}%`)

  const { data, error } = await query
  if (isMissingAuditTable(error)) {
    return NextResponse.json(
      { code: 'AUDIT_NOT_INITIALIZED', error: 'Auditoría aún no inicializada.', rows: [], actions: [], entities: [], actors: [] },
      { status: 503 },
    )
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const actorIds = Array.from(new Set(rows.map((row: any) => row.actor_user_id).filter(Boolean)))
  const profilesRes = actorIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('user_id,email,display_name,first_name,last_name')
        .in('user_id', actorIds)
    : { data: [], error: null }

  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })

  const profiles = new Map((profilesRes.data ?? []).map((profile: any) => [profile.user_id, profile]))
  const enriched = rows.map((row: any) => {
    const profile = profiles.get(row.actor_user_id)
    const actorName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.email || 'Sistema'
    return {
      ...row,
      actor_name: actorName,
      actor_email: profile?.email ?? null,
    }
  })

  return NextResponse.json({
    rows: enriched,
    actions: Array.from(new Set(enriched.map((row: any) => row.action).filter(Boolean))).sort(),
    entities: Array.from(new Set(enriched.map((row: any) => row.entity_type).filter(Boolean))).sort(),
    actors: Array.from(
      new Map(
        enriched
          .filter((row: any) => row.actor_user_id)
          .map((row: any) => [row.actor_user_id, { id: row.actor_user_id, name: row.actor_name, email: row.actor_email }]),
      ).values(),
    ).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))),
  })
}
