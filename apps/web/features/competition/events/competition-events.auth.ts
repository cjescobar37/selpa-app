import { createClient } from '@supabase/supabase-js'
import { NextRequest,NextResponse } from 'next/server'
import { hasClubCapability } from '@/lib/clubPermissions'
import { getTokenUser } from '@/lib/platformApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMembership, type ClubRole } from '@/lib/clubMembershipRules'

type Membership={id:string;club_id:string;user_id:string;role:ClubRole;status:string;approved_at:string|null}
export async function authorizeCompetitionEvents(req:NextRequest,clubId:string,mode:'read'|'write'){
  const header=req.headers.get('authorization')??'',token=header.startsWith('Bearer ')?header.slice(7):'';const user=token?await getTokenUser(req):null
  if(!user)return {client:null,error:NextResponse.json({error:'Sesión inválida.'},{status:401}),role:null,platform:false}
  const platformResult=await supabaseAdmin.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle()
  if(platformResult.error)throw new Error('AUTHORIZATION_LOOKUP_FAILED')
  const platform=Boolean(platformResult.data?.user_id)
  let membership:Membership|null=null
  if(!platform){
    const membershipResult=await supabaseAdmin.from('club_memberships').select('id,club_id,user_id,role,status,approved_at').eq('user_id',user.id).eq('club_id',clubId).maybeSingle()
    if(membershipResult.error)throw new Error('AUTHORIZATION_LOOKUP_FAILED')
    const candidate=membershipResult.data as Membership|null
    membership=candidate&&isApprovedMembership(candidate)?candidate:null
  }
  const capability=mode==='write'?'competition:manage':'competition:view'
  if(!platform&&(!membership||!hasClubCapability(membership.role,capability)))return {client:null,error:NextResponse.json({error:'No autorizado.'},{status:403}),role:membership?.role??null,platform}
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!url||!key)return {client:null,error:NextResponse.json({error:'Supabase no está configurado.'},{status:500}),role:membership?.role??null,platform}
  return {client:createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}),error:null,role:membership?.role??null,platform}
}
