'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type ActiveClub = {
  id: string
  name: string
  city: string | null
}

export function useActiveClub() {
  const [activeClub, setActiveClub] = useState<ActiveClub | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErrorMsg(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (!user) {
      setActiveClub(null)
      setLoading(false)
      return
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('active_club_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (settingsError) {
      setErrorMsg(settingsError.message)
      setLoading(false)
      return
    }

    if (!settings?.active_club_id) {
      setActiveClub(null)
      setLoading(false)
      return
    }

    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name, city')
      .eq('id', settings.active_club_id)
      .single()

    if (clubError) {
      setErrorMsg(clubError.message)
      setActiveClub(null)
    } else {
      setActiveClub(club)
    }

    setLoading(false)
  }

  async function setActiveClubId(clubId: string | null) {
    setErrorMsg(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user
    if (!user) return

    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      active_club_id: clubId,
    })

    if (error) {
      setErrorMsg(error.message)
      return
    }

    await load()
  }

  useEffect(() => {
    load()
  }, [])

  return {
    activeClub,
    loading,
    errorMsg,
    setActiveClubId,
  }
}