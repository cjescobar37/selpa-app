'use client'

import { useWriteGuard } from '@/lib/useWriteGuard'

import controls from '@/components/auth/AuthControls.module.css'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'
import PasswordField, { meetsPasswordRequirements, passwordRequirementsMessage } from '@/components/auth/PasswordField'

type AlertState = { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string } | null

export default function UpdatePasswordPage() {
  const write = useWriteGuard()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [alert, setAlert] = useState<AlertState>(null)
  const [loading, setLoading] = useState(false)

  async function updatePassword(e?: React.FormEvent) {
    e?.preventDefault()
    return write(async () => {
      if (!password) {
        setAlert({ variant: 'warning', title: 'Falta la contraseña', message: 'Ingresá la nueva contraseña.' })
        return
      }
      if (password !== password2) {
        setAlert({ variant: 'warning', title: 'No coinciden', message: 'Las contraseñas no coinciden.' })
        return
      }
      if (!meetsPasswordRequirements(password)) {
        setAlert({ variant: 'warning', title: 'Contraseña débil', message: passwordRequirementsMessage })
        return
      }

      setLoading(true)
      setAlert({ variant: 'info', title: 'Actualizando contraseña...' })

      let error
      try { ({ error } = await supabase.auth.updateUser({ password })) }
      catch {
        setLoading(false)
        setAlert({ variant: 'error', title: 'No se pudo actualizar', message: 'Revisá tu conexión y volvé a guardar la contraseña.' })
        return
      }

      if (error) {
        setAlert({ variant: 'error', title: 'No se pudo actualizar', message: error.message })
        setLoading(false)
        return
      }

      setAlert({ variant: 'success', title: 'Contraseña actualizada', message: 'Ya podés continuar con tu cuenta.' })
      router.replace('/auth/post-login')
    })
  }

  return (
    <div className={`px-auth px-authModern px-loginAuth ${controls.form}`}>
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo"><img src="/brand/selpa-isotipo.png" alt="SELPA" /></div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Nueva contraseña</h1>
              <p className="px-authSub">Creá una contraseña nueva para tu cuenta.</p>
            </div>
          </div>
        </div>

        <form className="px-authBody" onSubmit={updatePassword}>
          <PasswordField id="update-password" label="Nueva contraseña" value={password} onChange={setPassword} autoComplete="new-password" disabled={loading} minLength={8} showRequirements />
          <PasswordField id="update-password-confirm" label="Repetir contraseña" value={password2} onChange={setPassword2} autoComplete="new-password" disabled={loading} minLength={8} />

          <button className="px-btn" type="submit" disabled={loading}>
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
        </form>
      </div>
    </div>
  )
}
