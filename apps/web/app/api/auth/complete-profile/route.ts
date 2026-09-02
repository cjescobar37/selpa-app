import { NextResponse } from 'next/server'
import { countries, findArgentinaLocation } from '@/lib/argentinaLocations'
import { isValidBirthDate } from '@/lib/birthDate'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ASSET_BUCKET = 'player-assets'
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

type CompletionStep = 'personal' | 'sports'

class CompleteProfileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

type DatabaseError = {
  code?: string
  details?: string | null
  hint?: string | null
  message?: string
}

function profileSaveError(error: DatabaseError): CompleteProfileError {
  const code = error.code ?? 'DATABASE_ERROR'
  const message = error.message ?? 'Database error'

  console.error('[complete-profile:database]', {
    code,
    message,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  })

  if (code === '42703') {
    return new CompleteProfileError('PROFILE_SCHEMA_OUTDATED', 'Falta actualizar la estructura del perfil. Intentá nuevamente en unos minutos.')
  }
  if (code === '23514') {
    if (message.includes('profiles_phone_e164_check')) {
      return new CompleteProfileError('PHONE_FORMAT_CONSTRAINT_OUTDATED', 'La validación de celular requiere una actualización de configuración.')
    }
    return new CompleteProfileError('PROFILE_DATA_INVALID', 'Uno de los datos del perfil no cumple con el formato requerido.')
  }
  if (code === '23502') {
    return new CompleteProfileError('PROFILE_DATA_INCOMPLETE', 'No pudimos completar los datos requeridos de tu perfil.')
  }

  return new CompleteProfileError('PROFILE_SAVE_FAILED', 'No pudimos guardar tu perfil. Intentá nuevamente.')
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function splitFullName(value?: string | null) {
  const parts = text(value ?? null).split(' ').filter(Boolean)
  if (parts.length < 2 || parts.some((part) => part.length < 2)) return null
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '', displayName: parts.join(' ') }
}

function fileName(value: string, fallback: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase() || fallback
}

function getImageExtension(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

async function hasSupportedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50

  return (file.type === 'image/jpeg' && isJpeg) || (file.type === 'image/png' && isPng) || (file.type === 'image/webp' && isWebp)
}

