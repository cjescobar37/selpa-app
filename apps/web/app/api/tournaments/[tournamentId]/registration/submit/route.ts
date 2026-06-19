import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'

type RegistrationSubmitContext = {
  params: Promise<{ tournamentId: string }>
}

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

async function getTokenUser(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function normalizeGender(value?: string | null) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'M' || normalized === 'MALE' || normalized === 'MASCULINO') return 'MALE'
  if (normalized === 'F' || normalized === 'FEMALE' || normalized === 'FEMENINO' || normalized === 'MUJERES') return 'FEMALE'
  if (normalized.includes('MIX')) return 'MIXED'
  return normalized || null
}

const allowedPaymentMethods = new Set(['MERCADO_PAGO', 'CASH_ON_SITE_REQUEST', 'BANK_TRANSFER'])

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

function normalizePreferredSlots(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((slot) => String(slot ?? '').trim()).filter(Boolean).slice(0, 12)
}

function normalizeAvailabilityScore(value: unknown, fallback: number) {
  const score = Number(value ?? fallback)
  if (!Number.isFinite(score)) return fallback
  return Math.max(0, Math.min(100, Math.round(score)))
}

async function getRegisteredTeamsCount(tournamentId: string, clubId: string) {
  const { data, error } = await supabaseAdmin
    .from('tournament_registrations')
    .select('team_id,status')
    .eq('tournament_id', tournamentId)
    .eq('club_id', clubId)

  if (error) throw error
  const activeTeams = new Set<string>()
  for (const row of data ?? []) {
    const status = String(row.status ?? '').toUpperCase()
    if (status !== 'CANCELLED' && status !== 'REJECTED' && row.team_id) activeTeams.add(String(row.team_id))
  }
  return activeTeams.size
}

export async function POST(req: NextRequest, context: RegistrationSubmitContext) {
  const { tournamentId } = await context.params
  const token = getBearerToken(req)
  const user = await getTokenUser(req)
  if (!token || !user) return NextResponse.json({ error: 'Iniciá sesión para inscribirte.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const partnerUserId = String(body?.partnerUserId ?? '').trim()
  const paymentMethod = String(body?.paymentMethod ?? '').trim().toUpperCase()
  const preferredSlots = normalizePreferredSlots(body?.preferredSlots ?? body?.preferred_slots)
  const availabilityScore = normalizeAvailabilityScore(body?.availabilityScore ?? body?.availability_score, preferredSlots.length)
  const flexibilityLevel = String(body?.flexibilityLevel ?? body?.flexibility_level ?? preferredSlots.length).trim() || null
  if (!partnerUserId) return NextResponse.json({ error: 'Seleccioná un compañero.' }, { status: 400 })
  if (partnerUserId === user.id) return NextResponse.json({ error: 'No podés inscribirte con vos mismo.' }, { status: 400 })
  if (!allowedPaymentMethods.has(paymentMethod)) {
    return NextResponse.json({ error: 'Seleccioná un método de pago.' }, { status: 400 })
  }
  if (paymentMethod !== 'CASH_ON_SITE_REQUEST') {
    return NextResponse.json({ error: 'Este método de pago todavía no está disponible.' }, { status: 409 })
  }

  const { data: tournamentRow, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 })
  const tournament = toTournamentView(tournamentRow as any)
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const displayStatus = getTournamentDisplayStatus(tournament)
  if (displayStatus.key === 'finished' || displayStatus.key === 'cancelled' || displayStatus.key === 'draft') {
    return NextResponse.json({ error: 'Este torneo no está abierto para inscripciones.' }, { status: 409 })
  }

  if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
    return NextResponse.json({ error: 'La inscripción ya cerró.' }, { status: 409 })
  }

  const { data: players, error: playersError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,category,gender,approved_at')
    .eq('club_id', tournament.club_id)
    .in('user_id', [user.id, partnerUserId])

  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

  const me = (players ?? []).find((player) => String(player.user_id) === user.id)
  const partner = (players ?? []).find((player) => String(player.user_id) === partnerUserId)
  if (!me?.id) return NextResponse.json({ error: 'No tenés perfil de jugador en este club.' }, { status: 403 })
  if (!partner?.id) return NextResponse.json({ error: 'El compañero no pertenece a este club.' }, { status: 400 })
  if (!me.approved_at || !partner.approved_at) {
    return NextResponse.json({ error: 'Ambos jugadores deben estar aprobados en el club.' }, { status: 403 })
  }

  const tournamentCategory = Number(tournament.category ?? 0)
  if (tournamentCategory > 0) {
    if (Number(me.category ?? 0) < tournamentCategory) {
      return NextResponse.json({ error: `Tu categoría no habilita este torneo (${tournamentCategory}).` }, { status: 409 })
    }
    if (Number(partner.category ?? 0) < tournamentCategory) {
      return NextResponse.json({ error: `La categoría de tu compañero no habilita este torneo (${tournamentCategory}).` }, { status: 409 })
    }
  }

  if (tournament.gender !== 'MIXED') {
    const tournamentGender = normalizeGender(tournament.gender)
    if (normalizeGender(me.gender) && normalizeGender(me.gender) !== tournamentGender) {
      return NextResponse.json({ error: 'Tu rama no coincide con la del torneo.' }, { status: 409 })
    }
    if (normalizeGender(partner.gender) && normalizeGender(partner.gender) !== tournamentGender) {
      return NextResponse.json({ error: 'La rama de tu compañero no coincide con la del torneo.' }, { status: 409 })
    }
  }

  if (tournament.maxPairs) {
    const registeredTeamsCount = await getRegisteredTeamsCount(tournament.id, tournament.club_id)
    if (registeredTeamsCount >= tournament.maxPairs) {
      return NextResponse.json({ error: 'No hay cupos disponibles.' }, { status: 409 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return NextResponse.json({ error: 'Falta configuración de Supabase.' }, { status: 500 })

  const userSupabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await userSupabase.rpc('register_team_for_tournament', {
    p_tournament_id: tournament.id,
    p_club_id: tournament.club_id,
    p_partner_user_id: partnerUserId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  const row = Array.isArray(data) ? data[0] : data
  const registrationId = row?.registration_id ?? null

  if (registrationId && preferredSlots.length > 0) {
    const { error: availabilityError } = await supabaseAdmin
      .from('tournament_registrations')
      .update({
        preferred_slots: preferredSlots,
        availability_score: availabilityScore,
        flexibility_level: flexibilityLevel,
      })
      .eq('id', registrationId)

    if (availabilityError && !isMissingSchemaObjectError(availabilityError)) {
      return NextResponse.json({ error: availabilityError.message }, { status: 500 })
    }

    if (availabilityError && process.env.NODE_ENV !== 'production') {
      console.warn('[registration-submit] availability columns unavailable; continuing without persisted availability', availabilityError.message)
    }
  }

  await notifyClubAdmins(tournament.club_id, {
    tournamentId: tournament.id,
    actorId: user.id,
    type: 'registration_created',
    title: 'Nueva inscripción',
    body: 'Una pareja se inscribió al torneo.',
    href: `/club/torneos/${tournament.id}`,
    metadata: {
      registration_id: registrationId,
      team_id: row?.team_id ?? null,
      payment_method: paymentMethod,
    },
  })

  return NextResponse.json({
    ok: true,
    teamId: row?.team_id ?? null,
    registrationId,
    paymentStatus: 'PENDING',
    paymentMethod,
  })
}
