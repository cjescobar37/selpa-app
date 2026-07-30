import { NextResponse } from 'next/server'
type CodedError=Error & { code?:string }
export async function readSeriesJson(req:Request,maximumBytes=32_768):Promise<{value:unknown}|{error:NextResponse}> {
  const declared=Number(req.headers.get('content-length')??0)
  if(Number.isFinite(declared)&&declared>maximumBytes)return {error:NextResponse.json({error:'El cuerpo de la solicitud es demasiado grande.'},{status:413})}
  const raw=await req.text()
  if(new TextEncoder().encode(raw).byteLength>maximumBytes)return {error:NextResponse.json({error:'El cuerpo de la solicitud es demasiado grande.'},{status:413})}
  try{return {value:JSON.parse(raw)}}catch{return {value:null}}
}
export function seriesErrorResponse(error:unknown) {
  const value=error instanceof Error ? error as CodedError : null; const message=value?.message ?? ''
  if (value?.code==='40001') return NextResponse.json({error:'El circuito fue modificado en otra sesión. Actualizá e intentá nuevamente.'},{status:412})
  if (value?.code==='23505') return NextResponse.json({error:'Ya existe esa configuración en el circuito.'},{status:409})
  if (value?.code==='23514' || value?.code==='22023') return NextResponse.json({error:'La configuración no es válida.'},{status:400})
  if (value?.code==='42501' || value?.code==='28000') return NextResponse.json({error:'No autorizado.'},{status:value.code==='28000'?401:403})
  if (value?.code==='P0002' || value?.code==='PGRST116') return NextResponse.json({error:'Recurso inexistente.'},{status:404})
  if (message.includes('does not exist') || message.includes('schema cache')) return NextResponse.json({error:'Falta aplicar la migración Stage 5A.2.',setupRequired:true},{status:412})
  return NextResponse.json({error:'No se pudo gestionar el circuito competitivo.'},{status:500})
}
