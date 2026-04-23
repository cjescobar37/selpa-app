'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'
import { TOURNAMENT_SELECT, toTournamentView, type TournamentView } from '@/lib/tournamentHelpers'
import { resolveProfiles, playerName } from '@/lib/teamHelpers'

type Team = {
  id: string
  tournament_id: string
  tournament_name: string
  player1_name: string
  player2_name: string
  status: string
  created_at: string
}

type TabKey = 'inscripciones' | 'resultados'

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const dp = d.includes('T') ? d.split('T')[0] : d
  const [y,m,dd] = dp.split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', WAITLIST: 'Lista espera'
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: '#f59e0b', APPROVED: '#10b981', REJECTED: '#ef4444', WAITLIST: '#8b5cf6'
}

export default function ClubPartidosPage() {
  const { activeClub } = useSession()
  const [tab, setTab] = useState<TabKey>('inscripciones')
  const [teams, setTeams] = useState<Team[]>([])
  const [tournaments, setTournaments] = useState<TournamentView[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTournament, setFilterTournament] = useState<string>('all')

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)

    const [tourRes, teamRes] = await Promise.all([
      supabase.from('tournaments').select(TOURNAMENT_SELECT).eq('club_id', activeClub!.id).order('created_at', { ascending: false }),
      supabase.from('tournament_teams').select(`
        id, tournament_id, status, created_at,
        player1_id,
        player2_id,
        tournament:tournament_id ( name )
      `).eq('club_id', activeClub!.id).order('created_at', { ascending: false })
    ])

    const tvs = (tourRes.data ?? []).map(toTournamentView).filter(Boolean) as TournamentView[]
    setTournaments(tvs)

    const teamData = (teamRes.data ?? []) as any[]
    const allUserIds = teamData.flatMap((r: any) => [r.player1_id, r.player2_id]).filter(Boolean)
    const profileMap = await resolveProfiles(allUserIds)
    const rows: Team[] = teamData.map((r: any) => {
      const tname = Array.isArray(r.tournament) ? r.tournament[0]?.name : r.tournament?.name
      return { id: r.id, tournament_id: r.tournament_id, tournament_name: tname ?? '—', player1_name: playerName(profileMap[r.player1_id]) || 'Jugador 1', player2_name: playerName(profileMap[r.player2_id]) || 'Jugador 2', status: r.status ?? 'PENDING', created_at: r.created_at }
    })
    setTeams(rows)
    setLoading(false)
  }

  const filteredTeams = teams.filter(t => filterTournament === 'all' || t.tournament_id === filterTournament)

  const tabStyle = (k: TabKey): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 10, fontWeight: 900, cursor: 'pointer', fontSize: 14,
    background: tab === k ? 'var(--navy)' : 'transparent',
    color: tab === k ? '#fff' : 'var(--muted)',
    border: 'none',
  })

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Partidos · Inscripciones</h1>
            <p className="club-sub">Equipos inscriptos, resultados y fixture por torneo</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>

        <div style={{ display:'flex', gap:4, marginTop:16, background:'rgba(23,37,63,.06)', borderRadius:12, padding:4, width:'fit-content' }}>
          <button style={tabStyle('inscripciones')} onClick={() => setTab('inscripciones')}>Equipos inscriptos</button>
          <button style={tabStyle('resultados')} onClick={() => setTab('resultados')}>Torneos activos</button>
        </div>

        {tab === 'inscripciones' && (
          <div style={{ marginTop:16 }}>
            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              <select value={filterTournament} onChange={e => setFilterTournament(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
                <option value="all">Todos los torneos</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="px-pill" style={{ alignSelf:'center' }}>{filteredTeams.length} equipos</div>
            </div>

            {loading ? (
              <div className="px-help">Cargando equipos…</div>
            ) : filteredTeams.length === 0 ? (
              <div className="px-card px-card--flat" style={{ textAlign:'center', padding:32 }}>
                <div style={{ fontSize:32 }}>🏓</div>
                <div className="px-help" style={{ marginTop:8 }}>No hay equipos inscriptos aún.</div>
              </div>
            ) : (
              <div style={{ display:'grid', gap:8 }}>
                {filteredTeams.map(t => (
                  <div key={t.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:12, alignItems:'center', padding:'12px 16px' }}>
                    <div>
                      <div style={{ fontWeight:700 }}>⚡ {t.player1_name}</div>
                      <div style={{ fontWeight:700 }}>⚡ {t.player2_name}</div>
                    </div>
                    <div style={{ fontSize:13, color:'var(--muted)' }}>{t.tournament_name}</div>
                    <div>
                      <span style={{ background: STATUS_COLOR[t.status] + '22', color: STATUS_COLOR[t.status], border:`1px solid ${STATUS_COLOR[t.status]}44`, padding:'4px 10px', borderRadius:999, fontWeight:900, fontSize:12 }}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{fmtDate(t.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'resultados' && (
          <div style={{ marginTop:16 }}>
            {loading ? (
              <div className="px-help">Cargando torneos…</div>
            ) : tournaments.length === 0 ? (
              <div className="px-card px-card--flat" style={{ textAlign:'center', padding:32 }}>
                <div style={{ fontSize:32 }}>🏆</div>
                <div className="px-help" style={{ marginTop:8 }}>No hay torneos registrados en este club.</div>
              </div>
            ) : (
              <div style={{ display:'grid', gap:8 }}>
                {tournaments.map(t => (
                  <div key={t.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:14, alignItems:'center', padding:'14px 16px' }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:15 }}>{t.name}</div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{t.type} · {t.gender} · Cat {t.category ?? '—'}</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700 }}>INICIO</div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{fmtDate(t.startDate)}</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700 }}>PUNTOS</div>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--navy)' }}>{t.pointsTotal ?? 0}</div>
                    </div>
                    <div>
                      <span style={{ background:'var(--navy)', color:'#fff', padding:'4px 10px', borderRadius:999, fontWeight:900, fontSize:12 }}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
