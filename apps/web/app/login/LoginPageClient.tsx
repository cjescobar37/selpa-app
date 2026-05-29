'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

export default function LoginPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [identifier, setIdentifier] = useState('')
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
    setAlert({ variant: 'info', title: 'Redirigiendo a Google...' })
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

    if (!identifier || !password) {
      setAlert({
        variant: 'warning',
        title: 'Faltan datos',
        message: 'Completá email / CUIT / slug y contraseña.',
      })
      return
    }

    setLoading(true)
    setAlert({ variant: 'info', title: 'Ingresando...' })

    let resolvedEmail = identifier.trim().toLowerCase()

    if (!resolvedEmail.includes('@')) {
      const res = await fetch('/api/auth/resolve-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resolvedEmail }),
      })

      const json = await res.json()

      if (!res.ok) {
        setAlert({
          variant: 'error',
          title: 'No encontramos ese acceso',
          message:
            json?.error ?? 'Revisá el CUIT, slug o email.',
        })
        setLoading(false)
        return
      }

      resolvedEmail = String(json.email || '').toLowerCase()
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
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

    setAlert({
      variant: 'success',
      title: '¡Listo! Entraste correctamente.',
    })

    router.replace('/auth/post-login')
  }

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">PX</div>

            <div className="px-authBrandText">
              <h1 className="px-authTitle">Ingresar</h1>
              <p className="px-authSub">Ranking • Torneos • Clubes</p>
            </div>
          </div>
        </div>

        <form className="px-authBody" onSubmit={signInWithEmail}>
          <button
            className="px-btn px-btnGoogle"
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="px-spinner" /> Conectando...
              </>
            ) : (
              <>
                <img
                  src="https://www.svgrepo.com/show/475656/google-color.svg"
                  width={18}
                />
                Continuar con Google
              </>
            )}
          </button>

          <div className="px-sepRow">o</div>

          <div className="px-field">
            <label className="px-label">
              Email / CUIT / slug del club
            </label>
            <input
              className="px-input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="tu@email.com · 30712345678 · la33-santarosa"
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

          <button
            className="px-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="px-spinner" /> Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>

          {alert ? (
            <AuthAlert
              variant={alert.variant}
              title={alert.title}
              message={alert.message}
            />
          ) : null}

          <div className="px-authRow">
            <Link className="px-link" href="/register">
              Crear cuenta
            </Link>
            <Link className="px-link" href="/reset-password">
              Olvidé mi contraseña
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
