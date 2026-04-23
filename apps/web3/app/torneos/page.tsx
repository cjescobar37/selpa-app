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

const STATUS_LABEL: Record<string, string> = { DRAFT:'Borrador', OPEN:'Inscripciones abiertas', IN_PROGRESS:'En curso', CLOSED:'Cerrado', FINISHED:'Finalizado' }
const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }
const GENDER_LABEL: Record<string, string> = { MALE:'Masculino', FEMALE:'Femenino', MIXED:'Mixto' }
const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}

type TournamentWithClub = TournamentView & { club_name: string | null }

export default function TorneosPublicPage() {
  const { role } = useSession()
  const [torneos, setTorneos] = useState<TournamentWithClub[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterGender, setFilterGender] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (role === 'club') { window.location.assign('/club/torneos'); return }
    load()
  }, [role])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tournaments')
      .select(TOURNAMENT_SELECT + ', club:club_id(name)')
      .order('created_at', { ascending: false })

    const tvs: TournamentWithClub[] = ((data ?? []) as any[]).map(r => {
      const tv = toTournamentView(r)
      if (!tv) return null
      const c = Array.isArray(r.club) ? r.club[0] : r.club
      return { ...tv, club_name: c?.name ?? null }
    }).filter(Boolean) as TournamentWithClub[]

    setTorneos(tvs)
    setLoading(false)
  }

  const filtered = torneos.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterGender !== 'all' && t.gender !== filterGender) return false
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const abiertos = filtered.filter(t => t.status === 'OPEN')
  const enCurso = filtered.filter(t => t.status === 'IN_PROGRESS')
  const resto = filtered.filter(t => t.status !== 'OPEN' && t.status !== 'IN_PROGRESS')

  return (
    <div style={{ maxWidth:1120, margin:'0 auto', padding:'24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 className="px-h1">Torneos</h1>
        <p className="px-muted" style={{ marginTop:6 }}>Calendario de torneos · {torneos.length} torneos registrados</p>
      </div>

      {/* KPIs rápidos */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Total torneos', value: torneos.length, color:'var(--navy)', emoji:'🏆' },
          { label:'Inscripciones abiertas', value: torneos.filter(t=>t.status==='OPEN').length, color:'#10b981', emoji:'📋' },
          { label:'En curso', value: torneos.filter(t=>t.status==='IN_PROGRESS').length, color:'#3b82f6', emoji:'⚡' },
          { label:'Finalizados', value: torneos.filter(t=>t.status==='FINISHED').length, color:'#6b7280', emoji:'✅' },
        ].map(s => (
          <div key={s.label} className="px-card px-card--flat" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:22 }}>{s.emoji}</div>
            <div style={{ fontSize:26, fontWeight:900, color:s.color, marginTop:6, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:24 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar torneo…" style={{ height:38, padding:'0 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13, outline:'none', minWidth:200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height:38, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterGender} onChange={e => setFilterGender(e.target.value)} style={{ height:38, padding:'0 10px', borderRadius:10, border:'1px solid var(--border)', background:'var(--glass)', fontSize:13 }}>
          <option value="all">Todos los géneros</option>
          {Object.entries(GENDER_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <Link href="/torneos/calendario" className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>📅 Calendario</Link>
          <Link href="/torneos/reglamento" className="px-btn px-btn--ghost" style={{ height:38, padding:'0 14px', fontSize:13 }}>📄 Reglamento</Link>
        </div>
      </div>

      {loading ? (
        <div className="px-help" style={{ textAlign:'center', padding:48 }}>Cargando torneos…</div>
      ) : filtered.length === 0 ? (
        <div className="px-card" style={{ textAlign:'center', padding:64 }}>
          <div style={{ fontSize:48 }}>🏆</div>
          <div style={{ fontWeight:900, fontSize:20, marginTop:16 }}>No hay torneos para mostrar</div>
          <div className="px-help" style={{ marginTop:8 }}>Probá ajustando los filtros.</div>
        </div>
      ) : (
        <>
          {abiertos.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div className="px-sepRow" style={{ marginBottom:12 }}>🟢 Inscripciones abiertas</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
                {abiertos.map(t => <TorneoCard key={t.id} t={t} />)}
              </div>
            </div>
          )}
          {enCurso.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div className="px-sepRow" style={{ marginBottom:12 }}>⚡ En curso</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
                {enCurso.map(t => <TorneoCard key={t.id} t={t} />)}
              </div>
            </div>
          )}
          {resto.length > 0 && (
            <div>
              {(abiertos.length > 0 || enCurso.length > 0) && <div className="px-sepRow" style={{ marginBottom:12 }}>Histórico</div>}
              <div style={{ display:'grid', gap:8 }}>
                {resto.map(t => <TorneoRow key={t.id} t={t} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TorneoCard({ t }: { t: TournamentWithClub }) {
  function fmtDate(d: string | null | undefined) {
    if (!d) return '—'; const dp = d.includes('T') ? d.split('T')[0] : d; const [y,m,dd] = dp.split('-'); return `${dd}/${m}/${y}`
  }
  const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }
  const STATUS_LABEL: Record<string, string> = { DRAFT:'Borrador', OPEN:'Inscripciones abiertas', IN_PROGRESS:'En curso', CLOSED:'Cerrado', FINISHED:'Finalizado' }
  const GENDER_LABEL: Record<string, string> = { MALE:'Masculino', FEMALE:'Femenino', MIXED:'Mixto' }
  const CAT_LABELS: Record<number, string> = {1:'1ª',2:'2ª',3:'3ª',4:'4ª',5:'5ª',6:'6ª',7:'7ª',8:'8ª'}
  return (
    <div className="px-card" style={{ padding:0, overflow:'hidden', borderTop:`4px solid ${STATUS_COLOR[t.status]??'#9ca3af'}` }}>
      <div style={{ padding:'16px 18px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:10 }}>
          <span style={{ background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'3px 10px', borderRadius:999, fontWeight:900, fontSize:11 }}>{STATUS_LABEL[t.status]??t.status}</span>
          {t.club_name && <span style={{ fontSize:12, color:'var(--muted)', fontWeight:700 }}>📍 {t.club_name}</span>}
        </div>
        <div style={{ fontWeight:900, fontSize:17, lineHeight:1.2, marginBottom:10 }}>{t.name}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { k:'Inicio', v: fmtDate(t.startDate) },
            { k:'Cierre inscr.', v: fmtDate(t.registrationDeadline) },
            { k:'Género', v: GENDER_LABEL[t.gender]??t.gender },
            { k:'Categoría', v: CAT_LABELS[t.category??0]??`Cat ${t.category??'—'}` },
            { k:'Precio', v: `$${t.pricePerPlayer??0}/jug.` },
            { k:'Puntos', v: `${t.pointsTotal??0} pts` },
          ].map(({ k, v }) => (
            <div key={k}>
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)' }}>{k}</div>
              <div style={{ fontWeight:700, fontSize:13, marginTop:2 }}>{String(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ flex:1, height:34, fontSize:13 }}>Ver detalles</Link>
          {t.status === 'OPEN' && <Link href={`/torneos/${t.id}/inscripcion`} className="px-btn px-btn--magenta" style={{ flex:1, height:34, fontSize:13 }}>Inscribirse</Link>}
        </div>
      </div>
    </div>
  )
}

function TorneoRow({ t }: { t: TournamentWithClub }) {
  function fmtDate(d: string | null | undefined) {
    if (!d) return '—'; const dp = d.includes('T') ? d.split('T')[0] : d; const [y,m,dd] = dp.split('-'); return `${dd}/${m}/${y}`
  }
  const STATUS_COLOR: Record<string, string> = { DRAFT:'#9ca3af', OPEN:'#10b981', IN_PROGRESS:'#3b82f6', CLOSED:'#f59e0b', FINISHED:'#6b7280' }
  const STATUS_LABEL: Record<string, string> = { DRAFT:'Borrador', OPEN:'Inscripciones abiertas', IN_PROGRESS:'En curso', CLOSED:'Cerrado', FINISHED:'Finalizado' }
  return (
    <div className="px-card px-card--flat" style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:14, alignItems:'center', padding:'12px 16px' }}>
      <div>
        <div style={{ fontWeight:800, fontSize:14 }}>{t.name}</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
          {t.club_name??'—'} · {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · ${t.pricePerPlayer??0}/jug.
        </div>
      </div>
      <span style={{ background:(STATUS_COLOR[t.status]??'#9ca3af')+'22', color:STATUS_COLOR[t.status]??'#9ca3af', border:`1px solid ${(STATUS_COLOR[t.status]??'#9ca3af')}44`, padding:'4px 12px', borderRadius:999, fontWeight:900, fontSize:11, whiteSpace:'nowrap' }}>{STATUS_LABEL[t.status]??t.status}</span>
      <Link href={`/torneos/${t.id}`} className="px-btn px-btn--ghost" style={{ height:32, padding:'0 12px', fontSize:12 }}>Ver</Link>
    </div>
  )
}
