'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/components/session/SessionContext'
import PublicRankingExperience, { type PublicRankingExperienceProps } from '@/components/public/PublicRankingExperience'
import { rankingHref } from '@/features/player-career/public-ranking.presentation'
import type { PersonalRankingDefault } from '@/features/player-career/ranking-default.rules'

/** Used only when the URL has no explicit sporting selection. The public server
 * cannot infer a localStorage session. Never override filters after navigation. */
export default function RankingDefaultBoundary({requestedClubId,board,children}:{requestedClubId?:string;board:PublicRankingExperienceProps;children:ReactNode}) {
  const session=useSession(),router=useRouter()
  const clubId=requestedClubId??session.activeClubId,userId=session.user?.id
  const key=session.role==='player'&&userId&&clubId?userId+':'+clubId:null
  const [resolved,setResolved]=useState<{key:string;preferred:PersonalRankingDefault}|null>(null)
  useEffect(()=>{
    if(session.status!=='ready'||!key||!userId||!clubId)return
    const controller=new AbortController()
    void (async()=>{
      try {
        const {readPlayerProfile}=await import('@/lib/playerProfileRead')
        const result=await readPlayerProfile<{preferred:PersonalRankingDefault}>('/api/player/ranking-default?clubId='+encodeURIComponent(clubId),userId,controller.signal)
        if(controller.signal.aborted)return
        if(result.preferred?.published){
          const c=result.preferred.context
          router.replace(rankingHref({clubId:c.clubId,season:c.seasonId,division:c.divisionId,category:c.category===null?undefined:String(c.category),gender:c.gender,modality:c.modality}))
          return
        }
        if(!requestedClubId&&!result.preferred){router.replace(rankingHref({clubId,modality:'INDIVIDUAL',gender:'M'}));return}
        setResolved({key,preferred:result.preferred})
      } catch {
        if(!controller.signal.aborted)setResolved({key,preferred:null})
      }
    })()
    return ()=>controller.abort()
  },[session.status,key,userId,clubId,requestedClubId,router])
  if(session.status!=='ready'||(key&&resolved?.key!==key))return <section role="status" aria-live="polite" className="py-6 text-sm text-slate-600">Cargando tu contexto deportivo…</section>
  const own=key&&resolved?.key===key?resolved.preferred:null
  if(own&&!own.published){
    const c=own.context
    return <PublicRankingExperience {...board} clubs={[own.club]} clubsCount={1} contexts={[c]} ranking={{rows:[],count:0,page:1,pageSize:25,context:c}} pairs={[]} total={0} error={null}
      params={{clubId:c.clubId,season:c.seasonId,division:c.divisionId,category:c.category===null?undefined:String(c.category),gender:c.gender,modality:c.modality}}
      seasons={[{id:c.seasonId,name:c.seasonName}]} enabledBranches={[c.gender as 'M'|'F'|'MIXED']} unpublishedContext personalContextOnly />
  }
  return children
}
