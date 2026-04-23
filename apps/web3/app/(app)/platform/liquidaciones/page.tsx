'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type LiquidacionRow = {
  club_id: string
  club_name: string
  club_city: string | null
  total_bruto: number
  comision: number
  neto: number
  equipos_aprobados: number
}

function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
}

const COMISION_RATE = 0.05

export default function PlatformLiquidacionesPage() {
  const [rows, setRows] = useState<LiquidacionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClub, setSelectedClub] = useState<LiquidacionRow | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [clubsRes, teamsRes] = await Promise.all([
      supabase.from('clubs').select('id, name, city'),
      supabase.from('tournament_teams').select('club_id, status, tournament:tournament_id(price_per_player)').eq('status', 'APPROVED'),
    ])

    const clubsData = (clubsRes.data ?? []) as any[]
    const teamsData = (teamsRes.data ?? []) as any[]

    const byClub: Record<string, { bruto: number; equipos: number }> = {}
    for (const t of teamsData) {
      const p = Array.isArray(t.tournament) ? t.tournament[0] : t.tournament
      const amt = (p?.price_per_player ?? 0) * 2
      if (!byClub[t.club_id]) byClub[t.club_id] = { bruto:0, equipos:0 }
      byClub[t.club_id].bruto += amt
      byClub[t.club_id].equipos++
    }

    const liq: LiquidacionRow[] = clubsData.map((c: any) => {
      const d = byClub[c.id] ?? { bruto:0, equipos:0 }
      const com = d.bruto * COMISION_RATE
      return { club_id: c.id, club_name: c.name, club_city: c.city, total_bruto: d.bruto, comision: com, neto: d.bruto - com, equipos_aprobados: d.equipos }
    }).sort((a,b) => b.total_bruto - a.total_bruto)

    setRows(liq)
    setLoading(false)
  }

  const totalBruto = rows.reduce((a,r) => a+r.total_bruto, 0)
  const totalComision = rows.reduce((a,r) => a+r.comision, 0)
  const totalNeto = rows.reduce((a,r) => a+r.neto, 0)

  return (
    <div className="px-wrap">
      {selectedClub && (
        <div className="px-overlay" onClick={() => setSelectedClub(null)}>
          <div className="px-modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
            <div className="px-modalHead">
              <h2 className="px-modalTitle">Liquidación — {selectedClub.club_name}</h2>
              <button onClick={() => setSelectedClub(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--muted)' }}>✕</button>
            </div>
            <div style={{ display:'grid', gap:10 }}>
              {[
                { k:'Equipos aprobados', v: selectedClub.equipos_aprobados },
                { k:'Ingreso bruto', v: fmtARS(selectedClub.total_bruto) },
                { k:`Comisión plataforma (${COMISION_RATE*100}%)`, v: fmtARS(selectedClub.comision), color:'var(--magenta)' },
                { k:'Monto neto a liquidar', v: fmtARS(selectedClub.neto), color:'#10b981' },
              ].map(({ k, v, color }) => (
                <div key={k} className="px-card px-card--flat" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px' }}>
                  <div style={{ fontWeight:700 }}>{k}</div>
                  <div style={{ fontWeight:900, fontSize:16, color: color ?? 'var(--text)' }}>{String(v)}</div>
                </div>
              ))}
            </div>
            <div className="px-card px-card--flat" style={{ marginTop:14, padding:'12px 14px', background:'rgba(255,78,114,.06)', border:'1px solid rgba(255,78,114,.2)', fontSize:13 }}>
              💳 La liquidación real requiere integración con MercadoPago o transferencia bancaria. Estos valores son estimados basados en los equipos aprobados.
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
              <button onClick={() => setSelectedClub(null)} className="px-btn px-btn--ghost">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Liquidaciones</h1>
          <p className="px-muted">Resumen financiero por club · Comisión plataforma: {COMISION_RATE*100}%</p>
        </div>
        <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
      </div>

      {/* Totales globales */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Total bruto plataforma', value: fmtARS(totalBruto), color:'var(--navy)' },
          { label:'Comisión plataforma', value: fmtARS(totalComision), color:'var(--magenta)' },
          { label:'Total neto a liquidar', value: fmtARS(totalNeto), color:'#10b981' },
        ].map(s => (
          <div key={s.label} className="px-card" style={{ padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:900, color:s.color, marginTop:6, lineHeight:1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:900, fontSize:15 }}>Detalle por club</div>
        {loading ? (
          <div className="px-help" style={{ padding:'20px 18px' }}>Calculando liquidaciones…</div>
        ) : (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px 110px', gap:8, padding:'8px 18px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>
              <div>Club</div><div style={{ textAlign:'center' }}>Equipos</div><div style={{ textAlign:'right' }}>Bruto</div><div style={{ textAlign:'right' }}>Comisión</div><div style={{ textAlign:'right' }}>Neto</div>
            </div>
            {rows.map((r, i) => (
              <button key={r.club_id} onClick={() => setSelectedClub(r)} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px 110px', gap:8, alignItems:'center', padding:'14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', transition:'background .12s' }}>
                  <div>
                    <div style={{ fontWeight:700 }}>{r.club_name}</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{r.club_city ?? '—'}</div>
                  </div>
                  <div style={{ textAlign:'center', fontWeight:700 }}>{r.equipos_aprobados}</div>
                  <div style={{ textAlign:'right', fontWeight:700, fontSize:13 }}>{fmtARS(r.total_bruto)}</div>
                  <div style={{ textAlign:'right', fontWeight:700, fontSize:13, color:'var(--magenta)' }}>{fmtARS(r.comision)}</div>
                  <div style={{ textAlign:'right', fontWeight:900, fontSize:14, color:'#10b981' }}>{fmtARS(r.neto)}</div>
                </div>
              </button>
            ))}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px 110px', gap:8, padding:'12px 18px', background:'rgba(46,84,147,.06)', borderTop:'2px solid var(--border)', fontWeight:900 }}>
              <div>Total</div>
              <div style={{ textAlign:'center' }}>{rows.reduce((a,r)=>a+r.equipos_aprobados,0)}</div>
              <div style={{ textAlign:'right', fontSize:14 }}>{fmtARS(totalBruto)}</div>
              <div style={{ textAlign:'right', fontSize:14, color:'var(--magenta)' }}>{fmtARS(totalComision)}</div>
              <div style={{ textAlign:'right', fontSize:15, color:'#10b981' }}>{fmtARS(totalNeto)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
