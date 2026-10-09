'use client'
import { useEffect,useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from '@/components/session/SessionProvider'
import CareerExperience from '@/components/player/CareerExperience'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import type { CareerIdentity } from '@/features/player-career/player-career.types'
export default function MyCareer() {
  const {id}=useParams<{id:string}>();const session=useSession()
  const [result,setResult]=useState<{id:string;identity?:CareerIdentity;error?:boolean}>()
  useEffect(()=>{
    if (!session.user) return
    const controller=new AbortController()
    void fetch(`/api/players/${id}/career?section=identity`,{cache:'no-store',signal:controller.signal})
      .then(async r=>{if (!r.ok) throw new Error('READ');return r.json() as Promise<{identity:CareerIdentity}>})
      .then(data=>{if (!controller.signal.aborted) setResult({id,identity:data.identity})})
      .catch(()=>{if (!controller.signal.aborted) setResult({id,error:true})})
    return ()=>controller.abort()
  },[id,session.user])
  if (result?.id===id && result.error) return <PlayerStatePanel kind="error" title="No pudimos leer tu carrera" message="Volvé a tu perfil para reintentar." action={{label:'Mi perfil',href:'/perfil'}} compact/>
  if (result?.id!==id || !result.identity) return <PlayerStatePanel kind="loading" title="Preparando tu carrera" compact/>
  if (result.identity.userId!==session.user?.id) return <PlayerStatePanel kind="empty" title="Esta carrera pertenece a otro jugador" action={{label:'Ver perfil público',href:result.identity.publicPath}} compact/>
  const context=result.identity.contexts.find(c=>c.clubPlayerId===result.identity!.selectedClubPlayerId)!
  const editor='/player/carrera/'+context.clubPlayerId+'/editar?own=1'
  return <CareerExperience key={result.identity.selectedClubPlayerId} identity={result.identity} own
    editorHref={session.activeClubId===context.clubId?editor:'/seleccionar-club?next='+encodeURIComponent(editor)}/>
}
