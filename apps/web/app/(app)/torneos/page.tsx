'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

type TournamentRow = {
  id: string
  name: string
  type: string
  gender: string
  format: string
  start_date: string
  end_date: string | null
  registration_deadline: string | null
  price_per_player: number | null
  max_pairs: number | null
  points_total: number | null
  status: string
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  const datePart = d.includes('T') ? d.split('T')[0] : d
  const [y, m, dd] = datePart.split('-')
  if (!y || !m || !dd) return d
  return `${dd}/${m}/${y}`
}

function formatTs(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-AR')
}


function formatLabel(v: string) {
  if (v === 'GROUPS_ELIMINATION') return 'Zonas + Eliminación'
  if (v === 'ELIMINATION') return 'Eliminación directa'
  if (v === 'GROUPS') return 'Solo zonas'
  return v
}

export default function TorneosPage() {
  const { activeClub, loading } = useActiveClub()
  const [items, setItems] = useState<TournamentRow[]>([])
  const [msg, setMsg] = useState('')

  async function load() {
    if (!activeClub?.id) return
    setMsg('Cargando...')

    const { data, error } = await supabase
      .from('tournaments')
      .select(
        'id,name,type,gender,format,start_date,end_date,registration_deadline,price_per_player,max_pairs,points_total,status'
      )
      .eq('club_id', activeClub.id)
      .order('created_at', { ascending: false })

    if (error) {
      setMsg(`❌ ${error.message}`)
      return
    }

    setItems((data ?? []) as any)
    setMsg('')
  }

  useEffect(() => {
    if (!loading) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeClub?.id])

  if (loading) return <div>Cargando club...</div>

  if (!activeClub?.id) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Torneos</h1>
        <p style={{ opacity: 0.75 }}>Primero seleccioná un club en el selector de arriba.</p>
        <Link href="/seleccionar-club">Ir a seleccionar club</Link>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900 }}>Torneos</h1>
          <div style={{ opacity: 0.7 }}>Club activo: <b>{activeClub.name}</b></div>
        </div>

        <Link href="/torneos/nuevo" style={btnLink}>
          + Nuevo torneo
        </Link>
      </div>

      {msg ? <div style={{ marginTop: 12, color: '#ff6b6b' }}>{msg}</div> : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
        {items.map((t) => (
          <div key={t.id} style={card}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{t.type} · {t.gender}</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{t.name}</div>

            <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 13, opacity: 0.9 }}>
              <div>Formato: <b>{formatLabel(t.format)}</b></div>
              <div>Inicio: <b>{formatDate(t.start_date)}</b></div>
              <div>Fin: <b>{formatDate(t.end_date)}</b></div>
              <div>Cierre inscripción: <b>{formatTs(t.registration_deadline)}</b></div>
              <div>$ por jugador: <b>{t.price_per_player ?? 0}</b></div>
              <div>Máx. parejas: <b>{t.max_pairs ?? '—'}</b></div>
              <div>Puntos totales: <b>{t.points_total ?? 0}</b></div>
              <div>Estado: <b>{t.status}</b></div>
            </div>

            <Link href={`/torneos/${t.id}`} style={btnSecondary}>
              Ver detalle
            </Link>
          </div>
        ))}

        {items.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>No hay torneos todavía.</div>
        ) : null}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.06)',
  padding: 14,
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
}

const btnLink: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  textDecoration: 'none',
}

const btnSecondary: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  textDecoration: 'none',
  textAlign: 'center',
}
