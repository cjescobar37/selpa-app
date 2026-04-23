import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null

  return data.user
}

async function canManageClub(userId: string, clubId: string) {
  const { data: platformAdmin } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (platformAdmin?.user_id) return true

  const { data: membership } = await supabaseAdmin
    .from('club_memberships')
    .select('role, status')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (!membership) return false
  if (membership.status !== 'APPROVED') return false

  return ['OWNER', 'ADMIN', 'PLANILLERO'].includes(membership.role)
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req)

    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const form = await req.formData()
    const clubId = String(form.get('clubId') ?? '')
    const assetType = String(form.get('assetType') ?? '')
    const file = form.get('file')

    if (!clubId || !assetType || !(file instanceof File)) {
      return NextResponse.json({ error: 'Faltan datos para subir el archivo.' }, { status: 400 })
    }

    const allowed = await canManageClub(user.id, clubId)
    if (!allowed) {
      return NextResponse.json({ error: 'No tenés permisos para modificar este club.' }, { status: 403 })
    }

    let bucket = ''
    let folder = ''
    let targetColumn: 'logo_url' | 'rules_pdf_url'

    if (assetType === 'logo') {
      bucket = 'club-logos'
      folder = 'logos'
      targetColumn = 'logo_url'
    } else if (assetType === 'rules_pdf') {
      bucket = 'club-rules'
      folder = 'rules'
      targetColumn = 'rules_pdf_url'

      const fileName = file.name.toLowerCase()
      const fileType = file.type.toLowerCase()

      if (fileType !== 'application/pdf' && !fileName.endsWith('.pdf')) {
        return NextResponse.json({ error: 'El reglamento debe ser PDF.' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Tipo de archivo inválido.' }, { status: 400 })
    }

    const ext =
      (file.name.split('.').pop() || (assetType === 'logo' ? 'png' : 'pdf')).toLowerCase()
    const baseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, '')) || assetType
    const objectPath = `${folder}/${clubId}/${Date.now()}-${baseName}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(objectPath, fileBuffer, {
        contentType: file.type || undefined,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath)
    const publicUrl = publicUrlData.publicUrl

    const { error: updateError } = await supabaseAdmin
      .from('clubs')
      .update({ [targetColumn]: publicUrl })
      .eq('id', clubId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      publicUrl,
      assetType,
      targetColumn,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error subiendo archivo' }, { status: 500 })
  }
}