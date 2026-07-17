import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildConfirmEmailRedirectUrl } from '@/lib/authUrls'
import { meetsPasswordRequirements, passwordRequirementsMessage } from '@/lib/passwordPolicy'

type RegistrationPayload = {
  firstName?: unknown
  lastName?: unknown
  email?: unknown
  password?: unknown
}

type RegisterErrorCode =
  | 'EMAIL_ALREADY_REGISTERED'
  | 'EMAIL_RATE_LIMIT'
  | 'DATABASE_ERROR'
  | 'EMAIL_SEND_ERROR'
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

type RegisterFailure = {
  code: RegisterErrorCode
  message: string
  status: number
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function fail(failure: RegisterFailure) {
  return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status })
}

function logRegisterError(error: unknown) {
  if (process.env.NODE_ENV === 'production') return

  const source = error as { status?: unknown; code?: unknown; message?: unknown; name?: unknown }
  console.error('[register]', {
    status: typeof source?.status === 'number' ? source.status : null,
    code: typeof source?.code === 'string' ? source.code : null,
    message: typeof source?.message === 'string' ? source.message : 'Unknown registration error',
    name: typeof source?.name === 'string' ? source.name : 'Error',
  })
}

function mapSupabaseError(error: unknown): RegisterFailure {
  const source = error as { status?: unknown; code?: unknown; message?: unknown; name?: unknown }
  const status = typeof source?.status === 'number' ? source.status : 0
  const code = typeof source?.code === 'string' ? source.code.toLowerCase() : ''
  const message = typeof source?.message === 'string' ? source.message.toLowerCase() : ''

  if (status === 429 || code.includes('rate') || message.includes('rate limit') || message.includes('too many requests')) {
    return { code: 'EMAIL_RATE_LIMIT', message: 'Se alcanzó el límite de envíos. Esperá unos minutos antes de volver a intentarlo.', status: 429 }
  }
  if (code.includes('email') && (code.includes('exist') || code.includes('already'))) {
    return { code: 'EMAIL_ALREADY_REGISTERED', message: 'Ya existe una cuenta con este email.', status: 409 }
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('email exists')) {
    return { code: 'EMAIL_ALREADY_REGISTERED', message: 'Ya existe una cuenta con este email.', status: 409 }
  }
  if (code.includes('weak') || code.includes('password') || message.includes('password should') || message.includes('weak password')) {
    return { code: 'WEAK_PASSWORD', message: 'La contraseña no cumple los requisitos.', status: 400 }
  }
  if (code.includes('email') && (code.includes('send') || code.includes('delivery')) || message.includes('error sending confirmation email') || message.includes('email could not be sent')) {
    return { code: 'EMAIL_SEND_ERROR', message: 'La cuenta se creó, pero no pudimos enviar el correo de confirmación.', status: 502 }
  }
  if (code.includes('database') || code.includes('unexpected_failure') || message.includes('database error') || message.includes('saving new user')) {
    return { code: 'DATABASE_ERROR', message: 'No pudimos crear tu perfil. Revisá la configuración de la cuenta o intentá nuevamente.', status: 500 }
  }
  if (status >= 500) {
    return { code: 'UNKNOWN_ERROR', message: 'No pudimos crear tu cuenta.', status: 500 }
  }
  return { code: 'UNKNOWN_ERROR', message: 'No pudimos crear tu cuenta.', status: 400 }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return fail({ code: 'UNKNOWN_ERROR', message: 'No pudimos preparar el registro.', status: 500 })

  let payload: RegistrationPayload
  try {
    payload = await request.json() as RegistrationPayload
  } catch {
    return fail({ code: 'UNKNOWN_ERROR', message: 'Los datos del registro no son válidos.', status: 400 })
  }

  const firstName = text(payload.firstName)
  const lastName = text(payload.lastName)
  const email = text(payload.email).toLowerCase()
  const password = typeof payload.password === 'string' ? payload.password : ''

  if (firstName.length < 2 || lastName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
    return fail({ code: 'INVALID_EMAIL', message: 'Ingresá un email válido y completá nombre y apellido.', status: 400 })
  }
  if (!meetsPasswordRequirements(password)) {
    return fail({ code: 'WEAK_PASSWORD', message: passwordRequirementsMessage, status: 400 })
  }

  const displayName = `${firstName} ${lastName}`.trim()
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let emailRedirectTo: string
  try {
    emailRedirectTo = buildConfirmEmailRedirectUrl(new URL(request.url).origin)
  } catch (error) {
    logRegisterError(error)
    return fail({ code: 'UNKNOWN_ERROR', message: 'No pudimos preparar el correo de confirmación.', status: 500 })
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
        },
      },
    })

    if (error) {
      logRegisterError(error)
      return fail(mapSupabaseError(error))
    }

    // Supabase may deliberately return an empty identities array for an existing email
    // when email confirmation is enabled. Treat it as a normal accepted request to avoid enumeration.
    const identities = data.user?.identities ?? []
    if (data.user && identities.length === 0) {
      return NextResponse.json({ ok: true, code: 'SIGNUP_ACCEPTED' })
    }

    return NextResponse.json({ ok: true, code: 'SIGNUP_ACCEPTED' })
  } catch (error) {
    logRegisterError(error)
    return fail({ code: 'NETWORK_ERROR', message: 'No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.', status: 503 })
  }
}
