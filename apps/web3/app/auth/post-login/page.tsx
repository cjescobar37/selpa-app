'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthAlert from '@/components/AuthAlert'

type AlertState =
  | { variant: 'success' | 'warning' | 'error' | 'info'; title: string; message?: string }
  | null

type ClubRole = 'OWNER' | 'ADMIN' | 'PLANILLERO' | 'PLAYER'
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

async function resolveDestination() {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user
  if (!user) return { dest: '/login' as const, reason: 'no-session' as const }

  const userId = user.id

  const { data: pa } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (pa?.user_id) return { dest: '/platform' as const, reason: 'platform' as const }

  const { data: us } = await supabase
    .from('user_settings')
    .select('active_club_id')
    .eq('user_id', userId)
    .maybeSingle()

  const activeClubId = us?.active_club_id ?? null
  if (!activeClubId) return { dest: '/seleccionar-club' as const, reason: 'no-active-club' as const }

  const { data: m } = await supabase
    .from('club_memberships')
    .select('role,status')
    .eq('club_id', activeClubId)
    .eq('user_id', userId)
    .maybeSingle()

  const role = (m?.role as ClubRole) ?? null
  const status = (m?.status as MembershipStatus) ?? null

  if (!status || status !== 'APPROVED') return { dest: '/seleccionar-club' as const, reason: 'not-approved' as const }

  if (role === 'OWNER' || role === 'ADMIN' || role === 'PLANILLERO') {
    return { dest: '/club' as const, reason: 'club-staff' as const }
  }

  return { dest: '/player' as const, reason: 'player' as const }
}

export default function PostLoginPage() {
  const router = useRouter()
  const [t, setT] = useState(0)
  const [alert, setAlert] = useState<AlertState>({ variant: 'info', title: 'Accediendo…', message: 'Resolviendo tu perfil…' })
  const [stuck, setStuck] = useState(false)

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

    ;(async () => {
      // retry corto de sesión
      let r = await resolveDestination()
      if (r.reason === 'no-session') {
        await new Promise(res => setTimeout(res, 350))
        r = await resolveDestination()
      }

      if (!alive) return

      if (r.dest === '/login') {
        setAlert({ variant: 'warning', title: 'Sesión expirada', message: 'Volvé a iniciar sesión.' })
        setStuck(true)
        return
      }

      // ok → “100%” y redirige
      setAlert({ variant: 'success', title: 'Listo', message: 'Entrando…' })
      setTimeout(() => {
        router.replace(r.dest)
      }, 450)
    })()

    // fallback si tarda
    const slow = setTimeout(() => {
      if (!alive) return
      setStuck(true)
      setAlert({
        variant: 'warning',
        title: 'Está tardando más de lo normal',
        message: 'Podés reintentar, ir a seleccionar club o volver al login.',
      })
    }, 9000)

    return () => {
      alive = false
      clearTimeout(slow)
    }
  }, [router])

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
                  await supabase.auth.signOut()
                  router.replace('/login')
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