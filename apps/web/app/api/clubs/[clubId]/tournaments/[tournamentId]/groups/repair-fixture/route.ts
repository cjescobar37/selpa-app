import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { repairAndScheduleTournamentGroups } from '@/lib/tournamentGroupFixtureService'

export async function POST(req:NextRequest,context:{params:Promise<{clubId:string;tournamentId:string}>}){
  const auth=req.headers.get('authorization')??'',token=auth.replace(/^Bearer\s+/i,'')
  if(!token)return NextResponse.json({error:'Sesión inválida.'},{status:401})
  const user=await supabaseAdmin.auth.getUser(token)
  if(user.error||!user.data.user)return NextResponse.json({error:'Sesión inválida.'},{status:401})
  const {clubId,tournamentId}=await context.params
  if(!await userHasClubCapability(user.data.user.id,clubId,'groups:generate'))return NextResponse.json({error:'No autorizado para reparar el fixture.'},{status:403})
  try{return NextResponse.json({ok:true,...await repairAndScheduleTournamentGroups({clubId,tournamentId})})}
  catch(error){console.error('[groups/repair-fixture]',error);return NextResponse.json({error:'No pudimos completar los cruces y el cronograma. Revisá la configuración e intentá nuevamente.'},{status:409})}
}