async function uploadImage(userId: string, file: File, folder: 'avatars' | 'covers', maxBytes: number) {
  if (!imageTypes.has(file.type) || !(await hasSupportedImageSignature(file))) {
    throw new Error('Usá una imagen JPG, PNG o WEBP.')
  }
  if (file.size > maxBytes) {
    throw new Error(`La imagen no puede superar los ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  }

  const extension = getImageExtension(file)
  const path = `${folder}/${userId}/${Date.now()}-${fileName(file.name.replace(/\.[^.]+$/, ''), folder)}.${extension}`
  const { error } = await supabaseAdmin.storage.from(ASSET_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error('No pudimos subir la imagen. Intentá nuevamente.')

  return supabaseAdmin.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

function normalizeArgentinaPhone(areaCodeValue: string, phoneNumberValue: string) {
  const areaCode = areaCodeValue.replace(/\D/g, '')
  const phoneNumber = phoneNumberValue.replace(/\D/g, '')
  const nationalNumber = `${areaCode}${phoneNumber}`

  if (!/^\d{2,5}$/.test(areaCode) || !/^\d{6,8}$/.test(phoneNumber) || nationalNumber.length < 8 || nationalNumber.length > 13) {
    return null
  }

  return {
    areaCode,
    phoneNumber,
    e164: `+549${nationalNumber}`,
  }
}

async function upsertProfile(userId: string, email: string | null | undefined, patch: Record<string, unknown>) {
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('user_id,avatar_url,cover_url')
    .maybeSingle()

  if (updateError) throw profileSaveError(updateError)
  if (updated) return updated

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: userId, user_id: userId, email: email ?? null, ...patch })
    .select('user_id,avatar_url,cover_url')
    .single()

  if (insertError) throw profileSaveError(insertError)
  return inserted
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'No pudimos validar tu sesión.' }, { status: 401 })

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  const user = authData.user
  if (authError || !user) return NextResponse.json({ code: 'UNAUTHENTICATED', message: 'Tu sesión ya no es válida.' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ code: 'INVALID_FORM', message: 'Los datos del perfil no son válidos.' }, { status: 400 })
  }

  const step = text(form.get('step')) as CompletionStep
  if (step !== 'personal' && step !== 'sports') {
    return NextResponse.json({ code: 'INVALID_STEP', message: 'El paso de onboarding no es válido.' }, { status: 400 })
  }

  try {
    if (step === 'personal') {
      const birthDate = text(form.get('birthDate'))
      const gender = text(form.get('gender'))
      const countryCode = text(form.get('countryCode'))
      const provinceId = text(form.get('provinceId'))
      const cityId = text(form.get('cityId'))
      const phone = normalizeArgentinaPhone(text(form.get('phoneAreaCode')), text(form.get('phoneNumber')))
      const country = countries.find((item) => item.code === countryCode)
      const location = countryCode === 'AR' ? findArgentinaLocation(provinceId, cityId) : null
      const { data: identity, error: identityError } = await supabaseAdmin
        .from('profiles')
        .select('first_name,last_name,display_name,birth_date,gender')
        .eq('user_id', user.id)
        .maybeSingle()

      if (identityError) throw new CompleteProfileError('PROFILE_LOOKUP_FAILED', 'No pudimos validar tu perfil. Intentá nuevamente.')
      const storedName = splitFullName([identity?.first_name, identity?.last_name].filter(Boolean).join(' '))
      const profileName = splitFullName(identity?.display_name)
      const metadataName = splitFullName(String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name ?? ''))
      const submittedName = splitFullName(text(form.get('fullName')))
      const fullName = storedName ?? profileName ?? metadataName ?? submittedName
      if (!fullName) throw new CompleteProfileError('MISSING_IDENTITY', 'Ingresá tu nombre y apellido para continuar.')
      if (!isValidBirthDate(birthDate)) throw new CompleteProfileError('INVALID_BIRTH_DATE', 'Seleccioná una fecha de nacimiento válida.')
      if (gender !== 'FEMALE' && gender !== 'MALE') throw new CompleteProfileError('INVALID_GENDER', 'Elegí Dama o Caballero.')
      if (identity?.birth_date && identity.birth_date !== birthDate) {
        throw new CompleteProfileError('BIRTH_DATE_LOCKED', 'La fecha de nacimiento ya fue verificada y no se puede modificar desde tu cuenta.')
      }
      if (identity?.gender && identity.gender !== gender) {
        throw new CompleteProfileError('GENDER_LOCKED', 'El género ya fue verificado y no se puede modificar desde tu cuenta.')
      }
      if (!country || !location) throw new CompleteProfileError('INVALID_LOCATION', 'Elegí una provincia y localidad válidas.')
      if (!phone) throw new CompleteProfileError('INVALID_PHONE', 'Ingresá un celular válido.')

      const profile = await upsertProfile(user.id, user.email, {
        ...(storedName ? {} : {
          first_name: fullName.firstName,
          last_name: fullName.lastName,
          ...(text(identity?.display_name ?? null) ? {} : { display_name: fullName.displayName }),
        }),
        birth_date: birthDate,
        gender,
        country_code: country.code,
        country: country.name,
        province_id: location.province.id,
        province: location.province.name,
        city_id: location.city.id,
        city: location.city.name,
        phone_country_code: '+54',
        phone_area_code: phone.areaCode,
        phone_number: phone.phoneNumber,
        phone_e164: phone.e164,
      })
      return NextResponse.json({ ok: true, profile })
    }

    const rawHeight = text(form.get('heightCm'))
    const parsedHeight = rawHeight ? Number(rawHeight) : null
    const dominantHand = text(form.get('dominantHand'))
    const preferredPosition = text(form.get('preferredPosition'))
    const removeAvatar = text(form.get('removeAvatar')) === 'true'
    const removeCover = text(form.get('removeCover')) === 'true'
    const avatar = form.get('avatar')
    const cover = form.get('cover')

    if (rawHeight && (!Number.isInteger(parsedHeight) || parsedHeight === null || parsedHeight < 120 || parsedHeight > 230)) {
      throw new CompleteProfileError('INVALID_HEIGHT', 'La altura debe estar entre 120 y 230 cm.')
    }
    if (dominantHand && !['RIGHT', 'LEFT', 'AMBIDEXTROUS'].includes(dominantHand)) throw new CompleteProfileError('INVALID_DOMINANT_HAND', 'La mano hábil no es válida.')
    if (preferredPosition && !['DRIVE', 'REVES', 'BOTH'].includes(preferredPosition)) throw new CompleteProfileError('INVALID_POSITION', 'La posición preferida no es válida.')

    const patch: Record<string, unknown> = {}
    if (rawHeight) patch.height_cm = parsedHeight
    if (dominantHand) patch.dominant_hand = dominantHand
    if (preferredPosition) patch.preferred_position = preferredPosition
    if (removeAvatar) patch.avatar_url = null
    if (removeCover) patch.cover_url = null
    if (avatar instanceof File && avatar.size > 0) patch.avatar_url = await uploadImage(user.id, avatar, 'avatars', 3 * 1024 * 1024)
    if (cover instanceof File && cover.size > 0) patch.cover_url = await uploadImage(user.id, cover, 'covers', 5 * 1024 * 1024)

    const profile = Object.keys(patch).length > 0
      ? await upsertProfile(user.id, user.email, patch)
      : (await supabaseAdmin.from('profiles').select('user_id,avatar_url,cover_url').eq('user_id', user.id).maybeSingle()).data
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    if (error instanceof CompleteProfileError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 })
    }

    return NextResponse.json({ code: 'PROFILE_SAVE_FAILED', message: 'No pudimos guardar tu perfil. Intentá nuevamente.' }, { status: 500 })
  }
}
