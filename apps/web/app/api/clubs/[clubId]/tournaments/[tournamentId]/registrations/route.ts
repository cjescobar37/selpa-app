import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isClubAdmin } from '@/lib/clubMembershipServer'

type RegistrationRow = {
  id: string
  tournament_id: string
  club_id: string
  team_id: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  admission_status: AdmissionStatus
  admission_reason: string | null
  admission_by: string | null
  admission_at: string | null
  eligibility_blocked_reason: string | null
  created_by: string
  created_at: string
  updated_at: string | null
}

type TeamRow = {
  id: string
  player1_user_id: string
  player2_user_id: string
  created_by: string
}

type ProfileRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  avatar_url: string | null
}

type ClubPlayerRow = {
  user_id: string
  ranking_points: number | null
}

type PaymentStatus = 'SIN_PAGO' | 'PENDIENTE' | 'PAGADO' | 'FALLIDO'
type AdmissionStatus =
  | 'NONE'
  | 'MANUAL_PAYMENT_VALIDATED'
  | 'PAY_AT_VENUE_APPROVED'
  | 'EXCEPTION_APPROVED'
  | 'BLOCKED'

type PaymentRow = {
  id: string
  registration_id: string | null
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  source_type: string
  amount: number
  refunded_amount: number
  paid_at: string | null
  created_at: string
}

type TournamentPaymentRow = {
  id: string
  registration_id: string | null
  team_id: string | null
  method: string | null
  status: string | null
  amount: number | null
  requested_at: string | null
  approved_at: string | null
  paid_at: string | null
  created_at: string
}

type RegistrationChangeRequestRow = {
  id: string
  registration_id: string | null
  type: string
  status: string
  reason: string | null
  refund_percent: number | null
  refund_policy_label: string | null
  created_at: string
  resolved_at: string | null
}

type SeedSnapshotRow = {
  id: string
  tournament_id: string
  team_id: string
  registration_id: string
  seed: number
  team_score: number
  seed_source: string
  snapshot_at: string
}

type TournamentGroupRow = {
  id: string
  tournament_id: string
  name: string
  size: number
  order: number
}

type TournamentGroupTeamRow = {
  id: string
  tournament_id: string
  group_id: string
  team_id: string
  seed: number
  position: number | null
}

async function getTokenUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function getFullName(profile?: ProfileRow | null) {
  return (
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
    profile?.email ||
    'Jugador'
  )
}

function derivePaymentStatus(payments: PaymentRow[]): PaymentStatus {
  if (payments.some((payment) => payment.status === 'paid')) return 'PAGADO'
  if (payments.some((payment) => payment.status === 'pending')) return 'PENDIENTE'
  if (payments.some((payment) => payment.status === 'failed' || payment.status === 'refunded')) return 'FALLIDO'
  return 'SIN_PAGO'
}

function deriveTournamentPaymentStatus(payments: TournamentPaymentRow[]): PaymentStatus {
  if (payments.some((payment) => ['APPROVED', 'PAID'].includes(String(payment.status ?? '').toUpperCase()))) return 'PAGADO'
  if (payments.some((payment) => String(payment.status ?? '').toUpperCase() === 'PENDING')) return 'PENDIENTE'
  if (payments.some((payment) => ['REJECTED', 'CANCELLED'].includes(String(payment.status ?? '').toUpperCase()))) return 'FALLIDO'
  return 'SIN_PAGO'
}

