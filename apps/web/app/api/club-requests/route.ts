import { NextResponse } from 'next/server'
import { withNotificationScope } from '@/lib/notificationScope'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ClubRequestPayload = {
  club_name?: string
  brand_name?: string
  legal_name?: string
  cuit?: string
  email?: string
  phone?: string
  website?: string
  instagram?: string
  address?: string
  city?: string
  province?: string
  country?: string
  opening_hours?: string
  courts_count?: string | number
  courts_surface?: string
  logo_url?: string
  rules_pdf_url?: string
  notes?: string
  admin_name?: string
  admin_email?: string
  admin_phone?: string
}

async function getTokenUser(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function assertPlatformAdmin(req: Request) {
  const user = await getTokenUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 }), user: null }

  const { data: pa, error: paErr } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (paErr) return { error: NextResponse.json({ error: paErr.message }, { status: 500 }), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET(req: Request) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('club_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClubRequestPayload
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
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 })
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('club_requests')
      .insert(payload)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: platformAdmins } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')

    const adminIds = (platformAdmins ?? []).map((row: any) => row.user_id).filter(Boolean)
    if (adminIds.length > 0) {
      const notifications = adminIds.map((userId: string) => ({
        user_id: userId,
        type: 'club_request_created',
        title: 'Nueva solicitud de club',
        message: `${payload.club_name} solicitó alta en la plataforma.`,
        link: `/platform/solicitudes?focus=${inserted.id}`,
        metadata: withNotificationScope(
          {
            club_request_id: inserted.id,
            club_name: payload.club_name,
            owner_name: payload.owner_name,
            owner_email: payload.owner_email,
          },
          'platform'
        ),
      }))
      await supabaseAdmin.from('notifications').insert(notifications)
    }

    return NextResponse.json({ ok: true, id: inserted.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudo guardar la solicitud.' }, { status: 500 })
  }
}
