import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const payload = {
      club_name: (body.club_name ?? '').trim(),
      brand_name: (body.brand_name ?? '').trim() || null,
      legal_name: (body.legal_name ?? '').trim() || null,
      cuit: String(body.cuit ?? '').replace(/\D/g, '') || null,
      contact_email: (body.email ?? '').trim().toLowerCase(),
      phone: (body.phone ?? '').trim() || null,
      website: (body.website ?? '').trim() || null,
      instagram: (body.instagram ?? '').trim() || null,
      address: (body.address ?? '').trim() || null,
      city: (body.city ?? '').trim() || null,
      province: (body.province ?? '').trim() || null,
      country: (body.country ?? '').trim() || 'Argentina',
      opening_hours: (body.opening_hours ?? '').trim() || null,
      courts_count: body.courts_count ? Number(body.courts_count) : null,
      courts_surface: (body.courts_surface ?? '').trim() || null,
      logo_url: (body.logo_url ?? '').trim() || null,
      rules_pdf_url: (body.rules_pdf_url ?? '').trim() || null,
      notes: (body.notes ?? '').trim() || null,
      owner_name: (body.admin_name ?? '').trim(),
      owner_email: (body.admin_email ?? '').trim().toLowerCase(),
      owner_phone: (body.admin_phone ?? '').trim() || null,
    }

    if (!payload.club_name || !payload.contact_email || !payload.owner_name || !payload.owner_email) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('club_requests').insert(payload)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
