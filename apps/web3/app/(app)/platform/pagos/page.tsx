'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'

type PagoRow = {
  id: string
  club_name: string
  tournament_name: string
  player1: string
  player2: string
  amount: number
  status: string
  created_at: string
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }) } catch { return d }
}
function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
}

const STATUS_LABEL: Record<string, string> = { PENDING:'Pendiente', APPROVED:'Confirmado', REJECTED:'Anulado' }
const STATUS_COLOR: Record<string, string> = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444' }

export default function PlatformPagosPage() {
  const [rows, setRows] = useState<PagoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tournament_teams').select(`
      id, status, created_at,
      player1_id,
      player2_id,
      tournament:tournament_id ( name, price_per_player ),
      club:club_id ( name )
    `).order('created_at', { ascending: false })

    const rawData = (data ?? []) as any[]
    const allIds = rawData.flatMap((r: any) => [r.player1_id, r.player2_id]).filter(Boolean)
    const profileMap = await resolveProfiles(allIds)
    const mapped: PagoRow[] = rawData.map(r => {
      const t = Array.isArray(r.tournament) ? r.tournament[0] : r.tournament
      const c = Array.isArray(r.club) ? r.club[0] : r.club
      return { id: r.id, club_name: c?.name ?? '—', tournament_name: t?.name ?? '—', player1: playerName(profileMap[r.player1_id]) || 'J1', player2: playerName(profileMap[r.player2_id]) || 'J2', amount: (t?.price_per_player ?? 0) * 2, status: r.status ?? 'PENDING', created_at: r.created_at }
    })
    setRows(mapped)
    setLoading(false)
  }

  const filtered = rows.filter(r => filterStatus === 'all' || r.status === filterStatus)
  const totalAprobado = rows.filter(r => r.status === 'APPROVED').reduce((a,r) => a+r.amount, 0)
  const totalPendiente = rows.filter(r => r.status === 'PENDING').reduce((a,r) => a+r.amount, 0)

  return (
    <div className="px-wrap">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Pagos / Comisiones</h1>
          <p className="px-muted">Todos los pagos registrados en la plataforma</p>
        </div>
        <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Total registros', value: rows.length, color:'var(--navy)' },
          { label:'Monto confirmado', value: fmtARS(totalAprobado), color:'#10b981' },
          { label:'Monto pendiente', value: fmtARS(totalPendiente), color:'#f59e0b' },
          { label:'Comisión (5%)', value: fmtARS(totalAprobado * 0.05), color:'var(--magenta)' },
        ].map(s => (
          <div key={s.label} className="px-card px-card--flat" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize: typeof s.value === 'string' ? 18 : 28, fontWeight:900, color:s.color, marginTop:4, lineHeight:1.1 }}>{String(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="px-card px-card--flat" style={{ marginBottom:14, padding:'12px 16px', background:'rgba(255,78,114,.06)', border:'1px solid rgba(255,78,114,.2)', display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ fontSize:20 }}>💳</div>
        <div style={{ fontSize:13 }}>
          <b>Integración MercadoPago pendiente.</b> Los montos son estimados. Los pagos reales se mostrarán una vez activado el gateway.
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="px-pill" style={{ alignSelf:'center' }}>{filtered.length} registros</div>
      </div>

      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 100px', gap:8, padding:'8px 16px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>
          <div>Equipo / Torneo</div><div>Club</div><div style={{ textAlign:'center' }}>Estado</div><div style={{ textAlign:'right' }}>Monto</div>
        </div>
        {loading ? (
          <div className="px-help" style={{ padding:'20px 16px' }}>Cargando pagos…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:40 }}>
            <div style={{ fontSize:32 }}>💰</div>
            <div className="px-help" style={{ marginTop:8 }}>No hay pagos registrados.</div>
          </div>
        ) : filtered.map((r, i) => (
          <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 100px', gap:8, alignItems:'center', padding:'12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:13 }}>{r.player1} &amp; {r.player2}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{r.tournament_name} · {fmtDate(r.created_at)}</div>
            </div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>{r.club_name}</div>
            <div style={{ textAlign:'center' }}>
              <span style={{ background:(STATUS_COLOR[r.status]??'#9ca3af')+'22', color:STATUS_COLOR[r.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[r.status]??'#9ca3af')}44`, padding:'3px 8px', borderRadius:999, fontWeight:900, fontSize:11 }}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
            <div style={{ textAlign:'right', fontWeight:900, color:'var(--navy)' }}>{fmtARS(r.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
