'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type ClubRole = 'OWNER' | 'ADMIN' | 'PLANILLERO' | 'PLAYER'
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

async function getCtx() {
  const { data: u } = await supabase.auth.getUser()
  const user = u?.user
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

  // membership (role/status)
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
    ;(async () => {
      const ctx = await getCtx()

      if (!ctx) {
        router.replace('/login')
        return
      }

      // Rutas que pueden verse sin club activo (para que el usuario pueda unirse/crear)
      const allowedWithoutClub = [
        '/(app)/seleccionar-club',
        '/(app)/clubs',
        '/(app)/clubs/nuevo',
        '/(app)/perfil', // opcional: permitir ver perfil global
      ]

      const isAllowed = allowedWithoutClub.some(p => pathname.startsWith(p))

      // Platform admin: no obliga a club
      if (ctx.isPlatformAdmin) {
        setReady(true)
        return
      }

      // No tiene club activo -> seleccionar club
      if (!ctx.activeClubId) {
        if (!isAllowed) router.replace('/(app)/seleccionar-club')
        else setReady(true)
        return
      }

      // Tiene club activo pero no está aprobado -> seleccionar club (y mostrar estado ahí)
      if (ctx.membershipStatus && ctx.membershipStatus !== 'APPROVED') {
        if (!isAllowed) router.replace('/(app)/seleccionar-club')
        else setReady(true)
        return
      }

      // OK
      setReady(true)
    })()
  }, [pathname, router])

  if (!ready) return null
  return <>{children}</>
}
