import { createClient } from '@supabase/supabase-js'
import { mapTournamentError } from '@/lib/tournamentErrors'
import { NextRequest, NextResponse } from 'next/server'
import { notifyClubAdmins } from '@/lib/operationalNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { TOURNAMENT_SELECT, toTournamentView } from '@/lib/tournamentHelpers'
import { getTournamentRegistrationIneligibility } from '@/lib/tournamentRegistrationEligibility'

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

  if (tournamentError) {
    const mapped = mapTournamentError(tournamentError, 'No pudimos consultar este torneo. Intentá nuevamente.')
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
  // The Supabase generic is not available for this legacy select.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournament = toTournamentView(tournamentRow as any)
  if (!tournament) return NextResponse.json({ error: 'Torneo no encontrado.' }, { status: 404 })

  const displayStatus = getTournamentDisplayStatus(tournament)
  if (displayStatus.key === 'finished' || displayStatus.key === 'cancelled' || displayStatus.key === 'draft' || displayStatus.key === 'paused' || displayStatus.key === 'registration_closed') {
    return NextResponse.json({ error: 'Este torneo no está abierto para inscripciones.' }, { status: 409 })
  }

  const { data: players, error: playersError } = await supabaseAdmin
    .from('club_players')
    .select('id,user_id,category,gender,approved_at,operational_status')
    .eq('club_id', tournament.club_id)
    .in('user_id', [user.id, partnerUserId])

  if (playersError) {
    const mapped = mapTournamentError(playersError, 'No pudimos validar a los jugadores. Intentá nuevamente.')
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }

  const me = (players ?? []).find((player) => String(player.user_id) === user.id)
  const partner = (players ?? []).find((player) => String(player.user_id) === partnerUserId)
  if (!me?.id) return NextResponse.json({ error: 'No tenés perfil de jugador en este club.' }, { status: 403 })
  if (!partner?.id) return NextResponse.json({ error: 'El compañero no pertenece a este club.' }, { status: 400 })

  let ageCategory: { minAge: number | null; maxAge: number | null; referenceRule: string | null; referenceConfig: Record<string, unknown> | null } | null = null
  if (tournament.ageCategoryId) {
    const { data: ageCategoryRow, error: ageCategoryError } = await supabaseAdmin
      .from('competition_age_categories')
      .select('id,club_id,min_age,max_age,age_reference_rule,age_reference_config')
      .eq('id', tournament.ageCategoryId).eq('club_id', tournament.club_id).maybeSingle()
    if (ageCategoryError) {
      const mapped = mapTournamentError(ageCategoryError, 'No pudimos validar la categoría de edad. Intentá nuevamente.')
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
    }
    if (!ageCategoryRow) return NextResponse.json({ error: 'La categoría de edad del torneo ya no está disponible.' }, { status: 409 })
    ageCategory = {
      minAge: ageCategoryRow.min_age,
      maxAge: ageCategoryRow.max_age,
      referenceRule: ageCategoryRow.age_reference_rule,
      referenceConfig: ageCategoryRow.age_reference_config && typeof ageCategoryRow.age_reference_config === 'object' ? ageCategoryRow.age_reference_config as Record<string, unknown> : null,
    }
  }

  const [{ data: memberships, error: membershipsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabaseAdmin.from('club_memberships').select('user_id,status,approved_at').eq('club_id', tournament.club_id).in('user_id', [user.id, partnerUserId]),
    supabaseAdmin.from('profiles').select('user_id,status,birth_date').in('user_id', [user.id, partnerUserId]),
  ])
  if (membershipsError || profilesError) return NextResponse.json({ error: 'No pudimos validar la elegibilidad de la pareja. Intentá nuevamente.' }, { status: 500 })
  const membershipByUserId = new Map((memberships ?? []).map((membership) => [String(membership.user_id), membership]))
  const profileByUserId = new Map((profiles ?? []).map((profile) => [String(profile.user_id), profile]))
  for (const [player, label] of [[me, 'Tu perfil'], [partner, 'La categoría de tu compañero']] as const) {
    const membership = membershipByUserId.get(String(player.user_id))
    const profile = profileByUserId.get(String(player.user_id))
    const ineligibility = getTournamentRegistrationIneligibility(
      { category: tournament.category, gender: tournament.gender, startDate: tournament.startDate, endDate: tournament.endDate },
      {
        userId: player.user_id,
        category: player.category,
        gender: player.gender,
        approvedAt: player.approved_at,
        operationalStatus: player.operational_status,
        membershipStatus: membership?.status,
        membershipApprovedAt: membership?.approved_at,
        profileStatus: profile?.status,
        birthDate: profile?.birth_date,
      },
      ageCategory,
    )
    if (ineligibility) return NextResponse.json({ error: `${label}: ${ineligibility}` }, { status: 409 })
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

  if (error) {
    const mapped = mapTournamentError(error, 'No pudimos registrar la pareja. Intentá nuevamente.')
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status === 500 ? 409 : mapped.status })
  }
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
      const mapped = mapTournamentError(availabilityError, 'La pareja se creó, pero no pudimos guardar la disponibilidad.')
      return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
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
    href: registrationId
      ? `/club/torneos/${tournament.id}?tab=inscriptos&registrationId=${encodeURIComponent(String(registrationId))}`
      : `/club/torneos/${tournament.id}?tab=inscriptos`,
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
