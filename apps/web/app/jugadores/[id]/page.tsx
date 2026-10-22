import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CareerExperience from '@/components/player/CareerExperience'
import { readCareerIdentity } from '@/features/player-career/player-career.repository'
import PlayerStatePanel from '@/components/player/PlayerStatePanel'
import {sportsDemoEnabled} from '@/features/preview-sports-demo/demo-data'
export const dynamic='force-dynamic'
const identityForRender=cache(async(id:string,clubId?:string)=>{
  try{return {identity:await readCareerIdentity(id,clubId),unavailable:false}}
  catch{return {identity:null,unavailable:true}}
})
type Props={params:Promise<{id:string}>;searchParams:Promise<{clubId?:string}>}
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata> {
  const [{id},query]=await Promise.all([params,searchParams])
  const {identity,unavailable}=await identityForRender(id,query.clubId)
  if (!identity) return {title:unavailable?'Perfil deportivo no disponible · SELPA':'Jugador no disponible · SELPA',robots:{index:false,follow:false}}
  const club=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const title=`${identity.name} · Carrera de pádel · SELPA`
  const description=club?`Carrera deportiva de ${identity.name} en ${club.clubName}. Ranking, resultados oficiales y palmarés de pádel.`:`Perfil público de ${identity.name} en SELPA. Identidad global de pádel, sin club deportivo activo.`
  return {title,description,alternates:{canonical:identity.publicPath},openGraph:{title,description,type:'profile',url:identity.publicPath}}
}
export default async function PublicPlayerCareer({params,searchParams}:Props) {
  const [{id},query]=await Promise.all([params,searchParams])
  const {identity,unavailable}=await identityForRender(id,query.clubId)
  if(unavailable)return <PlayerStatePanel kind="error" title="Perfil deportivo no disponible" message="La lectura deportiva no está habilitada en este entorno. No mostramos datos sin verificar su publicación." action={sportsDemoEnabled()?{label:'Ver DEMO deportiva',href:'/preview/demo?view=profile'}:{label:'Ver rankings',href:'/ranking'}}/>
  if (!identity) notFound()
  return <CareerExperience key={identity.selectedClubPlayerId} identity={identity}/>
}
