'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Pencil, Trophy, Medal, Target } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import CareerIdentityHero from './CareerIdentityHero'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import { resultLabel } from '@/features/player-career/player-career.rules'
import type { CareerHistoryRow, CareerIdentity, CareerRecentRow, CareerSummary } from '@/features/player-career/player-career.types'
import styles from './CareerExperience.module.css'

function useSection<T>(identity:CareerIdentity,section:string,enabled=true,page=1,own=false) {
  const [result,setResult]=useState<{key:string;data?:T;error?:boolean}>()
  const [retry,setRetry]=useState(0)
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const key=`${own?'private':'public'}:${identity.userId}:${context.clubId}:${section}:${page}:${retry}`
  useEffect(()=>{
    if (!enabled) return
    const controller=new AbortController()
    const load=async()=>{
      const token=own?(await supabase.auth.getSession()).data.session?.access_token:null
      if(own&&!token)throw new Error('SESSION')
      const endpoint=own?`/api/player/career/${identity.userId}`:`/api/players/${identity.userId}/career`
      return fetch(`${endpoint}?${new URLSearchParams({clubId:context.clubId,section,page:String(page)})}`,
        {cache:'no-store',signal:controller.signal,headers:token?{Authorization:`Bearer ${token}`}:undefined})
    }
    void load().then(async response=>{
      if (!response.ok) throw new Error('READ')
      const data=await response.json() as T
      if (!controller.signal.aborted) setResult({key,data})
    }).catch(()=>{if (!controller.signal.aborted) setResult({key,error:true})})
    return ()=>controller.abort()
  },[context.clubId,enabled,identity.userId,key,page,section,own])
  return {data:result?.key===key ? result.data:undefined,error:result?.key===key && result.error,retry:()=>setRetry(r=>r+1)}
}
function date(value:string|null) { return value ? new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value.slice(0,10)}T12:00:00Z`)):'Sin fecha deportiva' }
type History={rows:CareerHistoryRow[];hasMore:boolean}
type Recent={rows:CareerRecentRow[];hasMore:boolean}

export default function CareerExperience(props:{identity:CareerIdentity;own?:boolean;editorHref?:string}) {
  return props.identity.contexts.length ? <ClubCareerExperience {...props}/> : <GlobalCareerExperience {...props}/>
}
function GlobalCareerExperience({identity,own=false}:{identity:CareerIdentity;own?:boolean}) {
  const [message,setMessage]=useState('')
  return <section className={`${styles.shell} ${own?'':styles.publicProfile}`} aria-label="Carrera deportiva"><CareerIdentityHero identity={identity} own={own} onShare={()=>void shareIdentity(identity,setMessage)}/>
    <p role="status" className={styles.shareMessage}>{message}</p><section className={styles.panel}><h2>Identidad deportiva</h2><p>No hay un contexto deportivo publicado para mostrar categoría, ranking ni puntos. No se suman carreras de clubes distintos.</p><Link className={styles.link} href="/clubes">Explorar clubes</Link></section></section>
}
async function shareIdentity(identity:CareerIdentity,setMessage:(message:string)=>void) {
  const url=`${window.location.origin}${identity.publicPath}`
  try {
    if (navigator.share) await navigator.share({title:`${identity.name} · SELPA`,text:'Mi carrera en pádel',url})
    else {await navigator.clipboard.writeText(url);setMessage('Enlace público copiado')}
  } catch(error) {if (!(error instanceof DOMException && error.name==='AbortError')) setMessage(`No pudimos compartir. Enlace público: ${url}`)}
}
function ClubCareerExperience({identity,own=false,editorHref}:{identity:CareerIdentity;own?:boolean;editorHref?:string}) {
  const [tab,setTab]=useState<'summary'|'history'|'stats'>('summary')
  const [page,setPage]=useState(1)
  const [showRecent,setShowRecent]=useState(false)
  const [shareMessage,setShareMessage]=useState('')
  const summary=useSection<{summary:CareerSummary}>(identity,'summary',true,1,own)
  const history=useSection<History>(identity,'history',tab==='history',page,own)
  const recent=useSection<Recent>(identity,'recent',showRecent,1,own)
  const context=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const sports=summary.data?.summary
  const standing=sports?.standing
  const stats=sports?.stats
  async function share() {
    const url=`${window.location.origin}${identity.publicPath}`
    try {
      if (navigator.share) await navigator.share({title:`${identity.name} · SELPA`,text:'Mi carrera en pádel',url})
      else {await navigator.clipboard.writeText(url);setShareMessage('Enlace público copiado')}
    } catch(error) {if (!(error instanceof DOMException && error.name==='AbortError')) setShareMessage('No pudimos compartir. Copiá el enlace público que aparece abajo.')}
  }
  const unavailable=summary.error || sports?.statsAvailable===false
  return <section className={`${styles.shell} ${own?'':styles.publicProfile}`} aria-label="Carrera deportiva">
    <CareerIdentityHero identity={identity} own={own} category={standing?.category_name} gender={standing?.gender} onShare={()=>void share()}/>
    {identity.contexts.length>1 ? <label className={styles.context}>Club deportivo<select value={context.clubPlayerId} onChange={event=>{
      const c=identity.contexts.find(c=>c.clubPlayerId===event.target.value)!
      window.location.assign(own?`/player/carrera/${c.clubPlayerId}`:`/jugadores/${identity.userId}?clubId=${c.clubId}`)
    }}>{identity.contexts.map(c=><option key={c.clubPlayerId} value={c.clubPlayerId}>{c.clubName}</option>)}</select></label>:null}
    <p className={styles.scope}>{sports?.scope.seasonName ?? (own?'Temporada activa':'Trayectoria publicada')} · Individual{standing ? ` · ${standing.category_name}`:''}</p>
    {!summary.data && !summary.error ? <div className={styles.metrics} aria-label="Cargando carrera" aria-busy="true">{['Posición','Puntos','Partidos'].map(label=><div key={label}><span>{label}</span><i className={styles.skeleton}/></div>)}</div>:
      unavailable ? <PlayerStatePanel kind="error" title="Carrera pendiente de lectura" message="La identidad está disponible. No mostramos puntos ni estadísticas sin confirmar su fuente." onRetry={summary.retry} compact/>:
      <div className={styles.metrics}><div><span>Posición en categoría</span><strong>{standing ? `#${standing.position}`:own?'Sin ranking':'No publicado'}</strong></div><div><span>{own?'Puntos de temporada':'Puntos publicados'}</span><strong>{standing ? standing.ranking_points.toLocaleString('es-AR'):'—'}</strong></div><div><span>Partidos de carrera</span><strong>{stats?.matches_played ?? '—'}</strong></div></div>}
    {standing ? <Link className={styles.link} href={`/ranking?${new URLSearchParams({clubId:context.clubId,season:standing.season_id,division:standing.division_id,gender:standing.gender,category:String(standing.category ?? ''),modality:'INDIVIDUAL'})}`}>Ver este ranking</Link>:null}
    {own ? <div className={styles.privateActions}><Link href={editorHref ?? '/perfil'}><Pencil size={16}/>Editar fotos, datos y pareja</Link><Link href="/preferencias">Preferencias</Link></div>:null}
    <p className={styles.shareMessage} role="status">{shareMessage}</p>
    {shareMessage.startsWith('No pudimos') ? <Link className={styles.link} href={identity.publicPath}>{identity.publicPath}</Link>:null}
    <div className={styles.tabs} role="tablist" aria-label="Carrera deportiva">
      {([['summary','Resumen'],['history','Torneos'],['stats','Estadísticas']] as const).map(([id,label])=><button id={`tab-${id}`} aria-controls={`panel-${id}`} key={id} type="button" role="tab" tabIndex={tab===id?0:-1} aria-selected={tab===id} onClick={()=>setTab(id)} onKeyDown={event=>{
        const tabs=['summary','history','stats'] as const
        const index=tabs.indexOf(id)
        const next=event.key==='ArrowRight'?tabs[(index+1)%3]:event.key==='ArrowLeft'?tabs[(index+2)%3]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:null
        if(next){event.preventDefault();setTab(next);document.getElementById(`tab-${next}`)?.focus()}
      }}>{label}</button>)}
    </div>
    <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
      {tab==='summary' ? <>
        <h3><Trophy size={18}/>Palmarés confirmado</h3>
        <p className={styles.muted}>{own?'Toda tu trayectoria':'Resultados publicados'} en {context.clubName}. El ranking superior es anual; sus puntos no se suman entre ámbitos.</p>
        {stats && !unavailable ? <div className={styles.palmares}><div>{!own?<Trophy size={18} aria-hidden="true"/>:null}<strong>{stats.titles}</strong><span>Títulos</span></div><div>{!own?<Medal size={18} aria-hidden="true"/>:null}<strong>{stats.finals}</strong><span>Finales, incluidos títulos</span></div><div>{!own?<Target size={18} aria-hidden="true"/>:null}<strong>{stats.semifinals}</strong><span>Semifinales</span></div></div>:<p className={styles.muted}>{unavailable?'Sin estadísticas verificadas.':'Todavía no hay resultados homologados publicados.'}</p>}
        {sports?.bestResult && !unavailable ? own?<p>Mejor resultado confirmado: {resultLabel(sports.bestResult.role)}{sports.bestResult.position ? ` · Puesto ${sports.bestResult.position}`:''}</p>:<p className={styles.bestResult}><Trophy size={18} aria-hidden="true"/><span>Mejor resultado confirmado<strong>{resultLabel(sports.bestResult.role)}{sports.bestResult.position ? ` · Puesto ${sports.bestResult.position}`:''}</strong></span></p>:null}
        {sports?.partner ? <p>Pareja actual: <Link href={sports.partner.publicPath}>{sports.partner.name}</Link></p>:null}
        <button className={styles.action} type="button" aria-expanded={showRecent} onClick={()=>setShowRecent(v=>!v)}>{showRecent?'Ocultar':'Ver'} últimos resultados</button>
        {showRecent ? recent.error ? <PlayerStatePanel kind="error" title="No pudimos leer los resultados" onRetry={recent.retry} compact/>:!recent.data ? <RowsSkeleton/>:recent.data.rows.length ? <ul className={styles.rows}>{recent.data.rows.map(row=><li key={row.id}><div><Link href={`/torneos/${row.tournament_id}`}>{row.tournament_name}</Link><small>{date(row.sports_date)}</small></div><span className={row.won?styles.won:styles.lost}>{row.won?'Ganado':'Perdido'}</span></li>)}</ul>:<p>No hay partidos computables confirmados.</p>:null}
      </>:tab==='history' ? <>
        <h3>Torneos con participación oficial</h3><p className={styles.muted}>Categoría y pareja de cada resultado homologado vigente. Una inscripción sola no cuenta como participación.</p>
        {history.error ? <PlayerStatePanel kind="error" title="No pudimos leer el historial" onRetry={history.retry} compact/>:!history.data ? <RowsSkeleton/>:history.data.rows.length ? <ul className={styles.rows}>{history.data.rows.map(row=><li key={row.id}><div><Link href={`/torneos/${row.tournament_id}`}>{row.tournament_name}</Link><small>{date(row.sports_date)} · {row.category_name ?? 'Categoría no registrada'}</small><small>{row.partner_name}</small></div><div className={styles.result}><span>{resultLabel(row.result_role)}</span><small>{row.points===null?'Puntos no publicados':`${row.points} pts publicados`}</small></div></li>)}</ul>:<p>Aún no hay participaciones homologadas en este club.</p>}
        <div className={styles.pager}><button disabled={page===1} type="button" onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button disabled={!history.data?.hasMore} type="button" onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
      </>:<>
        <h3>Estadísticas de la carrera en este club</h3>
        {stats && !unavailable ? <dl className={styles.stats}>{[['Torneos jugados',stats.tournaments_played],['Partidos computables',stats.matches_played],['Ganados',stats.wins],['Perdidos',stats.losses],['Efectividad',stats.effectiveness===null?'Sin partidos':`${stats.effectiveness}%`]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p>Sin estadísticas verificadas disponibles.</p>}
        <p className={styles.muted}>Sólo partidos decididos con dos equipos reales. BYE, WO y resoluciones administrativas no se cuentan como partidos, victorias ni derrotas. Las finales y los títulos vienen de homologaciones vigentes, incluso si no otorgaron puntos.</p>
        <p className={styles.muted}>La fecha mostrada es la fecha deportiva disponible (programación del partido o inicio del torneo), no la fecha de creación del registro. No existe un histórico certificado de la mejor posición; no lo inventamos.</p>
      </>}
    </section>
  </section>
}
function RowsSkeleton() {return <div aria-busy="true" aria-label="Cargando resultados" className={styles.rowsSkeleton}>{[1,2,3].map(n=><i key={n} className={styles.skeleton}/>)}</div>}
