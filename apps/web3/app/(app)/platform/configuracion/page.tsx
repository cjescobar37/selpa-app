'use client'

import { useState } from 'react'

type ConfigParam = { key: string; label: string; value: string; type: 'text' | 'number' | 'select'; options?: string[]; description: string; group: string }

const INITIAL_PARAMS: ConfigParam[] = [
  { key:'commission_rate', label:'Tasa de comisión (%)', value:'5', type:'number', description:'Porcentaje que cobra la plataforma sobre cada inscripción aprobada.', group:'Finanzas' },
  { key:'min_pairs_default', label:'Mínimo de parejas por defecto', value:'6', type:'number', description:'Mínimo de parejas que debe tener un torneo para realizarse.', group:'Torneos' },
  { key:'max_pairs_default', label:'Máximo de parejas por defecto', value:'32', type:'number', description:'Máximo de parejas permitidas si el club no especifica uno.', group:'Torneos' },
  { key:'points_winner', label:'Puntos ganador (%)', value:'100', type:'number', description:'Porcentaje del total de puntos del torneo que recibe el campeón.', group:'Ranking' },
  { key:'points_finalist', label:'Puntos finalista (%)', value:'60', type:'number', description:'Porcentaje para el subcampeón.', group:'Ranking' },
  { key:'points_semifinal', label:'Puntos semifinalistas (%)', value:'35', type:'number', description:'Porcentaje para cada semifinalista.', group:'Ranking' },
  { key:'points_quarterfinal', label:'Puntos cuartos (%)', value:'20', type:'number', description:'Porcentaje para equipos eliminados en cuartos.', group:'Ranking' },
  { key:'points_groups', label:'Puntos fase de grupos (%)', value:'10', type:'number', description:'Porcentaje para equipos que solo llegaron a fase de grupos.', group:'Ranking' },
  { key:'platform_name', label:'Nombre de la plataforma', value:'PAMPRAX', type:'text', description:'Nombre visible en emails, PDFs y comunicaciones.', group:'General' },
  { key:'support_email', label:'Email de soporte', value:'soporte@pamprax.com', type:'text', description:'Dirección de contacto para soporte técnico.', group:'General' },
  { key:'default_currency', label:'Moneda por defecto', value:'ARS', type:'select', options:['ARS','USD','EUR'], description:'Moneda usada en precios de inscripciones y liquidaciones.', group:'Finanzas' },
  { key:'ranking_season', label:'Temporada activa', value:'2026', type:'text', description:'Año o nombre de la temporada en curso.', group:'Ranking' },
]

export default function PlatformConfiguracionPage() {
  const [params, setParams] = useState<ConfigParam[]>(INITIAL_PARAMS)
  const [saved, setSaved] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)

  const groups = Array.from(new Set(params.map(p => p.group)))

  function updateParam(key: string, value: string) {
    setParams(ps => ps.map(p => p.key === key ? { ...p, value } : p))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="px-wrap" style={{ maxWidth:800 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="px-h1">Configuración del sistema</h1>
          <p className="px-muted" style={{ marginTop:6 }}>Parámetros globales de la plataforma PAMPRAX</p>
        </div>
        <button onClick={handleSave} className="px-btn px-btn--magenta" style={{ height:38, padding:'0 20px', fontSize:14 }}>
          Guardar cambios
        </button>
      </div>

      {saved && (
        <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:12, background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', fontSize:14, fontWeight:700, color:'#065f46' }}>
          ✓ Cambios guardados correctamente
        </div>
      )}

      <div className="px-card px-card--flat" style={{ marginBottom:20, padding:'12px 16px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', fontSize:13 }}>
        ℹ️ Estos parámetros afectan el comportamiento global de la plataforma. Modificá con cuidado. Los cambios se aplican inmediatamente.
      </div>

      {groups.map(group => (
        <div key={group} style={{ marginBottom:20 }}>
          <div className="px-sepRow" style={{ marginBottom:10 }}>{group}</div>
          <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
            {params.filter(p => p.group === group).map((p, i, arr) => (
              <div key={p.key} style={{ padding:'14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{p.label}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{p.description}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {editKey === p.key ? (
                      <>
                        {p.type === 'select' ? (
                          <select value={p.value} onChange={e => updateParam(p.key, e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
                            {p.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={p.type} value={p.value} onChange={e => updateParam(p.key, e.target.value)} style={{ height:36, padding:'0 12px', borderRadius:10, border:'1.5px solid var(--navy)', background:'var(--glass)', fontSize:14, fontWeight:700, outline:'none', width:140, textAlign:'right' }} />
                        )}
                        <button onClick={() => setEditKey(null)} className="px-btn" style={{ height:32, padding:'0 12px', fontSize:12 }}>Listo</button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight:900, fontSize:16, color:'var(--navy)', minWidth:80, textAlign:'right' }}>{p.value}{p.type==='number'&&(p.key.endsWith('_rate')||p.key.startsWith('points_'))?'%':''}</div>
                        <button onClick={() => setEditKey(p.key)} className="px-btn px-btn--ghost" style={{ height:32, padding:'0 12px', fontSize:12 }}>Editar</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
