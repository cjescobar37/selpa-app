import { NextResponse } from 'next/server'
export function pointsError(cause:unknown){ const error=cause as Error&{code?:string}; const message=error.message||''; const code=error.code||''
  if(code==='28000') return NextResponse.json({error:'Sesión inválida.'},{status:401})
  if(code==='42501') return NextResponse.json({error:'No autorizado.'},{status:403})
  if(code==='P0002'||message.includes('NOT_FOUND')) return NextResponse.json({error:'El esquema no existe.'},{status:404})
  if(code==='40001'||message.includes('STALE_REVISION')) return NextResponse.json({error:'El esquema cambió. Actualizá y volvé a intentar.'},{status:412})
  if(code==='23505') return NextResponse.json({error:'Ya existe un esquema con ese nombre.'},{status:409})
  if(code==='23514'||code==='22023'||message.includes('_REQUIRED')||message.includes('_INVALID')) return NextResponse.json({error: message.includes('SCHEME_IN_USE')?'Este esquema ya está en uso. Clonalo para modificarlo.':'Revisá los datos ingresados.'},{status:409})
  console.error('[competition:points-schemes]',code,message); return NextResponse.json({error:'No pudimos completar la operación.'},{status:500}) }
