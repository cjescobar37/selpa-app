import { NextRequest, NextResponse } from 'next/server'
import {
  assertClubCommercialManager,
  CLUB_SPONSOR_STATUSES,
  isMissingRelation,
  missingCommercialSetupResponse,
  normalizeNullableText,
  normalizeRequiredText,
  normalizeStatus,
} from '@/lib/clubCommercialServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await context.params
  const auth = await assertClubCommercialManager(req, clubId, 'sponsors:manage')
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('club_sponsors')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingRelation(error)) return missingCommercialSetupResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sponsors: data ?? [] })
}

export async function POST(req: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params
    const auth = await assertClubCommercialManager(req, clubId, 'sponsors:manage')
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const name = normalizeRequiredText(body?.name, 'nombre del sponsor')
    const payload = {
      club_id: clubId,
      name,
      logo_url: normalizeNullableText(body?.logo_url ?? body?.logoUrl, 1200),
      website_url: normalizeNullableText(body?.website_url ?? body?.websiteUrl, 1200),
      contact_name: normalizeNullableText(body?.contact_name ?? body?.contactName, 180),
      contact_email: normalizeNullableText(body?.contact_email ?? body?.contactEmail, 180),
      status: normalizeStatus(body?.status, CLUB_SPONSOR_STATUSES, 'active'),
      created_by: auth.user!.id,
    }

    const { data, error } = await supabaseAdmin
      .from('club_sponsors')
      .insert(payload)
      .select('*')
      .maybeSingle()

    if (error) {
      if (isMissingRelation(error)) return missingCommercialSetupResponse()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sponsor: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No pude crear el sponsor.' }, { status: 400 })
  }
}
