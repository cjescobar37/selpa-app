'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { supabase } from '@/lib/supabaseClient'

type ClubPlayerRow = {
  id: string
  club_id: string
  user_id: string
  approved_at: string | null
  created_at: string
}

export default function PerfilPage() {
  const router = useRouter()
  const session = useSession()
  const { activeClubId, setActiveClub, status, user } = session
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading')
  const [message, setMessage] = useState('Cargando tu información')

  useEffect(() => {
    let alive = true

    async function resolveOwnPlayerProfile() {
      if (status === 'loading') return
      if (!user) {
        router.replace('/login')
        return
      }

      const { data, error } = await supabase
        .from('club_players')
        .select('id,club_id,user_id,approved_at,created_at')
        .eq('user_id', user.id)
        .not('approved_at', 'is', null)
        .order('created_at', { ascending: true })

      if (!alive) return

      if (error) {
        setState('error')
        setMessage('No pudimos abrir tu perfil. Intentá nuevamente.')
        return
      }

      const rows = (data ?? []) as ClubPlayerRow[]
      const preferred = rows.find((row) => row.club_id === activeClubId) ?? rows[0] ?? null

      if (!preferred) {
        setState('empty')
        setMessage('Todavía no tenés un jugador aprobado en un club.')
        return
      }

      try {
        if (activeClubId !== preferred.club_id) {
          await setActiveClub(preferred.club_id)
        }
      } catch {
        if (!alive) return
        setState('error')
        setMessage('No pudimos activar el club de tu perfil. Intentá nuevamente.')
        return
      }

      router.replace(`/club/jugadores/${preferred.id}?own=1`)
    }

    void resolveOwnPlayerProfile()

    return () => {
      alive = false
    }
  }, [activeClubId, router, setActiveClub, status, user])

  return (
    <div className="px-wrap perfil-redirect">
      <PlayerStatePanel
        kind={state}
        title={state === 'loading' ? 'Cargando perfil' : state === 'empty' ? 'Tu perfil todavía no está activo' : 'No pudimos abrir tu perfil'}
        message={message}
        action={state === 'loading' ? undefined : { label: 'Volver a Mi espacio', href: '/player' }}
        viewport
      />
    </div>
  )
}
