'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Medal } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { formatRankingGender } from '@/lib/ranking'
import type { CareerSummary, SportsStanding } from '@/features/player-career/player-career.types'
import { myRankingFailure, myRankingMessages, type MyRankingState } from '@/features/player-career/my-ranking.state'
import RankingPlayerAvatar from '@/components/ranking/RankingPlayerAvatar'
import PlayerSectionHero from './PlayerSectionHero'
import PlayerStatePanel from './PlayerStatePanel'
import styles from './PlayerRankingProgress.module.css'
import controls from '@/components/product/ProductFlow.module.css'

type RankingResponse = {
  state?:MyRankingState; code?:MyRankingState; summary?:CareerSummary;
  individual?:SportsStanding[]; leader?:SportsStanding|null; next?:SportsStanding|null;
  participants?:{page:number;pageSize:number;count:number;visible:boolean};
}

export default function PlayerRankingProgress() {
  const session=useSession()
  const clubId=session.activeClubId
  const userId=session.user?.id
  const [pageState,setPageState]=useState({clubId,page:1})
  const page=pageState.clubId===clubId ? pageState.page : 1
  const key=`${clubId}:${page}`
  const [result,setResult]=useState<{key:string;data:RankingResponse}|null>(null)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    if (session.status!=='ready' || !clubId || !userId) return
    const controller=new AbortController()
    async function load() {
      try {
        const {data,error}=await supabase.auth.getSession()
        if (error || !data.session) {
          if (!controller.signal.aborted) setResult({key,data:{code:'AUTH_REQUIRED'}})
          return
        }
        const response=await fetch(`/api/player/my-ranking?clubId=${encodeURIComponent(clubId!)}&page=${page}`,{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:'no-store',signal:controller.signal})
        const body=await response.json() as RankingResponse
        if (!response.ok && !body.code) body.code=myRankingFailure(null)
        if (!controller.signal.aborted) setResult({key,data:body})
      } catch {
        if (!controller.signal.aborted) setResult({key,data:{code:'READ_UNAVAILABLE'}})
      }
    }
    void load()
    return ()=>controller.abort()
  },[attempt,clubId,key,page,session.status,userId])

  const data=result?.key===key ? result.data : null
  const me=data?.summary?.standing
  const rawState=data?.code ?? data?.state ?? (me?'READY':'NO_OFFICIAL_RANKING')
  const state=Object.prototype.hasOwnProperty.call(myRankingMessages,rawState) ? rawState : 'READ_UNAVAILABLE'
  const copy=myRankingMessages[state]
  const pending=Boolean(clubId && !data)
  const participants=data?.participants
  const myCategory=me?.category_name || (me?.category ? `${me.category}ª categoría` : 'Categoría oficial')
  const reload=()=>{setResult(null);setAttempt(value=>value+1)}
  return <main className={styles.shell}>
    <PlayerSectionHero badge="Progreso competitivo" title="Mi ranking" description={session.activeClub?.name ?? 'Tu situación deportiva oficial'} icon={<Medal />} />
    {!clubId ? <PlayerStatePanel kind="empty" title="Seleccioná un club" message="Tu progreso se consulta en el contexto deportivo de cada club." action={{label:'Elegir club',href:'/seleccionar-club'}} compact /> : pending ? <PlayerStatePanel kind="loading" title="Consultando tu ranking" message="Buscando posición y puntos oficiales" compact /> : <>
      {state!=='READY' ? <PlayerStatePanel kind={state==='READ_UNAVAILABLE'?'error':'empty'} title={copy.title} message={copy.message} onRetry={['READ_UNAVAILABLE','MODEL_UNAVAILABLE'].includes(state)?reload:undefined} action={state==='AUTH_REQUIRED'?{label:'Ingresar',href:'/login'}:undefined} compact /> : null}
      {me ? <section className={styles.current} aria-label="Mi categoría actual">
        <div className={styles.identity}><RankingPlayerAvatar className={styles.avatar} name={me.full_name} src={me.avatar_url} sizes="48px" /><div><span>Mi categoría actual</span><h2>{myCategory}</h2><p>{formatRankingGender(me.gender)} · {me.modality==='PAIRS'?'Parejas':'Individual'} · {me.season_name}</p></div></div>
        <dl className={styles.metrics}><div><dt>Posición oficial</dt><dd>#{me.position}{me.is_tied?<small> Compartida</small>:null}</dd></div><div><dt>Puntos confirmados</dt><dd>{me.ranking_points}</dd></div></dl>
      </section> : null}
      {me ? <section className={styles.goal} aria-label="Próximo objetivo">
        <h2>Próximo objetivo</h2>
        {data?.next ? <p>Tenés <strong>{Math.max(0,data.next.ranking_points-me.ranking_points)} puntos</strong> de diferencia con la siguiente posición de esta división. Alcanzarla puede producir un empate.</p> : participants?.visible && me.position===1 ? <p>Encabezás esta división. Seguí tu rendimiento en los próximos torneos oficiales.</p> : <p>Consultá los próximos torneos oficiales de tu club para continuar tu recorrido.</p>}
        <p className={styles.note}>Esta lectura no incluye reglas oficiales de ascenso. No hay una próxima categoría ni requisitos de promoción verificables para mostrar.</p>
        <Link className={controls.link} href="/player/torneos">Ver mi agenda <ArrowRight size={15} /></Link>
      </section> : null}
      {me && participants?.visible ? <section className={styles.division} aria-label="Participantes de mi división">
        <header><h2>Mi división</h2><span>{participants.count} participantes</span></header>
        <p className={styles.note}>{myCategory} · {formatRankingGender(me.gender)} · {me.season_name}</p>
        <div className={styles.labels} aria-hidden="true"><span>Pos.</span><span>Jugador</span><span>Puntos</span></div>
        {(data?.individual ?? []).map(player=><Link key={player.club_player_id} href={`/jugadores/${player.user_id}?clubId=${clubId}`} className={styles.row} data-own={player.user_id===userId}>
          <strong>#{player.position}</strong><span>{player.full_name}{player.user_id===userId?<em>Vos</em>:null}</span><b>{player.ranking_points}</b>
        </Link>)}
        {!data?.individual?.length ? <p className={styles.note}>No hay participantes en esta página.</p> : null}
        {participants.count>participants.pageSize ? <nav className={controls.actions} aria-label="Páginas de mi división">
          <button className={controls.link} disabled={page<=1} onClick={()=>setPageState({clubId,page:page-1})}>Anterior</button><span className={styles.note}>Página {page} de {Math.ceil(participants.count/participants.pageSize)}</span><button className={controls.link} disabled={page*participants.pageSize>=participants.count} onClick={()=>setPageState({clubId,page:page+1})}>Siguiente</button>
        </nav> : null}
      </section> : me && state!=='PRIVATE_SEASON' ? <p className={styles.note}>La división no está publicada para consultar otros participantes.</p> : null}
    </>}
    <section className={styles.explore} aria-label="Explorar otros rankings"><div><span>Comunidad SELPA</span><h2>Explorar otros rankings</h2><p>Buscá clubes y consultá las categorías, ramas, modalidades y temporadas que hayan autorizado publicar.</p></div>
      <div className={controls.actions}><Link className={controls.button} href="/ranking">Explorar rankings públicos <ArrowRight size={15} /></Link>{clubId?<Link className={controls.link} href={`/ranking?clubId=${clubId}`}>Ranking de mi club</Link>:null}</div>
      <small>La disponibilidad depende de las lecturas habilitadas y la publicación de cada club.</small>
    </section>
  </main>
}
