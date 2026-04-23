'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  profile: { display_name: string | null; first_name: string | null; last_name: string | null } | null
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

// Single batched state to avoid multiple re-renders per refresh
type SessionState = {
  status: 'loading' | 'ready'
  role: AppRole
  user: SessionCtx['user']
  profile: SessionCtx['profile']
  activeClub: ClubMini | null
  clubs: ClubMini[]
  isApprovedMember: boolean
}

const INITIAL_STATE: SessionState = {
  status: 'loading',
  role: 'guest',
  user: null,
  profile: null,
  activeClub: null,
  clubs: [],
  isApprovedMember: false,
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

async function resolveContext(): Promise<SessionState> {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user

  if (!user) {
    return { ...INITIAL_STATE, status: 'ready' }
  }

  const userId = user.id

  // Parallel: platform_admin + user_settings + memberships + profile
  const [paRes, usRes, membershipsRes, profileRes] = await Promise.all([
    supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('user_settings').select('active_club_id').eq('user_id', userId).maybeSingle(),
    supabase.from('club_memberships').select('club_id,role,status').eq('user_id', userId),
    supabase.from('profiles').select('display_name, first_name, last_name').eq('user_id', userId).maybeSingle(),
  ])

  const isPlatformAdmin = !!paRes.data?.user_id
  const configuredActiveClubId = (usRes.data?.active_club_id as string | null) ?? null
  const profile = profileRes.data
    ? { display_name: profileRes.data.display_name ?? null, first_name: profileRes.data.first_name ?? null, last_name: profileRes.data.last_name ?? null }
    : null

  const approvedMemberships = (membershipsRes.data ?? []).filter(
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

    clubs = (clubRows ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      logoUrl: buildAssetProxyUrl(c.logo_url ?? null),
    }))
  }

  let effectiveActiveClubId = configuredActiveClubId
  if (!effectiveActiveClubId && clubs.length > 0) {
    effectiveActiveClubId = clubs[0].id
    supabase.from('user_settings').upsert(
      { user_id: userId, active_club_id: effectiveActiveClubId },
      { onConflict: 'user_id' }
    ).then(() => {}) // fire-and-forget
  }

  const activeClub = effectiveActiveClubId
    ? clubs.find((c) => c.id === effectiveActiveClubId) ?? null
    : null

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
    status: 'ready',
    role,
    profile,
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
  const [state, setState] = useState<SessionState>(INITIAL_STATE)
  // Prevent concurrent refreshes
  const refreshingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      const next = await resolveContext()
      setState(next) // single setState = single re-render
    } finally {
      refreshingRef.current = false
    }
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
      setState({ ...INITIAL_STATE, status: 'ready' })
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
  }, [])

  useEffect(() => {
    refresh()

    // onAuthStateChange: only re-resolve on actual sign-in/sign-out events
    // NOT on TOKEN_REFRESHED (which fires every ~1h and causes unnecessary reloads)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        refresh()
      }
    })

    return () => { sub?.subscription?.unsubscribe() }
  }, [refresh])

  const value: SessionCtx = useMemo(
    () => ({
      status: state.status,
      role: state.role,
      user: state.user,
      profile: state.profile,
      activeClub: state.activeClub,
      clubs: state.clubs,
      isApprovedMember: state.isApprovedMember,
      refresh,
      setActiveClub,
      signOut,
    }),
    [state, refresh, setActiveClub, signOut]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used within <SessionProvider>')
  return v
}
