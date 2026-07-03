'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

export default function AuthCallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [alert, setAlert] = useState<AlertState>({
    variant: 'info',
    title: 'Validando acceso…',
    message: 'Estamos terminando el ingreso.',
  })

  const nextPath = useMemo(
    () => searchParams.get('next') || '/auth/post-login',
    [searchParams]
  )

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        const errorDescription = searchParams.get('error_description')
        if (errorDescription) {
          if (!active) return
          setAlert({
            variant: 'error',
            title: 'No se pudo completar el acceso',
            message: errorDescription,
          })
          return
        }

        const code = searchParams.get('code')
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            if (!active) return
            setAlert({
              variant: 'error',
              title: 'No se pudo crear la sesión',
              message: error.message,
            })
            return
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 250))
        const { data } = await supabase.auth.getSession()

        if (!active) return

        if (data?.session?.user) {
          const url = new URL(nextPath, window.location.origin)
          router.replace(url.pathname + url.search)
          return
        }

        setAlert({
          variant: 'warning',
          title: 'No encontramos una sesión activa',
          message: 'Volvé a intentar o ingresá manualmente.',
        })
      } catch (e: any) {
        if (!active) return
        setAlert({
          variant: 'error',
          title: 'Falló la validación',
          message: e?.message ?? 'Error inesperado.',
        })
      }
    })()

    return () => {
      active = false
    }
  }, [nextPath, router, searchParams])

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo"><img src="/brand/selpa-isotipo.png" alt="SELPA" /></div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Validando acceso</h1>
              <p className="px-authSub">
                Estamos cerrando el proceso de autenticación.
              </p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          {alert ? (
            <AuthAlert
              variant={alert.variant}
              title={alert.title}
              message={alert.message}
            />
          ) : null}

          <div className="px-authRow">
            <Link className="px-link" href="/login">
              Volver a login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
