'use client'

import { useSession } from '@/components/session/SessionProvider'

export function useClubRole() {
  const session = useSession()
  const role = session.isApprovedMember ? session.clubRole : null
  const loadingRole = session.status === 'loading'

  const isAdmin = role === 'OWNER' || role === 'ADMIN'

  return { role, isAdmin, loadingRole }
}
