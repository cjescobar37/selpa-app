'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'

type Tournament = {
  id: string
  club_id: string
  name: string
  status: string
  type: string
  format: string
  gender: string
  category_id: number
  start_date: string
  end_date: string | null
  registration_deadline: string | null
  min_pairs: number | null
  max_pairs: number | null
  price_per_player: number | null
  points_total: number | null
  rules: any | null
  created_at: string
  updated_at: string
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  // Si viene timestamp, cortamos
  const datePart = d.includes('T') ? d.split('T')[0] : d
  const [y, m, dd] = datePart.split('-')
  if (!y || !m || !dd) return d
  return `${dd}/${m}/${y}`
}

export default function TorneoDetallePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const { activeClub, loading: clubLoading } = useActiveClub()

  const [t, setT] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const okClub = useMemo(() => !!activeClub?.id, [activeClub?.id])

  async function load() {
    if (!id) return
    setLoading(true)
    setMsg('')

    const { data, error } = await supabase
      .from('tournaments')
      .select(
        'id, club_id, name, status, type, format, gender, category_id, start_date, end_date, registration_deadline, min_pairs, max_pairs, price_per_player, points_total, rules, created_at, updated_at'
      )
      .eq('id', id)
      .single()

    setLoading(false)

    if (error) {
      setMsg(`❌ ${error.message}`)
      setT(null)
      return
    }

    setT(data as any)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // protección: si el torneo no es del club activo, avisamos
  const clubMismatch = useMemo(() => {
    if (!t || !activeClub) return false
    return t.club_id !== activeClub.id
  }, [t, activeClub])

  if (clubLoading) return <div>Cargando...</div>

  if (!okClub) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>Torneo</h1>
        <p style={{ opacity: 0.8 }}>Seleccioná un club activo primero.</p>
        <Link href="/torneos" style={{ color: 'white' }}>
          ← Volver
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Link href="/torneos" style={{ color: 'white', opacity: 0.85, textDecoration: 'none' }}>
            ← Volver a Torneos
          </Link>

          <h1 style={{ fontSize: 28, fontWeight: 950, marginTop: 10, marginBottom: 0 }}>
            {t?.name ?? (loading ? 'Cargando...' : 'Torneo')}
          </h1>

          {t ? (
            <div style={{ opacity: 0.8, marginTop: 8 }}>
              {t.type} • {t.gender} • Cat {t.category_id} • {t.format}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} disabled={loading} style={btn}>
            {loading ? 'Actualizando...' : 'Refrescar'}
          </button>
          <button
            onClick={() => {
              router.push(`/torneos/${id}/editar`)
            }}
            style={btnGhost}
            disabled
            title="Lo hacemos en el próximo paso"
          >
            Editar (próximo)
          </button>
          <button
  onClick={() => router.push(`/torneos/${id}/inscripcion`)}
  style={btn}
  disabled={!t || clubMismatch}
  title={!t ? 'Cargando...' : clubMismatch ? 'Cambiar club activo' : 'Inscribirse'}
>
  Inscribirse
</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, color: '#ffb4b4' }}>{msg}</div>}

      {clubMismatch ? (
        <div style={warnBox}>
          ⚠️ Este torneo pertenece a otro club. Cambiá el club activo arriba para gestionarlo.
        </div>
      ) : null}

      {t ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <div style={card}>
            <div style={cardTitle}>Fechas</div>
            <div style={grid2}>
              <div>
                <div style={k}>Inicio</div>
                <div style={v}>{fmtDate(t.start_date)}</div>
              </div>
              <div>
                <div style={k}>Fin</div>
                <div style={v}>{fmtDate(t.end_date)}</div>
              </div>
              <div>
                <div style={k}>Cierre inscripción</div>
                <div style={v}>{fmtDate(t.registration_deadline)}</div>
              </div>
              <div>
                <div style={k}>Estado</div>
                <div style={v}>{t.status}</div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitle}>Cupos y costos</div>
            <div style={grid2}>
              <div>
                <div style={k}>Mín. parejas</div>
                <div style={v}>{t.min_pairs ?? '—'}</div>
              </div>
              <div>
                <div style={k}>Máx. parejas</div>
                <div style={v}>{t.max_pairs ?? '—'}</div>
              </div>
              <div>
                <div style={k}>Precio por jugador</div>
                <div style={v}>$ {t.price_per_player ?? 0}</div>
              </div>
              <div>
                <div style={k}>Puntos totales</div>
                <div style={v}>{t.points_total ?? 0}</div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={cardTitle}>Reglas</div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.10)',
                overflow: 'auto',
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              {JSON.stringify(t.rules ?? {}, null, 2)}
            </pre>
          </div>

          <div style={card}>
            <div style={cardTitle}>Próximo paso</div>
            <div style={{ opacity: 0.85 }}>
              Ahora vamos a implementar <b>Inscripción de parejas</b> para este torneo:
              <ul style={{ marginTop: 8 }}>
                <li>Crear pareja (2 usuarios) y registrarla en el torneo</li>
                <li>Validar categoría (no puede anotarse a menor nivel)</li>
                <li>Cupos + deadline</li>
                <li>Vista de inscriptos para admin</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.20)',
  background: 'rgba(255,255,255,0.10)',
  color: 'white',
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  ...btn,
  background: 'transparent',
  opacity: 0.65,
  cursor: 'not-allowed',
}

const card: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 16,
  padding: 14,
}
const cardTitle: React.CSSProperties = { fontWeight: 900, marginBottom: 10 }
const grid2: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
const k: React.CSSProperties = { fontSize: 12, opacity: 0.7 }
const v: React.CSSProperties = { fontSize: 15, fontWeight: 700 }

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  border: '1px solid rgba(255,120,120,0.35)',
  background: 'rgba(255,120,120,0.10)',
  color: 'white',
}
