import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { platformContentSetupMessage, uploadPlatformAsset } from '@/lib/platformContent'

function isMissingRelation(error?: { message?: string } | null) {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('could not find the table') || (msg.includes('relation') && msg.includes('does not exist'))
}

function setupResponse(entity: string) {
  return NextResponse.json({ error: `Primero aplicá la migración de contenido para ${entity}.`, detail: platformContentSetupMessage(), setupRequired: true }, { status: 412 })
}

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin.from('platform_sponsors').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelation(error)) return setupResponse('sponsors')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error
  try {
    const form = await req.formData()
    const name = String(form.get('name') ?? '').trim()
    const websiteUrl = String(form.get('websiteUrl') ?? '').trim()
    const tier = String(form.get('tier') ?? 'SPONSOR')
    const status = String(form.get('status') ?? 'ACTIVE')
    const sortOrder = Number(form.get('sortOrder') ?? 100)
    const file = form.get('logo')
    if (!name) return NextResponse.json({ error: 'Falta nombre.' }, { status: 400 })
    let logoUrl: string | null = null
    if (file instanceof File && file.size > 0) logoUrl = await uploadPlatformAsset(file, 'sponsors')
    const { data, error } = await supabaseAdmin.from('platform_sponsors').insert({ name, website_url: websiteUrl || null, tier, status, sort_order: sortOrder, logo_url: logoUrl, created_by: auth.user!.id, updated_by: auth.user!.id }).select('*').maybeSingle()
    if (error) {
      if (isMissingRelation(error)) return setupResponse('sponsors')
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, row: data })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'No pude crear el sponsor.' }, { status: 500 })
  }
}
