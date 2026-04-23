'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'
import { useSession } from '@/components/session/SessionProvider'

type IngresoRow = {
  id: string
  tournament_name: string
  player1_name: string
  player2_name: string
  amount: number
  status: string
  created_at: string
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

function fmtARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }).format(n)
}

const STATUS_LABEL: Record<string, string> = { PENDING:'Pendiente', APPROVED:'Confirmado', REJECTED:'Anulado' }
const STATUS_COLOR: Record<string, string> = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444' }

export default function ClubContabilidadPage() {
  const { activeClub } = useSession()
  const [rows, setRows] = useState<IngresoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tournament_teams')
      .select(`
        id, status, created_at,
        player1_id,
        player2_id,
        tournament:tournament_id ( name, price_per_player )
      `)
      .eq('club_id', activeClub!.id)
      .order('created_at', { ascending: false })

    const rawData = (data ?? []) as any[]
    const allIds = rawData.flatMap((r: any) => [r.player1_id, r.player2_id]).filter(Boolean)
    const profileMap = await resolveProfiles(allIds)
    const mapped: IngresoRow[] = rawData.map((r: any) => {
      const t = Array.isArray(r.tournament) ? r.tournament[0] : r.tournament
      const price = (t?.price_per_player ?? 0) * 2
      return { id: r.id, tournament_name: t?.name ?? '—', player1_name: playerName(profileMap[r.player1_id]) || 'J1', player2_name: playerName(profileMap[r.player2_id]) || 'J2', amount: price, status: r.status ?? 'PENDING', created_at: r.created_at }
    })
    setRows(mapped)
    setLoading(false)
  }

  const filtered = rows.filter(r => filterStatus === 'all' || r.status === filterStatus)

  const totalAprobado = rows.filter(r => r.status === 'APPROVED').reduce((a,r) => a + r.amount, 0)
  const totalPendiente = rows.filter(r => r.status === 'PENDING').reduce((a,r) => a + r.amount, 0)
  const totalAnulado = rows.filter(r => r.status === 'REJECTED').reduce((a,r) => a + r.amount, 0)
  const comisionEstimada = totalAprobado * 0.05

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Contabilidad</h1>
            <p className="club-sub">Ingresos por inscripciones a torneos · Comisión plataforma: 5%</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>

        {/* KPIs financieros */}
        <div className="club-kpis" style={{ marginTop:16 }}>
          {[
            { label:'Ingresos confirmados', value: fmtARS(totalAprobado), color:'#10b981', hint:'Equipos aprobados' },
            { label:'Pendiente de cobro', value: fmtARS(totalPendiente), color:'#f59e0b', hint:'Equipos pendientes' },
            { label:'Comisión plataforma', value: fmtARS(comisionEstimada), color:'var(--magenta)', hint:'5% sobre confirmados' },
            { label:'Neto estimado', value: fmtARS(totalAprobado - comisionEstimada), color:'var(--navy)', hint:'Después de comisión' },
          ].map(s => (
            <div key={s.label} className="club-kpi">
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.color, marginTop:4, lineHeight:1.1 }}>{s.value}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{s.hint}</div>
            </div>
          ))}
        </div>

        {/* Aviso MercadoPago */}
        <div className="px-card px-card--flat" style={{ marginTop:16, display:'flex', gap:14, alignItems:'center', padding:'12px 16px', background:'rgba(255,78,114,.06)', border:'1px solid rgba(255,78,114,.2)' }}>
          <div style={{ fontSize:24 }}>💳</div>
          <div>
            <div style={{ fontWeight:800, fontSize:14 }}>Integración MercadoPago pendiente</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>Los montos son estimados basados en el precio por jugador × 2. Una vez integrado el gateway de pagos, verás el estado real de cada cobro.</div>
          </div>
        </div>

        {/* Filtro */}
        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="px-pill" style={{ alignSelf:'center' }}>{filtered.length} registros</div>
        </div>

        {/* Tabla */}
        <div style={{ marginTop:14, display:'grid', gap:6 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 100px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)' }}>
            <div>Equipo</div><div>Torneo</div><div style={{ textAlign:'center' }}>Estado</div><div style={{ textAlign:'right' }}>Monto</div>
          </div>
          {loading ? (
            <div className="px-help" style={{ padding:'10px 14px' }}>Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="px-card px-card--flat" style={{ textAlign:'center', padding:32 }}>
              <div style={{ fontSize:32 }}>💰</div>
              <div className="px-help" style={{ marginTop:8 }}>No hay registros contables aún.</div>
            </div>
          ) : filtered.map(r => (
            <div key={r.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px 100px', gap:8, alignItems:'center', padding:'12px 14px' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13 }}>{r.player1_name} &amp; {r.player2_name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(r.created_at)}</div>
              </div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>{r.tournament_name}</div>
              <div style={{ textAlign:'center' }}>
                <span style={{ background:(STATUS_COLOR[r.status]??'#9ca3af')+'22', color:STATUS_COLOR[r.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[r.status]??'#9ca3af')}44`, padding:'3px 8px', borderRadius:999, fontWeight:900, fontSize:11 }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div style={{ textAlign:'right', fontWeight:900, fontSize:14, color: r.status === 'APPROVED' ? '#10b981' : r.status === 'REJECTED' ? '#ef444488' : 'var(--text)' }}>
                {fmtARS(r.amount)}
              </div>
            </div>
          ))}
        </div>

        {/* Total visible */}
        {filtered.length > 0 && (
          <div style={{ marginTop:12, padding:'12px 16px', borderRadius:12, background:'rgba(46,84,147,.06)', border:'1px solid rgba(46,84,147,.12)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:900 }}>Total filtrado</div>
            <div style={{ fontWeight:900, fontSize:18, color:'var(--navy)' }}>{fmtARS(filtered.reduce((a,r) => a + r.amount, 0))}</div>
          </div>
        )}
      </div>
    </div>
  )
}
