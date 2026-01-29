'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Club = {
  id: string
  name: string
  city: string | null
  slug: string | null
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      // ✅ saber si es superadmin
      const { data: adminFlag, error: adminErr } = await supabase.rpc('is_platform_admin')
      if (!adminErr) setIsPlatformAdmin(!!adminFlag)

      // ✅ lista de clubes (RLS decide qué ve)
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, city, slug')
        .order('created_at', { ascending: false })

      if (error) setMsg(error.message)
      else setClubs((data ?? []) as Club[])

      setLoading(false)
    })()
  }, [])

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Clubs</h1>
      <p style={{ opacity: 0.75 }}>
        Acá vas a ver los clubes donde estás aprobado.
      </p>

      <div style={{ marginTop: 12 }}>
        {isPlatformAdmin ? (
          <Link href="/clubs/nuevo">
            <button style={btn}>+ Crear club</button>
          </Link>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Solo el SUPERADMIN puede crear clubes.
          </div>
        )}
      </div>

      {loading && <div style={{ marginTop: 14 }}>Cargando...</div>}
      {msg && <div style={{ marginTop: 14, color: 'salmon' }}>{msg}</div>}

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {clubs.map((c) => (
          <div key={c.id} style={card}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
            <div style={{ opacity: 0.8 }}>{c.city ?? '—'}</div>
            {c.slug && <div style={{ opacity: 0.6, fontSize: 12 }}>{c.slug}</div>}
          </div>
        ))}

        {!loading && clubs.length === 0 && (
          <div style={{ marginTop: 10, opacity: 0.7 }}>
            No hay clubes para mostrar todavía.
          </div>
        )}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
}

const btn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  cursor: 'pointer',
}
