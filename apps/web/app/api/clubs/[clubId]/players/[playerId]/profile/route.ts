import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { playerAccountDenial } from '@/lib/accountRoleServer'
import { readCareerIdentity,readCareerSummary } from '@/features/player-career/player-career.repository'
import { editorCareerDto } from '@/features/player-career/player-career.compat'

type PlayerRow = {
  id: string
  club_id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
  ranking_points: number | null
  preferred_position: string | null
  approved_at: string | null
  created_at: string
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
  cover_url: string | null
  city: string | null
  birth_date: string | null
  height_cm: number | null
  dominant_hand: string | null
  preferred_position: string | null
}

type EditableProfilePayload = {
  display_name?: unknown
  city?: unknown
  birth_date?: unknown
  height_cm?: unknown
  dominant_hand?: unknown
  preferred_position?: unknown
  avatar_url?: unknown
  cover_url?: unknown
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function fullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    fallback ||
    profile?.email ||
    'Jugador'
  )
}

function optionalText(value: unknown, max = 120) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function optionalDate(value: unknown) {
  const text = optionalText(value, 16)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function optionalHeight(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < 80 || rounded > 230) throw new Error('La altura debe estar entre 80 y 230 cm.')
  return rounded
}

function optionalHand(value: unknown) {
  const text = optionalText(value, 24)
  if (!text) return null
  const normalized = text.toUpperCase()
  if (['RIGHT', 'LEFT', 'AMBIDEXTROUS'].includes(normalized)) return normalized
  if (normalized === 'DERECHO') return 'RIGHT'
  if (normalized === 'IZQUIERDO') return 'LEFT'
  throw new Error('La mano hábil no es válida.')
}

function optionalPreferredPosition(value: unknown) {
  const text = optionalText(value, 16)
  if (!text) return null
  const normalized = text.toUpperCase()
  if (['DRIVE', 'REVES', 'BOTH'].includes(normalized)) return normalized
  throw new Error('La posición preferida no es válida.')
}

function optionalImageUrl(value: unknown) {
  const text = optionalText(value, 1000)
  if (!text) return null
  try {
    const parsed = new URL(text)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return text
  } catch {
    // ignore
  }
  throw new Error('La URL de imagen no es válida.')
}

export async function GET(req:NextRequest,context:{params:Promise<{clubId:string;playerId:string}>}) {
  const headers={'Cache-Control':'private, no-store'}
  try {
    const user=await getTokenUser(req)
    if (!user) return NextResponse.json({error:'Sesión inválida.'},{status:401,headers})
    const {clubId,playerId}=await context.params
    const identity=await readCareerIdentity(playerId,clubId)
    if (!identity) return NextResponse.json({error:'Jugador no disponible.'},{status:404,headers})
    if (identity.userId!==user.id) return NextResponse.json({error:'Este endpoint contiene datos privados del propietario.'},{status:403,headers})
    const [summary,profile]=await Promise.all([
      readCareerSummary(identity),
      supabaseAdmin.from('profiles').select('user_id,email,first_name,last_name,display_name,avatar_url,cover_url,city,birth_date,height_cm,dominant_hand,preferred_position').eq('user_id',user.id).maybeSingle(),
    ])
    if (profile.error) throw new Error('READ')
    return NextResponse.json({...editorCareerDto(identity,summary),visibility:'private',profile:profile.data},{headers})
  } catch {return NextResponse.json({error:'No pudimos leer tu perfil.'},{status:503,headers})}
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; playerId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })

    const { clubId, playerId } = await context.params
    const { data: playerData, error: playerError } = await supabaseAdmin
      .from('club_players')
      .select('id,club_id,user_id,display_name,category,gender,ranking_points,preferred_position,approved_at,created_at')
      .eq('club_id', clubId)
      .or(`id.eq.${playerId},user_id.eq.${playerId}`)
      .maybeSingle()

    if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })
    if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado.' }, { status: 404 })

    const player = playerData as PlayerRow
    const denial = await playerAccountDenial(player.user_id)
    if (denial) return denial
    if (player.user_id !== user.id) {
      return NextResponse.json({ error: 'Solo podés editar tu propio perfil jugador.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as EditableProfilePayload
    const displayName = optionalText(body.display_name, 90)
    const city = optionalText(body.city, 90)
    const birthDate = optionalDate(body.birth_date)
    const heightCm = optionalHeight(body.height_cm)
    const dominantHand = optionalHand(body.dominant_hand)
    const preferredPosition = optionalPreferredPosition(body.preferred_position)
    const avatarUrl = optionalImageUrl(body.avatar_url)
    const coverUrl = optionalImageUrl(body.cover_url)

    const now = new Date().toISOString()
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        user_id: player.user_id,
        id: player.user_id,
        display_name: displayName,
        city,
        birth_date: birthDate,
        height_cm: heightCm,
        dominant_hand: dominantHand,
        preferred_position: preferredPosition,
        avatar_url: avatarUrl,
        cover_url: coverUrl,
        updated_at: now,
      }, { onConflict: 'user_id' })
      .select('user_id,email,first_name,last_name,display_name,avatar_url,cover_url,city,birth_date,height_cm,dominant_hand,preferred_position')
      .single()

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    return NextResponse.json({
      player: {
        ...player,
        display_name: player.display_name,
        preferred_position: preferredPosition,
        full_name: fullName(profileData as ProfileRow, displayName),
      },
      profile: profileData as ProfileRow,
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error guardando perfil.' }, { status: 500 })
  }
}
