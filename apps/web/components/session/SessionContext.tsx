'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { GlobalProfile } from '@/lib/globalProfile'
import type { ClubThemeKey } from '@/lib/clubThemes'
import type { ClubRole, MembershipStatus } from '@/lib/clubMembershipRules'

export type AppRole = 'guest' | 'player' | 'club' | 'platform'
export type PostLoginDestination = '/login' | '/completar-perfil' | '/seleccionar-club' | '/club' | '/player' | '/platform' | `/clubs/${string}`

export type ClubMini = {
  id: string
  name: string
  logoUrl?: string | null
  themeKey: ClubThemeKey
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
  globalProfile: GlobalProfile | null
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

export type RefreshOptions = { silent?: boolean }
export const SessionContext = createContext<SessionCtx | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used within <SessionProvider>')
  return value
}

const guest: SessionCtx = {
  status: 'ready', role: 'guest', isPlatformAdmin: false, user: null, globalProfile: null,
  activeClub: null, activeClubId: null, clubs: [], isApprovedMember: false, clubRole: null,
  membershipStatus: null, membershipApprovedAt: null, postLoginDestination: '/login',
  refresh: async () => {},
  setActiveClub: async () => { throw new Error('La DEMO no modifica el club activo.') },
  signOut: async () => { throw new Error('Salí de la DEMO para gestionar tu sesión.') },
}

/** The real shell can render without initializing Auth or reading a stored account. */
export function PreviewGuestSessionProvider({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={guest}>{children}</SessionContext.Provider>
}
