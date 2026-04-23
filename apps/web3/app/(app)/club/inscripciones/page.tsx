'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'
import { useSession } from '@/components/session/SessionProvider'

type Inscripcion = {
  id: string
  tournament_id: string
  tournament_name: string
  player1_name: string
  player2_name: string
  status: string
  created_at: string
  price_per_player: number | null
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = { PENDING:'Pendiente', APPROVED:'Aprobado', REJECTED:'Rechazado', WAITLIST:'Lista espera' }
const STATUS_COLOR: Record<string, string> = { PENDING:'#f59e0b', APPROVED:'#10b981', REJECTED:'#ef4444', WAITLIST:'#8b5cf6' }

export default function ClubInscripcionesPage() {
  const { activeClub, role } = useSession()
  const [rows, setRows] = useState<Inscripcion[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tournament_teams')
      .select(`
        id, tournament_id, status, created_at,
        player1_id,
        player2_id,
        tournament:tournament_id ( name, price_per_player )
      `)
      .eq('club_id', activeClub!.id)
      .order('created_at', { ascending: false })

    const rawData = (data ?? []) as any[]
    const allIds = rawData.flatMap((r: any) => [r.player1_id, r.player2_id]).filter(Boolean)
    const profileMap = await resolveProfiles(allIds)
    const mapped: Inscripcion[] = rawData.map((r: any) => {
      const t = Array.isArray(r.tournament) ? r.tournament[0] : r.tournament
      return { id: r.id, tournament_id: r.tournament_id, tournament_name: t?.name ?? '—', player1_name: playerName(profileMap[r.player1_id]) || 'Jugador 1', player2_name: playerName(profileMap[r.player2_id]) || 'Jugador 2', status: r.status ?? 'PENDING', created_at: r.created_at, price_per_player: t?.price_per_player ?? null }
    })
    setRows(mapped)
    setLoading(false)
  }

  async function updateStatus(id: string, newStatus: string) {
    setSavingId(id)
    setMsg('')
    const { error } = await supabase.from('tournament_teams').update({ status: newStatus }).eq('id', id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Estado actualizado.'); load() }
    setSavingId(null)
  }

  const canManage = role === 'club' || role === 'club_staff' || role === 'platform'

  const filtered = rows.filter(r => filterStatus === 'all' || r.status === filterStatus)

  const stats = {
    total: rows.length,
    pending: rows.filter(r => r.status === 'PENDING').length,
    approved: rows.filter(r => r.status === 'APPROVED').length,
    rejected: rows.filter(r => r.status === 'REJECTED').length,
  }

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Inscripciones</h1>
            <p className="club-sub">Gestión de equipos inscriptos en torneos del club</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>

        <div className="club-kpis" style={{ marginTop:16 }}>
          {[
            { label:'Total', value: stats.total, color:'var(--navy)' },
            { label:'Pendientes', value: stats.pending, color:'#f59e0b' },
            { label:'Aprobadas', value: stats.approved, color:'#10b981' },
            { label:'Rechazadas', value: stats.rejected, color:'#ef4444' },
          ].map(s => (
            <div key={s.label} className="club-kpi">
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:900, color:s.color, marginTop:4 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:10, marginTop:16, flexWrap:'wrap' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="px-pill" style={{ alignSelf:'center' }}>{filtered.length} equipos</div>
        </div>

        {msg && <div style={{ marginTop:10, padding:'8px 12px', borderRadius:10, background:'rgba(16,185,129,.12)', border:'1px solid rgba(16,185,129,.3)', fontSize:13, color:'#065f46' }}>{msg}</div>}

        <div style={{ marginTop:16, display:'grid', gap:8 }}>
          {loading ? (
            <div className="px-help">Cargando inscripciones…</div>
          ) : filtered.length === 0 ? (
            <div className="px-card px-card--flat" style={{ textAlign:'center', padding:36 }}>
              <div style={{ fontSize:36 }}>📋</div>
              <div className="px-help" style={{ marginTop:8 }}>No hay inscripciones registradas aún.</div>
              <Link href="/club/torneos" className="px-btn" style={{ marginTop:14, display:'inline-flex' }}>Ver torneos</Link>
            </div>
          ) : filtered.map(r => (
            <div key={r.id} className="px-card px-card--flat" style={{ padding:'14px 16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:14, alignItems:'start' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:14 }}>{r.player1_name} &amp; {r.player2_name}</div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>
                    {r.tournament_name} · {fmtDate(r.created_at)}
                    {r.price_per_player != null && ` · $${r.price_per_player * 2} total`}
                  </div>
                </div>
                <span style={{ background:(STATUS_COLOR[r.status]??'#9ca3af')+'22', color: STATUS_COLOR[r.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[r.status]??'#9ca3af')}44`, padding:'5px 12px', borderRadius:999, fontWeight:900, fontSize:12, whiteSpace:'nowrap' }}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                {canManage && r.status === 'PENDING' && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button disabled={savingId===r.id} onClick={() => updateStatus(r.id, 'APPROVED')} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', fontWeight:900, cursor:'pointer', fontSize:12 }}>
                      ✓ Aprobar
                    </button>
                    <button disabled={savingId===r.id} onClick={() => updateStatus(r.id, 'REJECTED')} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#ef4444', color:'#fff', fontWeight:900, cursor:'pointer', fontSize:12 }}>
                      ✕ Rechazar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
