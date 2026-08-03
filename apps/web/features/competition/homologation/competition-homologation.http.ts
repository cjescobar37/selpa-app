import {NextResponse} from 'next/server'
type Coded=Error&{code?:string}
export async function readJson(request:Request,max=32768){const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>max)return {error:NextResponse.json({error:'Solicitud demasiado grande.'},{status:413})};try{return {value:raw?JSON.parse(raw):{}}}catch{return {error:NextResponse.json({error:'JSON inválido.'},{status:400})}}}
export function homologationError(error:unknown){const value=error instanceof Error?error as Coded:null;const message=value?.message??''
  if(value?.code==='40001'||message.includes('PRECONDITION_FAILED'))return NextResponse.json({error:'La homologación fue modificada en otra sesión.',code:'PRECONDITION_FAILED'},{status:412})
  if(value?.code==='23505'||message.includes('IDEMPOTENCY_CONFLICT'))return NextResponse.json({error:'Conflicto de estado o idempotencia.',code:'CONFLICT'},{status:409})
  if(value?.code==='22023'||value?.code==='23514')return NextResponse.json({error:'La homologación no cumple las precondiciones.',code:message.split(':').at(-1)?.trim()},{status:400})
  if(value?.code==='42501'||value?.code==='28000')return NextResponse.json({error:'No autorizado.'},{status:value.code==='28000'?401:403})
  if(value?.code==='P0002'||value?.code==='PGRST116')return NextResponse.json({error:'Recurso inexistente.'},{status:404})
  if(message.includes('does not exist')||message.includes('schema cache'))return NextResponse.json({error:'Falta aplicar la migración Stage 5A.4.',setupRequired:true},{status:412})
  return NextResponse.json({error:'No se pudo gestionar la homologación.'},{status:500})}
