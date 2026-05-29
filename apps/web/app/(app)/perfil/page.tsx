'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
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
  const [message, setMessage] = useState('Buscando tu perfil jugador premium...')

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
        setMessage(error.message)
        return
      }

      const rows = (data ?? []) as ClubPlayerRow[]
      const preferred = rows.find((row) => row.club_id === activeClubId) ?? rows[0] ?? null

      if (!preferred) {
        setMessage('Todavía no tenés un jugador aprobado en un club.')
        return
      }

      try {
        if (activeClubId !== preferred.club_id) {
          await setActiveClub(preferred.club_id)
        }
      } catch (error: unknown) {
        if (!alive) return
        setMessage(error instanceof Error ? error.message : 'No pude activar el club del perfil.')
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
    <div className="px-wrap">
      <div className="club-panel perfil-redirect">
        <span>Mi perfil</span>
        <h1>Abriendo tu perfil premium</h1>
        <p>{message}</p>
        <div>
          <Link href="/player">Volver al inicio jugador</Link>
        </div>
      </div>

      <style>{`
        .perfil-redirect { align-content: center; display: grid; gap: 10px; min-height: 260px; text-align: center; }
        .perfil-redirect span { color: #0891b2; font-size: 12px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
        .perfil-redirect h1 { color: #061b3a; font-size: 30px; font-weight: 950; margin: 0; }
        .perfil-redirect p { color: #64748b; font-size: 14px; font-weight: 750; margin: 0; }
        .perfil-redirect a { background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 999px; color: #0e7490; display: inline-flex; font-size: 13px; font-weight: 950; margin-top: 8px; padding: 9px 13px; text-decoration: none; }
      `}</style>
    </div>
  )
}
