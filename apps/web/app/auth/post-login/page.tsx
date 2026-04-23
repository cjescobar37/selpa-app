'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthAlert from '@/components/AuthAlert'
import { useSession } from '@/components/session/SessionProvider'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

export default function PostLoginPage() {
  const router = useRouter()
  const session = useSession()
  const [t, setT] = useState(0)
  const [stuck, setStuck] = useState(false)

  const alert: AlertState = useMemo(() => {
    if (stuck) {
      return {
        variant: 'warning',
        title: 'Está tardando más de lo normal',
        message: 'Podés reintentar, ir a seleccionar club o volver al login.',
      }
    }

    if (session.status === 'ready' && !session.user) {
      return { variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' }
    }

    if (session.status === 'ready') {
      return { variant: 'success', title: 'Listo', message: 'Entrando…' }
    }

    return { variant: 'info', title: 'Accediendo…', message: 'Resolviendo tu perfil…' }
  }, [session.status, session.user, stuck])

  const pct = useMemo(() => {
    // barrita que sube “suave” hasta 90%, y si resolve ok, llega a 100% antes de redirigir
    const p = Math.min(90, 10 + t * 12)
    return p
  }, [t])

  useEffect(() => {
    const it = setInterval(() => setT(x => x + 1), 800)
    return () => clearInterval(it)
  }, [])

  useEffect(() => {
    let alive = true

    if (session.status === 'loading') return

    if (!session.user) {
      const retry = setTimeout(() => {
        if (!alive) return
        setStuck(true)
      }, 350)

      return () => {
        alive = false
        clearTimeout(retry)
      }
    }

    const redirect = setTimeout(() => {
      if (alive) router.replace(session.postLoginDestination)
    }, 450)

    // fallback si tarda
    const slow = setTimeout(() => {
      if (!alive) return
      setStuck(true)
    }, 9000)

    return () => {
      alive = false
      clearTimeout(redirect)
      clearTimeout(slow)
    }
  }, [router, session.postLoginDestination, session.status, session.user])

  return (
    <div className="px-auth">
      <div className="px-authCard">
        <div className="px-authTop">
          <div className="px-authBrand">
            <div className="px-authLogo">PX</div>
            <div className="px-authBrandText">
              <h1 className="px-authTitle">Accediendo</h1>
              <p className="px-authSub">Estamos resolviendo tu perfil…</p>
            </div>
          </div>
        </div>

        <div className="px-authBody">
          {/* Barra de progreso (sólida + detalle magenta) */}
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.14)',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, rgba(105,223,227,1), rgba(105,223,227,0.6))',
                boxShadow: '0 0 0 1px rgba(255,78,114,0.18) inset',
                transition: 'width .45s ease',
              }}
            />
          </div>

          {alert ? <AuthAlert variant={alert.variant} title={alert.title} message={alert.message} /> : null}

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
