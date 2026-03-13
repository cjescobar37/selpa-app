import { NextResponse } from 'next/server'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'

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
    contact_email?: string
    website?: string
    instagram?: string
    opening_hours?: string
    courts_count?: number | string
    courts_surface?: string
    logo_url?: string
    notes?: string
    rules_pdf_url?: string
  }
  owner: {
    email: string
    password: string
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
    if (!pa?.user_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

    const name = (body.club?.name ?? '').trim()
    const brand_name = (body.club?.brand_name ?? '').trim() || null
    const legal_name = (body.club?.legal_name ?? '').trim() || null
    const cuit = String(body.club?.cuit ?? '').replace(/\D/g, '') || null
    const city = (body.club?.city ?? '').trim() || null
    const province = (body.club?.province ?? '').trim() || null
    const country = (body.club?.country ?? '').trim() || 'Argentina'
    const address = (body.club?.address ?? '').trim() || null
    const phone = (body.club?.phone ?? '').trim() || null
    const contact_email = (body.club?.contact_email ?? '').trim().toLowerCase() || null
    const website = (body.club?.website ?? '').trim() || null
    const instagram = (body.club?.instagram ?? '').trim() || null
    const opening_hours = (body.club?.opening_hours ?? '').trim() || null
    const courts_count = body.club?.courts_count ? Number(body.club.courts_count) : null
    const courts_surface = (body.club?.courts_surface ?? '').trim() || null
    const logo_url = (body.club?.logo_url ?? '').trim() || null
    const notes = (body.club?.notes ?? '').trim() || null
    const rules_pdf_url = (body.club?.rules_pdf_url ?? '').trim() || null

    const email = (body.owner?.email ?? '').trim().toLowerCase()
    const password = (body.owner?.password ?? '').trim()
    const fullName = (body.owner?.fullName ?? '').trim() || null
    const ownerPhone = (body.owner?.phone ?? '').trim() || null

    if (name.length < 2) return NextResponse.json({ error: 'Nombre de club inválido' }, { status: 400 })
    if (!email.includes('@')) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'La clave debe tener al menos 8 caracteres' }, { status: 400 })

    let baseSlug = slugify(name) || 'club'
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
        logo_url, notes, rules_pdf_url, owner_name: fullName, owner_email: email, owner_phone: ownerPhone,
        is_active: true,
      })
      .select('id,name,slug')
      .single()

    if (clubErr) return NextResponse.json({ error: clubErr.message }, { status: 500 })

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

    const ownerId = created.user.id

    const { error: clubOwnerErr } = await supabaseAdmin.from('clubs').update({ owner_user_id: ownerId }).eq('id', clubRow.id)
    if (clubOwnerErr) {
      await supabaseAdmin.auth.admin.deleteUser(ownerId)
      await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
      return NextResponse.json({ error: clubOwnerErr.message }, { status: 500 })
    }

    const { error: mErr } = await supabaseAdmin.from('club_memberships').insert({
      club_id: clubRow.id,
      user_id: ownerId,
      role: 'OWNER',
      status: 'APPROVED',
    })

    if (mErr) {
      await supabaseAdmin.auth.admin.deleteUser(ownerId)
      await supabaseAdmin.from('clubs').delete().eq('id', clubRow.id)
      return NextResponse.json({ error: mErr.message }, { status: 500 })
    }

    await supabaseAdmin.from('user_settings').upsert({ user_id: ownerId, active_club_id: clubRow.id }, { onConflict: 'user_id' })

    return NextResponse.json({ clubId: clubRow.id, ownerId, clubName: clubRow.name, slug: clubRow.slug })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
