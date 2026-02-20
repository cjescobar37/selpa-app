'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  async function updatePassword() {
    if (!password) {
      setAlert({ variant: 'warning', title: 'Falta la contraseña', message: 'Ingresá la nueva contraseña.' })
      return
    }
    if (password !== password2) {
      setAlert({ variant: 'warning', title: 'No coinciden', message: 'Las contraseñas no coinciden.' })
      return
    }
    if (password.length < 6) {
      setAlert({ variant: 'warning', title: 'Contraseña débil', message: 'Debe tener al menos 6 caracteres.' })
      return
    }

    setLoading(true)
    setAlert({ variant: 'info', title: 'Actualizando contraseña...' })

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setAlert({ variant: 'error', title: 'No se pudo actualizar', message: error.message })
      setLoading(false)
      return
    }

    setAlert({ variant: 'success', title: 'Contraseña actualizada', message: 'Ahora ingresá de nuevo.' })
    setLoading(false)
    setTimeout(() => router.replace('/login'), 700)
  }

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">PX</div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Nueva contraseña</h1>
              <p className="px-authSub">Creá una contraseña nueva para tu cuenta.</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          <div className="px-field">
            <label className="px-label">Nueva contraseña</label>
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

          <button className="px-btn" onClick={updatePassword} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Guardando...
              </>
            ) : (
              'Guardar contraseña'
            )}
          </button>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

          <div className="px-authRow">
            <Link className="px-link" href="/login">Volver</Link>
            <span className="px-muted">Listo para ingresar</span>
          </div>
        </div>
      </div>
    </div>
  )
}