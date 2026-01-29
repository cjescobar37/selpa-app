'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'


type Profile = {
  id: string
  display_name: string | null
  city: string | null
  dominant_hand: string | null
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) {
        setError(userErr.message)
        setLoading(false)
        return
      }

      const user = userData?.user
      if (!user) {
        setError('No hay usuario logueado.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, city, dominant_hand')
        .eq('id', user.id)
        .single()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setProfile(data)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div>Cargando inicio...</div>

  if (error)
    return (
      <div style={{ color: 'salmon' }}>
        Error cargando perfil: {error}
      </div>
    )

  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>
        Hola{profile?.display_name ? `, ${profile.display_name}` : ''}
      </h1>

      <p style={{ opacity: 0.8, marginTop: 4 }}>
        Bienvenido a la plataforma de torneos
      </p>

      {/* Tarjeta de perfil */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: 420,
        }}
      >
        <h3 style={{ fontWeight: 700, marginBottom: 8 }}>
          Tu perfil
        </h3>

        <div style={{ fontSize: 14, opacity: 0.9 }}>
          <div>
            <strong>Ciudad:</strong>{' '}
            {profile?.city ?? '—'}
          </div>
          <div>
            <strong>Brazo hábil:</strong>{' '}
            {profile?.dominant_hand ?? '—'}
          </div>
        </div>
      </div>

      {/* Placeholder de dashboard */}
      <div style={{ marginTop: 30, opacity: 0.6 }}>
        Próximamente:
        <ul>
          <li>Clubes donde jugás</li>
          <li>Próximos partidos</li>
          <li>Notificaciones</li>
        </ul>
      </div>
    </div>
  )
}
