import { NextRequest, NextResponse } from 'next/server'
import { isClubAdmin } from '@/lib/clubMembershipServer'
import { assertServiceRole, supabaseAdmin } from '@/lib/supabaseAdmin'

type ManualPlayerInput = {
  user_id?: string
  full_name?: string
}

type PaymentMode = 'PAID' | 'VENUE' | 'NONE'

type ManualRegistrationPayload = {
  player1?: ManualPlayerInput
  player2?: ManualPlayerInput
  auto_confirm?: boolean
  payment_mode?: PaymentMode
}

type TournamentRow = {
  id: string
  club_id: string
  status: string
  category_id?: number | null
  category?: number | null
  gender?: string | null
  registration_deadline?: string | null
  signup_deadline?: string | null
}

type ClubPlayerRow = {
  id: string
  user_id: string
  display_name: string | null
  category: number | null
  gender: string | null
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
}

type TeamRow = {
  player1_user_id: string
  player2_user_id: string
}

type ResolvedPlayer = {
  userId: string
  fullName: string
  createdAuthUser: boolean
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const paymentModes = new Set<PaymentMode>(['PAID', 'VENUE', 'NONE'])

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function normalizeName(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeStatus(value?: string | null) {
  return (value ?? '').trim().toUpperCase()
}

function isRegistrationClosed(tournament: Pick<TournamentRow, 'registration_deadline' | 'signup_deadline'>) {
  const deadline = tournament.registration_deadline ?? tournament.signup_deadline ?? null
  if (!deadline) return false

  const deadlineTime = new Date(deadline).getTime()
  if (Number.isNaN(deadlineTime)) return false

  return Date.now() > deadlineTime
}

function normalizeSearch(value?: string | null) {
  return normalizeName(value).toLowerCase()
}

function normalizeGender(value?: string | null) {
  const cleanValue = normalizeName(value).toUpperCase()
  if (['M', 'MALE', 'MASCULINO', 'HOMBRE'].includes(cleanValue)) return 'MALE'
  if (['F', 'FEMALE', 'FEMENINO', 'MUJER'].includes(cleanValue)) return 'FEMALE'
  if (['MIXED', 'MIXTO'].includes(cleanValue)) return 'MIXED'
  return cleanValue
}

function getFullName(profile?: ProfileRow | null, fallback?: string | null) {
  return (
    normalizeName(fallback) ||
    normalizeName(profile?.display_name) ||
    normalizeName([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) ||
    normalizeName(profile?.email) ||
    'Jugador'
  )
}

function genderMatchesTournament(playerGender?: string | null, tournamentGender?: string | null) {
  const normalizedTournamentGender = normalizeGender(tournamentGender)
  if (!normalizedTournamentGender || normalizedTournamentGender === 'MIXED') return true
  return normalizeGender(playerGender) === normalizedTournamentGender
}

function buildManualEmail(clubId: string) {
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  return `manual-${clubId.slice(0, 8)}-${suffix}@manual.pamprax.local`
}

function splitName(fullName: string) {
  const parts = fullName.split(' ').filter(Boolean)
  if (parts.length <= 1) return { firstName: fullName, lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function getAdmissionForPaymentMode(paymentMode: PaymentMode, actorId: string) {
  if (paymentMode === 'PAID') {
    return {
      admission_status: 'MANUAL_PAYMENT_VALIDATED',
      admission_reason: 'Inscripción manual: pago validado por el club.',
      admission_by: actorId,
      admission_at: new Date().toISOString(),
    }
  }

  if (paymentMode === 'VENUE') {
    return {
      admission_status: 'PAY_AT_VENUE_APPROVED',
      admission_reason: 'Inscripción manual: pago aprobado en predio.',
      admission_by: actorId,
      admission_at: new Date().toISOString(),
    }
  }

  return {
    admission_status: 'NONE',
    admission_reason: null,
    admission_by: null,
    admission_at: null,
  }
}

function isDuplicateError(error: { code?: string; message?: string } | null) {
  return error?.code === '23505' || /duplicate key/i.test(error?.message ?? '')
}

async function cleanupCreatedAuthUsers(userIds: string[]) {
  await Promise.allSettled(userIds.map((userId) => supabaseAdmin.auth.admin.deleteUser(userId)))
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para buscar jugadores.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const query = normalizeSearch(req.nextUrl.searchParams.get('q'))
    if (query.length < 1) {
      return NextResponse.json({ players: [] })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,status,category_id,category,gender')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.', code: 'TOURNAMENT_NOT_FOUND' }, { status: 404 })
    }

    const tournamentRow = tournament as TournamentRow
    const tournamentCategory = tournamentRow.category_id ?? tournamentRow.category ?? null

    let playersQuery = supabaseAdmin
      .from('club_players')
      .select('id,user_id,display_name,category,gender')
      .eq('club_id', clubId)
      .not('approved_at', 'is', null)
      .limit(80)

    if (tournamentCategory !== null) {
      playersQuery = playersQuery.eq('category', tournamentCategory)
    }

    const [{ data: players, error: playersError }, { data: teams, error: teamsError }] = await Promise.all([
      playersQuery,
      supabaseAdmin
        .from('tournament_teams')
        .select('player1_user_id,player2_user_id')
        .eq('tournament_id', tournamentId)
        .eq('club_id', clubId),
    ])

    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })
    if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })

    const usedPlayerIds = new Set(
      ((teams ?? []) as TeamRow[]).flatMap((team) => [team.player1_user_id, team.player2_user_id]).filter(Boolean)
    )
    const playerRows = ((players ?? []) as ClubPlayerRow[])
      .filter((player) => !usedPlayerIds.has(player.user_id))
      .filter((player) => genderMatchesTournament(player.gender, tournamentRow.gender))

    const userIds = playerRows.map((player) => player.user_id)
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabaseAdmin
        .from('profiles')
        .select('user_id,email,first_name,last_name,display_name')
        .in('user_id', userIds)
      : { data: [], error: null }

    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

    const profilesMap = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
    const suggestions = playerRows
      .map((player) => {
        const profile = profilesMap.get(player.user_id) ?? null
        const fullName = getFullName(profile, player.display_name)
        return {
          club_player_id: player.id,
          user_id: player.user_id,
          full_name: fullName,
          category: player.category,
          gender: normalizeGender(player.gender),
        }
      })
      .filter((player) => normalizeSearch(player.full_name).includes(query))
      .slice(0, 8)

    return NextResponse.json({
      players: suggestions,
      filters: {
        category: tournamentCategory,
        gender: normalizeGender(tournamentRow.gender),
        excludedAlreadyInTournament: usedPlayerIds.size,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No pude buscar jugadores.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function ensureClubPlayer(clubId: string, userId: string, fullName: string, actorId: string) {
  const { error } = await supabaseAdmin
    .from('club_players')
    .upsert(
      {
        club_id: clubId,
        user_id: userId,
        display_name: fullName,
        approved_at: new Date().toISOString(),
        approved_by: actorId,
      },
      { onConflict: 'club_id,user_id' }
    )

  if (error) throw error
}

async function resolveExistingPlayer(input: ManualPlayerInput, clubId: string, actorId: string): Promise<ResolvedPlayer> {
  const userId = input.user_id?.trim()
  if (!userId || !uuidPattern.test(userId)) {
    throw new Error('INVALID_PLAYER_USER_ID')
  }

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (authError || !authUser?.user) {
    throw new Error('PLAYER_USER_NOT_FOUND')
  }

  const fullName =
    normalizeName(input.full_name) ||
    normalizeName(authUser.user.user_metadata?.full_name as string | undefined) ||
    authUser.user.email ||
    'Jugador'

  await ensureClubPlayer(clubId, userId, fullName, actorId)
  return { userId, fullName, createdAuthUser: false }
}

async function createMinimalPlayer(input: ManualPlayerInput, clubId: string, actorId: string): Promise<ResolvedPlayer> {
  assertServiceRole()

  const fullName = normalizeName(input.full_name)
  if (fullName.length < 2) {
    throw new Error('INVALID_PLAYER_NAME')
  }

  const email = buildManualEmail(clubId)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      source: 'manual_tournament_registration',
    },
  })

  if (authError || !authData?.user) {
    throw new Error('MANUAL_PLAYER_CREATE_FAILED')
  }

  const userId = authData.user.id
  const { firstName, lastName } = splitName(fullName)

  try {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          user_id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          display_name: fullName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (profileError) throw profileError

    await ensureClubPlayer(clubId, userId, fullName, actorId)
    return { userId, fullName, createdAuthUser: true }
  } catch (error) {
    await cleanupCreatedAuthUsers([userId])
    throw error
  }
}

