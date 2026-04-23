import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PlatformAuditEntity =
  | 'club'
  | 'user'
  | 'club_membership'
  | 'platform_news'
  | 'platform_sponsor'
  | 'platform_ad_campaign'

type LogPlatformActionInput = {
  actorUserId: string | null | undefined
  action: string
  entityType: PlatformAuditEntity | string
  entityId?: string | null
  entityLabel?: string | null
  metadata?: Record<string, unknown> | null
  req?: NextRequest
}

function getClientIp(req?: NextRequest) {
  if (!req) return null
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
  )
}

export async function logPlatformAction({
  actorUserId,
  action,
  entityType,
  entityId = null,
  entityLabel = null,
  metadata = null,
  req,
}: LogPlatformActionInput) {
  try {
    const { error } = await supabaseAdmin.from('platform_audit_logs').insert({
      actor_user_id: actorUserId || null,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      entity_label: entityLabel || null,
      metadata: metadata ?? {},
      ip_address: getClientIp(req),
      user_agent: req?.headers.get('user-agent') || null,
    })

    if (error) {
      console.error('[platform-audit] insert failed', {
        action,
        entityType,
        entityId,
        message: error.message,
      })
      return { ok: false, error }
    }

    return { ok: true, error: null }
  } catch (error) {
    console.error('[platform-audit] unexpected failure', {
      action,
      entityType,
      entityId,
      error,
    })
    return { ok: false, error }
  }
}
