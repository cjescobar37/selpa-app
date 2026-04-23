'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { resolveProfiles } from '@/lib/teamHelpers'

type PlayerRow = {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  club_name: string | null
  category: number | null
  gender: string | null
  points: number | null
  matches_played: number | null
  matches_won: number | null
}

function fullName(p: PlayerRow) {
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Jugador'
}

const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
const GENDER_LABELS: Record<string, string> = { M:'Masculino', F:'Femenino', X:'Mixto' }

export default function RankingPublicPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const [filterGender, setFilterGender] = useState<string>(() => searchParams?.get('gender') ?? 'all')
  const [filterCat, setFilterCat] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('club_players')
      .select(`
        user_id, category, gender, points, matches_played, matches_won,
        user_id,
        club:club_id ( name )
      `)
      .order('points', { ascending: false })
      .limit(200)

    const rows: PlayerRow[] = ((data ?? []) as any[]).map(r => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      const c = Array.isArray(r.club) ? r.club[0] : r.club
      return { user_id: r.user_id, category: r.category, gender: r.gender, points: r.points ?? 0, matches_played: r.matches_played ?? 0, matches_won: r.matches_won ?? 0, display_name: p?.display_name ?? null, first_name: p?.first_name ?? null, last_name: p?.last_name ?? null, club_name: c?.name ?? null }
    })
    setPlayers(rows)
    setLoading(false)
  }

  const categories = Array.from(new Set(players.map(p => p.category).filter(Boolean))).sort() as number[]
  const filtered = players.filter(p => {
    if (filterGender !== 'all' && p.gender !== filterGender) return false
    if (filterCat !== 'all' && p.category !== filterCat) return false
    if (search.trim() && !fullName(p).toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const medalColor = (i: number) => { if (i===0) return '#f59e0b'; if (i===1) return '#9ca3af'; if (i===2) return '#b45309'; return 'transparent' }

  return (
    <div className="px-wrap" style={{ maxWidth:1120, margin:'0 auto', padding:'24px 16px' }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="px-h1">Ranking PAMPRAX</h1>
        <p className="px-muted" style={{ marginTop:6 }}>Posiciones por categoría y género · Actualización en tiempo real</p>
      </div>

      {/* Tabs género */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        {['all','M','F','X'].map(g => (
          <button key={g} onClick={() => setFilterGender(g)} style={{ padding:'8px 20px', borderRadius:999, fontWeight:900, cursor:'pointer', fontSize:14, border:'1.5px solid var(--border)', background: filterGender===g ? 'var(--navy)' : 'var(--glass)', color: filterGender===g ? '#fff' : 'var(--text)' }}>
            {g === 'all' ? 'Todos' : GENDER_LABELS[g] ?? g}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jugador…" style={{ height:38, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:180 }} />
          <select value={String(filterCat)} onChange={e => setFilterCat(e.target.value==='all'?'all':Number(e.target.value))} style={{ height:38, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{CAT_LABELS[c] ?? `Cat ${c}`}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="px-help" style={{ padding:32, textAlign:'center' }}>Cargando ranking…</div>
      ) : filtered.length === 0 ? (
        <div className="px-card" style={{ textAlign:'center', padding:64 }}>
          <div style={{ fontSize:48 }}>🏓</div>
          <div style={{ fontWeight:900, fontSize:18, marginTop:16 }}>No hay jugadores para mostrar</div>
          <div className="px-help" style={{ marginTop:8 }}>Probá con otros filtros o volvé más tarde.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {/* Top 3 destacado */}
          {filtered.slice(0,3).length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:8 }}>
              {[filtered[1], filtered[0], filtered[2]].filter(Boolean).map((p, ii) => {
                const realIdx = ii === 0 ? 1 : ii === 1 ? 0 : 2
                return p ? (
                  <div key={p.user_id} className="px-card" style={{ textAlign:'center', padding:'20px 16px', order: realIdx === 0 ? 0 : realIdx === 1 ? -1 : 1, borderTop: `4px solid ${medalColor(realIdx)}` }}>
                    <div style={{ fontSize:32 }}>{['🥇','🥈','🥉'][realIdx]}</div>
                    <div style={{ width:50, height:50, borderRadius:'50%', background:'var(--navy)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18, margin:'10px auto' }}>{fullName(p).slice(0,2).toUpperCase()}</div>
                    <div style={{ fontWeight:900, fontSize:15 }}>{fullName(p)}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{p.club_name ?? '—'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:'var(--navy)', marginTop:6 }}>{(p.points??0).toLocaleString('es-AR')}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>puntos</div>
                  </div>
                ) : null
              })}
            </div>
          )}

          {/* Resto */}
          <div style={{ display:'grid', gap:6 }}>
            <div style={{ display:'grid', gridTemplateColumns:'48px 1fr 100px 80px 80px 80px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)' }}>
              <div>#</div><div>Jugador</div><div>Club</div><div style={{ textAlign:'center' }}>Cat.</div><div style={{ textAlign:'center' }}>PJ</div><div style={{ textAlign:'right' }}>Pts</div>
            </div>
            {filtered.map((p, i) => (
              <div key={p.user_id} className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'48px 1fr 100px 80px 80px 80px', gap:8, alignItems:'center', padding:'12px 14px', borderLeft: i<3?`3px solid ${medalColor(i)}`:'1px solid var(--border)' }}>
                <div style={{ fontWeight:900, textAlign:'center', color:i<3?medalColor(i):'var(--muted)', fontSize:i<3?16:14 }}>{i<3?['🥇','🥈','🥉'][i]:i+1}</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--navy)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:12, flexShrink:0 }}>{fullName(p).slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fullName(p)}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{GENDER_LABELS[p.gender??'']??p.gender??'—'}</div>
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.club_name ?? '—'}</div>
                <div style={{ textAlign:'center' }}><span className="px-pill" style={{ fontSize:10, padding:'2px 7px' }}>{CAT_LABELS[p.category??0]??`${p.category}`}</span></div>
                <div style={{ textAlign:'center', fontWeight:700, fontSize:13 }}>{p.matches_played??0}</div>
                <div style={{ textAlign:'right', fontWeight:900, fontSize:15, color:'var(--navy)' }}>{(p.points??0).toLocaleString('es-AR')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
