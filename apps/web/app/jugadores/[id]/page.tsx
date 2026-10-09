import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import CareerExperience from '@/components/player/CareerExperience'
import { readCareerIdentity } from '@/features/player-career/player-career.repository'
export const dynamic='force-dynamic'
const identityForRender=cache(readCareerIdentity)
type Props={params:Promise<{id:string}>;searchParams:Promise<{clubId?:string}>}
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata> {
  const [{id},query]=await Promise.all([params,searchParams])
  const identity=await identityForRender(id,query.clubId)
  if (!identity) return {title:'Jugador no disponible · SELPA',robots:{index:false,follow:false}}
  const club=identity.contexts.find(c=>c.clubPlayerId===identity.selectedClubPlayerId)!
  const title=`${identity.name} · Carrera de pádel · SELPA`
  const description=`Carrera deportiva de ${identity.name} en ${club.clubName}. Ranking, resultados oficiales y palmarés de pádel.`
  return {title,description,alternates:{canonical:identity.publicPath},openGraph:{title,description,type:'profile',url:identity.publicPath}}
}
export default async function PublicPlayerCareer({params,searchParams}:Props) {
  const [{id},query]=await Promise.all([params,searchParams])
  const identity=await identityForRender(id,query.clubId)
  if (!identity) notFound()
  return <CareerExperience key={identity.selectedClubPlayerId} identity={identity}/>
}
