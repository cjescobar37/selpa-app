'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { buildAssetProxyUrl } from '@/lib/clubAssets'

export type AppRole = 'guest' | 'player' | 'club' | 'platform'

export type ClubMini = {
  id: string
  name: string
  logoUrl?: string | null
}

export type SessionCtx = {
  status: 'loading' | 'ready'
  role: AppRole
  user: {
    id: string
    name: string
    email?: string
    avatarUrl?: string | null
  } | null
  activeClub: ClubMini | null
  clubs: ClubMini[]
  isApprovedMember: boolean
  refresh: () => Promise<void>
  setActiveClub: (clubId: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionCtx | null>(null)

function getNameFromUser(u: any) {
  return (
    u?.user_metadata?.full_name ||
    u?.user_metadata?.name ||
    u?.email?.split('@')?.[0] ||
    'Usuario'
  )
}

type ClubRole = 'OWNER' | 'ADMIN' | 'PLANILLERO' | 'PLAYER'
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED'

async function resolveContext() {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user

  if (!user) {
    return {
      role: 'guest' as const,
      user: null,
      activeClub: null,
      clubs: [] as ClubMini[],
      isApprovedMember: false,
    }
  }

  const userId = user.id

  const { data: pa } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  const isPlatformAdmin = !!pa?.user_id

  const { data: us } = await supabase
    .from('user_settings')
    .select('active_club_id')
    .eq('user_id', userId)
    .maybeSingle()

  const configuredActiveClubId = (us?.active_club_id as string | null) ?? null

  const { data: memberships } = await supabase
    .from('club_memberships')
    .select('club_id,role,status')
    .eq('user_id', userId)

  const approvedMemberships = (memberships ?? []).filter(
    (m: any) => (m.status as MembershipStatus) === 'APPROVED'
  )

  const approvedClubIds = approvedMemberships.map((m: any) => m.club_id as string)

  let clubs: ClubMini[] = []

  if (approvedClubIds.length > 0) {
    const { data: clubRows } = await supabase
      .from('clubs')
      .select('id,name,logo_url')
      .in('id', approvedClubIds)
      .order('name', { ascending: true })

    clubs = await Promise.all(
      (clubRows ?? []).map(async (c: any) => ({
        id: c.id,
        name: c.name,
        logoUrl: buildAssetProxyUrl(c.logo_url ?? null),
      }))
    )
  }

  let effectiveActiveClubId = configuredActiveClubId

  if (!effectiveActiveClubId && clubs.length > 0) {
    effectiveActiveClubId = clubs[0].id

    await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          active_club_id: effectiveActiveClubId,
        },
        { onConflict: 'user_id' }
      )
  }

  const activeClub =
    effectiveActiveClubId ? clubs.find((c) => c.id === effectiveActiveClubId) ?? null : null

  let clubRole: ClubRole | null = null
  let membershipStatus: MembershipStatus | null = null

  if (effectiveActiveClubId) {
    const m = approvedMemberships.find((x: any) => x.club_id === effectiveActiveClubId)
    clubRole = (m?.role as ClubRole) ?? null
    membershipStatus = (m?.status as MembershipStatus) ?? null
  }

  const isApprovedMember = !!effectiveActiveClubId && membershipStatus === 'APPROVED'

  let role: AppRole = 'player'
  if (isPlatformAdmin) role = 'platform'
  else if (clubRole === 'OWNER' || clubRole === 'ADMIN' || clubRole === 'PLANILLERO') role = 'club'
  else role = 'player'

  return {
    role,
    user: {
      id: userId,
      name: getNameFromUser(user),
      email: user.email,
      avatarUrl: (user.user_metadata?.avatar_url as string | null) ?? null,
    },
    activeClub,
    clubs,
    isApprovedMember,
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [role, setRole] = useState<AppRole>('guest')
  const [user, setUser] = useState<SessionCtx['user']>(null)
  const [activeClub, setActiveClubState] = useState<ClubMini | null>(null)
  const [clubs, setClubs] = useState<ClubMini[]>([])
  const [isApprovedMember, setIsApprovedMember] = useState(false)

  const refresh = useCallback(async () => {
    setStatus('loading')
    const r = await resolveContext()
    setRole(r.role)
    setUser(r.user)
    setActiveClubState(r.activeClub)
    setClubs(r.clubs)
    setIsApprovedMember(r.isApprovedMember)
    setStatus('ready')
  }, [])

  const setActiveClub = useCallback(
    async (clubId: string) => {
      const { data: s } = await supabase.auth.getSession()
      const u = s?.session?.user
      if (!u) return

      await supabase
        .from('user_settings')
        .upsert({ user_id: u.id, active_club_id: clubId }, { onConflict: 'user_id' })

      await refresh()
    },
    [refresh]
  )

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' })
    } finally {
      setRole('guest')
      setUser(null)
      setActiveClubState(null)
      setClubs([])
      setIsApprovedMember(false)
      setStatus('ready')
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
  }, [])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        await refresh()
      } finally {
        if (alive) setStatus('ready')
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh()
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [refresh])

  const value: SessionCtx = useMemo(
    () => ({
      status,
      role,
      user,
      activeClub,
      clubs,
      isApprovedMember,
      refresh,
      setActiveClub,
      signOut,
    }),
    [status, role, user, activeClub, clubs, isApprovedMember, refresh, setActiveClub, signOut]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used within <SessionProvider>')
  return v
}