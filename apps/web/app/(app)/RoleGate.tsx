'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type ClubRole = 'OWNER' | 'ADMIN' | 'PLANILLERO' | 'PLAYER'
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

async function getCtx() {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user
  if (!user) return null

  const userId = user.id

  // platform admin?
  const { data: pa } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  const isPlatformAdmin = !!pa?.user_id

  // active club
  const { data: us } = await supabase
    .from('user_settings')
    .select('active_club_id')
    .eq('user_id', userId)
    .maybeSingle()

  const activeClubId = us?.active_club_id ?? null

  let clubRole: ClubRole | null = null
  let membershipStatus: MembershipStatus | null = null

  if (activeClubId) {
    const { data: m } = await supabase
      .from('club_memberships')
      .select('role,status')
      .eq('club_id', activeClubId)
      .eq('user_id', userId)
      .maybeSingle()

    clubRole = (m?.role as ClubRole) ?? null
    membershipStatus = (m?.status as MembershipStatus) ?? null
  }

  return { userId, isPlatformAdmin, activeClubId, clubRole, membershipStatus }
}

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true

    ;(async () => {
      // 1) intentamos resolver sesión (una vez + retry corto)
      let ctx = await getCtx()
      if (!ctx) {
        await new Promise(r => setTimeout(r, 350))
        ctx = await getCtx()
      }

      if (!alive) return

      if (!ctx) {
        router.replace('/login')
        return
      }

      // Rutas que pueden verse sin club activo (para unirse/crear)
      const allowedWithoutClub = [
        '/seleccionar-club',
        '/clubs',
        '/clubs/nuevo',
        '/perfil',
        '/player',
      ]
      const isAllowed = allowedWithoutClub.some(p => pathname.startsWith(p))

      // Platform admin: no obliga club
      if (ctx.isPlatformAdmin) {
        setReady(true)
        return
      }

      // Sin club activo -> mandar a seleccionar
      if (!ctx.activeClubId) {
        if (!isAllowed) router.replace('/seleccionar-club')
        else setReady(true)
        return
      }

      // Club activo pero status no APPROVED -> seleccionar club (ahí mostrás estado)
      if (ctx.membershipStatus && ctx.membershipStatus !== 'APPROVED') {
        if (!isAllowed) router.replace('/seleccionar-club')
        else setReady(true)
        return
      }

      setReady(true)
    })()

    return () => {
      alive = false
    }
  }, [pathname, router])

  if (!ready) {
    return (
      <div className="px-auth">
        <div className="px-authCard">
          <div className="px-authTop">
            <div className="px-authBrand">
              <div className="px-authLogo">PX</div>
              <div className="px-authBrandText">
                <h1 className="px-authTitle">Accediendo…</h1>
                <p className="px-authSub">Verificando permisos y club activo</p>
              </div>
            </div>
          </div>

          <div className="px-authBody">
            <div className="px-help" style={{ marginBottom: 10 }}>
              Si tarda más de lo normal, podés salir y volver a entrar.
            </div>

            <div className="px-authRow" style={{ justifyContent: 'flex-end' }}>
              <button
                className="px-btn px-btn--ghost"
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.replace('/login')
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ✅ ACÁ ESTABA TU BUG: faltaba devolver children
  return <>{children}</>
}