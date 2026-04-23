'use client'

import { useEffect, useState } from 'react'

type NoticiaPublica = {
  id: string
  titulo: string
  resumen: string
  contenido: string
  fecha: string
  club: string
  categoria: string
  destacada: boolean
}

// Noticias públicas demo — en producción vendría de la tabla de noticias
const DEMO: NoticiaPublica[] = [
  { id:'1', titulo:'¡Bienvenidos a PAMPRAX!', resumen:'La plataforma oficial de gestión de pádel ya está disponible para todos los clubes del país.', contenido:'PAMPRAX es la nueva plataforma integral para la gestión de torneos, ranking y clubes de pádel en Argentina. Clubes, jugadores y organizadores pueden registrarse de forma gratuita.', fecha:'2026-01-01', club:'PAMPRAX', categoria:'Plataforma', destacada:true },
  { id:'2', titulo:'Torneo Apertura 2026 — Club LA 33', resumen:'Las inscripciones para el Torneo Apertura están abiertas. Categorías del 3ª al 7ª. No te quedés afuera.', contenido:'El Club LA 33 organiza su primer torneo del año. Habrá categorías para todos los niveles, premios para los primeros puestos y una gran jornada de pádel.', fecha:'2026-01-10', club:'LA 33', categoria:'Torneos', destacada:true },
  { id:'3', titulo:'Nuevo sistema de ranking por puntos', resumen:'Presentamos el sistema de puntos acumulativos para el ranking de clubes. Cada torneo suma.', contenido:'A partir de este mes, todos los torneos oficiales dentro de la plataforma sumarán puntos al ranking interno de cada club y al ranking general de PAMPRAX.', fecha:'2026-01-15', club:'PAMPRAX', categoria:'Plataforma', destacada:false },
  { id:'4', titulo:'Temporada 2026 en Complejo BLP', resumen:'El Complejo BLP anuncia su calendario completo de torneos para la temporada 2026.', contenido:'Con 6 torneos programados entre enero y diciembre, el Complejo BLP promete una temporada llena de acción. Las fechas estarán disponibles en el calendario del club.', fecha:'2026-01-20', club:'Complejo BLP', categoria:'Torneos', destacada:false },
]

function fmtDate(d: string) {
  const [y,m,dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

const CAT_COLOR: Record<string, string> = { Plataforma:'var(--cyan)', Torneos:'var(--magenta)', General:'var(--navy)' }

export default function NoticiasPublicPage() {
  const [noticias] = useState<NoticiaPublica[]>(DEMO)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const categorias = Array.from(new Set(noticias.map(n => n.categoria)))
  const filtered = noticias.filter(n => filterCat === 'all' || n.categoria === filterCat)
  const destacadas = filtered.filter(n => n.destacada)
  const resto = filtered.filter(n => !n.destacada)

  return (
    <div style={{ maxWidth:1120, margin:'0 auto', padding:'24px 16px' }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="px-h1">Noticias</h1>
        <p className="px-muted" style={{ marginTop:6 }}>Últimas novedades de la plataforma y los clubes</p>
      </div>

      {/* Filtro categorías */}
      <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
        {['all', ...categorias].map(c => (
          <button key={c} onClick={() => setFilterCat(c)} style={{ padding:'7px 18px', borderRadius:999, fontWeight:900, cursor:'pointer', fontSize:13, border:'1.5px solid var(--border)', background: filterCat===c ? 'var(--navy)' : 'var(--glass)', color: filterCat===c ? '#fff' : 'var(--text)' }}>
            {c === 'all' ? 'Todas' : c}
          </button>
        ))}
      </div>

      {/* Destacadas */}
      {destacadas.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div className="px-sepRow" style={{ marginBottom:14 }}>⭐ Destacadas</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
            {destacadas.map(n => (
              <div key={n.id} className="px-card" style={{ padding:0, overflow:'hidden', borderTop:`4px solid ${CAT_COLOR[n.categoria]??'var(--navy)'}`, cursor:'pointer' }} onClick={() => setExpanded(expanded===n.id?null:n.id)}>
                <div style={{ padding:'18px 18px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                    <span style={{ fontSize:11, fontWeight:900, padding:'3px 10px', borderRadius:999, background:(CAT_COLOR[n.categoria]??'var(--navy)')+'22', color:CAT_COLOR[n.categoria]??'var(--navy)', border:`1px solid ${(CAT_COLOR[n.categoria]??'var(--navy)')}44` }}>{n.categoria}</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>{fmtDate(n.fecha)}</span>
                  </div>
                  <div style={{ fontWeight:900, fontSize:18, lineHeight:1.2 }}>{n.titulo}</div>
                  <div style={{ fontSize:14, color:'var(--muted)', marginTop:8, lineHeight:1.5 }}>{expanded===n.id?n.contenido:n.resumen}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
                    <span style={{ fontSize:12, color:'var(--muted)', fontWeight:700 }}>📍 {n.club}</span>
                    <span style={{ fontSize:12, fontWeight:900, color:'var(--navy)' }}>{expanded===n.id?'Ver menos ▲':'Leer más ▼'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resto */}
      {resto.length > 0 && (
        <div>
          {destacadas.length > 0 && <div className="px-sepRow" style={{ marginBottom:14 }}>Más noticias</div>}
          <div style={{ display:'grid', gap:10 }}>
            {resto.map(n => (
              <div key={n.id} className="px-card px-card--flat" style={{ padding:'16px 18px', cursor:'pointer', borderLeft:`3px solid ${CAT_COLOR[n.categoria]??'var(--navy)'}` }} onClick={() => setExpanded(expanded===n.id?null:n.id)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:900, padding:'2px 8px', borderRadius:999, background:(CAT_COLOR[n.categoria]??'var(--navy)')+'22', color:CAT_COLOR[n.categoria]??'var(--navy)' }}>{n.categoria}</span>
                      <span style={{ fontSize:12, color:'var(--muted)' }}>{n.club} · {fmtDate(n.fecha)}</span>
                    </div>
                    <div style={{ fontWeight:900, fontSize:16 }}>{n.titulo}</div>
                    <div style={{ fontSize:13, color:'var(--muted)', marginTop:6, lineHeight:1.5 }}>{expanded===n.id?n.contenido:n.resumen}</div>
                  </div>
                  <div style={{ fontSize:18, color:'var(--muted)', flexShrink:0, paddingTop:2 }}>{expanded===n.id?'▲':'›'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="px-card" style={{ textAlign:'center', padding:64 }}>
          <div style={{ fontSize:40 }}>📰</div>
          <div style={{ fontWeight:900, fontSize:18, marginTop:14 }}>No hay noticias en esta categoría</div>
        </div>
      )}
    </div>
  )
}
