'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthAlert from '@/components/AuthAlert'
import PasswordField, { meetsPasswordRequirements } from '@/components/auth/PasswordField'
import { BRAND } from '@/lib/branding'
import { supabase } from '@/lib/supabaseClient'

type RegisterErrorCode = 'EMAIL_ALREADY_REGISTERED' | 'EMAIL_RATE_LIMIT' | 'DATABASE_ERROR' | 'EMAIL_SEND_ERROR' | 'INVALID_EMAIL' | 'WEAK_PASSWORD' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'
type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string; code?: RegisterErrorCode } | null
type FieldName = 'firstName' | 'lastName' | 'email' | 'password' | 'password2'
type FieldErrors = Partial<Record<FieldName, string>>

const fieldOrder: FieldName[] = ['firstName', 'lastName', 'email', 'password', 'password2']

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function registerAlertFromCode(code: RegisterErrorCode, fallback?: string): AlertState {
  switch (code) {
    case 'EMAIL_ALREADY_REGISTERED':
      return { variant: 'error', code, title: 'Ya existe una cuenta con este email.', message: 'Ingresá o recuperá tu contraseña.' }
    case 'EMAIL_RATE_LIMIT':
      return { variant: 'error', code, title: 'Demasiados intentos.', message: 'Esperá unos minutos antes de solicitar otro correo.' }
    case 'DATABASE_ERROR':
      return { variant: 'error', code, title: 'No pudimos completar tu registro.', message: 'El equipo debe revisar la configuración del perfil.' }
    case 'EMAIL_SEND_ERROR':
      return { variant: 'error', code, title: 'La cuenta se creó, pero no pudimos enviar el correo.', message: 'Esperá unos minutos e intentá nuevamente.' }
    case 'NETWORK_ERROR':
      return { variant: 'error', code, title: 'No pudimos conectarnos.', message: 'Revisá tu conexión e intentá nuevamente.' }
    default:
      return { variant: 'error', code, title: fallback ?? 'No pudimos crear tu cuenta.' }
  }
}

