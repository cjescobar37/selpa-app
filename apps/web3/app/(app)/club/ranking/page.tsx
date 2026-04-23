'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'

type PlayerRow = {
  id: string
  user_id: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  category: number | null
  gender: string | null
  points: number | null
  matches_played: number | null
  matches_won: number | null
}

function fullName(p: PlayerRow) {
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Jugador'
}
function winRate(p: PlayerRow) {
  if (!p.matches_played || p.matches_played === 0) return '—'
  return `${(((p.matches_won ?? 0) / p.matches_played) * 100).toFixed(0)}%`
}

const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
const GENDER_LABELS: Record<string, string> = { M:'Masculino', F:'Femenino', X:'Mixto' }

export default function ClubRankingPage() {
  const { activeClub } = useSession()
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState<number | 'all'>('all')
  const [filterGender, setFilterGender] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)

    // Step 1: fetch club_players (sin join a profiles)
    const { data: clubPlayers } = await supabase
      .from('club_players')
      .select('id, user_id, category, gender, points, matches_played, matches_won')
      .eq('club_id', activeClub!.id)
      .order('points', { ascending: false })

    if (!clubPlayers || clubPlayers.length === 0) { setPlayers([]); setLoading(false); return }

    // Step 2: fetch profiles for those user_ids
    const userIds = (clubPlayers as any[]).map(p => p.user_id).filter(Boolean)
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('user_id, display_name, first_name, last_name').in('user_id', userIds)
      : { data: [] }

    const profileMap: Record<string, any> = {}
    for (const p of (profiles ?? []) as any[]) profileMap[p.user_id] = p

    const rows: PlayerRow[] = (clubPlayers as any[]).map(r => {
      const p = profileMap[r.user_id] ?? {}
      return {
        id: r.id, user_id: r.user_id, category: r.category, gender: r.gender,
        points: r.points ?? 0, matches_played: r.matches_played ?? 0, matches_won: r.matches_won ?? 0,
        display_name: p.display_name ?? null, first_name: p.first_name ?? null, last_name: p.last_name ?? null,
      }
    })
    setPlayers(rows)
    setLoading(false)
  }

  const categories = Array.from(new Set(players.map(p => p.category).filter(Boolean))).sort() as number[]
  const genders = Array.from(new Set(players.map(p => p.gender).filter(Boolean))) as string[]
  const filtered = players.filter(p => {
    if (filterCat !== 'all' && p.category !== filterCat) return false
    if (filterGender !== 'all' && p.gender !== filterGender) return false
    if (search.trim() && !fullName(p).toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const medalColor = (i: number) => { if (i===0) return '#f59e0b'; if (i===1) return '#9ca3af'; if (i===2) return '#b45309'; return 'transparent' }

  return (
    <div className="px-wrap">
      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Ranking del club</h1>
            <p className="club-sub">Posiciones por categoría y género · {filtered.length} jugadores</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jugador…" style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:180 }} />
          <select value={String(filterCat)} onChange={e => setFilterCat(e.target.value==='all'?'all':Number(e.target.value))} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{CAT_LABELS[c]??`Cat ${c}`}</option>)}
          </select>
          <select value={filterGender} onChange={e => setFilterGender(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todos los géneros</option>
            {genders.map(g => <option key={g} value={g}>{GENDER_LABELS[g]??g}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="px-help" style={{ marginTop:20 }}>Cargando ranking…</div>
        ) : filtered.length === 0 ? (
          <div className="px-card px-card--flat" style={{ marginTop:16, textAlign:'center', padding:32 }}>
            <div style={{ fontSize:32 }}>🎾</div>
            <div className="px-help" style={{ marginTop:8 }}>{players.length===0?'No hay jugadores registrados en este club aún.':'No hay jugadores que coincidan con los filtros.'}</div>
          </div>
        ) : (
          <div style={{ marginTop:16, display:'grid', gap:8 }}>
            <div style={{ display:'grid', gridTemplateColumns:'48px 1fr 80px 80px 80px 80px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)' }}>
              <div>#</div><div>Jugador</div><div style={{ textAlign:'center' }}>Cat.</div><div style={{ textAlign:'center' }}>PJ</div><div style={{ textAlign:'center' }}>% G</div><div style={{ textAlign:'right' }}>Puntos</div>
            </div>
            {filtered.map((p, i) => (
              <div key={p.id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'48px 1fr 80px 80px 80px 80px', gap:8, alignItems:'center', padding:'12px 14px', borderLeft:i<3?`3px solid ${medalColor(i)}`:'1px solid var(--border)' }}>
                <div style={{ fontWeight:900, fontSize:i<3?18:15, color:i<3?medalColor(i):'var(--muted)', textAlign:'center' }}>{i<3?['🥇','🥈','🥉'][i]:i+1}</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--navy)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:13, flexShrink:0 }}>{fullName(p).slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fullName(p)}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{GENDER_LABELS[p.gender??'']??p.gender??'—'}</div>
                  </div>
                </div>
                <div style={{ textAlign:'center' }}><span className="px-pill" style={{ fontSize:11, padding:'3px 8px' }}>{CAT_LABELS[p.category??0]??`Cat ${p.category}`}</span></div>
                <div style={{ textAlign:'center', fontWeight:700 }}>{p.matches_played??0}</div>
                <div style={{ textAlign:'center', fontWeight:700, color:'var(--navy)' }}>{winRate(p)}</div>
                <div style={{ textAlign:'right', fontWeight:900, fontSize:16, color:'var(--navy)' }}>{(p.points??0).toLocaleString('es-AR')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
