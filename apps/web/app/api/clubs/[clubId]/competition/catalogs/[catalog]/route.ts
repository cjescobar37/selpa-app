import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeCompetitionCatalog } from '@/features/competition/catalogs/competition-catalogs.auth'
import { isUuid } from '@/features/competition/catalogs/competition-catalogs.validation'

type Context = { params: Promise<{ clubId: string; catalog: string }> }
const catalogs = new Set(['branch', 'segment', 'category'])
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
function client(req: NextRequest) { const token=(req.headers.get('authorization')??'').replace(/^Bearer\s+/,''); const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; return token&&url&&key ? createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}}) : null }
function slugify(value: string) { return value.replace(/ª/g, 'a').replace(/º/g, 'o').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }

export async function POST(req: NextRequest, context: Context) {
  const { clubId, catalog } = await context.params
  if (!isUuid(clubId) || !catalogs.has(catalog)) return bad('Catálogo inválido.')
  const auth = await authorizeCompetitionCatalog(req, clubId, 'write'); if (auth.error) return auth.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const name=typeof body?.name==='string'?body.name.trim():''
  if(!name)return bad('Ingresá un nombre.')
  const slug=slugify(name); if(!slug)return bad('El nombre no es válido.')
  const db = client(req); if (!db) return bad('Sesión inválida.', 401)
  const { data, error } = await db.rpc('manage_competition_catalog_entry', { p_club_id:clubId,p_catalog:catalog,p_operation:'CREATE',p_name:name,p_slug:slug,p_short_label:catalog==='category'?name:null,p_sort_order:typeof body?.sort_order==='number'?body.sort_order:0,p_accent_kind:'DEFAULT' })
  if (error) return bad(error.code==='42501'?'No tenés permisos para modificar este catálogo.':'No pudimos guardar esta opción.', error.code==='42501'?403:400)
  const entry = data as Record<string, unknown> | null
  const action = typeof entry?._catalog_action === 'string' ? entry._catalog_action : 'CREATED'
  const message = action === 'ALREADY_ACTIVE' ? `${name} ya está disponible.` : action === 'REACTIVATED' ? `${name} fue reactivado.` : `${name} fue agregado.`
  return NextResponse.json({ entry, action, message }, { status: action === 'CREATED' ? 201 : 200 })
}

export async function PATCH(req: NextRequest, context: Context) {
  const { clubId, catalog } = await context.params
  if (!isUuid(clubId) || !catalogs.has(catalog)) return bad('Catálogo inválido.')
  const auth = await authorizeCompetitionCatalog(req, clubId, 'write'); if (auth.error) return auth.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!isUuid(body?.id) || typeof body?.is_active !== 'boolean') return bad('La entrada seleccionada no es válida.')
  const db = client(req); if (!db) return bad('Sesión inválida.',401)
  const {data,error}=await db.rpc('manage_competition_catalog_entry',{p_club_id:clubId,p_catalog:catalog,p_operation:body.is_active?'ACTIVATE':'DEACTIVATE',p_entry_id:body.id})
  if(error)return bad(error.code==='23514'?'Esta entrada está en uso y no se puede desactivar.':'No pudimos actualizar la entrada del catálogo.',error.code==='42501'?403:error.code==='P0002'?404:error.code==='23514'?409:400)
  return NextResponse.json({entry:data})
}
