'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/`
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) router.replace('/')
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
      setAlert({ variant: 'error', title: 'No se pudo iniciar sesión', message: error.message })
      setLoading(false)
    }
  }

  async function signInWithEmail() {
    if (!email || !password) {
      setAlert({ variant: 'warning', title: 'Faltan datos', message: 'Completá email y contraseña.' })
      return
    }

    setLoading(true)
    setAlert({ variant: 'info', title: 'Ingresando...' })

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setAlert({ variant: 'error', title: 'Credenciales inválidas', message: error.message })
      setLoading(false)
      return
    }

    setAlert({ variant: 'success', title: '¡Listo! Entraste correctamente.' })
    router.replace('/')
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

        <div className="px-authBody">
          <button className="px-btn px-btn--ghost" onClick={signInWithGoogle} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Conectando...
              </>
            ) : (
              'Continuar con Google'
            )}
          </button>

          <div className="px-sepRow">o</div>

          <div className="px-field">
            <label className="px-label">Email</label>
            <input
              className="px-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>

          <div className="px-field">
            <label className="px-label">Contraseña</label>
            <input
              className="px-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button className="px-btn" onClick={signInWithEmail} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

          <div className="px-authRow">
            <Link className="px-link" href="/register">Crear cuenta</Link>
            <Link className="px-link" href="/reset-password">Olvidé mi contraseña</Link>
          </div>
        </div>
      </div>
    </div>
  )
}