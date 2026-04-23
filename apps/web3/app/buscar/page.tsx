'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ResultType = 'torneo' | 'jugador' | 'club'

type SearchResult = {
  id: string
  type: ResultType
  title: string
  subtitle: string
  href: string
  emoji: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function BuscarPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [filterType, setFilterType] = useState<ResultType | 'all'>('all')

  const debouncedQuery = useDebounce(query, 350)

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) { setResults([]); setSearched(false); return }
    doSearch(debouncedQuery.trim())
  }, [debouncedQuery])

  async function doSearch(q: string) {
    setLoading(true)
    setSearched(true)

    const like = `%${q}%`

    const [torneosRes, clubsRes, playersRes] = await Promise.all([
      supabase.from('tournaments').select('id, name, status, club:club_id(name)').ilike('name', like).limit(8),
      supabase.from('clubs').select('id, name, city').ilike('name', like).limit(6),
      supabase.from('profiles').select('user_id, display_name, first_name, last_name').or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`).limit(8),
    ])

    const all: SearchResult[] = []

    for (const t of (torneosRes.data ?? []) as any[]) {
      const c = Array.isArray(t.club) ? t.club[0] : t.club
      all.push({ id: t.id, type:'torneo', title: t.name, subtitle: `${c?.name??'—'} · ${t.status}`, href:`/torneos/${t.id}`, emoji:'🏆' })
    }

    for (const c of (clubsRes.data ?? []) as any[]) {
      all.push({ id: c.id, type:'club', title: c.name, subtitle: c.city ?? '—', href:`/clubs`, emoji:'🏟️' })
    }

    for (const p of (playersRes.data ?? []) as any[]) {
      const name = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Jugador'
      all.push({ id: p.user_id, type:'jugador', title: name, subtitle:'Jugador registrado', href:`/club/ranking`, emoji:'👤' })
    }

    setResults(all)
    setLoading(false)
  }

  const filtered = results.filter(r => filterType === 'all' || r.type === filterType)
  const counts = { torneo: results.filter(r=>r.type==='torneo').length, club: results.filter(r=>r.type==='club').length, jugador: results.filter(r=>r.type==='jugador').length }

  const TYPE_LABEL: Record<ResultType, string> = { torneo:'Torneos', club:'Clubes', jugador:'Jugadores' }
  const TYPE_COLOR: Record<ResultType, string> = { torneo:'var(--navy)', club:'var(--cyan)', jugador:'var(--magenta)' }

  return (
    <div style={{ maxWidth:760, margin:'0 auto', padding:'40px 16px' }}>
      <div style={{ textAlign:'center', marginBottom:32 }}>
        <h1 className="px-h1" style={{ fontSize:40 }}>Buscar en PAMPRAX</h1>
        <p className="px-muted" style={{ marginTop:8 }}>Torneos, jugadores y clubes en un solo lugar</p>
      </div>

      {/* Buscador */}
      <div style={{ position:'relative', marginBottom:20 }}>
        <div style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', fontSize:18, pointerEvents:'none' }}>🔍</div>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Escribí un torneo, club o jugador…"
          style={{ width:'100%', height:52, padding:'0 16px 0 48px', borderRadius:16, border:'1.5px solid var(--border)', background:'var(--glass)', fontSize:16, outline:'none', boxSizing:'border-box', boxShadow:'0 4px 20px rgba(0,0,0,.08)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--muted)' }}>✕</button>
        )}
      </div>

      {/* Filtros tipo */}
      {results.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          <button onClick={() => setFilterType('all')} style={{ padding:'6px 16px', borderRadius:999, fontWeight:900, cursor:'pointer', fontSize:13, border:'1.5px solid var(--border)', background: filterType==='all'?'var(--navy)':'var(--glass)', color: filterType==='all'?'#fff':'var(--text)' }}>
            Todos ({results.length})
          </button>
          {(['torneo','club','jugador'] as ResultType[]).map(t => counts[t] > 0 && (
            <button key={t} onClick={() => setFilterType(t)} style={{ padding:'6px 16px', borderRadius:999, fontWeight:900, cursor:'pointer', fontSize:13, border:'1.5px solid var(--border)', background: filterType===t?TYPE_COLOR[t]:'var(--glass)', color: filterType===t?'#fff':'var(--text)' }}>
              {TYPE_LABEL[t]} ({counts[t]})
            </button>
          ))}
        </div>
      )}

      {/* Resultados */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:32 }}>🔍</div>
          <div className="px-help" style={{ marginTop:10 }}>Buscando…</div>
        </div>
      ) : searched && filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:48 }}>
          <div style={{ fontSize:40 }}>😕</div>
          <div style={{ fontWeight:900, fontSize:18, marginTop:14 }}>Sin resultados para "{query}"</div>
          <div className="px-help" style={{ marginTop:8 }}>Probá con otro término de búsqueda.</div>
        </div>
      ) : filtered.length > 0 ? (
        <div style={{ display:'grid', gap:8 }}>
          {filtered.map(r => (
            <Link key={`${r.type}-${r.id}`} href={r.href} style={{ textDecoration:'none', color:'inherit' }}>
              <div className="px-card px-card--flat" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderLeft:`3px solid ${TYPE_COLOR[r.type]}` }}>
                <div style={{ fontSize:26, flexShrink:0 }}>{r.emoji}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:15 }}>{r.title}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{r.subtitle}</div>
                </div>
                <div style={{ fontSize:11, fontWeight:900, padding:'3px 10px', borderRadius:999, background:TYPE_COLOR[r.type]+'22', color:TYPE_COLOR[r.type], flexShrink:0 }}>
                  {TYPE_LABEL[r.type]}
                </div>
                <div style={{ fontSize:18, color:'var(--muted)', opacity:.4 }}>›</div>
              </div>
            </Link>
          ))}
        </div>
      ) : !searched ? (
        <div style={{ marginTop:32 }}>
          <div className="px-sepRow" style={{ marginBottom:12 }}>Accesos rápidos</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { emoji:'🏆', label:'Torneos', href:'/torneos', sub:'Ver todos los torneos' },
              { emoji:'📊', label:'Ranking', href:'/ranking', sub:'Posiciones generales' },
              { emoji:'🏟️', label:'Clubes', href:'/clubs', sub:'Ver clubes activos' },
            ].map(s => (
              <Link key={s.href} href={s.href} style={{ textDecoration:'none', color:'inherit' }}>
                <div className="px-card px-card--flat" style={{ textAlign:'center', padding:'20px 16px' }}>
                  <div style={{ fontSize:32 }}>{s.emoji}</div>
                  <div style={{ fontWeight:900, marginTop:8 }}>{s.label}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>{s.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
