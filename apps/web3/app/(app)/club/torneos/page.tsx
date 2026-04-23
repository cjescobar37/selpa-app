'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280'
}
const STATUS_LABEL: Record<string, string> = {
  DRAFT:'Borrador', OPEN:'Inscripciones abiertas', IN_PROGRESS:'En curso', CLOSED:'Cerrado', FINISHED:'Finalizado'
}
const GENDER_LABEL: Record<string, string> = { MALE:'Masculino', FEMALE:'Femenino', MIXED:'Mixto' }

export default function ClubTorneosPage() {
  const { activeClub, role } = useSession()
  const [tournaments, setTournaments] = useState<TournamentView[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_SELECT)
      .eq('club_id', activeClub!.id)
      .order('created_at', { ascending: false })

    const tvs = (data ?? []).map(toTournamentView).filter(Boolean) as TournamentView[]
    setTournaments(tvs)
    setLoading(false)
  }

  const filtered = tournaments.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const canManage = role === 'club' || role === 'club_staff' || role === 'platform'

  const stats = [
    { label: 'Total torneos', value: tournaments.length },
    { label: 'Abiertos', value: tournaments.filter(t => t.status === 'OPEN').length },
    { label: 'En curso', value: tournaments.filter(t => t.status === 'IN_PROGRESS').length },
    { label: 'Finalizados', value: tournaments.filter(t => t.status === 'FINISHED').length },
  ]

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Torneos</h1>
            <p className="club-sub">Gestión completa de torneos del club</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
            {canManage && (
              <Link href="/torneos/nuevo" className="px-btn px-btn--magenta" style={{ height:36, padding:'0 16px', fontSize:13 }}>
                + Nuevo torneo
              </Link>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="club-kpis" style={{ marginTop:16 }}>
          {stats.map(s => (
            <div key={s.label} className="club-kpi">
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:900, color:'var(--navy)', marginTop:4 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar torneo…" style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:200 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div style={{ marginTop:16, display:'grid', gap:10 }}>
          {loading ? (
            <div className="px-help">Cargando torneos…</div>
          ) : filtered.length === 0 ? (
            <div className="px-card px-card--flat" style={{ textAlign:'center', padding:36 }}>
              <div style={{ fontSize:36 }}>🏆</div>
              <div style={{ fontWeight:900, marginTop:10 }}>
                {tournaments.length === 0 ? 'Aún no hay torneos en este club' : 'Sin resultados para estos filtros'}
              </div>
              {canManage && tournaments.length === 0 && (
                <Link href="/torneos/nuevo" className="px-btn px-btn--magenta" style={{ marginTop:14, display:'inline-flex' }}>
                  Crear primer torneo
                </Link>
              )}
            </div>
          ) : filtered.map(t => (
            <div key={t.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'center', padding:'16px 18px' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span style={{ fontWeight:900, fontSize:16 }}>{t.name}</span>
                  <span style={{ background: (STATUS_COLOR[t.status]??'#9ca3af')+'22', color: STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'3px 10px', borderRadius:999, fontWeight:900, fontSize:11 }}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
                <div style={{ marginTop:6, display:'flex', gap:14, flexWrap:'wrap', fontSize:13, color:'var(--muted)' }}>
                  <span>📅 {fmtDate(t.startDate)} → {fmtDate(t.endDate)}</span>
                  <span>👤 {GENDER_LABEL[t.gender] ?? t.gender}</span>
                  <span>🏷️ Cat {t.category ?? '—'}</span>
                  <span>💰 ${t.pricePerPlayer ?? 0}/jugador</span>
                  <span>⭐ {t.pointsTotal ?? 0} pts</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ height:34, padding:'0 14px', fontSize:13 }}>Ver</Link>
                <Link href={`/torneos/${t.id}/inscripcion`} className="px-btn" style={{ height:34, padding:'0 14px', fontSize:13 }}>Inscribirse</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
