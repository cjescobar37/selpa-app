'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type ClubRole = 'OWNER' | 'ADMIN' | 'PLANILLERO' | 'PLAYER'
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

type Ctx = {
  userId: string
  isPlatformAdmin: boolean
  activeClubId: string | null
  clubRole: ClubRole | null
  membershipStatus: MembershipStatus | null
}

async function getCtx(): Promise<Ctx | null> {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user
  if (!user) return null

  const userId = user.id

  const [paRes, usRes] = await Promise.all([
    supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('user_settings').select('active_club_id').eq('user_id', userId).maybeSingle(),
  ])

  const isPlatformAdmin = !!paRes.data?.user_id
  const activeClubId = usRes.data?.active_club_id ?? null

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

function canAccessPath(pathname: string, ctx: Ctx): boolean {
  const allowedWithoutClub = ['/seleccionar-club', '/clubs', '/clubs/nuevo', '/perfil', '/player']
  const isAllowed = allowedWithoutClub.some(p => pathname.startsWith(p))

  if (ctx.isPlatformAdmin) return true
  if (!ctx.activeClubId) return isAllowed
  if (ctx.membershipStatus && ctx.membershipStatus !== 'APPROVED') return isAllowed
  return true
}

function redirectTarget(pathname: string, ctx: Ctx | null): string | null {
  if (!ctx) return '/login'
  if (canAccessPath(pathname, ctx)) return null
  return '/seleccionar-club'
}

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  // Cache the ctx so we don't re-query on every pathname change
  const ctxRef = useRef<Ctx | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    let alive = true

    async function check() {
      // Only fetch ctx once per session mount — not on every navigation
      if (!loadedRef.current) {
        let ctx = await getCtx()
        if (!ctx) {
          await new Promise(r => setTimeout(r, 350))
          ctx = await getCtx()
        }
        if (!alive) return
        ctxRef.current = ctx
        loadedRef.current = true
      }

      const ctx = ctxRef.current
      const target = redirectTarget(pathname, ctx)

      if (target) {
        router.replace(target)
        return
      }

      if (alive) setReady(true)
    }

    check()
    return () => { alive = false }
  }, [pathname, router])
  // Note: pathname is still needed to check if the NEW route is accessible,
  // but we no longer re-fetch ctx from Supabase on each navigation.

  if (!ready) {
    return (
      <div className="px-auth">
        <div className="px-authCard">
          <div className="px-authTop">
            <div className="px-authBrand">
              <div className="px-authLogo">PX</div>
              <div className="px-authBrandText">
                <h1 className="px-authTitle">Accediendo…</h1>
                <p className="px-authSub">Verificando permisos</p>
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
                onClick={async () => { await supabase.auth.signOut(); router.replace('/login') }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
