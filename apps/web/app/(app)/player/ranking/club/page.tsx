'use client'

import {useEffect} from 'react'
import {useRouter,useSearchParams} from 'next/navigation'
import {useSession} from '@/components/session/SessionProvider'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'

/** Compatibility entry point. All full-ranking surfaces use one paginated reader. */
export default function PlayerClubRankingPage() {
  const session=useSession()
  const params=useSearchParams()
  const router=useRouter()
  useEffect(()=>{
    if(session.status==='loading')return
    const query=new URLSearchParams()
    if(session.activeClubId)query.set('clubId',session.activeClubId)
    const category=params.get('categoria') ?? params.get('category')
    if(category && category!=='all')query.set('category',category)
    for(const key of ['gender','division','season','q','page']) {
      const value=params.get(key);if(value)query.set(key,value)
    }
    query.set('modality',params.get('view')==='pairs' || params.get('modality')==='PAIRS'?'PAIRS':'INDIVIDUAL')
    router.replace('/ranking?'+query)
  },[params,router,session.activeClubId,session.status])
  return <PlayerStatePanel kind="loading" title="Abriendo ranking del club" message="La misma posición, también al buscar y paginar." compact/>
}
