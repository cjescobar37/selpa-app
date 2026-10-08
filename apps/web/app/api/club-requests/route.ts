import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { CLUB_THEMES } from '@/lib/clubThemes'
import { randomUUID } from 'node:crypto'
import { writeErrorResponse } from '@/lib/writeFlowServer'

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
  theme_key?: string
  requestId?: string
}

const CLUB_THEME_KEYS = new Set(Object.keys(CLUB_THEMES))

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

  if (paErr) return { error: writeErrorResponse('club-request.authorize', paErr), user: null }
  if (!pa?.user_id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET(req: Request) {
  const auth = await assertPlatformAdmin(req)
  if (auth.error) return auth.error

  const { data, error } = await supabaseAdmin
    .from('club_requests')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })

  if (error) return writeErrorResponse('club-request.list', error, 'No pudimos cargar las altas. Reintentá.')

  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ClubRequestPayload | null
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.entries(body).some(([key,value])=>
      key!=='courts_count'&&key!=='actor_id'&&value!=null&&typeof value!=='string'
    ))return NextResponse.json({error:'Revisá los datos de la solicitud.',kind:'VALIDATION'},{status:400})
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
      theme_key: (body.theme_key ?? '').trim(),
    }

    if (!payload.club_name || !payload.contact_email || !payload.owner_name || !payload.owner_email) {
      return NextResponse.json({ error: 'Faltan campos obligatorios.' }, { status: 400 })
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.owner_email)
      ||(payload.courts_count!==null&&(!Number.isInteger(payload.courts_count)||payload.courts_count<1))) {
      return NextResponse.json({error:'Revisá los emails y la cantidad de canchas.',kind:'VALIDATION'},{status:400})
    }
    if (!CLUB_THEME_KEYS.has(payload.theme_key)) {
      return NextResponse.json({ error: 'Elegí una identidad visual válida para el club.' }, { status: 400 })
    }

    const requestId = body.requestId ?? randomUUID()
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(requestId)) {
      return NextResponse.json({ error: 'Solicitud inválida.', kind: 'VALIDATION' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin.rpc('submit_club_request_pass3', {
      p_request_id: requestId, p_payload: payload,
    })
    if (error) return writeErrorResponse('club-request.submit', error)
    return NextResponse.json(data)
  } catch {
    return writeErrorResponse('club-request.submit', { code: 'UNEXPECTED' })
  }
}
