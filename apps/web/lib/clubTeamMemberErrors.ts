import { NextResponse } from 'next/server'

export const CLUB_TEAM_MEMBER_ERROR_CODES = [
  'unauthorized','forbidden','member_not_found','membership_not_approved','invalid_role',
  'owner_role_protected','cannot_assign_owner','cannot_remove_owner','cannot_modify_self',
  'role_unchanged','ownership_target_invalid','ownership_target_not_approved',
  'ownership_target_role_invalid','ownership_same_user','cross_club_forbidden','concurrent_update',
] as const

export type ClubTeamMemberErrorCode = (typeof CLUB_TEAM_MEMBER_ERROR_CODES)[number]

const RESPONSES: Record<ClubTeamMemberErrorCode,{status:number;message:string}> = {
  unauthorized:{status:401,message:'Sesión inválida.'},
  forbidden:{status:403,message:'No tenés permisos para realizar esta acción.'},
  member_not_found:{status:404,message:'Miembro no encontrado.'},
  membership_not_approved:{status:409,message:'La membresía no está aprobada.'},
  invalid_role:{status:400,message:'El rol seleccionado no es válido.'},
  owner_role_protected:{status:403,message:'El rol OWNER está protegido. Usá la transferencia de propiedad.'},
  cannot_assign_owner:{status:403,message:'OWNER solo puede asignarse mediante transferencia de propiedad.'},
  cannot_remove_owner:{status:403,message:'No se puede remover al OWNER. Primero transferí la propiedad.'},
  cannot_modify_self:{status:409,message:'No podés modificar tu propia membresía desde esta operación.'},
  role_unchanged:{status:409,message:'El miembro ya tiene ese rol.'},
  ownership_target_invalid:{status:404,message:'El destino de la transferencia no existe.'},
  ownership_target_not_approved:{status:409,message:'El destino debe tener una membresía aprobada.'},
  ownership_target_role_invalid:{status:409,message:'La propiedad solo puede transferirse a un ADMIN u OPERADOR.'},
  ownership_same_user:{status:409,message:'No podés transferirte la propiedad a vos mismo.'},
  cross_club_forbidden:{status:403,message:'El miembro no pertenece a este club.'},
  concurrent_update:{status:409,message:'Otro cambio está modificando el equipo. Intentá nuevamente.'},
}

export function getClubTeamMemberErrorCode(error:unknown):ClubTeamMemberErrorCode|null {
  const message=typeof error==='object'&&error&&'message' in error
    ? String((error as {message?:unknown}).message??'') : String(error??'')
  const code=message.match(/SELPA_CODE:([a-z_]+)/)?.[1]
  return CLUB_TEAM_MEMBER_ERROR_CODES.includes(code as ClubTeamMemberErrorCode)
    ? code as ClubTeamMemberErrorCode : null
}

export function clubTeamMemberErrorResponse(error:unknown) {
  const code=getClubTeamMemberErrorCode(error)
  if (!code) return NextResponse.json(
    {error:'No pudimos completar la operación.',code:'team_member_operation_failed'},
    {status:500},
  )
  const response=RESPONSES[code]
  return NextResponse.json({error:response.message,code},{status:response.status})
}
