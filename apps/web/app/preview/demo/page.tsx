import {notFound} from 'next/navigation'
import type {Metadata} from 'next'
import PublicRankingExperience from '@/components/public/PublicRankingExperience'
import CareerExperience from '@/components/player/CareerExperience'
import PreviewSportsNotice from '@/components/public/PreviewSportsNotice'
import {DEMO_PLAYER,demoIdentity,demoRanking,sportsDemoEnabled} from '@/features/preview-sports-demo/demo-data'
import type {RankingSearch} from '@/features/player-career/public-ranking.presentation'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'DEMO deportiva · SELPA Preview',robots:{index:false,follow:false},description:'Datos ficticios. Sólo para revisar el diseño en Preview.'}
export default async function PreviewSportsDemo({searchParams}:{searchParams:Promise<RankingSearch&{view?:string;playerId?:string}>}){
  if(!sportsDemoEnabled())notFound()
  const query=await searchParams
  if(query.view==='profile'){
    const identity=demoIdentity(query.playerId??DEMO_PLAYER)
    if(!identity)notFound()
    return <><PreviewSportsNotice demo/><CareerExperience identity={identity} demo/></>
  }
  return <><PreviewSportsNotice demo/><PublicRankingExperience {...demoRanking(query)} demo/></>
}
