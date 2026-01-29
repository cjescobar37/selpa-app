'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActiveClub } from '@/lib/useActiveClub'

export default function SeleccionarClubPage() {
  const router = useRouter()
  const { activeClub, loading } = useActiveClub()

  useEffect(() => {
    if (!loading && activeClub) router.replace('/')
  }, [loading, activeClub, router])

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Seleccioná un club</h1>

      <p style={{ opacity: 0.75 }}>
        Para acceder a torneos, ranking y partidos en vivo necesitás tener un club activo.
      </p>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        Usá el selector <b>Club</b> en la barra superior.
      </div>

      <div style={{ marginTop: 16 }}>
        <Link href="/clubs" style={{ textDecoration: 'underline', color: 'white' }}>
          Ir a Clubs
        </Link>
      </div>
    </div>
  )
}

