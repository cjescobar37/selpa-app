'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

export function useClubRole() {
  const { activeClub } = useActiveClub()
  const [role, setRole] = useState<string | null>(null)
  const [loadingRole, setLoadingRole] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoadingRole(true)
      setRole(null)

      if (!activeClub) {
        setLoadingRole(false)
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      const user = userData.user
      if (!user) {
        setLoadingRole(false)
        return
      }

      const { data } = await supabase
        .from('club_memberships')
        .select('role, approved_at')
        .eq('club_id', activeClub.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (data?.approved_at) setRole(String(data.role))
      else setRole(null)

      setLoadingRole(false)
    })()
  }, [activeClub])

  const isAdmin = role === 'OWNER' || role === 'ADMIN'

  return { role, isAdmin, loadingRole }
}
