import { NextRequest, NextResponse } from 'next/server'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { readTournamentOperationalConfiguration } from '@/lib/tournamentOperationalConfigurationServer'
import { isUuid } from '@/features/competition/events/competition-events.validation'
import { hasClubCapability } from '@/lib/clubPermissions'
export async function GET(request: NextRequest, context: {params: Promise<{clubId:string;tournamentId:string}>}) {
  const {clubId,tournamentId}=await context.params
  if(!isUuid(clubId)||!isUuid(tournamentId))return NextResponse.json({error:'Identificador inválido.'},{status:400})
  const auth=await requireClubCapability(request,clubId,'tournaments:view')
  if(auth.error)return auth.error
  try {
    const detail=await readTournamentOperationalConfiguration(clubId,tournamentId)
    if(!detail)return NextResponse.json({error:'Torneo no encontrado para este club.'},{status:404})
    const permitted=Boolean(auth.membership&&hasClubCapability(auth.membership.role,'tournaments:update'))
    const reason='No tenés permisos para editar la configuración del torneo.'
    const capabilities=permitted?detail.capabilities:Object.fromEntries(Object.keys(detail.capabilities).map(key=>[key,{editable:false,reason}]))
    return NextResponse.json({...detail,capabilities,canEdit:detail.canEdit&&permitted,blockedReason:permitted?detail.blockedReason:reason})
  }catch{return NextResponse.json({error:'No pudimos cargar la configuración del torneo.'},{status:500})}
}
