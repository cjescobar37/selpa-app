'use client'
import { useEffect,useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import CareerExperience from '@/components/player/CareerExperience'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import type { CareerIdentity } from '@/features/player-career/player-career.types'
import { readPlayerProfile } from '@/lib/playerProfileRead'
export default function MyCareer() {
  const {id}=useParams<{id:string}>();const session=useSession()
  const [result,setResult]=useState<{id:string;userId:string;retry:number;identity?:CareerIdentity;error?:boolean}>()
  const [retry,setRetry]=useState(0)
  const userId=session.user?.id
  useEffect(()=>{
    if (session.status!=='ready' || !userId) return
    const controller=new AbortController()
    void readPlayerProfile<{identity:CareerIdentity}>(`/api/player/career/${id}?section=identity`,userId,controller.signal)
      .then(data=>{if (!controller.signal.aborted) setResult({id,userId,retry,identity:data.identity})})
      .catch(()=>{if (!controller.signal.aborted) setResult({id,userId,retry,error:true})})
    return ()=>controller.abort()
  },[id,session.status,userId,retry])
  if (result?.id===id && result.userId===userId && result.retry===retry && result.error) return <PlayerStatePanel kind="error" title="No pudimos leer tu carrera" message="Revisá tu conexión y reintentá." onRetry={()=>setRetry(value=>value+1)} compact/>
  if (result?.id!==id || result.userId!==userId || result.retry!==retry || !result.identity) return <PlayerStatePanel kind="loading" title="Preparando tu carrera" compact/>
  if (result.identity.userId!==session.user?.id) return <PlayerStatePanel kind="empty" title="Esta carrera pertenece a otro jugador" action={{label:'Ver perfil público',href:result.identity.publicPath}} compact/>
  const context=result.identity.contexts.find(c=>c.clubPlayerId===result.identity!.selectedClubPlayerId)
  if(!context)return <CareerExperience identity={result.identity} own/>
  const editor='/player/carrera/'+context.clubPlayerId+'/editar?own=1'
  return <CareerExperience key={result.identity.selectedClubPlayerId} identity={result.identity} own
    editorHref={session.activeClubId===context.clubId?editor:'/seleccionar-club?next='+encodeURIComponent(editor)}/>
}
