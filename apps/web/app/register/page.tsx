'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null

export default function RegisterPage() {
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) router.replace('/')
    })
  }, [router])

  async function signUp() {
    if (!email || !password) {
      setAlert({ variant: 'warning', title: 'Faltan datos', message: 'Completá email y contraseña.' })
      return
    }
    if (password !== password2) {
      setAlert({ variant: 'warning', title: 'Revisá las contraseñas', message: 'No coinciden.' })
      return
    }
    if (password.length < 6) {
      setAlert({ variant: 'warning', title: 'Contraseña débil', message: 'Debe tener al menos 6 caracteres.' })
      return
    }

    setLoading(true)
    setAlert({ variant: 'info', title: 'Creando cuenta...' })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName || null,
        },
      },
    })

    if (error) {
      setAlert({ variant: 'error', title: 'No se pudo crear la cuenta', message: error.message })
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (userId) {
      await supabase
        .from('profiles')
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName || null,
          email: email || null,
        })
        .eq('user_id', userId)
    }

    // Si tu proyecto exige confirmar email, esto es útil
    setAlert({
      variant: 'success',
      title: 'Cuenta creada',
      message: 'Si te llega un email de confirmación, confirmalo y luego ingresá.',
    })
    setLoading(false)

    // opcional: llevar a login luego de 1s
    setTimeout(() => router.replace('/login'), 900)
  }

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">PX</div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Crear cuenta</h1>
              <p className="px-authSub">Registrate con tus datos y empezá a jugar.</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          <div className="px-field">
            <label className="px-label">Nombre</label>
            <input className="px-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>

          <div className="px-field">
            <label className="px-label">Apellido</label>
            <input className="px-input" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>

          <div className="px-field">
            <label className="px-label">Nombre visible</label>
            <input
              className="px-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Ej: Cristian Escobar"
            />
          </div>

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
              autoComplete="new-password"
            />
          </div>

          <div className="px-field">
            <label className="px-label">Repetir contraseña</label>
            <input
              className="px-input"
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <button className="px-btn" onClick={signUp} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Creando...
              </>
            ) : (
              'Crear cuenta'
            )}
          </button>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

          <div className="px-authRow">
            <span className="px-muted">¿Ya tenés cuenta?</span>
            <Link className="px-link" href="/login">Ingresar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}