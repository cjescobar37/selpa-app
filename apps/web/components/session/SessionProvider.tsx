'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import {
  isApprovedMembership,
  isClubStaffRole,
  type ClubRole,
  type MembershipStatus,
} from '@/lib/clubMembershipRules'

export type AppRole = 'guest' | 'player' | 'club' | 'platform'
export type PostLoginDestination = '/login' | '/seleccionar-club' | '/club' | '/player' | '/platform'

export type ClubMini = {
  id: string
  name: string
  logoUrl?: string | null
}

export type SessionCtx = {
  status: 'loading' | 'ready'
  role: AppRole
  isPlatformAdmin: boolean
  user: {
    id: string
    name: string
    email?: string
    avatarUrl?: string | null
  } | null
  activeClub: ClubMini | null
  activeClubId: string | null
  clubs: ClubMini[]
  isApprovedMember: boolean
  clubRole: ClubRole | null
  membershipStatus: MembershipStatus | null
  membershipApprovedAt: string | null
  postLoginDestination: PostLoginDestination
  refresh: (options?: RefreshOptions) => Promise<void>
  setActiveClub: (clubId: string) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionCtx | null>(null)

type RefreshOptions = {
  silent?: boolean
}

type AuthUserLike = {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    name?: string
    avatar_url?: string | null
  }
}

type ClubRow = {
  id: string
  name: string
  logo_url: string | null
  status?: string | null
}

function getNameFromUser(u: AuthUserLike) {
  return (
    u?.user_metadata?.full_name ||
    u?.user_metadata?.name ||
    u?.email?.split('@')?.[0] ||
    'Usuario'
  )
}

type MembershipRow = {
  club_id: string
  role: ClubRole
  status: MembershipStatus
  approved_at: string | null
}

function getPostLoginDestination(ctx: Pick<SessionCtx, 'role' | 'user' | 'activeClub' | 'isApprovedMember'>): PostLoginDestination {
  if (!ctx.user) return '/login'
  if (ctx.role === 'platform') return '/platform'
  if (!ctx.activeClub || !ctx.isApprovedMember) return '/seleccionar-club'
  if (ctx.role === 'club') return '/club'
  return '/player'
}

