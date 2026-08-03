import { NextResponse } from 'next/server'
type Coded=Error&{code?:string}
export async function readEventJson(req:Request,max=32768){const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>max)return {error:NextResponse.json({error:'Solicitud demasiado grande.'},{status:413})};try{return {value:raw?JSON.parse(raw):{}}}catch{return {error:NextResponse.json({error:'JSON inválido.'},{status:400})}}}
export function eventErrorResponse(error:unknown){const e=error instanceof Error?error as Coded:null;const m=e?.message??''
  if(e?.code==='40001'||m.includes('PRECONDITION_FAILED'))return NextResponse.json({error:'El evento fue modificado en otra sesión.',code:'PRECONDITION_FAILED'},{status:412})
  if(e?.code==='23505'||m.includes('IDEMPOTENCY_CONFLICT')||m.includes('EVENT_RULE_CHANGED'))return NextResponse.json({error:'Conflicto de estado o idempotencia.',code:m.includes('EVENT_RULE_CHANGED')?'EVENT_RULE_CHANGED':'CONFLICT'},{status:409})
  if(e?.code==='22023'||e?.code==='23514'||e?.code==='22P02')return NextResponse.json({error:'La configuración del evento no es válida.'},{status:400})
  if(e?.code==='42501'||e?.code==='28000')return NextResponse.json({error:'No autorizado.'},{status:e.code==='28000'?401:403})
  if(e?.code==='P0002'||e?.code==='PGRST116')return NextResponse.json({error:'Recurso inexistente.'},{status:404})
  if(m.includes('does not exist')||m.includes('schema cache'))return NextResponse.json({error:'Falta aplicar la migración Stage 5A.3.',setupRequired:true},{status:412})
  return NextResponse.json({error:'No se pudo gestionar el evento competitivo.'},{status:500})}
