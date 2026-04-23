import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ActionBody = {
  action?: 'approve' | 'reject'
  rejectionReason?: string
}

type ClubRequestRow = {
  id: string
  club_name: string
  brand_name: string | null
  legal_name: string | null
  cuit: string | null
  contact_email: string | null
  phone: string | null
  website: string | null
  instagram: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  opening_hours: string | null
  courts_count: number | null
  courts_surface: string | null
  logo_url: string | null
  rules_pdf_url: string | null
  notes: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertPlatformAdmin(req)
    if (auth.error) return auth.error

    const { id } = await params
    const body = (await req.json()) as ActionBody
    const action = body.action

    if (!id || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
    }

    const { data: requestRow, error: requestErr } = await supabaseAdmin
      .from('club_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (requestErr || !requestRow) {
      return NextResponse.json({ error: requestErr?.message ?? 'Solicitud no encontrada.' }, { status: 404 })
    }

    const request = requestRow as ClubRequestRow

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, display_name, first_name, last_name')
      .eq('email', (request.owner_email ?? '').toLowerCase())
      .maybeSingle()

    if (action === 'reject') {
      const rejectionReason = (body.rejectionReason ?? '').trim()
      if (!rejectionReason) {
        return NextResponse.json({ error: 'Indicá el motivo del rechazo.' }, { status: 400 })
      }

      if (requesterProfile?.user_id) {
        await supabaseAdmin.from('notifications').insert({
          user_id: requesterProfile.user_id,
          type: 'club_request_rejected',
          title: 'Solicitud de club rechazada',
          message: `La solicitud para ${request.club_name} fue rechazada. Motivo: ${rejectionReason}`,
          link: '/unir-mi-club',
          metadata: {
            club_request_id: request.id,
            club_name: request.club_name,
            rejection_reason: rejectionReason,
          },
        })
      }

      const { error: deleteErr } = await supabaseAdmin.from('club_requests').delete().eq('id', id)
      if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    const existingByName = await supabaseAdmin
      .from('clubs')
      .select('id, name')
      .eq('name', request.club_name)
      .limit(1)
      .maybeSingle()

    if (existingByName.data?.id) {
      return NextResponse.json({ error: 'Ya existe un club con ese nombre o email de contacto.' }, { status: 409 })
    }

    let baseSlug = slugify(request.club_name) || 'club'
    let slug = baseSlug
    for (let i = 1; i <= 20; i++) {
      const { data: exists } = await supabaseAdmin.from('clubs').select('id').eq('slug', slug).maybeSingle()
      if (!exists?.id) break
      slug = `${baseSlug}-${i}`
    }

    const requesterName =
      requesterProfile?.display_name ||
      [requesterProfile?.first_name, requesterProfile?.last_name].filter(Boolean).join(' ').trim() ||
      request.owner_name ||
      null

    const { data: clubRow, error: clubErr } = await supabaseAdmin
      .from('clubs')
      .insert({
        name: request.club_name,
        brand_name: request.brand_name,
        legal_name: request.legal_name,
        cuit: request.cuit,
        slug,
        city: request.city,
        province: request.province,
        country: request.country || 'Argentina',
        address: request.address,
        phone: request.phone,
        contact_email: request.contact_email,
        website: request.website,
        instagram: request.instagram,
        opening_hours: request.opening_hours,
        courts_count: request.courts_count,
        courts_surface: request.courts_surface,
        logo_url: request.logo_url,
        notes: request.notes,
        rules_pdf_url: request.rules_pdf_url,
        owner_name: requesterName,
        owner_email: request.owner_email,
        owner_phone: request.owner_phone,
        owner_user_id: requesterProfile?.user_id ?? null,
        is_active: true,
      })
      .select('id, name')
      .single()

    if (clubErr) return NextResponse.json({ error: clubErr.message }, { status: 500 })

    if (requesterProfile?.user_id) {
      const { data: existingMembership } = await supabaseAdmin
        .from('club_memberships')
        .select('id')
        .eq('club_id', clubRow.id)
        .eq('user_id', requesterProfile.user_id)
        .maybeSingle()

      if (!existingMembership?.id) {
        const { error: membershipErr } = await supabaseAdmin.from('club_memberships').insert({
          club_id: clubRow.id,
          user_id: requesterProfile.user_id,
          role: 'OWNER',
          status: 'APPROVED',
          approved_by: auth.user!.id,
          approved_at: new Date().toISOString(),
        })

        if (membershipErr) {
          await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
          return NextResponse.json({ error: membershipErr.message }, { status: 500 })
        }
      }

      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('user_id, active_club_id')
        .eq('user_id', requesterProfile.user_id)
        .maybeSingle()

      if (!settings?.active_club_id) {
        await supabaseAdmin
          .from('user_settings')
          .upsert({ user_id: requesterProfile.user_id, active_club_id: clubRow.id }, { onConflict: 'user_id' })
      }

      await supabaseAdmin.from('notifications').insert({
        user_id: requesterProfile.user_id,
        type: 'club_request_approved',
        title: 'Solicitud de club aprobada',
        message: `Tu solicitud para ${clubRow.name} fue aprobada. Ya podés seleccionarlo como club activo.`,
        link: '/seleccionar-club',
        metadata: {
          club_request_id: request.id,
          club_id: clubRow.id,
          club_name: clubRow.name,
        },
      })
    }

    const { error: deleteErr } = await supabaseAdmin.from('club_requests').delete().eq('id', id)
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, status: 'APPROVED', clubId: clubRow.id, clubName: clubRow.name })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error procesando solicitud.' }, { status: 500 })
  }
}
