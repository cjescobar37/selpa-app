'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ClubRow = { id: string; name: string; city: string | null; is_active: boolean | null; created_at: string }
type TournamentRow = { id: string; name: string; club_name: string; status: string; created_at: string }

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' }) } catch { return d }
}

const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }

export default function PlatformModeracionPage() {
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'clubs'|'torneos'>('clubs')
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [clubsRes, tourRes] = await Promise.all([
      supabase.from('clubs').select('id, name, city, is_active, created_at').order('created_at', { ascending: false }),
      supabase.from('tournaments').select('id, name, status, created_at, club:club_id(name)').order('created_at', { ascending: false }),
    ])
    setClubs((clubsRes.data ?? []) as ClubRow[])
    setTournaments(((tourRes.data ?? []) as any[]).map(t => {
      const c = Array.isArray(t.club) ? t.club[0] : t.club
      return { id: t.id, name: t.name, club_name: c?.name ?? '—', status: t.status ?? 'DRAFT', created_at: t.created_at }
    }))
    setLoading(false)
  }

  async function toggleClubActive(club: ClubRow) {
    setSaving(club.id)
    setMsg('')
    const { error } = await supabase.from('clubs').update({ is_active: !club.is_active }).eq('id', club.id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Club actualizado.'); load() }
    setSaving(null)
  }

  async function updateTournamentStatus(id: string, status: string) {
    setSaving(id)
    setMsg('')
    const { error } = await supabase.from('tournaments').update({ status, tournament_type: undefined }).eq('id', id)
    if (error) setMsg(`Error: ${error.message}`)
    else { setMsg('Torneo actualizado.'); load() }
    setSaving(null)
  }

  const tabStyle = (k: 'clubs'|'torneos'): React.CSSProperties => ({
    padding:'8px 18px', borderRadius:10, fontWeight:900, cursor:'pointer', fontSize:14, border:'none',
    background: tab === k ? 'var(--navy)' : 'transparent', color: tab === k ? '#fff' : 'var(--muted)',
  })

  return (
    <div className="px-wrap">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 className="px-h1">Moderación</h1>
          <p className="px-muted">Control de clubes y torneos de la plataforma</p>
        </div>
        <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
      </div>

      {msg && <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:10, background:'rgba(16,185,129,.1)', border:'1px solid rgba(16,185,129,.3)', fontSize:13 }}>{msg}</div>}

      <div style={{ display:'flex', gap:4, background:'rgba(23,37,63,.06)', borderRadius:12, padding:4, width:'fit-content', marginBottom:16 }}>
        <button style={tabStyle('clubs')} onClick={() => setTab('clubs')}>Clubes ({clubs.length})</button>
        <button style={tabStyle('torneos')} onClick={() => setTab('torneos')}>Torneos ({tournaments.length})</button>
      </div>

      {tab === 'clubs' && (
        <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 110px 80px', gap:8, padding:'8px 16px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>
            <div>Club</div><div style={{ textAlign:'center' }}>Ciudad</div><div style={{ textAlign:'center' }}>Registrado</div><div style={{ textAlign:'center' }}>Estado</div>
          </div>
          {loading ? <div className="px-help" style={{ padding:'20px 16px' }}>Cargando…</div> : clubs.map((c, i) => (
            <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 110px 80px', gap:8, alignItems:'center', padding:'12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontWeight:700 }}>{c.name}</div>
              <div style={{ textAlign:'center', fontSize:13, color:'var(--muted)' }}>{c.city ?? '—'}</div>
              <div style={{ textAlign:'center', fontSize:12, color:'var(--muted)' }}>{fmtDate(c.created_at)}</div>
              <div style={{ textAlign:'center' }}>
                <button disabled={saving===c.id} onClick={() => toggleClubActive(c)} style={{ padding:'4px 10px', borderRadius:999, border:'none', fontWeight:900, fontSize:11, cursor:'pointer', background: c.is_active !== false ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)', color: c.is_active !== false ? '#10b981' : '#ef4444' }}>
                  {saving===c.id ? '…' : c.is_active !== false ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'torneos' && (
        <div className="px-card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 140px', gap:8, padding:'8px 16px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>
            <div>Torneo</div><div>Club</div><div style={{ textAlign:'center' }}>Estado</div><div style={{ textAlign:'center' }}>Acción</div>
          </div>
          {loading ? <div className="px-help" style={{ padding:'20px 16px' }}>Cargando…</div> : tournaments.map((t, i) => (
            <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 100px 140px', gap:8, alignItems:'center', padding:'12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div>
                <div style={{ fontWeight:700 }}>{t.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(t.created_at)}</div>
              </div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>{t.club_name}</div>
              <div style={{ textAlign:'center' }}>
                <span style={{ background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'3px 8px', borderRadius:999, fontWeight:900, fontSize:11 }}>{t.status}</span>
              </div>
              <div style={{ textAlign:'center', display:'flex', gap:4, justifyContent:'center' }}>
                {t.status === 'DRAFT' && <button disabled={saving===t.id} onClick={() => updateTournamentStatus(t.id, 'OPEN')} style={{ padding:'4px 8px', borderRadius:8, border:'none', background:'rgba(16,185,129,.15)', color:'#10b981', fontWeight:900, fontSize:11, cursor:'pointer' }}>Abrir</button>}
                {t.status === 'OPEN' && <button disabled={saving===t.id} onClick={() => updateTournamentStatus(t.id, 'CLOSED')} style={{ padding:'4px 8px', borderRadius:8, border:'none', background:'rgba(239,68,68,.1)', color:'#ef4444', fontWeight:900, fontSize:11, cursor:'pointer' }}>Cerrar</button>}
                {t.status === 'IN_PROGRESS' && <button disabled={saving===t.id} onClick={() => updateTournamentStatus(t.id, 'FINISHED')} style={{ padding:'4px 8px', borderRadius:8, border:'none', background:'rgba(107,114,128,.15)', color:'#6b7280', fontWeight:900, fontSize:11, cursor:'pointer' }}>Finalizar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
