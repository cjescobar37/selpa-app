'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSession } from '@/components/session/SessionProvider'

type Jugador = {
  id: string; user_id: string | null; display_name: string | null
  first_name: string | null; last_name: string | null; email: string | null
  category: number | null; gender: string | null; points: number | null
  matches_played: number | null; matches_won: number | null
  membership_status: string | null; membership_role: string | null
}

const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
const GENDER_LABELS: Record<string, string> = { M:'Masculino', F:'Femenino', X:'Mixto' }

function fullName(j: Jugador) {
  return j.display_name || [j.first_name, j.last_name].filter(Boolean).join(' ').trim() || j.email || 'Jugador'
}

export default function ClubJugadoresPage() {
  const { activeClub, role } = useSession()
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<number | 'all'>('all')
  const [filterGender, setFilterGender] = useState<string>('all')
  const [selected, setSelected] = useState<Jugador | null>(null)

  useEffect(() => {
    if (!activeClub?.id) { setLoading(false); return }
    load()
  }, [activeClub?.id])

  async function load() {
    setLoading(true)

    // Step 1: club_players
    const { data: clubPlayers } = await supabase
      .from('club_players')
      .select('id, user_id, category, gender, points, matches_played, matches_won')
      .eq('club_id', activeClub!.id)

    if (!clubPlayers || clubPlayers.length === 0) { setJugadores([]); setLoading(false); return }

    const userIds = (clubPlayers as any[]).map(p => p.user_id).filter(Boolean)

    // Step 2: profiles + memberships in parallel
    const [profilesRes, membershipsRes] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('user_id, display_name, first_name, last_name, email').in('user_id', userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('club_memberships').select('user_id, status, role').eq('club_id', activeClub!.id).in('user_id', userIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileMap: Record<string, any> = {}
    for (const p of (profilesRes.data ?? []) as any[]) profileMap[p.user_id] = p

    const memberMap: Record<string, any> = {}
    for (const m of (membershipsRes.data ?? []) as any[]) memberMap[m.user_id] = m

    const rows: Jugador[] = (clubPlayers as any[]).map(r => {
      const p = profileMap[r.user_id] ?? {}
      const m = memberMap[r.user_id] ?? {}
      return {
        id: r.id, user_id: r.user_id, category: r.category, gender: r.gender,
        points: r.points ?? 0, matches_played: r.matches_played ?? 0, matches_won: r.matches_won ?? 0,
        display_name: p.display_name ?? null, first_name: p.first_name ?? null,
        last_name: p.last_name ?? null, email: p.email ?? null,
        membership_status: m.status ?? null, membership_role: m.role ?? null,
      }
    })
    setJugadores(rows)
    setLoading(false)
  }

  const categories = Array.from(new Set(jugadores.map(j => j.category).filter(Boolean))).sort() as number[]
  const genders = Array.from(new Set(jugadores.map(j => j.gender).filter(Boolean))) as string[]
  const filtered = jugadores.filter(j => {
    if (filterCat !== 'all' && j.category !== filterCat) return false
    if (filterGender !== 'all' && j.gender !== filterGender) return false
    if (search.trim() && !fullName(j).toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div className="px-wrap">
      {selected && (
        <div className="px-overlay" onClick={() => setSelected(null)}>
          <div className="px-modalCard" onClick={e => e.stopPropagation()} style={{ maxWidth:560 }}>
            <div className="px-modalHead">
              <div>
                <h2 className="px-modalTitle">{fullName(selected)}</h2>
                <div className="px-modalSub">{selected.email ?? '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--muted)' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { k:'Categoría', v: CAT_LABELS[selected.category??0]??`Cat ${selected.category}` },
                { k:'Género', v: GENDER_LABELS[selected.gender??'']??selected.gender??'—' },
                { k:'Puntos', v: (selected.points??0).toLocaleString('es-AR') },
                { k:'Partidos jugados', v: selected.matches_played??0 },
                { k:'Partidos ganados', v: selected.matches_won??0 },
                { k:'% victorias', v: selected.matches_played ? `${(((selected.matches_won??0)/(selected.matches_played))*100).toFixed(0)}%` : '—' },
                { k:'Estado membership', v: selected.membership_status??'—' },
                { k:'Rol en club', v: selected.membership_role??'—' },
              ].map(({ k, v }) => (
                <div key={k} className="px-card px-card--flat" style={{ padding:'10px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{k}</div>
                  <div style={{ fontWeight:700, fontSize:15, marginTop:4 }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="club-panel">
        <div className="club-head">
          <div>
            <h1 className="club-title">Jugadores</h1>
            <p className="club-sub">Listado, categorías y estadísticas · {filtered.length} jugadores</p>
          </div>
          <button onClick={load} className="px-btn px-btn--ghost" style={{ height:36, padding:'0 14px', fontSize:13 }}>↻ Actualizar</button>
        </div>
        <div className="club-kpis" style={{ marginTop:16 }}>
          {[
            { label:'Total', value: jugadores.length },
            { label:'Masculino', value: jugadores.filter(j=>j.gender==='M').length },
            { label:'Femenino', value: jugadores.filter(j=>j.gender==='F').length },
            { label:'Aprobados', value: jugadores.filter(j=>j.membership_status==='APPROVED').length },
          ].map(s => (
            <div key={s.label} className="club-kpi">
              <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:900, color:'var(--navy)', marginTop:4 }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jugador…" style={{ height:36, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:200 }} />
          <select value={String(filterCat)} onChange={e => setFilterCat(e.target.value==='all'?'all':Number(e.target.value))} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{CAT_LABELS[c]??`Cat ${c}`}</option>)}
          </select>
          <select value={filterGender} onChange={e => setFilterGender(e.target.value)} style={{ height:36, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
            <option value="all">Todos los géneros</option>
            {genders.map(g => <option key={g} value={g}>{GENDER_LABELS[g]??g}</option>)}
          </select>
        </div>
        <div style={{ marginTop:16, display:'grid', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px', gap:8, padding:'6px 14px', fontSize:11, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)' }}>
            <div>Jugador</div><div style={{ textAlign:'center' }}>Cat.</div><div style={{ textAlign:'center' }}>PJ</div><div style={{ textAlign:'center' }}>PG</div><div style={{ textAlign:'right' }}>Puntos</div>
          </div>
          {loading ? (
            <div className="px-help" style={{ padding:'12px 14px' }}>Cargando jugadores…</div>
          ) : filtered.length === 0 ? (
            <div className="px-card px-card--flat" style={{ textAlign:'center', padding:36 }}>
              <div style={{ fontSize:36 }}>👤</div>
              <div className="px-help" style={{ marginTop:8 }}>{jugadores.length===0?'No hay jugadores registrados en este club.':'Sin resultados para estos filtros.'}</div>
            </div>
          ) : filtered.map(j => (
            <button key={j.id} onClick={() => setSelected(j)} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
              <div className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 80px', gap:8, alignItems:'center', padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--navy)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:13, flexShrink:0 }}>{fullName(j).slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{fullName(j)}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{GENDER_LABELS[j.gender??'']??j.gender??'—'} · {j.membership_status??'—'}</div>
                  </div>
                </div>
                <div style={{ textAlign:'center' }}><span className="px-pill" style={{ fontSize:11, padding:'3px 8px' }}>{CAT_LABELS[j.category??0]??`${j.category}`}</span></div>
                <div style={{ textAlign:'center', fontWeight:700 }}>{j.matches_played??0}</div>
                <div style={{ textAlign:'center', fontWeight:700 }}>{j.matches_won??0}</div>
                <div style={{ textAlign:'right', fontWeight:900, fontSize:15, color:'var(--navy)' }}>{(j.points??0).toLocaleString('es-AR')}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
