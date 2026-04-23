'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type LogEntry = {
  id: string
  action: string
  table_name: string
  user_id: string | null
  created_at: string
  details: string
  level: 'info'|'warning'|'error'
}

function fmtDateTime(d: string) {
  try { return new Date(d).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) } catch { return d }
}

const LEVEL_COLOR: Record<string, string> = { info:'#3b82f6', warning:'#f59e0b', error:'#ef4444' }
const LEVEL_EMOJI: Record<string, string> = { info:'ℹ️', warning:'⚠️', error:'❌' }

// Log sintético basado en actividad real del DB
export default function PlatformLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterLevel, setFilterLevel] = useState<string>('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // Construir log sintético desde eventos reales del DB
    const [clubsRes, teamsRes, membershipsRes] = await Promise.all([
      supabase.from('clubs').select('id, name, created_at').order('created_at', { ascending: false }).limit(10),
      supabase.from('tournament_teams').select('id, status, created_at, club_id').order('created_at', { ascending: false }).limit(20),
      supabase.from('club_memberships').select('id, status, role, created_at, club_id').order('created_at', { ascending: false }).limit(10),
    ])

    const entries: LogEntry[] = []

    for (const c of (clubsRes.data ?? []) as any[]) {
      entries.push({ id:`club-${c.id}`, action:'Club creado', table_name:'clubs', user_id: null, created_at: c.created_at, details:`Club "${c.name}" dado de alta en plataforma.`, level:'info' })
    }

    for (const t of (teamsRes.data ?? []) as any[]) {
      const level = t.status === 'REJECTED' ? 'warning' : 'info'
      entries.push({ id:`team-${t.id}`, action:`Equipo ${t.status === 'APPROVED' ? 'aprobado' : t.status === 'REJECTED' ? 'rechazado' : 'inscripto'}`, table_name:'tournament_teams', user_id: null, created_at: t.created_at, details:`Equipo en club ID ${t.club_id} — estado: ${t.status}`, level })
    }

    for (const m of (membershipsRes.data ?? []) as any[]) {
      entries.push({ id:`mem-${m.id}`, action:`Membership ${m.status}`, table_name:'club_memberships', user_id: null, created_at: m.created_at, details:`Rol ${m.role} en club ID ${m.club_id} — estado: ${m.status}`, level:'info' })
    }

    entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setLogs(entries)
    setLoading(false)
  }

  const filtered = logs.filter(l => filterLevel === 'all' || l.level === filterLevel)

  return (
    <div className="px-wrap">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Logs del sistema</h1>
          <p className="px-muted">Auditoría de eventos críticos de la plataforma</p>
        </div>
        <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
      </div>

      <div className="px-card px-card--flat" style={{ marginBottom:14, padding:'12px 16px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', fontSize:13 }}>
        📋 Los logs actuales se generan a partir de actividad real en la base de datos. En una versión futura se puede agregar una tabla de auditoría con triggers nativos.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'Info', value: logs.filter(l=>l.level==='info').length, color:'#3b82f6' },
          { label:'Warning', value: logs.filter(l=>l.level==='warning').length, color:'#f59e0b' },
          { label:'Error', value: logs.filter(l=>l.level==='error').length, color:'#ef4444' },
        ].map(s => (
          <div key={s.label} className="px-card px-card--flat" style={{ padding:'12px 16px' }}>
            <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color, marginTop:4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
          <option value="all">Todos los niveles</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <div className="px-pill" style={{ alignSelf:'center' }}>{filtered.length} eventos</div>
      </div>

      <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ fontFamily:'monospace', fontSize:12 }}>
          {loading ? (
            <div className="px-help" style={{ padding:'20px 16px' }}>Generando logs…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:40 }}>
              <div style={{ fontSize:32 }}>📋</div>
              <div className="px-help" style={{ marginTop:8 }}>No hay eventos para mostrar.</div>
            </div>
          ) : filtered.map((l, i) => (
            <div key={l.id} style={{ display:'grid', gridTemplateColumns:'16px 140px 1fr', gap:10, alignItems:'start', padding:'10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: l.level === 'error' ? 'rgba(239,68,68,.04)' : l.level === 'warning' ? 'rgba(245,158,11,.04)' : 'transparent' }}>
              <div style={{ color:LEVEL_COLOR[l.level], fontSize:13, paddingTop:1 }}>{LEVEL_EMOJI[l.level]}</div>
              <div style={{ color:'var(--muted)', fontSize:11, paddingTop:2 }}>{fmtDateTime(l.created_at)}</div>
              <div>
                <span style={{ fontWeight:700, color:LEVEL_COLOR[l.level] }}>[{l.table_name}]</span>{' '}
                <span style={{ fontWeight:700 }}>{l.action}</span>{' '}
                <span style={{ color:'var(--muted)' }}>— {l.details}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
