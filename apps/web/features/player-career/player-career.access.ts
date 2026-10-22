import 'server-only'
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { playerAccountDenial } from '@/lib/accountRoleServer'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { validId } from './player-career.rules'

export type CareerAccess = Readonly<{kind:'public'} | {kind:'self';userId:string} | {kind:'admin';clubId:string}>
export const PUBLIC_CAREER:CareerAccess=Object.freeze({kind:'public'})
// Request-local capabilities, never accepted from a URL/body or serialized.
const authorized=new WeakSet<object>()
export class CareerAccessError extends Error {
  constructor(public readonly status:number) {super('CAREER_ACCESS_DENIED')}
}
export async function verifySelfCareer(request:Request):Promise<Extract<CareerAccess,{kind:'self'}>> {
  const auth=request.headers.get('authorization') ?? ''
  if(!auth.startsWith('Bearer '))throw new CareerAccessError(401)
  const result=await supabaseAdmin.auth.getUser(auth.slice(7))
  if(result.error||!result.data.user)throw new CareerAccessError(401)
  if(await playerAccountDenial(result.data.user.id))throw new CareerAccessError(403)
  const access:Extract<CareerAccess,{kind:'self'}>=Object.freeze({kind:'self',userId:result.data.user.id});authorized.add(access);return access
}
export async function verifyAdminCareer(request:Request,clubId:string):Promise<CareerAccess> {
  if(!validId(clubId))throw new CareerAccessError(400)
  const result=await requireClubCapability(new NextRequest(request),clubId,'players:view')
  if(result.error)throw new CareerAccessError(result.error.status)
  const access:CareerAccess=Object.freeze({kind:'admin',clubId});authorized.add(access);return access
}
export function assertCareerAccess(access:CareerAccess,userId:string,clubId?:string|null) {
  if(access.kind==='public')return
  if(!authorized.has(access)||(access.kind==='self'?access.userId!==userId:access.clubId!==clubId))throw new CareerAccessError(403)
}