async function resolvePlayer(input: ManualPlayerInput | undefined, clubId: string, actorId: string) {
  if (!input) throw new Error('INVALID_PLAYER')
  return input.user_id?.trim()
    ? resolveExistingPlayer(input, clubId, actorId)
    : createMinimalPlayer(input, clubId, actorId)
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  let createdTeamId: string | null = null
  const createdAuthUserIds: string[] = []

  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para crear inscripciones manuales.', code: 'UNAUTHORIZED' }, { status: 403 })
    }

    const payload = (await req.json().catch(() => ({}))) as ManualRegistrationPayload
    const paymentMode = payload.payment_mode ?? 'NONE'
    if (!paymentModes.has(paymentMode)) {
      return NextResponse.json({ error: 'Modo de pago inválido.', code: 'INVALID_PAYMENT_MODE' }, { status: 400 })
    }

    const player1Name = normalizeName(payload.player1?.full_name)
    const player2Name = normalizeName(payload.player2?.full_name)
    if (!payload.player1?.user_id && !payload.player2?.user_id && player1Name.toLowerCase() === player2Name.toLowerCase()) {
      return NextResponse.json({ error: 'Los jugadores de la pareja deben ser distintos.', code: 'SAME_PLAYER' }, { status: 400 })
    }

    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id,club_id,status,registration_deadline,signup_deadline')
      .eq('id', tournamentId)
      .eq('club_id', clubId)
      .maybeSingle()

    if (tournamentError) {
      return NextResponse.json({ error: tournamentError.message }, { status: 500 })
    }

    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.', code: 'TOURNAMENT_NOT_FOUND' }, { status: 404 })
    }

    if (normalizeStatus(tournament.status) !== 'OPEN') {
      return NextResponse.json({ error: 'El torneo debe estar abierto para cargar inscripciones manuales.', code: 'TOURNAMENT_NOT_OPEN' }, { status: 409 })
    }

    if (isRegistrationClosed(tournament as TournamentRow)) {
      return NextResponse.json({
        error: 'La fecha de cierre de inscripción ya venció.',
        code: 'REGISTRATION_CLOSED',
      }, { status: 409 })
    }

    const player1 = await resolvePlayer(payload.player1, clubId, user.id)
    if (player1.createdAuthUser) createdAuthUserIds.push(player1.userId)
    const player2 = await resolvePlayer(payload.player2, clubId, user.id)
    if (player2.createdAuthUser) createdAuthUserIds.push(player2.userId)

    if (player1.userId === player2.userId) {
      await cleanupCreatedAuthUsers(createdAuthUserIds)
      return NextResponse.json({ error: 'Los jugadores de la pareja deben ser distintos.', code: 'SAME_PLAYER' }, { status: 400 })
    }

    const { data: existingTeams, error: existingTeamsError } = await supabaseAdmin
      .from('tournament_teams')
      .select('id,player1_user_id,player2_user_id')
      .eq('tournament_id', tournamentId)
      .eq('club_id', clubId)

    if (existingTeamsError) {
      await cleanupCreatedAuthUsers(createdAuthUserIds)
      return NextResponse.json({ error: existingTeamsError.message }, { status: 500 })
    }

    const requestedPlayerIds = new Set([player1.userId, player2.userId])
    const alreadyRegisteredPlayerId = (existingTeams ?? [])
      .flatMap((team) => [team.player1_user_id, team.player2_user_id])
      .find((playerId) => typeof playerId === 'string' && requestedPlayerIds.has(playerId))

    if (alreadyRegisteredPlayerId) {
      await cleanupCreatedAuthUsers(createdAuthUserIds)
      return NextResponse.json({
        error: 'Uno de los jugadores ya está inscripto en este torneo.',
        code: 'PLAYER_ALREADY_REGISTERED_IN_TOURNAMENT',
      }, { status: 409 })
    }

    const { data: team, error: teamError } = await supabaseAdmin
      .from('tournament_teams')
      .insert({
        tournament_id: tournamentId,
        club_id: clubId,
        player1_user_id: player1.userId,
        player2_user_id: player2.userId,
        created_by: user.id,
      })
      .select('id,tournament_id,club_id,player1_user_id,player2_user_id,created_at')
      .single()

    if (teamError) {
      await cleanupCreatedAuthUsers(createdAuthUserIds)
      if (isDuplicateError(teamError)) {
        return NextResponse.json({ error: 'Esta pareja ya está inscripta o cargada para el torneo.', code: 'TEAM_ALREADY_REGISTERED' }, { status: 409 })
      }
      return NextResponse.json({ error: teamError.message }, { status: 500 })
    }

    createdTeamId = team.id

    const admission = getAdmissionForPaymentMode(paymentMode, user.id)
    const { data: registration, error: registrationError } = await supabaseAdmin
      .from('tournament_registrations')
      .insert({
        tournament_id: tournamentId,
        club_id: clubId,
        team_id: team.id,
        status: payload.auto_confirm ? 'CONFIRMED' : 'PENDING',
        created_by: user.id,
        ...admission,
      })
      .select('id,tournament_id,club_id,team_id,status,admission_status,admission_reason,admission_by,admission_at,created_at')
      .single()

    if (registrationError) {
      await supabaseAdmin.from('tournament_teams').delete().eq('id', createdTeamId)
      await cleanupCreatedAuthUsers(createdAuthUserIds)
      if (isDuplicateError(registrationError)) {
        return NextResponse.json({ error: 'Esta pareja ya tiene una inscripción para el torneo.', code: 'REGISTRATION_ALREADY_EXISTS' }, { status: 409 })
      }
      return NextResponse.json({ error: registrationError.message }, { status: 500 })
    }

    return NextResponse.json({
      registration,
      team,
      players: [
        { user_id: player1.userId, full_name: player1.fullName, created: player1.createdAuthUser },
        { user_id: player2.userId, full_name: player2.fullName, created: player2.createdAuthUser },
      ],
    })
  } catch (error) {
    if (createdTeamId) {
      await supabaseAdmin.from('tournament_teams').delete().eq('id', createdTeamId)
    }
    await cleanupCreatedAuthUsers(createdAuthUserIds)

    const message = error instanceof Error ? error.message : 'No pude crear la inscripción manual.'
    const knownErrors: Record<string, string> = {
      INVALID_PLAYER: 'Completá los datos de ambos jugadores.',
      INVALID_PLAYER_USER_ID: 'El user_id de jugador no es válido.',
      PLAYER_USER_NOT_FOUND: 'No encontré uno de los usuarios indicados.',
      INVALID_PLAYER_NAME: 'Completá el nombre del jugador.',
      MANUAL_PLAYER_CREATE_FAILED: 'No pude crear el jugador manual.',
    }

    return NextResponse.json(
      {
        error: knownErrors[message] ?? message,
        code: knownErrors[message] ? message : 'MANUAL_REGISTRATION_FAILED',
      },
      { status: 400 }
    )
  }
}
