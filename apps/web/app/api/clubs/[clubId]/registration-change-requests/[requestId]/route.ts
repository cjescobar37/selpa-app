import { NextRequest, NextResponse } from 'next/server'
import { userHasClubCapability } from '@/lib/clubMembershipServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { writeErrorResponse } from '@/lib/writeFlowServer'

export async function PATCH(req: NextRequest, context: {params:Promise<{clubId:string;requestId:string}>}) {
  try {
    const authorization=req.headers.get('authorization')??''
    const token=authorization.startsWith('Bearer ')?authorization.slice(7):''
    const {data:auth,error:authError}=await supabaseAdmin.auth.getUser(token)
    if(authError||!auth?.user)return NextResponse.json({error:'Tu sesión venció. Volvé a ingresar.',kind:'FORBIDDEN'},{status:401})
    const {clubId,requestId}=await context.params
    const {data:platform}=await supabaseAdmin.from('platform_admins').select('user_id').eq('user_id',auth.user.id).maybeSingle()
    if(!platform&&!(await userHasClubCapability(auth.user.id,clubId,'registrations:manage')))return NextResponse.json({error:'No tenés permiso para resolver bajas.',kind:'FORBIDDEN'},{status:403})
    const body=await req.json().catch(()=>({}))
    const status=String(body?.status??'').trim().toUpperCase()
    if(!['APPROVED','REJECTED'].includes(status))return NextResponse.json({error:'Elegí una resolución válida.',kind:'VALIDATION'},{status:400})
    const {data,error}=await supabaseAdmin.rpc('resolve_registration_change_request_pass3',{
      p_club_id:clubId,p_request_id:requestId,p_actor_id:auth.user.id,p_status:status,
    })
    if(error)return writeErrorResponse('resolve_registration_change',error,'No pudimos resolver la baja. Ningún cambio parcial fue guardado.')
    return NextResponse.json(data)
  }catch {return writeErrorResponse('resolve_registration_change',{code:'UNEXPECTED'})}
}
