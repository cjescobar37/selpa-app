'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ClubConReglamento = { id: string; name: string; city: string | null; rules_pdf_url: string | null }

const REGLAMENTO_GENERAL = [
  { titulo:'1. Sistema de puntos', contenido:'Los puntos se asignan según la ronda alcanzada en cada torneo. El ganador del torneo recibe el 100% de los puntos disponibles, el finalista el 60%, los semifinalistas el 35%, los cuartos de final el 20%, y los grupos el 10%. Los puntos acumulados definen el ranking general y el ranking por categoría.' },
  { titulo:'2. Categorías', contenido:'Las categorías van de 1ª (nivel más alto) a 8ª (nivel más bajo). La categoría de un jugador se determina por su nivel de juego y puede actualizarse al inicio de cada temporada. Los jugadores pueden inscribirse en su categoría o en la superior, pero no en inferior.' },
  { titulo:'3. Formato de competencia', contenido:'El formato estándar es fase de grupos seguida de eliminación directa. En torneos con menos de 8 parejas se puede utilizar eliminación directa desde el inicio. Los partidos se juegan al mejor de 3 sets con tie-break en el tercer set a 10 puntos.' },
  { titulo:'4. Inscripciones', contenido:'Las inscripciones se realizan a través de la plataforma PAMPRAX. La pareja debe pertenecer al mismo club. El cierre de inscripciones es el indicado en cada torneo. Pasado ese plazo, no se aceptan nuevas inscripciones salvo lista de espera.' },
  { titulo:'5. Cancelaciones y walkover (WO)', contenido:'La cancelación de inscripción antes del cierre no tiene penalidad. Si una pareja se retira una vez cerradas las inscripciones, pierde el derecho a la devolución del arancel. El WO de un partido implica la derrota automática y puede conllevar sanción en el ranking.' },
  { titulo:'6. Conducta y fair play', contenido:'Se espera de todos los participantes un comportamiento deportivo y de respeto hacia rivales, árbitros y público. El organizador puede descalificar a cualquier jugador por conducta antideportiva, con pérdida de puntos y posible suspensión temporal.' },
  { titulo:'7. Reclamos y apelaciones', contenido:'Los reclamos deben realizarse ante el organizador del torneo durante el evento. Reclamos posteriores al torneo solo se aceptan dentro de las 48 horas siguientes a la finalización y deben enviarse a través de la plataforma.' },
]

export default function TorneosReglamentoPage() {
  const [clubs, setClubs] = useState<ClubConReglamento[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('clubs').select('id, name, city, rules_pdf_url').not('rules_pdf_url', 'is', null)
    setClubs((data ?? []) as ClubConReglamento[])
    setLoading(false)
  }

  return (
    <div style={{ maxWidth:860, margin:'0 auto', padding:'24px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="px-h1">Reglamento general</h1>
          <p className="px-muted" style={{ marginTop:6 }}>Reglas del circuito PAMPRAX — válidas para todos los torneos</p>
        </div>
        <Link href="/torneos" className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>← Torneos</Link>
      </div>

      {/* Reglamento general expandible */}
      <div style={{ display:'grid', gap:8, marginBottom:32 }}>
        {REGLAMENTO_GENERAL.map(r => (
          <div key={r.titulo} className="px-card px-card--flat" style={{ padding:0, overflow:'hidden' }}>
            <button onClick={() => setExpanded(expanded===r.titulo?null:r.titulo)} style={{ all:'unset', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:'16px 18px', width:'100%', boxSizing:'border-box' }}>
              <div style={{ fontWeight:900, fontSize:15 }}>{r.titulo}</div>
              <div style={{ fontSize:18, color:'var(--muted)', transition:'transform .2s', transform: expanded===r.titulo?'rotate(180deg)':'none' }}>▼</div>
            </button>
            {expanded === r.titulo && (
              <div style={{ padding:'0 18px 16px', fontSize:14, color:'var(--muted)', lineHeight:1.65, borderTop:'1px solid var(--border)' }}>
                <div style={{ paddingTop:12 }}>{r.contenido}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reglamentos por club */}
      <div>
        <div className="px-sepRow" style={{ marginBottom:14 }}>Reglamentos por club</div>
        {loading ? (
          <div className="px-help">Cargando reglamentos…</div>
        ) : clubs.length === 0 ? (
          <div className="px-card px-card--flat" style={{ textAlign:'center', padding:32 }}>
            <div style={{ fontSize:32 }}>📄</div>
            <div className="px-help" style={{ marginTop:8 }}>Ningún club ha subido su reglamento propio todavía.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gap:10 }}>
            {clubs.map(c => (
              <div key={c.id} className="px-card px-card--flat" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, padding:'14px 18px', flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:15 }}>{c.name}</div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>{c.city ?? '—'}</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <a href={c.rules_pdf_url!} target="_blank" rel="noreferrer" className="px-btn" style={{ height:34, padding:'0 14px', fontSize:13 }}>📄 Ver reglamento</a>
                  <a href={c.rules_pdf_url!} download className="px-btn px-btn--ghost" style={{ height:34, padding:'0 14px', fontSize:13 }}>⬇ Descargar</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
