import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { assertPlatformAdmin } from '@/lib/platformApiAuth'
import { requireClubCapability } from '@/lib/clubMembershipServer'
import { billingLists, billingOperations, billingValidMoney } from './platformBillingF2'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function billingAccess(req:NextRequest,platform:boolean) {
  const clubId=req.nextUrl.searchParams.get('clubId')
  if ((clubId && !uuid.test(clubId)) || (!platform && !clubId)) return {error:NextResponse.json({error:'Club inválido.'},{status:400}),client:null,clubId:null}
  // club:update is restricted to approved OWNER/ADMIN; DB independently checks both role and approval.
  const access=platform ? await assertPlatformAdmin(req) : await requireClubCapability(req,clubId!,'club:update')
  if (access.error) return {error:access.error,client:null,clubId:null}
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return {error:NextResponse.json({error:'Facturación no disponible.'},{status:503}),client:null,clubId:null}
  return {error:null,clubId,client:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.get('authorization') ?? ''}}})}
}
export function billingFailure(error:{code?:string;message?:string}) {
  const messages:Record<string,string>={
    BILLING_OVER_ALLOCATION:'El importe supera el saldo actual. Actualizá antes de continuar.',
    BILLING_CURRENT_SUBSCRIPTION_EXISTS:'Este club ya tiene una suscripción vigente.',
    BILLING_REVERSE_PAYMENTS_BEFORE_VOID:'Revertí los pagos aplicados antes de anular este comprobante.',
    BILLING_ACTIVE_PLAN_REQUIRED:'Seleccioná un plan activo. El plan actual puede haber sido desactivado.',
    BILLING_IDEMPOTENCY_CONFLICT:'La operación ya fue enviada con otros datos. Cerrá y volvé a abrir la acción.',
    BILLING_REVISION_CONFLICT:'Los datos cambiaron. Actualizá antes de continuar.',
    BILLING_NEXT_PERIOD_REQUIRED:'El siguiente período debe comenzar al finalizar el actual.',
    BILLING_SUBSCRIPTION_SUSPENDED:'Reactivá la suscripción antes de generar un período.',
    BILLING_PAYMENT_ALREADY_REVERSED:'El pago ya fue revertido.',
  }
  const match=Object.keys(messages).find(key=>error.message?.includes(key))
  return NextResponse.json({error: match ? messages[match] : error.code==='40001' ? 'Operación concurrente. Reintentá con la misma acción.' : 'No pudimos completar la operación de facturación.'},
    {status:error.code==='42501'?403:error.code==='40001'||error.code==='23505'||match?409:400})
}
export async function billingGet(req:NextRequest,platform:boolean) {
  const access=await billingAccess(req,platform); if(access.error || !access.client) return access.error
  const q=req.nextUrl.searchParams; const kind=q.get('kind') ?? 'overview'
  if(kind!=='overview' && !(billingLists as readonly string[]).includes(kind)) return NextResponse.json({error:'Lista inválida.'},{status:400})
  const at=q.get('at'); const id=q.get('id'); const from=q.get('from'); const to=q.get('to')
  if ((at && !Number.isFinite(Date.parse(at))) || (id && !uuid.test(id)) || Boolean(at)!==Boolean(id) ||
    Boolean(from)!==Boolean(to) || (from && (!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to!)))) return NextResponse.json({error:'Filtros inválidos.'},{status:400})
  const result=await access.client.rpc(kind==='overview'?'get_platform_billing_overview_f2':'list_platform_billing_f2',{
    p_club_id:access.clubId,p_from:from,p_to:to,...(kind==='overview'?{}:{p_kind:kind,p_cursor_at:at,p_cursor_id:id,p_limit:20,p_search:q.get('search')??''}),
  })
  if(result.error) return billingFailure(result.error)
  return NextResponse.json(result.data,{headers:{'Cache-Control':'private, no-store'}})
}
export async function billingPost(req:NextRequest) {
  const access=await billingAccess(req,true); if(access.error || !access.client) return access.error
  const body=await req.json().catch(()=>null)
  if(!body || !(billingOperations as readonly string[]).includes(body.operation) || typeof body.key!=='string' || body.key.length<8 || body.key.length>160 ||
    !body.payload || Array.isArray(body.payload) || typeof body.payload!=='object' || 'actor_id' in body.payload ||
    (body.operation==='SAVE_PLAN' && !billingValidMoney(body.payload.price)) ||
    (body.operation==='REGISTER_PAYMENT' && !billingValidMoney(body.payload.amount,true))) return NextResponse.json({error:'Operación inválida.'},{status:400})
  const result=await access.client.rpc('execute_platform_billing_f2',{p_operation:body.operation,p_key:body.key,p_payload:body.payload})
  if(result.error) return billingFailure(result.error)
  return NextResponse.json(result.data,{headers:{'Cache-Control':'private, no-store'}})
}
