import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getApprovedMembership } from '@/lib/clubMembershipServer'
import { hasClubCapability } from '@/lib/clubPermissions'
import { isPlatformAdmin } from '@/lib/clubNewsServer'
import { getTokenUser } from '@/lib/platformApiAuth'

export async function authorizeCompetitionSeries(req: NextRequest, clubId: string, mode: 'read'|'write'|'delete') {
  const auth=req.headers.get('authorization') ?? ''; const token=auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const user=token ? await getTokenUser(req) : null
  if (!user) return { client:null,error:NextResponse.json({error:'Sesión inválida.'},{status:401}) }
  const platform=await isPlatformAdmin(user.id); const membership=platform ? null : await getApprovedMembership(user.id,clubId)
  const capability=mode==='read' ? 'competition:view' : mode==='delete' ? 'ranking:manage' : 'competition:manage'
  if (!platform && (!membership || !hasClubCapability(membership.role,capability))) return { client:null,error:NextResponse.json({error:'No autorizado.'},{status:403}) }
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { client:null,error:NextResponse.json({error:'Supabase no está configurado.'},{status:500}) }
  return { client:createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}),error:null }
}
