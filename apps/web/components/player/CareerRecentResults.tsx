'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import type {CareerRecentRow} from '@/features/player-career/player-career.types'
/** Small lazy consumer of C. Home never reinterprets raw administrative matches. */
export default function CareerRecentResults({userId,clubId}:{userId:string;clubId:string}) {
  const [open,setOpen]=useState(false)
  const [result,setResult]=useState<{key:string;rows?:CareerRecentRow[];error?:boolean}>()
  const key=userId+':'+clubId
  useEffect(()=>{
    if(!open)return
    const controller=new AbortController()
    void fetch(`/api/players/${userId}/career?clubId=${clubId}&section=recent`,{cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('READ');return r.json() as Promise<{rows:CareerRecentRow[]}>})
      .then(r=>{if(!controller.signal.aborted)setResult({key,rows:r.rows})})
      .catch(()=>{if(!controller.signal.aborted)setResult({key,error:true})})
    return ()=>controller.abort()
  },[clubId,key,open,userId])
  return <div className="playerRecentStack">
    <button type="button" onClick={()=>setOpen(o=>!o)} aria-expanded={open} style={{minHeight:44,textAlign:'left',font:'inherit',fontSize:14}}>{open?'Ocultar':'Ver'} últimos resultados confirmados</button>
    {open ? result?.key!==key ? <span aria-busy="true">Cargando resultados…</span>:result.error ? <span role="status">No pudimos verificar los resultados. Tu ranking no cambió.</span>:
      result.rows?.length ? result.rows.slice(0,5).map(row=><Link key={row.id} href={`/torneos/${row.tournament_id}`}><span>{row.won?'Ganado':'Perdido'}</span><small>{row.tournament_name} · {row.sports_date ?? 'Sin fecha deportiva'}</small></Link>):<span>Sin partidos computables homologados.</span>:null}
  </div>
}
