'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/auth/callback?next=/update-password&recovered=1`
  }, [])

  async function sendReset() {
    if (!email) {
      setAlert({ variant: 'warning', title: 'Falta el email', message: 'Ingresá tu email para enviarte el link.' })
      return
    }

    setLoading(true)
    setAlert({ variant: 'info', title: 'Enviando link…' })

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      setAlert({ variant: 'error', title: 'No se pudo enviar', message: error.message })
      setLoading(false)
      return
    }

    setAlert({
      variant: 'success',
      title: 'Email enviado',
      message: 'Revisá tu bandeja y abrí el link para crear una contraseña nueva.',
    })
    setLoading(false)
  }

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">PX</div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Restablecer contraseña</h1>
              <p className="px-authSub">Te mandamos un link para crear una contraseña nueva.</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
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

          <button className="px-btn" onClick={sendReset} disabled={loading}>
            {loading ? (
              <>
                <span className="px-spinner" />&nbsp;Enviando...
              </>
            ) : (
              'Enviar link'
            )}
          </button>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

          <div className="px-authRow">
            <Link className="px-link" href="/login">Volver</Link>
            <Link className="px-link" href="/register">Crear cuenta</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
