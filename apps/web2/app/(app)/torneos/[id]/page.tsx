'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useActiveClub } from '@/lib/useActiveClub'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
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

  const [t, setT] = useState<TournamentView | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const okClub = useMemo(() => !!activeClub?.id, [activeClub?.id])

  async function load() {
    if (!id) return
    setLoading(true)
    setMsg('')

    const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('id', id).single()

    setLoading(false)

    if (error) {
      setMsg(`❌ ${error.message}`)
      setT(null)
      return
    }

    setT(toTournamentView(data as any))
  }

  useEffect(() => {
    load()
  }, [id])

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
              {t.type} • {t.gender} • Cat {t.category ?? '—'} • {t.format}
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
                <div style={v}>{fmtDate(t.startDate)}</div>
              </div>
              <div>
                <div style={k}>Fin</div>
                <div style={v}>{fmtDate(t.endDate)}</div>
              </div>
              <div>
                <div style={k}>Cierre inscripción</div>
                <div style={v}>{fmtDate(t.registrationDeadline)}</div>
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
                <div style={v}>{t.minPairs ?? '—'}</div>
              </div>
              <div>
                <div style={k}>Máx. parejas</div>
                <div style={v}>{t.maxPairs ?? '—'}</div>
              </div>
              <div>
                <div style={k}>Precio por jugador</div>
                <div style={v}>$ {t.pricePerPlayer ?? 0}</div>
              </div>
              <div>
                <div style={k}>Puntos totales</div>
                <div style={v}>{t.pointsTotal ?? 0}</div>
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