import { NextResponse } from 'next/server'
import { withNotificationScope } from '@/lib/notificationScope'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'
import { ensureClubPlayerForMembership, setActiveClubIfApproved } from '@/lib/clubMembershipServer'

type Body = {
  accessToken: string
  club: {
    name: string
    brand_name?: string
    legal_name?: string
    cuit?: string
    city?: string
    province?: string
    country?: string
    address?: string
    phone?: string
    mobile_phone?: string
    contact_email?: string
    website?: string
    instagram?: string
    opening_hours?: string
    opening_hours_json?: Array<{ day: string; label?: string; opens: string; closes: string }>
    courts_count?: number | string
    courts_surface?: string
    court_surfaces?: Array<{ surface: string; courts: number }>
    logo_url?: string
    notes?: string
    description?: string
    rules_pdf_url?: string
  }
  owner: {
    email?: string
    password?: string
    fullName?: string
    phone?: string
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function POST(req: Request) {
  try {
    assertServiceRole()

    const body = (await req.json()) as Body
    if (!body?.accessToken) {
      return NextResponse.json({ error: 'Falta accessToken' }, { status: 400 })
    }

    const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(body.accessToken)
    if (uErr || !u?.user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const requesterId = u.user.id
    const { data: pa, error: paErr } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', requesterId)
      .maybeSingle()

    if (paErr) return NextResponse.json({ error: paErr.message }, { status: 500 })
    const isPlatformAdmin = !!pa?.user_id

    const name = (body.club?.name ?? '').trim()
    const brand_name = (body.club?.brand_name ?? '').trim() || null
    const legal_name = (body.club?.legal_name ?? '').trim() || null
    const cuit = String(body.club?.cuit ?? '').replace(/\D/g, '') || null
    const city = (body.club?.city ?? '').trim() || null
    const province = (body.club?.province ?? '').trim() || null
    const country = (body.club?.country ?? '').trim() || 'Argentina'
    const address = (body.club?.address ?? '').trim() || null
    const phone = (body.club?.phone ?? '').trim() || null
    const mobile_phone = (body.club?.mobile_phone ?? '').trim() || null
    const contact_email = (body.club?.contact_email ?? '').trim().toLowerCase() || null
    const website = (body.club?.website ?? '').trim() || null
    const instagram = (body.club?.instagram ?? '').trim() || null
    const opening_hours_json = Array.isArray(body.club?.opening_hours_json)
      ? body.club.opening_hours_json
          .filter((item) => item?.day && item?.opens && item?.closes)
          .map((item) => ({
            day: String(item.day),
            label: item.label ? String(item.label) : null,
            opens: String(item.opens),
            closes: String(item.closes),
          }))
      : null
    const opening_hours =
      (body.club?.opening_hours ?? '').trim() ||
      opening_hours_json?.map((item) => `${item.label ?? item.day}: ${item.opens}-${item.closes}`).join(', ') ||
      null
    const courts_count = body.club?.courts_count ? Number(body.club.courts_count) : null
    const court_surfaces = Array.isArray(body.club?.court_surfaces)
      ? body.club.court_surfaces
          .filter((item) => item?.surface && Number(item.courts) > 0)
          .map((item) => ({
            surface: String(item.surface),
            courts: Number(item.courts),
          }))
      : null
    const courts_surface =
      (body.club?.courts_surface ?? '').trim() ||
      court_surfaces?.map((item) => `${item.surface}: ${item.courts}`).join(', ') ||
      null
    const logo_url = (body.club?.logo_url ?? '').trim() || null
    const description = (body.club?.description ?? '').trim() || null
    const notes = (body.club?.notes ?? '').trim() || description
    const rules_pdf_url = (body.club?.rules_pdf_url ?? '').trim() || null

    const requestedOwnerEmail = (body.owner?.email ?? '').trim().toLowerCase()
    const password = (body.owner?.password ?? '').trim()
    const requesterEmail = (u.user.email ?? '').trim().toLowerCase()
    const shouldCreateOwnerUser = isPlatformAdmin && Boolean(requestedOwnerEmail && password)
    const email = shouldCreateOwnerUser ? requestedOwnerEmail : requesterEmail
    const fullName =
      (body.owner?.fullName ?? '').trim() ||
      String(u.user.user_metadata?.full_name ?? u.user.user_metadata?.name ?? '').trim() ||
      email.split('@')[0] ||
      null
    const ownerPhone = (body.owner?.phone ?? '').trim() || null

    if (name.length < 2) return NextResponse.json({ error: 'Nombre de club inválido' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    if (shouldCreateOwnerUser && password.length < 8) {
      return NextResponse.json({ error: 'La clave debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const baseSlug = slugify(name) || 'club'
    let slug = baseSlug
    for (let i = 1; i <= 20; i++) {
      const { data: exists } = await supabaseAdmin.from('clubs').select('id').eq('slug', slug).maybeSingle()
      if (!exists?.id) break
      slug = `${baseSlug}-${i}`
    }

    const { data: clubRow, error: clubErr } = await supabaseAdmin
      .from('clubs')
      .insert({
        name, brand_name, legal_name, cuit, slug, city, province, country, address, phone,
        contact_email, website, instagram, opening_hours, courts_count, courts_surface,
        logo_url, notes, rules_pdf_url, mobile_phone, description, court_surfaces, opening_hours_json,
        owner_name: fullName, owner_email: email, owner_phone: ownerPhone,
        is_active: false,
        status: 'PENDING_APPROVAL',
      })
      .select('id,name,slug')
      .single()

    if (clubErr) return NextResponse.json({ error: clubErr.message }, { status: 500 })

    let ownerId = requesterId
    let createdOwnerUser = false

    if (shouldCreateOwnerUser) {
      const { data: created, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      })

      if (createUserErr || !created?.user) {
        await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
        return NextResponse.json({ error: createUserErr?.message ?? 'No pude crear el usuario' }, { status: 500 })
      }

      ownerId = created.user.id
      createdOwnerUser = true
    }

    const approvedAt = new Date().toISOString()

    const { error: clubOwnerErr } = await supabaseAdmin.from('clubs').update({ owner_user_id: ownerId }).eq('id', clubRow.id)
    if (clubOwnerErr) {
      if (createdOwnerUser) await supabaseAdmin.auth.admin.deleteUser(ownerId)
      await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
      return NextResponse.json({ error: clubOwnerErr.message }, { status: 500 })
    }

    const { error: mErr } = await supabaseAdmin.from('club_memberships').insert({
      club_id: clubRow.id,
      user_id: ownerId,
      role: 'OWNER',
      status: 'APPROVED',
      approved_by: requesterId,
      approved_at: approvedAt,
    })

    if (mErr) {
      if (createdOwnerUser) await supabaseAdmin.auth.admin.deleteUser(ownerId)
      await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
      return NextResponse.json({ error: mErr.message }, { status: 500 })
    }

    try {
      await ensureClubPlayerForMembership({
        clubId: clubRow.id,
        userId: ownerId,
        approvedBy: requesterId,
        approvedAt,
      })
      await setActiveClubIfApproved(ownerId, clubRow.id)
    } catch (consistencyError: unknown) {
      if (createdOwnerUser) await supabaseAdmin.auth.admin.deleteUser(ownerId)
      await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
      return NextResponse.json({
        error: consistencyError instanceof Error ? consistencyError.message : 'No pude dejar consistente el owner.',
      }, { status: 500 })
    }

    const { data: platformAdmins } = await supabaseAdmin
      .from('platform_admins')
      .select('user_id')

    const adminIds = Array.from(new Set((platformAdmins ?? []).map((row: any) => row.user_id).filter(Boolean)))
    if (adminIds.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        adminIds.map((userId: string) => ({
          user_id: userId,
          type: 'club_created_pending_review',
          title: 'Nuevo club para revisar',
          message: `${clubRow.name} quedó en pendiente de aprobación y ya está listo para revisión platform.`,
          link: `/platform/clubs?focus=${clubRow.id}`,
          metadata: withNotificationScope(
            {
              club_id: clubRow.id,
              club_name: clubRow.name,
              owner_user_id: ownerId,
              owner_email: email,
            },
            'platform'
          ),
        }))
      )
    }

    return NextResponse.json({ clubId: clubRow.id, ownerId, clubName: clubRow.name, slug: clubRow.slug })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