function isMissingSchemaObjectError(error: { code?: string; message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache')
}

function isAdmissionEligible(admissionStatus: AdmissionStatus) {
  return (
    admissionStatus === 'MANUAL_PAYMENT_VALIDATED' ||
    admissionStatus === 'PAY_AT_VENUE_APPROVED' ||
    admissionStatus === 'EXCEPTION_APPROVED'
  )
}

function deriveEligible(registration: RegistrationRow, paymentStatus: PaymentStatus) {
  return (
    registration.status === 'CONFIRMED' &&
    registration.admission_status !== 'BLOCKED' &&
    (paymentStatus === 'PAGADO' || isAdmissionEligible(registration.admission_status))
  )
}

function buildEligibilityAlerts(registration: RegistrationRow, paymentStatus: PaymentStatus) {
  const alerts: string[] = []
  if (registration.admission_status === 'BLOCKED') {
    alerts.push(registration.eligibility_blocked_reason || 'Bloqueada para competir')
    return alerts
  }
  if (registration.status !== 'CONFIRMED') alerts.push('Inscripción no confirmada')
  if (isAdmissionEligible(registration.admission_status)) return alerts
  if (paymentStatus === 'SIN_PAGO') alerts.push('Sin pago registrado')
  if (paymentStatus === 'PENDIENTE') alerts.push('Pago pendiente')
  if (paymentStatus === 'FALLIDO') alerts.push('Pago no resuelto')
  return alerts
}

async function ensureTournamentBelongsToClub(clubId: string, tournamentId: string) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id,club_id,name,status')
    .eq('id', tournamentId)
    .eq('club_id', clubId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clubId: string; tournamentId: string }> }
) {
  try {
    const user = await getTokenUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 })
    }

    const { clubId, tournamentId } = await context.params
    const canManage = await isClubAdmin(user.id, clubId)
    if (!canManage) {
      return NextResponse.json({ error: 'No autorizado para ver inscripciones.' }, { status: 403 })
    }

    const tournament = await ensureTournamentBelongsToClub(clubId, tournamentId)
    if (!tournament) {
      return NextResponse.json({ error: 'Torneo no encontrado para este club.' }, { status: 404 })
    }

    const { data: registrations, error: registrationsError } = await supabaseAdmin
      .from('tournament_registrations')
      .select('id,tournament_id,club_id,team_id,status,admission_status,admission_reason,admission_by,admission_at,eligibility_blocked_reason,created_by,created_at,updated_at')
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })

    if (registrationsError) {
      return NextResponse.json({ error: registrationsError.message }, { status: 500 })
    }

    const rows = (registrations ?? []) as RegistrationRow[]
    const teamIds = Array.from(new Set(rows.map((row) => row.team_id).filter(Boolean)))
    const registrationIds = rows.map((row) => row.id)

    let teams = new Map<string, TeamRow>()
    if (teamIds.length > 0) {
      const { data: teamRows, error: teamsError } = await supabaseAdmin
        .from('tournament_teams')
        .select('id,player1_user_id,player2_user_id,created_by')
        .in('id', teamIds)

      if (teamsError) {
        return NextResponse.json({ error: teamsError.message }, { status: 500 })
      }

      teams = new Map(((teamRows ?? []) as TeamRow[]).map((team) => [team.id, team]))
    }

    const userIds = Array.from(
      new Set(
        Array.from(teams.values())
          .flatMap((team) => [team.player1_user_id, team.player2_user_id, team.created_by])
          .filter(Boolean)
      )
    )

    let profiles = new Map<string, ProfileRow>()
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('user_id,email,first_name,last_name,display_name,avatar_url')
        .in('user_id', userIds)

      if (profilesError) {
        return NextResponse.json({ error: profilesError.message }, { status: 500 })
      }

      profiles = new Map(((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))
    }

    let clubPlayers = new Map<string, ClubPlayerRow>()
    if (userIds.length > 0) {
      const { data: clubPlayerRows, error: clubPlayersError } = await supabaseAdmin
        .from('club_players')
        .select('user_id,ranking_points')
        .eq('club_id', clubId)
        .in('user_id', userIds)

      if (clubPlayersError) {
        return NextResponse.json({ error: clubPlayersError.message }, { status: 500 })
      }

      clubPlayers = new Map(((clubPlayerRows ?? []) as ClubPlayerRow[]).map((clubPlayer) => [clubPlayer.user_id, clubPlayer]))
    }

    let tournamentPaymentsByRegistration = new Map<string, TournamentPaymentRow[]>()
    let paymentsByRegistration = new Map<string, PaymentRow[]>()
    let changeRequestsByRegistration = new Map<string, RegistrationChangeRequestRow>()
    if (registrationIds.length > 0) {
      const { data: tournamentPaymentRows, error: tournamentPaymentsError } = await supabaseAdmin
        .from('tournament_payments')
        .select('id,registration_id,team_id,method,status,amount,requested_at,approved_at,paid_at,created_at')
        .in('registration_id', registrationIds)
        .neq('status', 'CANCELLED')
        .order('created_at', { ascending: false })

      if (tournamentPaymentsError && !isMissingSchemaObjectError(tournamentPaymentsError)) {
        return NextResponse.json({ error: tournamentPaymentsError.message }, { status: 500 })
      }

      tournamentPaymentsByRegistration = ((tournamentPaymentRows ?? []) as TournamentPaymentRow[]).reduce((map, payment) => {
        if (!payment.registration_id) return map
        const current = map.get(payment.registration_id) ?? []
        current.push(payment)
        map.set(payment.registration_id, current)
        return map
      }, new Map<string, TournamentPaymentRow[]>())

      const { data: paymentRows, error: paymentsError } = await supabaseAdmin
        .from('payments')
        .select('id,registration_id,status,source_type,amount,refunded_amount,paid_at,created_at')
        .in('registration_id', registrationIds)
        .order('created_at', { ascending: false })

      if (paymentsError) {
        return NextResponse.json({ error: paymentsError.message }, { status: 500 })
      }

      paymentsByRegistration = ((paymentRows ?? []) as PaymentRow[]).reduce((map, payment) => {
        if (!payment.registration_id) return map
        const current = map.get(payment.registration_id) ?? []
        current.push(payment)
        map.set(payment.registration_id, current)
        return map
      }, new Map<string, PaymentRow[]>())

      const { data: changeRequestRows, error: changeRequestsError } = await supabaseAdmin
        .from('tournament_registration_change_requests')
        .select('id,registration_id,type,status,reason,refund_percent,refund_policy_label,created_at,resolved_at')
        .in('registration_id', registrationIds)
        .eq('type', 'CANCEL_REGISTRATION')
        .order('created_at', { ascending: false })

      if (changeRequestsError && !isMissingSchemaObjectError(changeRequestsError)) {
        return NextResponse.json({ error: changeRequestsError.message }, { status: 500 })
      }

      changeRequestsByRegistration = ((changeRequestRows ?? []) as RegistrationChangeRequestRow[]).reduce((map, request) => {
        if (!request.registration_id || map.has(request.registration_id)) return map
        map.set(request.registration_id, request)
        return map
      }, new Map<string, RegistrationChangeRequestRow>())
    }

    let seedRows: SeedSnapshotRow[] = []
    if (rows.length > 0) {
      const { data: snapshotRows, error: snapshotsError } = await supabaseAdmin
        .from('tournament_team_seed_snapshots')
        .select('id,tournament_id,team_id,registration_id,seed,team_score,seed_source,snapshot_at')
        .eq('club_id', clubId)
        .eq('tournament_id', tournamentId)
        .order('seed', { ascending: true })

      if (snapshotsError) {
        return NextResponse.json({ error: snapshotsError.message }, { status: 500 })
      }

      seedRows = (snapshotRows ?? []) as SeedSnapshotRow[]
    }

    const seedsByRegistration = new Map(seedRows.map((snapshot) => [snapshot.registration_id, snapshot]))
    const seedsByTeam = new Map(seedRows.map((snapshot) => [snapshot.team_id, snapshot]))

    const { data: groupRows, error: groupsError } = await supabaseAdmin
      .from('tournament_groups')
      .select('id,tournament_id,name,size,order')
      .eq('tournament_id', tournamentId)
      .order('order', { ascending: true })

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 })
    }

    const groups = (groupRows ?? []) as TournamentGroupRow[]
    const groupIds = groups.map((group) => group.id)
    let groupTeamsByGroup = new Map<string, TournamentGroupTeamRow[]>()

    if (groupIds.length > 0) {
      const { data: groupTeamRows, error: groupTeamsError } = await supabaseAdmin
        .from('tournament_group_teams')
        .select('id,tournament_id,group_id,team_id,seed,position')
        .eq('tournament_id', tournamentId)
        .in('group_id', groupIds)
        .order('seed', { ascending: true })

      if (groupTeamsError) {
        return NextResponse.json({ error: groupTeamsError.message }, { status: 500 })
      }

      groupTeamsByGroup = ((groupTeamRows ?? []) as TournamentGroupTeamRow[]).reduce((map, row) => {
        const current = map.get(row.group_id) ?? []
        current.push(row)
        map.set(row.group_id, current)
        return map
      }, new Map<string, TournamentGroupTeamRow[]>())
    }

    const { count: groupMatchesCount, error: groupMatchesCountError } = await supabaseAdmin
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .eq('tournament_id', tournamentId)
      .eq('phase', 'GROUP')

    if (groupMatchesCountError) {
      return NextResponse.json({ error: groupMatchesCountError.message }, { status: 500 })
    }

    return NextResponse.json({
      tournament,
      meta: {
        hasSeedSnapshot: seedRows.length > 0,
        seededTeamsCount: seedRows.length,
        hasGroups: groups.length > 0,
        groupCount: groups.length,
        hasGroupMatches: (groupMatchesCount ?? 0) > 0,
        groupMatchesCount: groupMatchesCount ?? 0,
      },
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        size: group.size,
        order: group.order,
        teams: (groupTeamsByGroup.get(group.id) ?? []).map((groupTeam) => {
          const team = teams.get(groupTeam.team_id) ?? null
          const player1 = team ? profiles.get(team.player1_user_id) ?? null : null
          const player2 = team ? profiles.get(team.player2_user_id) ?? null : null
          const seedSnapshot = seedsByTeam.get(groupTeam.team_id) ?? null

          return {
            id: groupTeam.id,
            team_id: groupTeam.team_id,
            seed: groupTeam.seed,
            position: groupTeam.position,
            team_score: seedSnapshot?.team_score ?? null,
            team: team
              ? {
                  id: team.id,
                  players: [
                    {
                      user_id: team.player1_user_id,
                      full_name: getFullName(player1),
                    },
                    {
                      user_id: team.player2_user_id,
                      full_name: getFullName(player2),
                    },
                  ],
                }
              : null,
          }
        }),
      })),
      registrations: rows.map((registration) => {
        const team = teams.get(registration.team_id) ?? null
        const seedSnapshot = seedsByRegistration.get(registration.id) ?? seedsByTeam.get(registration.team_id) ?? null
        const player1 = team ? profiles.get(team.player1_user_id) ?? null : null
        const player2 = team ? profiles.get(team.player2_user_id) ?? null : null
        const player1ClubPlayer = team ? clubPlayers.get(team.player1_user_id) ?? null : null
        const player2ClubPlayer = team ? clubPlayers.get(team.player2_user_id) ?? null : null
        const tournamentPaymentRows = tournamentPaymentsByRegistration.get(registration.id) ?? []
        const paymentRows = paymentsByRegistration.get(registration.id) ?? []
        const changeRequest = changeRequestsByRegistration.get(registration.id) ?? null
        const paymentStatus = tournamentPaymentRows.length
          ? deriveTournamentPaymentStatus(tournamentPaymentRows)
          : derivePaymentStatus(paymentRows)
        const eligible = deriveEligible(registration, paymentStatus)
        const player1Points = Number.isFinite(player1ClubPlayer?.ranking_points ?? NaN) ? Number(player1ClubPlayer?.ranking_points ?? 0) : 0
        const player2Points = Number.isFinite(player2ClubPlayer?.ranking_points ?? NaN) ? Number(player2ClubPlayer?.ranking_points ?? 0) : 0

        return {
          id: registration.id,
          tournament_id: registration.tournament_id,
          club_id: registration.club_id,
          team_id: registration.team_id,
          status: registration.status,
          admission_status: registration.admission_status,
          admission_reason: registration.admission_reason,
          admission_by: registration.admission_by,
          admission_at: registration.admission_at,
          eligibility_blocked_reason: registration.eligibility_blocked_reason,
          payment_status: paymentStatus,
          payment_method: tournamentPaymentRows[0]?.method ?? null,
          operational_payment: tournamentPaymentRows[0]
            ? {
                id: tournamentPaymentRows[0].id,
                method: tournamentPaymentRows[0].method,
                status: tournamentPaymentRows[0].status,
                amount: tournamentPaymentRows[0].amount,
                requested_at: tournamentPaymentRows[0].requested_at,
                approved_at: tournamentPaymentRows[0].approved_at,
                paid_at: tournamentPaymentRows[0].paid_at,
                created_at: tournamentPaymentRows[0].created_at,
              }
            : null,
          registration_change_request: changeRequest
            ? {
                id: changeRequest.id,
                type: changeRequest.type,
                status: changeRequest.status,
                reason: changeRequest.reason,
                refund_percent: changeRequest.refund_percent,
                refund_policy_label: changeRequest.refund_policy_label,
                created_at: changeRequest.created_at,
                resolved_at: changeRequest.resolved_at,
              }
            : null,
          eligible,
          alerts: buildEligibilityAlerts(registration, paymentStatus),
          estimated_team_score: player1Points + player2Points,
          seed_snapshot: seedSnapshot
            ? {
                seed: seedSnapshot.seed,
                team_score: seedSnapshot.team_score,
                seed_source: seedSnapshot.seed_source,
                snapshot_at: seedSnapshot.snapshot_at,
              }
            : null,
          payment: paymentRows[0]
            ? {
                id: paymentRows[0].id,
                status: paymentRows[0].status,
                source_type: paymentRows[0].source_type,
                amount: paymentRows[0].amount,
                refunded_amount: paymentRows[0].refunded_amount,
                paid_at: paymentRows[0].paid_at,
                created_at: paymentRows[0].created_at,
              }
            : null,
          created_at: registration.created_at,
          team: team
            ? {
                id: team.id,
                player1_user_id: team.player1_user_id,
                player2_user_id: team.player2_user_id,
                players: [
                  {
                    user_id: team.player1_user_id,
                    full_name: getFullName(player1),
                    email: player1?.email ?? null,
                    avatar_url: player1?.avatar_url ?? null,
                    ranking_points: player1Points,
                  },
                  {
                    user_id: team.player2_user_id,
                    full_name: getFullName(player2),
                    email: player2?.email ?? null,
                    avatar_url: player2?.avatar_url ?? null,
                    ranking_points: player2Points,
                  },
                ],
              }
            : null,
        }
      }),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, 'Error leyendo inscripciones.') }, { status: 500 })
  }
}
