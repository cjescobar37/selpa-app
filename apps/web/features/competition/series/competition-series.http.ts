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
  if (message.includes('SERIES_FINALIZE_BLOCKED')) {
    const raw=message.slice(message.indexOf('SERIES_FINALIZE_BLOCKED:')+'SERIES_FINALIZE_BLOCKED:'.length)
    let detail='El circuito todavía tiene pasos pendientes antes de finalizar.'
    try { const blockers=JSON.parse(raw) as Array<{message?:string}>; detail=blockers[0]?.message || detail } catch { /* mensaje seguro */ }
    return NextResponse.json({error:detail},{status:409})
  }
  if (message.includes('SERIES_FINAL_RANKING_EMPTY')) return NextResponse.json({error:'El ranking final todavía no tiene participantes elegibles.'},{status:409})
  if (message.includes('SERIES_FINALIZED_IMMUTABLE')) return NextResponse.json({error:'El circuito está finalizado y sus resultados quedaron protegidos.'},{status:409})
  if (value?.code==='40001') return NextResponse.json({error:'El circuito fue modificado en otra sesión. Actualizá e intentá nuevamente.'},{status:412})
  if (value?.code==='23505') return NextResponse.json({error:'Ya existe esa configuración en el circuito.'},{status:409})
  if (value?.code==='23514' || value?.code==='22023') return NextResponse.json({error:'La configuración no es válida.'},{status:400})
  if (value?.code==='42501' || value?.code==='28000') return NextResponse.json({error:'No autorizado.'},{status:value.code==='28000'?401:403})
  if (message.includes('SERIES_DELETE_CONFIRMATION_REQUIRED')) return NextResponse.json({error:'Escribí ACEPTAR para eliminar el circuito.'},{status:400})
  if (message.includes('SERIES_DELETE_BLOCKED')) return NextResponse.json({error:'Este circuito ya tiene actividad vinculada y no puede eliminarse. Podés cancelarlo para conservar el historial.'},{status:409})
  if (message.includes('SERIES_NOT_READY')) return NextResponse.json({error:'No pudimos programar el circuito. Revisá las reglas y la elegibilidad.'},{status:409})
  if (message.includes('SERIES_ALREADY_SCHEDULED')) return NextResponse.json({error:'El circuito ya está programado.'},{status:409})
  if (message.includes('SERIES_FORBIDDEN')) return NextResponse.json({error:'No tenés permisos para administrar este circuito.'},{status:403})
  if (value?.code==='P0002' || value?.code==='PGRST116') return NextResponse.json({error:'Recurso inexistente.'},{status:404})
  if (value?.code==='PGRST202' || message.includes('schema cache')) return NextResponse.json({error:'La acción solicitada todavía no está disponible. Actualizá la página e intentá nuevamente.'},{status:503})
  if (message.includes('does not exist')) return NextResponse.json({error:'No pudimos encontrar una configuración necesaria del circuito. Intentá nuevamente.'},{status:500})
  return NextResponse.json({error:'No se pudo gestionar el circuito competitivo.'},{status:500})
}
