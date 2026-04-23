'use client'

import { useMemo, useState } from 'react'
import { useSession } from '@/components/session/SessionProvider'

export type ActiveClub = {
  id: string
  name: string
  city: string | null
}

export function useActiveClub() {
  const session = useSession()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeClub = useMemo<ActiveClub | null>(() => {
    if (!session.activeClub) return null
    return {
      id: session.activeClub.id,
      name: session.activeClub.name,
      city: null,
    }
  }, [session.activeClub])

  async function setActiveClubId(clubId: string | null) {
    setErrorMsg(null)

    if (!clubId) {
      setErrorMsg('No se puede activar un club vacío.')
      return
    }

    try {
      await session.setActiveClub(clubId)
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'No pude activar el club.')
    }
  }

  return {
    activeClub,
    loading: session.status === 'loading',
    errorMsg,
    setActiveClubId,
  }
}
