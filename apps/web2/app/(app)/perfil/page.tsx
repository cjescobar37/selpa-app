'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  display_name: string | null
  city: string | null
  birth_date: string | null
  height_cm: number | null
  dominant_hand: 'DERECHO' | 'IZQUIERDO' | null
  avatar_url: string | null
  cover_url: string | null
}

export default function PerfilPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [profile, setProfile] = useState<Profile | null>(null)

  // campos editables
  const [displayName, setDisplayName] = useState('')
  const [city, setCity] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [dominantHand, setDominantHand] = useState<'DERECHO' | 'IZQUIERDO' | ''>('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setMsg('')

      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) {
        setMsg('No hay usuario logueado.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, city, birth_date, height_cm, dominant_hand, avatar_url, cover_url')
        .eq('id', user.id)
        .single()

      if (error) {
        setMsg(error.message)
        setLoading(false)
        return
      }

      setProfile(data as Profile)

      setDisplayName(data.display_name ?? '')
      setCity(data.city ?? '')
      setBirthDate(data.birth_date ?? '')
      setHeightCm(data.height_cm?.toString() ?? '')
      setDominantHand((data.dominant_hand as any) ?? '')

      setLoading(false)
    })()
  }, [])

  async function save() {
  setSaving(true)
  setMsg('Guardando...')

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr) throw userErr
    const user = userData?.user
    if (!user) throw new Error('No hay usuario logueado.')

    const payload = {
      id: user.id, // ✅ clave: asegura que exista la fila
      display_name: displayName.trim() || null,
      city: city.trim() || null,
      birth_date: birthDate || null,
      height_cm: heightCm ? Number(heightCm) : null,
      dominant_hand: dominantHand || null,
    }

    const { error, data } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' }) // ✅ crea si no existe, actualiza si existe
      .select('id')
      .single()

    if (error) throw error

    setMsg(`✅ Guardado. (id=${data.id})`)
  } catch (e: any) {
    setMsg(`❌ Error: ${e?.message ?? 'desconocido'}`)
  } finally {
    setSaving(false)
  }
}


  if (loading) return <div>Cargando perfil...</div>

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Mi Perfil</h1>
      <p style={{ opacity: 0.8 }}>Estos datos alimentan estadísticas y emparejamientos.</p>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre público</div>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Ciudad</div>
          <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Fecha de nacimiento</div>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={inputStyle} />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Altura (cm)</div>
          <input
            inputMode="numeric"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            style={inputStyle}
            placeholder="Ej: 173"
          />
        </label>

        <label>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Brazo hábil</div>
          <select value={dominantHand} onChange={(e) => setDominantHand(e.target.value as any)} style={inputStyle}>
            <option value="">(sin definir)</option>
            <option value="DERECHO">Derecho</option>
            <option value="IZQUIERDO">Izquierdo</option>
          </select>
        </label>

        <button onClick={save} disabled={saving} style={btnStyle}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
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
  marginTop: 6,
}

const btnStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 10,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  cursor: 'pointer',
}
