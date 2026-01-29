'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NuevoClubPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [slug, setSlug] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

async function crear() {
  setSaving(true)
  setMsg('Creando...')

  const { data, error } = await supabase.rpc('create_club', {
    p_name: name.trim(),
    p_city: city.trim() || null,
    p_slug: slug.trim() || null,
  })

  setSaving(false)

  if (error) {
    setMsg(`❌ ${error.message}`)
    return
  }

  setMsg('✅ Club creado.')
  router.replace('/clubs')
}


  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Crear club</h1>
      <p style={{ opacity: 0.75 }}>
        Solo el Administrador General (platform admin) puede crear clubes.
      </p>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <input
          placeholder="Nombre del club (ej: LA 33)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Ciudad (ej: Santa Rosa)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Slug (ej: la33-santarosa)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          style={inputStyle}
        />

        <button disabled={saving || !name.trim()} onClick={crear} style={btnStyle}>
          {saving ? 'Creando...' : 'Crear'}
        </button>

        {msg && <div style={{ marginTop: 6, opacity: 0.9 }}>{msg}</div>}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: 'white',
}

const btnStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  cursor: 'pointer',
}