async function resolveContext() {
  const { data: s } = await supabase.auth.getSession()
  const user = s?.session?.user

  if (!user) {
    return {
      role: 'guest' as const,
      isPlatformAdmin: false,
      user: null,
      activeClub: null,
      activeClubId: null,
      clubs: [] as ClubMini[],
      isApprovedMember: false,
      clubRole: null,
      membershipStatus: null,
      membershipApprovedAt: null,
      postLoginDestination: '/login' as const,
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
    .select('club_id,role,status,approved_at')
    .eq('user_id', userId)

  const membershipRows = ((memberships ?? []) as Partial<MembershipRow>[]).map((m) => ({
    club_id: m.club_id as string,
    role: m.role as ClubRole,
    status: m.status as MembershipStatus,
    approved_at: (m.approved_at as string | null) ?? null,
  })) satisfies MembershipRow[]

  const approvedMemberships = membershipRows.filter(isApprovedMembership)

  const approvedClubIds = approvedMemberships.map((m) => m.club_id)

  let clubs: ClubMini[] = []

  if (approvedClubIds.length > 0) {
    const token = s.session?.access_token
    if (!token) {
      return {
        role: 'guest' as const,
        isPlatformAdmin: false,
        user: null,
        activeClub: null,
        activeClubId: null,
        clubs: [] as ClubMini[],
        isApprovedMember: false,
        clubRole: null,
        membershipStatus: null,
        membershipApprovedAt: null,
        postLoginDestination: '/login' as const,
      }
    }
    const response = await fetch('/api/clubs/member-clubs', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    const json = await response.json().catch(() => ({}))

    if (response.ok) {
      clubs = await Promise.all(
        (((json?.clubs ?? []) as ClubRow[]).filter((club) => approvedClubIds.includes(club.id))).map(async (c) => ({
          id: c.id,
          name: c.name,
          logoUrl: buildAssetProxyUrl(c.logo_url ?? null),
        }))
      )
    }
  }

  const hasValidConfiguredClub = Boolean(
    configuredActiveClubId &&
      approvedMemberships.some((m) => m.club_id === configuredActiveClubId)
  )

  let effectiveActiveClubId = hasValidConfiguredClub ? configuredActiveClubId : null

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

  if (configuredActiveClubId && !effectiveActiveClubId) {
    await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          active_club_id: null,
        },
        { onConflict: 'user_id' }
      )
  }

  const activeClub =
    effectiveActiveClubId ? clubs.find((c) => c.id === effectiveActiveClubId) ?? null : null

  let clubRole: ClubRole | null = null
  let membershipStatus: MembershipStatus | null = null
  let membershipApprovedAt: string | null = null

  if (effectiveActiveClubId) {
    const m = approvedMemberships.find((x) => x.club_id === effectiveActiveClubId)
    clubRole = (m?.role as ClubRole) ?? null
    membershipStatus = (m?.status as MembershipStatus) ?? null
    membershipApprovedAt = m?.approved_at ?? null
  }

  const isApprovedMember = Boolean(
    effectiveActiveClubId && membershipStatus === 'APPROVED' && membershipApprovedAt
  )

  let role: AppRole = 'player'
  if (isPlatformAdmin) role = 'platform'
  else if (isClubStaffRole(clubRole)) role = 'club'
  else role = 'player'

  const result = {
    role,
    isPlatformAdmin,
    user: {
      id: userId,
      name: getNameFromUser(user),
      email: user.email,
      avatarUrl: (user.user_metadata?.avatar_url as string | null) ?? null,
    },
    activeClub,
    activeClubId: activeClub?.id ?? null,
    clubs,
    isApprovedMember,
    clubRole,
    membershipStatus,
    membershipApprovedAt,
  }

  return {
    ...result,
    postLoginDestination: getPostLoginDestination(result),
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [role, setRole] = useState<AppRole>('guest')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [user, setUser] = useState<SessionCtx['user']>(null)
  const [activeClub, setActiveClubState] = useState<ClubMini | null>(null)
  const [activeClubId, setActiveClubId] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubMini[]>([])
  const [isApprovedMember, setIsApprovedMember] = useState(false)
  const [clubRole, setClubRole] = useState<ClubRole | null>(null)
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null)
  const [membershipApprovedAt, setMembershipApprovedAt] = useState<string | null>(null)
  const [postLoginDestination, setPostLoginDestination] = useState<PostLoginDestination>('/login')

  const refresh = useCallback(async (options?: RefreshOptions) => {
    if (!options?.silent) setStatus('loading')
    const r = await resolveContext()
    setRole(r.role)
    setIsPlatformAdmin(r.isPlatformAdmin)
    setUser(r.user)
    setActiveClubState(r.activeClub)
    setActiveClubId(r.activeClubId)
    setClubs(r.clubs)
    setIsApprovedMember(r.isApprovedMember)
    setClubRole(r.clubRole)
    setMembershipStatus(r.membershipStatus)
    setMembershipApprovedAt(r.membershipApprovedAt)
    setPostLoginDestination(r.postLoginDestination)
    setStatus('ready')
  }, [])

  const setActiveClub = useCallback(
    async (clubId: string) => {
      const { data: s } = await supabase.auth.getSession()
      const u = s?.session?.user
      if (!u) return

      const { data: membership } = await supabase
        .from('club_memberships')
        .select('club_id,status,approved_at')
        .eq('user_id', u.id)
        .eq('club_id', clubId)
        .maybeSingle()

      if (membership?.status !== 'APPROVED' || !membership?.approved_at) {
        throw new Error('No podés activar un club sin membresía aprobada.')
      }

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
      setIsPlatformAdmin(false)
      setUser(null)
      setActiveClubState(null)
      setActiveClubId(null)
      setClubs([])
      setIsApprovedMember(false)
      setClubRole(null)
      setMembershipStatus(null)
      setMembershipApprovedAt(null)
      setPostLoginDestination('/login')
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

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        void refresh({ silent: true })
        return
      }

      void refresh()
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
      isPlatformAdmin,
      user,
      activeClub,
      activeClubId,
      clubs,
      isApprovedMember,
      clubRole,
      membershipStatus,
      membershipApprovedAt,
      postLoginDestination,
      refresh,
      setActiveClub,
      signOut,
    }),
    [
      status,
      role,
      isPlatformAdmin,
      user,
      activeClub,
      activeClubId,
      clubs,
      isApprovedMember,
      clubRole,
      membershipStatus,
      membershipApprovedAt,
      postLoginDestination,
      refresh,
      setActiveClub,
      signOut,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used within <SessionProvider>')
  return v
}
