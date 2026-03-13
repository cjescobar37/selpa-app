import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase()
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { identifier?: string }
    const identifier = normalizeIdentifier(body?.identifier ?? '')
    if (!identifier) {
      return NextResponse.json({ error: 'Falta identifier' }, { status: 400 })
    }

    const digits = normalizeDigits(identifier)

    // 1) exact email matches first
    const { data: byEmail } = await supabaseAdmin
      .from('clubs')
      .select('owner_email, contact_email, slug, cuit, is_active')
      .or(`owner_email.eq.${identifier},contact_email.eq.${identifier}`)
      .eq('is_active', true)
      .limit(1)

    const emailRow = byEmail?.[0]
    if (emailRow?.owner_email || emailRow?.contact_email) {
      return NextResponse.json({
        email: (emailRow.owner_email || emailRow.contact_email || '').toLowerCase(),
        matchType: emailRow.owner_email?.toLowerCase() === identifier ? 'owner_email' : 'contact_email',
      })
    }

    // 2) slug / cuit
    const filters: string[] = [`slug.eq.${identifier}`]
    if (digits) filters.push(`cuit.eq.${digits}`)

    const { data: byKeys, error } = await supabaseAdmin
      .from('clubs')
      .select('owner_email, contact_email, slug, cuit, is_active')
      .or(filters.join(','))
      .eq('is_active', true)
      .limit(1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = byKeys?.[0]
    if (!row) {
      return NextResponse.json({ error: 'No encontramos un club activo con ese identificador' }, { status: 404 })
    }

    const resolvedEmail = (row.owner_email || row.contact_email || '').toLowerCase()
    if (!resolvedEmail) {
      return NextResponse.json({ error: 'El club no tiene email configurado para iniciar sesión' }, { status: 400 })
    }

    return NextResponse.json({
      email: resolvedEmail,
      matchType: row.slug === identifier ? 'slug' : row.cuit === digits ? 'cuit' : 'email',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
