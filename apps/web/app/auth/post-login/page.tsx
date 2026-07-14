'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthAlert from '@/components/AuthAlert'
import SelpaLoader from '@/components/SelpaLoader'
import { useSession } from '@/components/session/SessionProvider'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

export default function PostLoginPage() {
  const router = useRouter()
  const session = useSession()
  const [stuck, setStuck] = useState(false)
  const safeNextPath = getSafeNextPath()

  const alert: AlertState = stuck
    ? session.status === 'ready' && !session.user
      ? { variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' }
      : {
          variant: 'warning',
          title: 'Está tardando más de lo normal',
          message: 'Podés reintentar, ir a seleccionar club o volver al login.',
        }
    : null

  useEffect(() => {
    let alive = true

    if (session.status === 'loading') return

    if (!session.user) {
      const retry = setTimeout(() => {
        if (!alive) return
        setStuck(true)
      }, 1600)

      return () => {
        alive = false
        clearTimeout(retry)
      }
    }

    router.replace(safeNextPath || session.postLoginDestination)

    const slow = setTimeout(() => {
      if (!alive) return
      setStuck(true)
    }, 9000)

    return () => {
      alive = false
      clearTimeout(slow)
    }
  }, [router, safeNextPath, session.postLoginDestination, session.status, session.user])

  if (!alert) {
    return (
      <div className="px-auth px-authModern px-auth--bridge">
        <SelpaLoader title="Ingresando..." subtitle="Preparando tu espacio" />
      </div>
    )
  }

  return (
    <div className="px-auth px-authModern px-loginAuth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authBrandText">
              <span className="px-authMark" aria-label="SELPA logo">
                <img src="/brand/selpa-wordmark-clean-dark.png" alt="SELPA" />
              </span>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} />

          {stuck ? (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <button className="px-btn" onClick={() => router.refresh()}>
                Reintentar
              </button>

              <button className="px-btn px-btn--ghost" onClick={() => router.replace('/seleccionar-club')}>
                Ir a seleccionar club
              </button>

              <button
                className="px-btn px-btn--ghost"
                onClick={async () => {
                  await session.signOut()
                }}
              >
                Volver a login
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function getSafeNextPath() {
  if (typeof window === 'undefined') return ''
  const nextPath = new URLSearchParams(window.location.search).get('next')
  return nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : ''
}