export default function RegisterPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)

  const oauthRedirectTo = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/auth/callback`
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) router.replace('/auth/post-login')
    })
  }, [router])

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function focusFirstInvalidField(errors: FieldErrors) {
    const firstField = fieldOrder.find((field) => errors[field])
    if (!firstField) return

    const inputId = {
      firstName: 'register-first-name',
      lastName: 'register-last-name',
      email: 'register-email',
      password: 'register-password',
      password2: 'register-password-confirm',
    }[firstField]
    const input = document.getElementById(inputId) as HTMLInputElement | null
    if (!input) return

    input.scrollIntoView({ behavior: 'smooth', block: 'center' })
    requestAnimationFrame(() => input.focus({ preventScroll: true }))
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault()
    setAlert(null)

    const cleanFirstName = normalizeName(firstName)
    const cleanLastName = normalizeName(lastName)
    const cleanEmail = email.trim().toLowerCase()
    const nextErrors: FieldErrors = {}

    if (!cleanFirstName) nextErrors.firstName = 'Ingresá tu nombre.'
    else if (cleanFirstName.length < 2) nextErrors.firstName = 'El nombre debe tener al menos 2 caracteres.'
    if (!cleanLastName) nextErrors.lastName = 'Ingresá tu apellido.'
    else if (cleanLastName.length < 2) nextErrors.lastName = 'El apellido debe tener al menos 2 caracteres.'
    if (!cleanEmail) nextErrors.email = 'Ingresá tu email.'
    else if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) nextErrors.email = 'Ingresá un email válido.'
    if (!password) nextErrors.password = 'Ingresá una contraseña.'
    else if (!meetsPasswordRequirements(password)) nextErrors.password = 'Revisá los requisitos.'
    if (!password2) nextErrors.password2 = 'Repetí la contraseña.'
    else if (password !== password2) nextErrors.password2 = 'Las contraseñas no coinciden.'

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors)
      return
    }

    setLoading(true)
    let response: Response
    let result: { code?: RegisterErrorCode; message?: string } | null
    try {
      response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: cleanFirstName, lastName: cleanLastName, email: cleanEmail, password }),
      })
      result = await response.json().catch(() => null) as { code?: RegisterErrorCode; message?: string } | null
    } catch {
      setAlert(registerAlertFromCode('NETWORK_ERROR'))
      setLoading(false)
      return
    }

    if (!response.ok) {
      const code = result?.code ?? 'UNKNOWN_ERROR'
      setAlert(registerAlertFromCode(code, result?.message))
      setLoading(false)
      return
    }

    router.replace(`/register/success?email=${encodeURIComponent(cleanEmail)}`)
  }

  async function signUpWithGoogle() {
    setAlert(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirectTo },
    })

    if (error) {
      setAlert({ variant: 'error', title: 'No pudimos continuar con Google.', message: error.message })
      setLoading(false)
    }
  }

  return (
    <div className="px-auth px-authModern px-registerAuth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authBrandText">
              <span className="px-authMark" aria-label={`${BRAND.name} logo`}>
                <img src="/brand/selpa-wordmark-clean-dark.png" alt={BRAND.name.toUpperCase()} />
              </span>
              <p className="px-authSub">Ingresá a tu comunidad deportiva.</p>
            </div>
          </div>
        </div>

        <form className="px-authBody" onSubmit={signUp}>
          <button className="px-btn px-btnGoogle" type="button" onClick={signUpWithGoogle} disabled={loading}>
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" width={16} height={16} alt="" />
            Continuar con Google
          </button>

          <div className="px-sepRow">o</div>

          <div className="px-registerNameRow">
            <div className="px-field">
              <label className="px-label" htmlFor="register-first-name">Nombre</label>
              <input id="register-first-name" className="px-input" value={firstName} onChange={(event) => { setFirstName(event.target.value); clearFieldError('firstName') }} autoComplete="given-name" aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? 'register-first-name-error' : undefined} />
              {fieldErrors.firstName ? <p id="register-first-name-error" className="px-fieldError" role="alert">{fieldErrors.firstName}</p> : null}
            </div>
            <div className="px-field">
              <label className="px-label" htmlFor="register-last-name">Apellido</label>
              <input id="register-last-name" className="px-input" value={lastName} onChange={(event) => { setLastName(event.target.value); clearFieldError('lastName') }} autoComplete="family-name" aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? 'register-last-name-error' : undefined} />
              {fieldErrors.lastName ? <p id="register-last-name-error" className="px-fieldError" role="alert">{fieldErrors.lastName}</p> : null}
            </div>
          </div>

          <div className="px-field">
            <label className="px-label" htmlFor="register-email">Email</label>
            <input id="register-email" className="px-input" type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearFieldError('email') }} placeholder="nombre@correo.com" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} />
            {fieldErrors.email ? <p id="register-email-error" className="px-fieldError" role="alert">{fieldErrors.email}</p> : null}
          </div>

          <div className="px-registerPasswordRow">
            <PasswordField id="register-password" label="Contraseña" value={password} onChange={(value) => { setPassword(value); clearFieldError('password') }} autoComplete="new-password" error={fieldErrors.password} disabled={loading} minLength={8} showRequirements />
            <PasswordField id="register-password-confirm" label="Confirmar" inputAriaLabel="Confirmar contraseña" value={password2} onChange={(value) => { setPassword2(value); clearFieldError('password2') }} autoComplete="new-password" error={fieldErrors.password2} disabled={loading} minLength={8} reserveRequirements />
          </div>

          <button className="px-btn" type="submit" disabled={loading}>{loading ? 'Creando...' : 'Crear cuenta'}</button>
          {alert ? <div className="px-registerAlert"><AuthAlert variant={alert.variant} title={alert.title} message={alert.message} />{alert.code === 'EMAIL_ALREADY_REGISTERED' ? <div className="px-registerAlertActions"><Link className="px-link" href="/login">Ingresar</Link><Link className="px-link" href="/reset-password">Recuperar contraseña</Link></div> : null}</div> : null}
          <div className="px-authRow"><span className="px-muted">¿Ya tenés cuenta?</span><Link className="px-link" href="/login">Ingresar</Link></div>
        </form>
      </div>
    </div>
  )
}
