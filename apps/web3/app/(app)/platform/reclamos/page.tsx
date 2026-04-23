'use client'

import { useState } from 'react'

type Reclamo = {
  id: string
  tipo: string
  descripcion: string
  estado: string
  usuario: string
  club: string
  fecha: string
}

// Reclamos mock — se conectará a tabla real (pendiente de schema)
const MOCK_RECLAMOS: Reclamo[] = [
  { id:'1', tipo:'Pago duplicado', descripcion:'Se me cobró dos veces la inscripción al torneo de enero.', estado:'PENDIENTE', usuario:'Juan García', club:'LA 33', fecha:'2026-01-15' },
  { id:'2', tipo:'Inscripción rechazada erróneamente', descripcion:'Mi inscripción fue rechazada pero cumplía todos los requisitos.', estado:'EN_REVISION', usuario:'María López', club:'Complejo BLP', fecha:'2026-01-18' },
  { id:'3', tipo:'Problema técnico', descripcion:'No puedo subir mi foto de perfil, me da error 500.', estado:'RESUELTO', usuario:'Carlos Ruiz', club:'LA 33', fecha:'2026-01-10' },
]

const ESTADO_COLOR: Record<string, string> = { PENDIENTE:'#f59e0b', EN_REVISION:'#3b82f6', RESUELTO:'#10b981', CERRADO:'#9ca3af' }
const TIPO_EMOJI: Record<string, string> = { 'Pago duplicado':'💳', 'Inscripción rechazada erróneamente':'📋', 'Problema técnico':'🔧' }

function fmtDate(d: string) {
  const [y,m,dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

export default function PlatformReclamosPage() {
  const [reclamos] = useState<Reclamo[]>(MOCK_RECLAMOS)
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [selected, setSelected] = useState<Reclamo | null>(null)

  const filtered = reclamos.filter(r => filterEstado === 'all' || r.estado === filterEstado)

  return (
    <div className="px-wrap">
      {selected && (
        <div className="px-overlay" onClick={() => setSelected(null)}>
          <div className="px-modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth:520 }}>
            <div className="px-modalHead">
              <div>
                <h2 className="px-modalTitle">{selected.tipo}</h2>
                <div className="px-modalSub">{selected.usuario} · {selected.club} · {fmtDate(selected.fecha)}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--muted)' }}>✕</button>
            </div>
            <div className="px-card px-card--flat" style={{ padding:'14px 16px', marginBottom:14 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Descripción del reclamo</div>
              <div className="px-modalBodyText">{selected.descripcion}</div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ background:(ESTADO_COLOR[selected.estado]??'#9ca3af')+'22', color:ESTADO_COLOR[selected.estado]??'#9ca3af', border:`1px solid ${(ESTADO_COLOR[selected.estado]??'#9ca3af')}44`, padding:'6px 14px', borderRadius:999, fontWeight:900, fontSize:13 }}>
                {selected.estado.replace('_',' ')}
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="px-btn px-btn--ghost" style={{ height:34, padding:'0 12px', fontSize:13 }}>En revisión</button>
                <button className="px-btn" style={{ height:34, padding:'0 12px', fontSize:13, background:'#10b981', borderColor:'#10b981', color:'#fff' }}>Marcar resuelto</button>
              </div>
            </div>
            <div className="px-card px-card--flat" style={{ marginTop:14, padding:'10px 14px', fontSize:12, color:'var(--muted)', background:'rgba(255,78,114,.04)', border:'1px solid rgba(255,78,114,.15)' }}>
              ℹ️ Los reclamos vinculados a pagos reales estarán disponibles una vez integrado el gateway de pago.
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Reclamos</h1>
          <p className="px-muted">Soporte y reclamos de usuarios · {reclamos.length} registros</p>
        </div>
        <div className="px-pill" style={{ background:'rgba(255,78,114,.1)', color:'var(--magenta)', border:'1px solid rgba(255,78,114,.3)', fontWeight:900 }}>
          {reclamos.filter(r => r.estado === 'PENDIENTE').length} pendientes
        </div>
      </div>

      <div className="px-card px-card--flat" style={{ marginBottom:14, padding:'12px 16px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', fontSize:13 }}>
        📌 Los datos actuales son de ejemplo. Una vez activado el gateway de pagos y el módulo de soporte, los reclamos reales aparecerán acá automáticamente.
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
          <option value="all">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="EN_REVISION">En revisión</option>
          <option value="RESUELTO">Resuelto</option>
          <option value="CERRADO">Cerrado</option>
        </select>
        <div className="px-pill" style={{ alignSelf:'center' }}>{filtered.length} reclamos</div>
      </div>

      <div style={{ display:'grid', gap:8 }}>
        {filtered.map(r => (
          <button key={r.id} onClick={() => setSelected(r)} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
            <div className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center', padding:'14px 16px' }}>
              <div style={{ fontSize:24 }}>{TIPO_EMOJI[r.tipo] ?? '❓'}</div>
              <div>
                <div style={{ fontWeight:800, fontSize:14 }}>{r.tipo}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{r.usuario} · {r.club} · {fmtDate(r.fecha)}</div>
                <div style={{ fontSize:13, color:'var(--muted)', marginTop:4, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:400 }}>{r.descripcion}</div>
              </div>
              <span style={{ background:(ESTADO_COLOR[r.estado]??'#9ca3af')+'22', color:ESTADO_COLOR[r.estado]??'#9ca3af', border:`1px solid ${(ESTADO_COLOR[r.estado]??'#9ca3af')}44`, padding:'4px 12px', borderRadius:999, fontWeight:900, fontSize:12, whiteSpace:'nowrap' }}>
                {r.estado.replace('_',' ')}
              </span>
              <div style={{ fontSize:18, color:'var(--muted)', opacity:.5 }}>›</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
