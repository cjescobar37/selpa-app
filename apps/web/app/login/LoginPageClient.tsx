'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import { BRAND } from '@/lib/branding'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

export default function LoginPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/auth/callback`
  }, [])

  useEffect(() => {
    const confirmed = searchParams.get('confirmed')
    const error = searchParams.get('error')

    if (confirmed === '1') {
      setAlert({
        variant: 'success',
        title: 'Email confirmado',
        message:
          'Tu cuenta fue validada correctamente. Ahora podés iniciar sesión.',
      })
      return
    }

    if (error) {
      setAlert({
        variant: 'error',
        title: 'No se pudo completar la validación',
        message: decodeURIComponent(error),
      })
    }
  }, [searchParams])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) router.replace('/auth/post-login')
    })
  }, [router])

  async function signInWithGoogle() {
    setAlert(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })

    if (error) {
      setAlert({
        variant: 'error',
        title: 'No se pudo iniciar sesión',
        message: error.message,
      })
      setLoading(false)
    }
  }

  async function signInWithEmail(e?: React.FormEvent) {
    e?.preventDefault()

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail || !password) {
      setAlert({
        variant: 'warning',
        title: 'Faltan datos',
        message: 'Completá email y contraseña.',
      })
      return
    }

    setLoading(true)
    setAlert(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error) {
      setAlert({
        variant: 'error',
        title: 'Credenciales inválidas',
        message: error.message,
      })
      setLoading(false)
      return
    }

    router.replace('/auth/post-login')
  }

  return (
    <div className="px-auth px-authModern px-loginAuth">
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

        <form className="px-authBody" onSubmit={signInWithEmail}>
          {loading ? (
            <div className="px-loginLoading" role="status" aria-live="polite">
              <span className="px-loginLoading__mark" aria-hidden="true">
                <span className="px-spinner" />
              </span>
              <div>
                <strong>Ingresando...</strong>
                <p>Preparando tu espacio</p>
              </div>
              <span className="px-loginLoading__line" aria-hidden="true" />
            </div>
          ) : (
            <>
              <button
                className="px-btn px-btnGoogle"
                type="button"
                onClick={signInWithGoogle}
              >
                <img
                  src="https://www.svgrepo.com/show/475656/google-color.svg"
                  width={16}
                  height={16}
                  alt=""
                />
                Continuar con Google
              </button>

              <div className="px-sepRow">o</div>

              <div className="px-field">
                <label className="px-label">Email</label>
                <input
                  className="px-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="username"
                />
              </div>

              <div className="px-field">
                <label className="px-label">Contraseña</label>
                <input
                  className="px-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button className="px-btn" type="submit">
                Ingresar
              </button>
              <p className="px-loginSecureText">Tus datos viajan protegidos mediante conexión segura.</p>

              {alert ? (
                <AuthAlert
                  variant={alert.variant}
                  title={alert.title}
                  message={alert.message}
                />
              ) : null}

              <div className="px-authRow px-loginLinks">
                <Link className="px-loginLinkBlock" href="/register">
                  <span>¿Primera vez?</span>
                  <strong>Crear cuenta <b>→</b></strong>
                </Link>
                <Link className="px-loginLinkBlock" href="/reset-password">
                  <span>¿Olvidaste tu contraseña?</span>
                  <strong>Recuperarla <b>→</b></strong>
                </Link>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
